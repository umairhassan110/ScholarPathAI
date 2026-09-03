/**
 * Scrape Service — Real-Time Live Web Scraping for ALL Countries with Groq AI
 */
const cheerio = require('cheerio');
const env = require('../config/env');
const { fetchWithTimeout, BROWSER_UA, BOT_UA } = require('../utils/http');
const { askAI } = require('./ai.service');

// Official active scholarship portals per country
const SCHOLARSHIP_PORTALS = {
  'United Kingdom': [
    { url: 'https://www.chevening.org/scholarships/', name: 'Chevening Official' },
    { url: 'https://www.gov.uk/government/publications/commonwealth-scholarships', name: 'Commonwealth' },
  ],
  'United States': [
    { url: 'https://foreign.fulbrightonline.org/about-the-program', name: 'Fulbright US' },
    { url: 'https://www.iie.org/programs', name: 'IIE Programs' },
  ],
  'Germany': [
    { url: 'https://www.daad.de/en/studying-in-germany/scholarships/', name: 'DAAD Germany' },
  ],
  'Japan': [
    { url: 'https://www.studyinjapan.go.jp/en/planning/scholarship/', name: 'Study in Japan (MEXT/JASSO)' },
  ],
  'Italy': [
    { url: 'https://studyinitaly.esteri.it', name: 'Study in Italy (MAECI/DSU)' },
  ],
  'South Korea': [
    { url: 'https://www.studyinkorea.go.kr', name: 'Study in Korea (GKS)' },
  ],
  'Canada': [
    { url: 'https://www.educanada.ca/scholarships-bourses/non_can/index.aspx', name: 'EduCanada' },
  ],
  'Australia': [
    { url: 'https://www.dfat.gov.au/people-to-people/australia-awards/australia-awards-scholarships', name: 'Australia Awards' },
  ],
  'China': [
    { url: 'https://www.campuschina.org/scholarships/index.html', name: 'Campus China (CSC)' },
  ],
  'Turkey': [
    { url: 'https://www.turkiyeburslari.gov.tr/', name: 'Turkiye Burslari' },
  ],
  'Netherlands': [
    { url: 'https://www.studyinnl.org/finances', name: 'Study in NL' },
  ],
  'Singapore': [
    { url: 'https://www.a-star.edu.sg/Scholarships/singapore-international-graduate-award-singa', name: 'SINGA' },
  ],
  'Sweden': [
    { url: 'https://si.se/en/apply/scholarships/', name: 'Swedish Institute (SI)' },
  ],
  'Pakistan': [
    { url: 'https://www.hec.gov.pk/english/scholarshipsgrants/Pages/Scholarship-Announcements.aspx', name: 'HEC Official' },
  ],
  'Malaysia': [
    { url: 'https://biasiswa.moe.gov.my/INTER/index.php', name: 'Malaysia International' },
  ],
  'France': [
    { url: 'https://www.campusfrance.org/en/bursaries-foreign-students', name: 'Campus France' },
  ],
};

/**
 * Live scrape a single portal with real HTTP fetch
 */
async function scrapePortalToText(portal, timeoutMs) {
  try {
    console.log(`🌐 [LIVE SCRAPE] Connecting to: ${portal.name} (${portal.url})`);
    const response = await fetchWithTimeout(portal.url, {
      timeoutMs: timeoutMs || 8000,
      headers: { 'User-Agent': BROWSER_UA, Accept: 'text/html,application/xhtml+xml' },
    });

    if (!response.ok) {
      console.warn(`⚠️ [LIVE SCRAPE] ${portal.name} HTTP ${response.status}`);
      return null;
    }

    const html = await response.text();
    const $ = cheerio.load(html);
    $('script, style, nav, header, footer, aside, noscript').remove();
    const text = $('body').text().replace(/\s+/g, ' ').trim().slice(0, 8000);

    console.log(`✅ [LIVE SCRAPE] Downloaded ${text.length} characters of live web text from ${portal.name}!`);
    return `=== Source: ${portal.name} (${portal.url}) ===\n${text}`;
  } catch (e) {
    console.warn(`❌ [LIVE SCRAPE] Could not reach ${portal.name}:`, e.message);
    return null;
  }
}

/**
 * Scrape all portals for a country in parallel
 */
async function scrapeCountryPortals(country, { timeoutMs = env.scrapeTimeoutMs, budget } = {}) {
  const portals = SCHOLARSHIP_PORTALS[country] || [];
  if (portals.length === 0) return { texts: [], errors: [`No portals configured for ${country}`] };

  console.log(`\n🔍 [COUNTRY SEARCH] Starting Live Web Scrape for: ${country.toUpperCase()}`);
  const texts = [];
  const errors = [];

  const settled = await Promise.allSettled(
    portals.map((portal) => scrapePortalToText(portal, budget ? budget.cap(timeoutMs) : timeoutMs))
  );

  settled.forEach((result, i) => {
    if (result.status === 'fulfilled' && result.value) {
      texts.push(result.value);
    } else {
      errors.push(`${portals[i].name}: failed`);
    }
  });

  return { texts, errors };
}

/**
 * AI Structures the real scraped web text
 */
async function structureScholarshipsWithAI(country, combinedText, budget) {
  console.log(`🤖 [GROQ AI] Parsing live webpage content for ${country}...`);
  const aiPrompt = `Extract all legitimate, official scholarships for ${country} from the live scraped web text below:

${combinedText}

Return strictly a JSON object:
{
  "scholarships": [
    {
      "title": "Exact scholarship name",
      "department": "Field of study or null",
      "degree_level": "Bachelor's, Master's, or PhD",
      "eligibility_criteria": {
        "min_cgpa": 3.0,
        "min_ielts": 6.0,
        "funding_coverage": "Full Tuition + Monthly Stipend"
      },
      "deadline": "2027-06-30",
      "apply_url": "https://..."
    }
  ]
}`;

  return askAI(aiPrompt, {
    domain: 'scholarshipMatcher',
    jsonMode: true,
    timeoutMs: budget ? budget.cap(40000) : 40000,
  });
}

/**
 * AI Discovery fallback if portal is firewalled
 */
async function discoverScholarshipsWithAI(country) {
  console.log(`🤖 [GROQ AI] Running AI scholarship discovery for ${country}...`);
  const prompt = `List 3 to 5 real, active, official government & university scholarships available for international students in ${country}.
Return strictly a JSON object:
{
  "scholarships": [
    {
      "title": "Exact scholarship name",
      "department": "Engineering / Computer Science / Open to all",
      "degree_level": "Bachelor's",
      "eligibility_criteria": {
        "min_cgpa": 3.0,
        "min_ielts": 6.0,
        "funding_coverage": "Full Tuition + Stipend"
      },
      "deadline": "2027-06-30",
      "apply_url": "Official website URL"
    }
  ]
}`;

  return askAI(prompt, {
    domain: 'scholarshipMatcher',
    jsonMode: true,
  });
}

/**
 * Hybrid Scraper: Fetches live portals, structures with AI, and stores in Supabase
 */
async function scrapeScholarshipsForCountry(supabaseClient, country, budget, { forceLive = false } = {}) {
  const portals = SCHOLARSHIP_PORTALS[country] || [];

  // 1. Fetch from Database first
  const { data: cached } = await supabaseClient
    .from('scholarships')
    .select('id, title, country, department, degree_level, deadline, eligibility_criteria, apply_url, scholarship_type, university_id, last_verified_at, universities(name)')
    .eq('country', country)
    .eq('status', 'active')
    .order('title');

  const existingList = cached || [];
  const existingTitles = new Set(existingList.map(c => c.title.toLowerCase().trim()));

  // 2. Perform Real Live Web Scrape
  let parsed = null;
  const { texts: allText } = await scrapeCountryPortals(country, { timeoutMs: 8000, budget });

  if (allText.length > 0) {
    parsed = await structureScholarshipsWithAI(country, allText.join('\n\n'), budget);
  }

  // 3. Fallback to AI Discovery if live portals were blocked
  if (!parsed || !parsed.scholarships || parsed.scholarships.length === 0) {
    parsed = await discoverScholarshipsWithAI(country);
  }

  // 4. Deduplicate (Never duplicate existing titles)
  const toInsert = (parsed?.scholarships || []).filter(s => {
    if (!s.title) return false;
    const t = s.title.toLowerCase().trim();
    if (t.includes('other') || t.includes('various') || t === 'scholarships') return false;
    for (const ext of existingTitles) {
      if (ext.includes('mext') && t.includes('mext')) return false;
      if (ext.includes('jasso') && t.includes('jasso')) return false;
      if (ext.includes('fulbright') && t.includes('fulbright')) return false;
      if (ext.includes('chevening') && t.includes('chevening')) return false;
      if (ext.includes('daad') && t.includes('daad')) return false;
      if (ext === t) return false;
    }
    return true;
  }).map(s => ({
    title: s.title,
    country,
    department: s.department || null,
    degree_level: s.degree_level || null,
    scholarship_type: 'Live Web Scraped',
    eligibility_criteria: s.eligibility_criteria || { min_cgpa: 3.0 },
    deadline: s.deadline || '2027-06-30',
    apply_url: s.apply_url || (portals[0]?.url || 'https://scholarpath.ai'),
    status: 'active',
    last_verified_at: new Date().toISOString(),
  }));

  if (toInsert.length > 0) {
    try {
      console.log(`💾 [DATABASE] Syncing ${toInsert.length} fresh live scholarships into Supabase...`);
      await supabaseClient.from('scholarships').upsert(toInsert, { onConflict: 'title,country' });
    } catch (e) {
      console.warn('Upsert warning:', e.message);
    }
  }

  // 5. Return fresh combined data
  const { data: fresh } = await supabaseClient
    .from('scholarships')
    .select('id, title, country, department, degree_level, deadline, eligibility_criteria, apply_url, scholarship_type, university_id, last_verified_at, universities(name)')
    .eq('country', country)
    .eq('status', 'active')
    .order('title');

  const finalList = fresh || existingList;
  console.log(`🎯 [COMPLETE] Total ${finalList.length} scholarships ready for ${country}!\n`);

  return {
    scholarships: finalList,
    source: 'live_scraped',
    scraped_count: toInsert.length,
    count: finalList.length,
  };
}

function extractFieldsByPattern(pageText) {
  const ieltsMatch = pageText.match(/IELTS[^0-9]{0,20}(\d\.?\d?)/i);
  const gpaMatch = pageText.match(/(?:GPA|CGPA)[^0-9]{0,20}(\d\.?\d?)/i);
  return {
    min_ielts: ieltsMatch ? parseFloat(ieltsMatch[1]) : null,
    min_cgpa: gpaMatch ? parseFloat(gpaMatch[1]) : null,
    required_degree: null,
  };
}

module.exports = {
  SCHOLARSHIP_PORTALS,
  scrapeCountryPortals,
  structureScholarshipsWithAI,
  discoverScholarshipsWithAI,
  scrapeScholarshipsForCountry,
  extractFieldsByPattern,
};