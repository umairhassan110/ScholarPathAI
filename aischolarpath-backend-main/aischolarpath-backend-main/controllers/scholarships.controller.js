/**
 * Scholarships Controller — listing, detail, country scraping, moderation
 *
 * The heavy country-scrape flow is decoupled into scrape.service with
 * parallel portal fetching + deadline budget, preventing Vercel 504s.
 */
const { supabase } = require('../config/supabase');
const { createBudget } = require('../utils/budget');
const { SCHOLARSHIP_PORTALS, scrapeCountryPortals, structureScholarshipsWithAI } = require('../services/scrape.service');

// List scholarships with filters
async function listScholarships(req, res) {
  const { country, scholarship_type, department, degree_level } = req.query;

  let query = supabase.from('scholarships').select('*, universities(name, official_portal_url)');

  if (country) query = query.eq('country', country);
  if (scholarship_type) query = query.eq('scholarship_type', scholarship_type);
  if (department) query = query.eq('department', department);
  if (degree_level) query = query.eq('degree_level', degree_level);

  const { data, error } = await query;

  if (error) {
    return res.status(500).json({ success: false, error: error.message });
  }
  res.json({ success: true, scholarships: data });
}

// Get single scholarship by id
async function getScholarship(req, res) {
  const { id } = req.params;

  const { data, error } = await supabase
    .from('scholarships')
    .select('*, universities(name, official_portal_url)')
    .eq('id', id)
    .single();

  if (error) {
    return res.status(404).json({ success: false, error: error.message });
  }
  res.json({ success: true, scholarship: data });
}

// Scrape scholarships for a specific country - real-time, AI-structured
async function scrapeCountry(req, res) {
  const { country } = req.body;
  if (!country) {
    return res.status(400).json({ success: false, error: 'country is required' });
  }

  const budget = createBudget();
  const portals = SCHOLARSHIP_PORTALS[country] || [];
  if (portals.length === 0) {
    return res.json({ success: true, scholarships: [], message: `No known scholarship portals for ${country}. Try checking official government websites.` });
  }

  // First check if we already have recent scraped data for this country (cache: 24h)
  const { data: existingScholarships } = await supabase
    .from('scholarships')
    .select('id, title, country, department, degree_level, deadline, eligibility_criteria, apply_url, scholarship_type, last_verified_at')
    .eq('country', country)
    .eq('status', 'active')
    .order('title');

  if (existingScholarships && existingScholarships.length > 0) {
    const latestCheck = existingScholarships[0].last_verified_at;
    if (latestCheck && (Date.now() - new Date(latestCheck).getTime()) < 24 * 60 * 60 * 1000) {
      // Data is fresh - return cached
      return res.json({ success: true, scholarships: existingScholarships, source: 'cached', message: `${existingScholarships.length} scholarships found for ${country} (updated within 24h)` });
    }
  }

  // Scrape portals IN PARALLEL (legacy code fetched sequentially)
  const { texts: allScrapedText, errors: scrapeErrors } = await scrapeCountryPortals(country, { budget });

  if (allScrapedText.length === 0) {
    // All portals failed - return existing DB data
    const fallback = existingScholarships || [];
    return res.json({ success: true, scholarships: fallback, source: 'database_fallback', scrape_errors: scrapeErrors, message: `Could not scrape live data. Found ${fallback.length} scholarships for ${country}.` });
  }

  // AI structures the scraped content (scholarshipMatcher domain)
  const combinedText = allScrapedText.join('\n\n');
  const parsed = await structureScholarshipsWithAI(country, combinedText, budget);

  if (!parsed || !parsed.scholarships || parsed.scholarships.length === 0) {
    // AI failed - return existing DB data
    const fallback = existingScholarships || [];
    return res.json({ success: true, scholarships: fallback, source: 'database_fallback', message: `AI could not parse live data. Found ${fallback.length} scholarships for ${country}.` });
  }

  // Store scraped scholarships in DB (upsert)
  const now = new Date().toISOString();
  const toInsert = parsed.scholarships.map(s => ({
    title: s.title,
    country,
    department: s.department || null,
    degree_level: s.degree_level || null,
    scholarship_type: 'Scraped',
    eligibility_criteria: s.eligibility_criteria || {},
    deadline: s.deadline || null,
    apply_url: s.apply_url || null,
    status: 'active',
    source_url: portals[0]?.url || null,
    last_verified_at: now,
  }));

  if (toInsert.length > 0) {
    const { error } = await supabase.from('scholarships').upsert(toInsert, { onConflict: 'title,country' });
    if (error) console.error('Scrape insert error:', error.message);
  }

  // Fetch updated list from DB
  const { data: freshScholarships } = await supabase
    .from('scholarships')
    .select('id, title, country, department, degree_level, deadline, eligibility_criteria, apply_url, scholarship_type, last_verified_at')
    .eq('country', country)
    .eq('status', 'active')
    .order('title');

  // Log the scrape
  await supabase.from('discovery_log').insert([{
    source_url: portals.map(p => p.url).join(', '),
    status: 'success',
    raw_snapshot: { country, found: parsed.scholarships.length, errors: scrapeErrors }
  }]);

  res.json({
    success: true,
    scholarships: freshScholarships || [],
    source: 'live_scrape',
    scraped_count: parsed.scholarships.length,
    scrape_errors: scrapeErrors.length > 0 ? scrapeErrors : undefined,
    message: `Scraped ${parsed.scholarships.length} scholarships for ${country} from ${allScrapedText.length} portal(s).`
  });
}

// Get all scholarships pending review (scraped, not yet verified)
async function pendingReview(req, res) {
  const { data, error } = await supabase
    .from('scholarships')
    .select('*')
    .eq('status', 'under_review');

  if (error) {
    return res.status(500).json({ success: false, error: error.message });
  }
  res.json({ success: true, count: data.length, pending: data });
}

// Approve a scholarship (mark it active after manual verification)
async function approveScholarship(req, res) {
  const { id } = req.params;
  const { eligibility_criteria, deadline } = req.body || {};

  const updates = { status: 'active', last_verified_at: new Date().toISOString() };
  if (eligibility_criteria) updates.eligibility_criteria = eligibility_criteria;
  if (deadline) updates.deadline = deadline;

  const { data, error } = await supabase
    .from('scholarships')
    .update(updates)
    .eq('id', id)
    .select();

  if (error) {
    return res.status(500).json({ success: false, error: error.message });
  }
  res.json({ success: true, scholarship: data[0] });
}

module.exports = { listScholarships, getScholarship, scrapeCountry, pendingReview, approveScholarship };
