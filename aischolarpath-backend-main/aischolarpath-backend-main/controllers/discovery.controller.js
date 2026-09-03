/**
 * Discovery Controller — generic scholarship page scrapers
 *
 * The bulk scrapers here are the biggest Vercel-timeout risk in the app:
 * legacy code slept 2s between every page, unconditionally. Now the delay
 * and every fetch honor a deadline budget — when time runs low, remaining
 * items are skipped gracefully and the endpoint still returns JSON.
 */
const cheerio = require('cheerio');
const { supabase } = require('../config/supabase');
const { createBudget } = require('../utils/budget');
const { fetchWithTimeout, BROWSER_UA, BOT_UA } = require('../utils/http');
const { askAI, isDomainConfigured } = require('../services/ai.service');
const { extractFieldsByPattern } = require('../services/scrape.service');

// Politeness delay between page fetches — capped by remaining budget
async function politeDelay(budget) {
  if (!budget || budget.expired()) return;
  const delay = budget.cap(2_000);
  if (delay > 0) await new Promise(resolve => setTimeout(resolve, delay));
}

// Generic scraper: fetches a page and extracts listing items using CSS selectors
async function scrapeGeneric(req, res) {
  const { url, item_selector, title_selector, link_selector } = req.body;

  if (!url || !item_selector) {
    return res.status(400).json({ success: false, error: 'url and item_selector are required' });
  }

  try {
    const response = await fetchWithTimeout(url, {
      headers: { 'User-Agent': BROWSER_UA },
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch page: ${response.status}`);
    }

    const html = await response.text();
    const $ = cheerio.load(html);

    const items = [];
    $(item_selector).each((i, el) => {
      const title = title_selector ? $(el).find(title_selector).first().text().trim() : $(el).text().trim();
      let link = link_selector ? $(el).find(link_selector).first().attr('href') : $(el).attr('href');

      // Resolve relative links to absolute
      if (link && !link.startsWith('http')) {
        try {
          link = new URL(link, url).href;
        } catch (e) {
          // leave as-is if URL resolution fails
        }
      }

      if (title) items.push({ title, link });
    });

    const { data, error } = await supabase
      .from('discovery_log')
      .insert([{
        source_url: url,
        status: items.length > 0 ? 'success' : 'needs_review',
        raw_snapshot: { items }
      }])
      .select();

    if (error) {
      return res.status(500).json({ success: false, error: error.message });
    }

    res.json({ success: true, items_found: items.length, items, log: data[0] });
  } catch (err) {
    await supabase.from('discovery_log').insert([{
      source_url: url,
      status: 'failed',
      raw_snapshot: { error: err.message }
    }]);
    res.status(500).json({ success: false, error: err.message });
  }
}

// View past scraping logs
async function getLogs(req, res) {
  const { data, error } = await supabase
    .from('discovery_log')
    .select('*')
    .order('fetched_at', { ascending: false })
    .limit(20);

  if (error) {
    return res.status(500).json({ success: false, error: error.message });
  }
  res.json({ success: true, logs: data });
}

// Bulk scraper: scrapes multiple URLs with the same selectors in one call
async function scrapeBulk(req, res) {
  const { urls, item_selector, title_selector, link_selector } = req.body;

  if (!urls || !Array.isArray(urls) || urls.length === 0 || !item_selector) {
    return res.status(400).json({ success: false, error: 'urls (array) and item_selector are required' });
  }

  const budget = createBudget();
  const results = [];

  for (const url of urls) {
    // Stop early when the request budget is nearly spent (504 protection)
    if (!budget.canStart(4_000)) {
      results.push({ url, items_found: 0, error: 'Skipped: request time budget exhausted' });
      continue;
    }
    await politeDelay(budget);
    try {
      const response = await fetchWithTimeout(url, {
        timeoutMs: budget.cap(12_000),
        headers: {
          'User-Agent': BROWSER_UA,
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
          'Accept-Language': 'en-US,en;q=0.9'
        },
      });

      if (!response.ok) throw new Error(`Failed to fetch page: ${response.status}`);

      const html = await response.text();
      const $ = cheerio.load(html);

      const items = [];
      $(item_selector).each((i, el) => {
        const title = title_selector ? $(el).find(title_selector).first().text().trim() : $(el).text().trim();
        let link = link_selector ? $(el).find(link_selector).first().attr('href') : $(el).attr('href');

        if (link && !link.startsWith('http')) {
          try { link = new URL(link, url).href; } catch (e) { }
        }
        if (title) items.push({ title, link });
      });

      const { data } = await supabase
        .from('discovery_log')
        .insert([{ source_url: url, status: items.length > 0 ? 'success' : 'needs_review', raw_snapshot: { items } }])
        .select();

      results.push({ url, items_found: items.length, log_id: data?.[0]?.id });
    } catch (err) {
      await supabase.from('discovery_log').insert([{ source_url: url, status: 'failed', raw_snapshot: { error: err.message } }]);
      results.push({ url, items_found: 0, error: err.message });
    }
  }

  const totalItems = results.reduce((sum, r) => sum + (r.items_found || 0), 0);
  res.json({ success: true, total_items_found: totalItems, results });
}

// Scrape + auto-structure using pattern matching (no AI, best-effort)
async function scrapeAndStructure(req, res) {
  const { listing_url, item_selector, country, max_items } = req.body;

  if (!listing_url || !item_selector || !country) {
    return res.status(400).json({ success: false, error: 'listing_url, item_selector, and country are required' });
  }

  const budget = createBudget();
  const limit = max_items || 5;

  try {
    // Step 1: scrape the listing page
    const listResponse = await fetchWithTimeout(listing_url, {
      timeoutMs: budget.cap(12_000),
      headers: { 'User-Agent': BOT_UA },
    });
    const listHtml = await listResponse.text();
    const $list = cheerio.load(listHtml);

    const items = [];
    $list(item_selector).each((i, el) => {
      if (items.length >= limit) return;
      const title = $list(el).text().trim();
      let link = $list(el).attr('href');
      if (link && !link.startsWith('http')) {
        try { link = new URL(link, listing_url).href; } catch (e) { }
      }
      if (title && link) items.push({ title, link });
    });

    const structuredResults = [];

    // Step 2: visit each scholarship page and try to extract fields
    for (const item of items) {
      if (!budget.canStart(4_000)) {
        structuredResults.push({ title: item.title, saved: false, error: 'Skipped: request time budget exhausted' });
        continue;
      }
      await politeDelay(budget); // be polite, avoid rate limiting

      try {
        const pageResponse = await fetchWithTimeout(item.link, {
          timeoutMs: budget.cap(12_000),
          headers: { 'User-Agent': BOT_UA },
        });
        const pageHtml = await pageResponse.text();
        const $page = cheerio.load(pageHtml);
        const pageText = $page('body').text();

        // Best-effort pattern matching (not AI - may miss or misread values)
        const deadlineMatch = pageText.match(/deadline[^a-zA-Z0-9]{0,10}([A-Z][a-z]+ \d{1,2},? \d{4})/i);
        const eligibility_criteria = extractFieldsByPattern(pageText);

        const { data, error } = await supabase
          .from('scholarships')
          .upsert([{
            title: item.title,
            country,
            eligibility_criteria,
            deadline: deadlineMatch ? deadlineMatch[1] : null,
            apply_url: item.link,
            source_url: item.link,
            status: 'under_review',
            last_verified_at: new Date().toISOString()
          }], { onConflict: 'title,country' })
          .select();

        structuredResults.push({ title: item.title, saved: !error, extracted: eligibility_criteria, deadline_found: !!deadlineMatch, error: error?.message });
      } catch (err) {
        console.error(`FULL ERROR for ${item.title}:`, err);
        structuredResults.push({ title: item.title, saved: false, error: err.message, detail: JSON.stringify(err.cause || {}) });
      }
    }

    res.json({ success: true, processed: structuredResults.length, results: structuredResults });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
}

// Scrape a single official scholarship page directly (authentic source, no listing needed)
async function scrapeOfficial(req, res) {
  const { title, url, country } = req.body;

  if (!title || !url || !country) {
    return res.status(400).json({ success: false, error: 'title, url, and country are required' });
  }

  try {
    const response = await fetchWithTimeout(url, {
      headers: { 'User-Agent': BOT_UA },
    });
    const html = await response.text();
    const $ = cheerio.load(html);
    const pageText = $('body').text();

    const deadlineMatch = pageText.match(/deadline[^a-zA-Z0-9]{0,15}([A-Z][a-z]+ \d{1,2},? \d{4}|\d{1,2} [A-Z][a-z]+ \d{4})/i);
    const eligibility_criteria = {
      min_ielts: (() => { const m = pageText.match(/IELTS[^0-9]{0,20}(\d\.\d|\d)/i); return m ? parseFloat(m[1]) : null; })(),
      min_cgpa: (() => { const m = pageText.match(/(?:GPA|CGPA)[^0-9]{0,20}(\d\.\d)/i); return m ? parseFloat(m[1]) : null; })(),
      required_degree: null
    };

    const { data, error } = await supabase
      .from('scholarships')
      .upsert([{
        title,
        country,
        eligibility_criteria,
        deadline: deadlineMatch ? deadlineMatch[1] : null,
        apply_url: url,
        source_url: url,
        status: 'under_review',
        last_verified_at: new Date().toISOString()
      }], { onConflict: 'title,country' })
      .select();

    if (error) {
      return res.status(500).json({ success: false, error: error.message });
    }

    res.json({ success: true, scholarship: data[0], extracted: eligibility_criteria, deadline_found: !!deadlineMatch });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
}

// Scrape multiple official scholarship pages in one request - AI-enhanced extraction
async function scrapeOfficialBulk(req, res) {
  const { scholarships, auto_approve } = req.body;

  if (!scholarships || !Array.isArray(scholarships) || scholarships.length === 0) {
    return res.status(400).json({ success: false, error: 'scholarships (array of {title, url, country}) is required' });
  }

  const budget = createBudget();
  const results = [];

  for (const item of scholarships) {
    // Stop early when the request budget is nearly spent (504 protection)
    if (!budget.canStart(6_000)) {
      results.push({ title: item.title, saved: false, error: 'Skipped: request time budget exhausted' });
      continue;
    }
    await politeDelay(budget);

    try {
      const response = await fetchWithTimeout(item.url, {
        timeoutMs: budget.cap(12_000),
        headers: { 'User-Agent': BROWSER_UA },
        okOnly: true,
      });
      const html = await response.text();
      const $ = cheerio.load(html);
      const pageText = $('body').text().slice(0, 8000);

      // Use Gemini AI for deep extraction (scholarshipMatcher domain)
      let extracted = {
        min_cgpa: null, min_ielts: null, required_degree: null,
        funding_coverage: null, funding_value: 0,
        degree_level: item.degree_level || null,
        department: item.department || null,
        description: null
      };

      if (isDomainConfigured('scholarshipMatcher') && budget.canStart(8_000)) {
        const extractPrompt = `You are a scholarship data extraction expert.
Analyze this scholarship page text and extract structured information.

Scholarship title: "${item.title}"
Country: "${item.country}"
URL: ${item.url}

Page text (truncated):
${pageText.slice(0, 4000)}

Return ONLY valid JSON:
{
  "min_cgpa": number (0-4 scale, null if not found),
  "min_ielts": number (0-9 scale, null if not found),
  "required_degree": string (e.g. "Bachelor's", "Master's", null if not found),
  "funding_coverage": string (e.g. "Full tuition + stipend", null if not found),
  "funding_value": number (estimated USD value, 0 if unknown),
  "degree_level": string ("Bachelor's", "Master's", "PhD", null if not found),
  "department": string (field of study, null if open to all),
  "deadline": string (YYYY-MM-DD format, null if not found or varies),
  "description": string (1-2 sentence summary of the scholarship)
}`;

        const aiResult = await askAI(extractPrompt, {
          domain: 'scholarshipMatcher',
          jsonMode: true,
          timeoutMs: budget.cap(20_000),
        });
        if (aiResult) extracted = { ...extracted, ...aiResult };
      } else {
        // Fallback to regex
        const pattern = extractFieldsByPattern(pageText);
        if (pattern.min_ielts) extracted.min_ielts = pattern.min_ielts;
        if (pattern.min_cgpa) extracted.min_cgpa = pattern.min_cgpa;
      }

      const eligibility_criteria = {
        min_cgpa: extracted.min_cgpa,
        min_ielts: extracted.min_ielts,
        required_degree: extracted.required_degree,
        funding_coverage: extracted.funding_coverage,
        funding_value: extracted.funding_value
      };

      // Find or create university if title suggests one
      const university_id = item.university_id || null;

      const { data, error } = await supabase
        .from('scholarships')
        .upsert([{
          title: item.title,
          country: item.country,
          university_id,
          scholarship_type: item.scholarship_type || 'merit-based',
          degree_level: extracted.degree_level,
          department: extracted.department,
          eligibility_criteria,
          deadline: extracted.deadline || null,
          apply_url: item.url,
          source_url: item.url,
          status: auto_approve ? 'active' : 'under_review',
          last_verified_at: new Date().toISOString()
        }], { onConflict: 'title,country' })
        .select();

      results.push({ title: item.title, saved: !error, extracted, deadline_found: !!extracted.deadline, error: error?.message });
    } catch (err) {
      console.error(`Scrape error for ${item.title}:`, err.message);
      results.push({ title: item.title, saved: false, error: err.message });
    }
  }

  res.json({ success: true, processed: results.length, results });
}

module.exports = { scrapeGeneric, getLogs, scrapeBulk, scrapeAndStructure, scrapeOfficial, scrapeOfficialBulk };
