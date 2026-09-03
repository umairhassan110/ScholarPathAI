/**
 * Smart Agent Service — intelligent scholarship matching with live data
 *
 * The heaviest endpoint in the app. Orchestrated as a decoupled service with
 * a deadline budget so it ALWAYS returns structured JSON before the Vercel
 * function limit:
 *
 *   1. profile + CV data (parallel DB reads)
 *   2. scholarships      (DB-first, quick scrape only when empty)
 *   3. weighted matching (in-memory, fast)
 *   4. persistence       (matches table)
 *   5. AI summary        (skipped when the budget is spent -> template analysis)
 *
 * AI calls use the 'scholarshipMatcher' domain (GEMINI_SCHOLARSHIP_MATCHER_KEY).
 */
const { supabase } = require('../config/supabase');
const { createBudget } = require('../utils/budget');
const { askAI, isDomainConfigured } = require('./ai.service');
const { computeMatch, calculateChance, enhanceTitle } = require('./matching.service');
const { isDegreeCompatible } = require('../matching-engine');
const { scrapeScholarshipsForCountry } = require('./scrape.service');

/**
 * Run the full Smart Agent flow for a profile.
 * @returns response payload for the controller
 */
async function runSmartAgent(targetId, { budget = createBudget() } = {}) {
  // 1. Get user profile + CV data in parallel for speed
  const [profileResult, cvResult] = await Promise.all([
    supabase.from('profiles').select('*').eq('id', targetId).single(),
    supabase.from('extracted_profile_data').select('*').eq('profile_id', targetId).order('created_at', { ascending: false }).limit(1).then(r => r).catch(() => ({ data: null })),
  ]);

  const { data: profile, error: profileError } = profileResult;
  if (profileError || !profile) {
    const err = new Error('Profile not found: ' + (profileError?.message || 'no data'));
    err.status = 404;
    throw err;
  }

  // 2. CV extracted data
  let cvData = {};
  const extracted = cvResult?.data;
  if (extracted?.length > 0) {
    cvData = extracted[0].raw_extraction || {};
  }
  const hasCv = !!(profile.cv_file_path || Object.keys(cvData).length > 0);
  const coalescedProfile = { ...profile };
  const academics = cvData.academics || cvData;
  const language = cvData.language || cvData;
  if (coalescedProfile.cgpa == null && academics.cgpa != null) coalescedProfile.cgpa = academics.cgpa;
  if (coalescedProfile.fsc_percentage == null && academics.fsc_percentage != null) coalescedProfile.fsc_percentage = academics.fsc_percentage;
  if (coalescedProfile.ielts_score == null && language.ielts_score != null) coalescedProfile.ielts_score = language.ielts_score;
  if (!coalescedProfile.target_degree && (academics.degree_level || cvData.degree_level)) coalescedProfile.target_degree = academics.degree_level || cvData.degree_level;
  if (!coalescedProfile.target_department && (academics.field_of_study || cvData.department || cvData.field_of_study)) {
    coalescedProfile.target_department = academics.field_of_study || cvData.department || cvData.field_of_study;
  }
  if (!coalescedProfile.target_field) coalescedProfile.target_field = coalescedProfile.target_department;

  // 3. Get scholarships - fast DB-first, scrape only if empty
  let scholarships = [];
  let scrapeInfo = { source: 'database' };

  if (profile.target_country) {
    try {
      const scrapeResult = await scrapeScholarshipsForCountry(supabase, profile.target_country, budget, { forceLive: false });
      scholarships = scrapeResult.scholarships;
      scrapeInfo = scrapeResult;
    } catch (e) {
      scrapeInfo = { source: 'scrape_failed', error: e.message };
    }
  }

  // Always merge verified database rows with live results. Live portals often
  // expose only a subset of opportunities, while the DB preserves known ones.
  {
    const { data: dbScholarships } = await supabase
      .from('scholarships').select('*, universities(name)')
      .eq('status', 'active')
      .limit(200);

    // Merge with deduplication by title+country
    const seen = new Set(scholarships.map(s => `${s.title}|${s.country}`));
    if (dbScholarships) {
      for (const s of dbScholarships) {
        const key = `${s.title}|${s.country}`;
        if (!seen.has(key)) {
          if (!profile.target_country || s.country === profile.target_country) {
            scholarships.push(s);
            seen.add(key);
          }
        }
      }
    }
  }

  const userField = coalescedProfile.target_department || coalescedProfile.target_field;

  if (scholarships.length === 0) {
    return {
      success: true,
      matches: [],
      scholarship_count: 0,
      scrape_info: scrapeInfo,
      analysis: 'No scholarships found for your target country. Try selecting a different country or check back later.',
      profile_summary: {
        degree: coalescedProfile.target_degree, field: userField,
        country: coalescedProfile.target_country, cgpa: coalescedProfile.cgpa, ielts: coalescedProfile.ielts_score,
        cv_analyzed: hasCv
      }
    };
  }

  // 4. Run matching engine
  const results = scholarships.map((sch) => {
    const { matchScore, status, evidence, reasons } = computeMatch(coalescedProfile, sch);
    const chanceInfo = calculateChance({ match_score: matchScore, status, evidence, reasons });
    const criteria = sch.eligibility_criteria || {};

    return {
      profile_id: targetId,
      scholarship_id: sch.id,
      university_id: sch.university_id,
      university_name: sch.universities?.name || null,
      match_score: matchScore.toFixed(2),
      status,
      evidence,
      reasons,
      chance: chanceInfo.chance,
      chance_label: chanceInfo.label,
      chance_color: chanceInfo.color,
      title: enhanceTitle(sch),
      country: sch.country,
      deadline: sch.deadline || null,
      apply_url: sch.apply_url || null,
      degree: criteria.required_degree || (Array.isArray(criteria.degree_levels) ? criteria.degree_levels.join(', ') : criteria.degree_levels) || sch.degree_level || 'All eligible levels',
      department: sch.department || null,
      scholarship_type: sch.scholarship_type || null,
      funding: criteria.funding_coverage || null,
      funding_value: criteria.funding_value || 0,
    };
  });

  // Sort by chance (highest first), then by score
  results.sort((a, b) => b.chance - a.chance || Number(b.match_score) - Number(a.match_score));

  // Do not show scholarships for an incompatible field or degree level.
  // Soft failures such as a slightly lower CGPA remain visible as partial matches.
  const fieldFiltered = results.filter(r => {
    const fieldFail = r.evidence.some(e => e.criterion === 'Field' && e.result === 'Fail');
    const source = scholarships.find(s => s.id === r.scholarship_id);
    const criteria = source?.eligibility_criteria || {};
    const degreeValue = criteria.required_degree || criteria.degree_levels || source?.degree_level;
    const isUnscoredScraped = r.status === 'Not Scored' && r.scholarship_type === 'Scraped';
    return !fieldFail && !isUnscoredScraped && isDegreeCompatible(coalescedProfile.target_degree, Array.isArray(degreeValue) ? degreeValue.join(', ') : degreeValue);
  });

  // Final deduplication - remove duplicate scholarships by title+country
  const resultSeen = new Set();
  const deduplicated = fieldFiltered.filter(r => {
    const normalizedTitle = /mext/i.test(r.title)
      ? 'mext'
      : r.title.replace(/\b(japanese government|government|scholarship|international|university)\b/gi, '').replace(/[^a-z0-9]/gi, '').toLowerCase();
    const key = `${normalizedTitle}|${r.country}|${r.degree}`;
    if (resultSeen.has(key)) return false;
    resultSeen.add(key);
    return true;
  });

  // 5. Store matches in DB
  try { await supabase.from('matches').delete().eq('profile_id', targetId); } catch (e) { /* ignore */ }
  const dbRecords = deduplicated.map(r => ({
    profile_id: r.profile_id, scholarship_id: r.scholarship_id,
    university_id: r.university_id, match_score: r.match_score,
    status: r.status, evidence: r.evidence, reasons: r.reasons,
  }));
  try {
    await supabase.from('matches').insert(dbRecords);
  } catch (e) {
    const stripped = dbRecords.map(r => { const { reasons, ...rest } = r; return rest; });
    try { await supabase.from('matches').insert(stripped); } catch (e2) { /* ignore */ }
  }

  // 6. AI analysis (if Gemini available AND budget remains) - use deduplicated results
  let aiAnalysis = null;
  let aiStatus = 'ok';
  const eligible = deduplicated.filter(r => r.status === 'Eligible').length;
  const partial = deduplicated.filter(r => r.status === 'Partially Eligible').length;
  const notEligible = deduplicated.filter(r => r.status === 'Not Eligible').length;
  const topChance = deduplicated.length > 0 ? deduplicated[0] : null;

  if (isDomainConfigured('scholarshipMatcher') && budget.canStart(8_000)) {
    try {
      const summaryPrompt = `You are a scholarship advisor for a Pakistani student. Analyze this profile and matching results, then give a brief, honest assessment in 3-4 sentences.

PROFILE:
- Degree: ${coalescedProfile.target_degree || 'not set'}
- Field: ${userField || 'not set'}
- Country: ${coalescedProfile.target_country || 'not set'}
- CGPA: ${coalescedProfile.cgpa || 'not provided'}
- FSc: ${coalescedProfile.fsc_percentage || 'not provided'}%
- IELTS: ${coalescedProfile.ielts_score || 'not provided'}

MATCHING RESULTS:
- ${deduplicated.length} scholarships checked
- ${eligible} eligible, ${partial} partially eligible, ${notEligible} not eligible
- Best chance: ${topChance ? topChance.title + ' (' + topChance.chance + '% chance)' : 'None'}

Give honest, actionable advice. Mention the best opportunity and what they should improve. Write in simple English. Do NOT use markdown.`;

      aiAnalysis = await askAI(summaryPrompt, { domain: 'scholarshipMatcher', timeoutMs: budget.cap(30_000) });
      if (/quota|temporarily unavailable|official scholarship portal/i.test(aiAnalysis || '')) aiAnalysis = null;
    } catch (e) { /* quota exceeded or error */ }
  }

  if (!aiAnalysis) {
    aiStatus = budget.expired() ? 'degraded_time_budget' : 'fallback';
    if (eligible > 0) {
      aiAnalysis = `Great news! You're eligible for ${eligible} scholarship(s). Your top pick is "${topChance?.title}" with ${topChance?.chance}% chance. Focus on preparing strong application documents before the deadline.`;
    } else if (partial > 0) {
      const bestPartial = deduplicated.find(r => r.status === 'Partially Eligible');
      aiAnalysis = `You have ${partial} partially eligible scholarship(s). Your best option is "${bestPartial?.title}" (${bestPartial?.chance}% chance). ${bestPartial?.reasons?.[0] || 'Complete your profile to improve.'}`;
    } else {
      aiAnalysis = `Currently no scholarships match your profile well. Consider broadening your target country or improving your CGPA/IELTS scores to unlock more opportunities.`;
    }
  }

  return {
    success: true,
    matches: deduplicated,
    scholarship_count: deduplicated.length,
    scrape_info: scrapeInfo,
    stats: { eligible, partial, not_eligible: notEligible, total: deduplicated.length },
    analysis: aiAnalysis,
    ai_status: aiStatus,
    profile_summary: {
      degree: coalescedProfile.target_degree,
      country: profile.target_country, cgpa: profile.cgpa,
      fsc_percentage: profile.fsc_percentage,
      ielts: profile.ielts_score,
      cv_analyzed: hasCv
    }
  };
}

module.exports = { runSmartAgent };
