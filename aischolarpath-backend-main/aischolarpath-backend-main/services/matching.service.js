/**
 * Matching Service — weighted scholarship eligibility engine
 *
 * Contains the single canonical implementation of the weighted scoring
 * algorithm (previously duplicated between /api/profile/:id/match-scholarships
 * and /api/smart-agent/match with drifting strings). Pure functions — no DB.
 *
 * The endpoint orchestration (DB reads, match persistence) lives in
 * runMatchAndStore() and the smart-agent service.
 */
const { WEIGHTS, degreesMatch, fieldsMatch, isDeadlineValid, isDegreeCompatible } = require('../matching-engine');
const { supabase } = require('../config/supabase');

/**
 * Score one scholarship against a profile.
 * @returns {{ matchScore: number, status: string, evidence: Array, reasons: Array }}
 */
function computeMatch(profile, sch) {
  const criteria = sch.eligibility_criteria || {};
  const evidence = [];
  const reasons = []; // Clear reasons WHY not eligible
  let weightedScore = 0;
  let totalWeightUsed = 0;
  let fatalFail = false;

  // Determine which CGPA to use based on degree type
  const isBachelor = profile.target_degree && profile.target_degree.toLowerCase().includes('bachelor');
  const userGpa = isBachelor ? (profile.fsc_percentage || profile.cgpa) : profile.cgpa;
  const gpaLabel = isBachelor && profile.fsc_percentage ? 'FSc %' : 'CGPA';
  const userField = profile.target_department || profile.target_field;

  // 1. Deadline check (hard filter - expired = Not Eligible)
  if (sch.deadline && !isDeadlineValid(sch.deadline)) {
    evidence.push({ criterion: 'Deadline', required: sch.deadline, actual: 'Expired', result: 'Fail', weight: 0, note: 'Deadline has passed' });
    reasons.push('Application deadline has passed (' + sch.deadline + ')');
    fatalFail = true;
  }

  // 2. CGPA / FSc percentage (25%)
  if (criteria.min_cgpa != null) {
    const w = WEIGHTS.cgpa;
    totalWeightUsed += w;
    if (userGpa == null) {
      evidence.push({ criterion: gpaLabel, required: criteria.min_cgpa, actual: null, result: 'Missing', weight: w });
      reasons.push(gpaLabel + ' not provided - minimum required is ' + criteria.min_cgpa);
    } else if (Number(userGpa) >= Number(criteria.min_cgpa)) {
      evidence.push({ criterion: gpaLabel, required: criteria.min_cgpa, actual: Number(userGpa), result: 'Pass', weight: w });
      weightedScore += w * 100;
    } else {
      evidence.push({ criterion: gpaLabel, required: criteria.min_cgpa, actual: Number(userGpa), result: 'Fail', weight: w });
      reasons.push('Your ' + gpaLabel + ' (' + Number(userGpa) + ') is below the minimum required (' + criteria.min_cgpa + ')');
      const ratio = Math.max(0, Math.min(Number(userGpa) / Number(criteria.min_cgpa), 1));
      weightedScore += w * ratio * 100;
      if (Number(userGpa) < Number(criteria.min_cgpa) - 0.5) fatalFail = true;
    }
  }

  // 3. Field/Department matching (25%)
  if (sch.department) {
    const w = WEIGHTS.field;
    totalWeightUsed += w;
    const match = fieldsMatch(userField, sch.department);
    if (match === null) {
      evidence.push({ criterion: 'Field', required: sch.department, actual: userField || null, result: 'Missing', weight: w });
      reasons.push('Target field not specified in your profile');
    } else if (match === 'exact') {
      evidence.push({ criterion: 'Field', required: sch.department, actual: userField, result: 'Pass', weight: w });
      weightedScore += w * 100;
    } else if (match === 'related') {
      evidence.push({ criterion: 'Field', required: sch.department, actual: userField, result: 'Pass', weight: w, note: 'Related field accepted' });
      weightedScore += w * 75;
    } else {
      evidence.push({ criterion: 'Field', required: sch.department, actual: userField, result: 'Fail', weight: w });
      reasons.push('Your field (' + (userField || 'not set') + ') does not match the required field (' + sch.department + ')');
      fatalFail = true;
    }
  }

  // 4. Degree level (20%) - use eligibility_criteria.required_degree OR top-level degree_level
  const requiredDeg = criteria.required_degree || sch.degree_level;
  if (requiredDeg) {
    const w = WEIGHTS.degree;
    totalWeightUsed += w;
    if (!profile.target_degree) {
      evidence.push({ criterion: 'Degree', required: requiredDeg, actual: null, result: 'Missing', weight: w });
      reasons.push('Target degree not specified in your profile');
    } else {
      const degResult = degreesMatch(profile.target_degree, requiredDeg);
      if (degResult === 'exact') {
        evidence.push({ criterion: 'Degree', required: requiredDeg, actual: profile.target_degree, result: 'Pass', weight: w });
        weightedScore += w * 100;
      } else if (degResult === 'progression') {
        // User has lower degree (e.g. Bachelor's applying for Master's) - still allow with partial score
        evidence.push({ criterion: 'Degree', required: requiredDeg, actual: profile.target_degree, result: 'Pass', weight: w, note: 'Degree progression accepted' });
        weightedScore += w * 80;
      } else if (degResult === null) {
        evidence.push({ criterion: 'Degree', required: requiredDeg, actual: profile.target_degree, result: 'Missing', weight: w });
        reasons.push('Could not determine degree match');
      } else {
        evidence.push({ criterion: 'Degree', required: requiredDeg, actual: profile.target_degree, result: 'Fail', weight: w });
        reasons.push('This scholarship requires ' + requiredDeg + ' but you selected ' + profile.target_degree);
        fatalFail = true;
      }
    }
  }

  // 5. IELTS (15%)
  if (criteria.min_ielts != null) {
    const w = WEIGHTS.ielts;
    totalWeightUsed += w;
    if (profile.ielts_score == null) {
      evidence.push({ criterion: 'IELTS', required: criteria.min_ielts, actual: null, result: 'Missing', weight: w });
      reasons.push('IELTS score not provided - minimum required is ' + criteria.min_ielts);
    } else if (Number(profile.ielts_score) >= Number(criteria.min_ielts)) {
      evidence.push({ criterion: 'IELTS', required: criteria.min_ielts, actual: Number(profile.ielts_score), result: 'Pass', weight: w });
      weightedScore += w * 100;
    } else {
      evidence.push({ criterion: 'IELTS', required: criteria.min_ielts, actual: Number(profile.ielts_score), result: 'Fail', weight: w });
      reasons.push('Your IELTS score (' + Number(profile.ielts_score) + ') is below the minimum required (' + criteria.min_ielts + ')');
    }
  }

  // 6. Country (pre-filtered)
  if (sch.country && profile.target_country) {
    evidence.push({ criterion: 'Country', required: sch.country, actual: profile.target_country, result: 'Pass', weight: 0 });
  }

  // Normalize score
  const matchScore = totalWeightUsed > 0 ? weightedScore / totalWeightUsed : 0;

  // Determine status
  // Hard fails (degree mismatch, field mismatch, expired deadline) = Not Eligible
  // Soft fails (CGPA/IELTS slightly below min) = Partially Eligible (user can still apply)
  // Missing data = Partially Eligible
  const hardFailCriteria = ['Degree', 'Field', 'Deadline'];
  const hasHardFail = evidence.some(e => e.result === 'Fail' && hardFailCriteria.includes(e.criterion));
  const hasSoftFail = evidence.some(e => e.result === 'Fail' && !hardFailCriteria.includes(e.criterion));
  const hasMissing = evidence.some(e => e.result === 'Missing');
  let status;
  if (totalWeightUsed === 0) status = 'Not Scored';
  else if (fatalFail || hasHardFail) status = 'Not Eligible';
  else if (hasSoftFail) status = 'Partially Eligible';
  else if (hasMissing) status = 'Partially Eligible';
  else status = 'Eligible';

  return { matchScore, status, evidence, reasons };
}

/**
 * Calculate probability/chance of getting a scholarship (smart-agent enrichment).
 */
function calculateChance(match) {
  const score = Number(match.match_score) || 0;
  const evidence = match.evidence || [];

  // Base probability from score
  let chance = score;

  // Hard fail = 0% chance
  if (match.status === 'Not Eligible') chance = Math.min(chance * 0.05, 5);

  // Partially eligible = reduced
  else if (match.status === 'Partially Eligible') {
    const missingCount = evidence.filter(e => e.result === 'Missing').length;
    const failCount = evidence.filter(e => e.result === 'Fail').length;
    chance = score * (0.75 - failCount * 0.05 - missingCount * 0.05);
  }

  // Not scored = unknown
  if (match.status === 'Not Scored') chance = 15;

  // Clamp 0-95 (never 100% - always some uncertainty)
  chance = Math.max(0, Math.min(95, Math.round(chance)));

  // Label
  let label, color;
  if (chance >= 75) { label = 'High Chance'; color = 'green'; }
  else if (chance >= 50) { label = 'Good Chance'; color = 'blue'; }
  else if (chance >= 25) { label = 'Moderate'; color = 'amber'; }
  else if (chance > 5) { label = 'Low Chance'; color = 'orange'; }
  else { label = 'Very Low'; color = 'red'; }

  return { chance, label, color };
}

/**
 * Enhance generic scholarship titles into descriptive display titles.
 */
function enhanceTitle(sch) {
  const title = (sch.title || '').trim();
  const generic = ['Government/University', 'Government', 'University', 'Government-funded', 'merit-based', 'need-based'];
  if (generic.some(g => title.toLowerCase() === g.toLowerCase()) || title.length < 5) {
    // Build a descriptive title from available data
    const parts = [];
    if (sch.country) parts.push(sch.country);
    if (sch.department) parts.push(sch.department);
    if (sch.degree_level) parts.push(sch.degree_level);
    parts.push('Scholarship');
    return parts.join(' ');
  }
  return title;
}

/**
 * Run the full match-scholarships flow: load profile + active scholarships,
 * score every scholarship, persist fresh matches.
 * @throws {Error} with .status for HTTP mapping
 */
async function runMatchAndStore(profileId) {
  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', profileId)
    .single();

  if (profileError || !profile) {
    const err = new Error('Profile not found');
    err.status = 404;
    throw err;
  }

  // ── Coalesce: blend manual form inputs + AI-extracted CV data ──
  // Profile values (user's manual edits) always take priority.
  // When a profile field is null/empty, fall back to extracted CV data
  // so matching uses the most complete picture available.
  let coalescedProfile = { ...profile };
  try {
    const { data: extractedRows } = await supabase
      .from('extracted_profile_data')
      .select('raw_extraction')
      .eq('profile_id', profileId)
      .order('created_at', { ascending: false })
      .limit(1);

    if (extractedRows && extractedRows.length > 0 && extractedRows[0].raw_extraction) {
      const raw = extractedRows[0].raw_extraction;
      const academics = raw.academics || raw;
      const language = raw.language || raw;
      const experience = raw.experience || raw;

      if ((coalescedProfile.cgpa == null) && (academics.cgpa != null)) coalescedProfile.cgpa = academics.cgpa;
      if ((coalescedProfile.fsc_percentage == null) && (academics.fsc_percentage != null)) coalescedProfile.fsc_percentage = academics.fsc_percentage;
      if ((coalescedProfile.ielts_score == null) && (language.ielts_score != null)) coalescedProfile.ielts_score = language.ielts_score;
      if (!coalescedProfile.target_degree && (academics.degree_level || raw.degree_level)) {
        coalescedProfile.target_degree = academics.degree_level || raw.degree_level;
      }
      if (!coalescedProfile.target_department && (academics.field_of_study || raw.department || raw.field_of_study)) {
        coalescedProfile.target_department = academics.field_of_study || raw.department || raw.field_of_study;
      }
      if (!coalescedProfile.target_field) {
        coalescedProfile.target_field = coalescedProfile.target_department;
      }
    }
  } catch (e) {
    // If coalesce query fails, continue with the raw profile (non-fatal)
    console.warn('Profile coalesce warning:', e.message);
  }

  // Match scholarships from user's target country (or all if no country set)
  let query = supabase
    .from('scholarships')
    .select('*, universities(name)')
    .eq('status', 'active');

  if (coalescedProfile.target_country) {
    query = query.eq('country', coalescedProfile.target_country);
  }

  const { data: scholarships, error: scholarshipsError } = await query;

  if (scholarshipsError) {
    const err = new Error(scholarshipsError.message);
    err.status = 500;
    throw err;
  }

  const allResults = scholarships.map((sch) => {
    const { matchScore, status, evidence, reasons } = computeMatch(coalescedProfile, sch);
    return {
      profile_id: profileId,
      scholarship_id: sch.id,
      university_id: sch.university_id,
      match_score: matchScore.toFixed(2),
      status,
      evidence,
      reasons
    };
  });

  // Filter out field mismatches
  const results = allResults.filter(r => {
    const fieldFail = r.evidence.some(e => e.criterion === 'Field' && e.result === 'Fail');
    const scholarship = scholarships.find(s => s.id === r.scholarship_id);
    const criteria = scholarship?.eligibility_criteria || {};
    const degreeValue = criteria.required_degree || criteria.degree_levels || scholarship?.degree_level;
    const isUnscoredScraped = r.status === 'Not Scored' && scholarship?.scholarship_type === 'Scraped';
    return !fieldFail && !isUnscoredScraped && isDegreeCompatible(coalescedProfile.target_degree, Array.isArray(degreeValue) ? degreeValue.join(', ') : degreeValue);
  });

  // Clear old matches, insert fresh
  await supabase.from('matches').delete().eq('profile_id', profileId);

  // Try insert with reasons; if column doesn't exist, insert without
  let inserted, insertError;
  try {
    const result = await supabase.from('matches').insert(results).select();
    inserted = result.data;
    insertError = result.error;
  } catch (e) {
    const stripped = results.map(r => { const { reasons, ...rest } = r; return rest; });
    const result2 = await supabase.from('matches').insert(stripped).select();
    inserted = result2.data;
    insertError = result2.error;
  }

  if (insertError) {
    const err = new Error(insertError.message);
    err.status = 500;
    throw err;
  }

  return inserted;
}

module.exports = { computeMatch, calculateChance, enhanceTitle, runMatchAndStore, computeMatchAnalysis };

/**
 * Compute a detailed match_analysis block for a single match row.
 * Uses the user-specified weighted matrix:
 *   Merit (CGPA/FSc) 30% | Financial/Field Fit 25% | IELTS 20% |
 *   CV Experience Depth 15% | Quota Check 10%
 *
 * @param {object} profile - User profile row
 * @param {object} match   - Match row (with joined scholarship fields)
 * @returns {object} match_analysis object
 */
function computeMatchAnalysis(profile, match) {
  const ANALYSIS_WEIGHTS = { merit: 0.30, fieldFit: 0.25, ielts: 0.20, experience: 0.15, quota: 0.10 };
  const criteria = match.eligibility_criteria || {};
  const evidence = match.evidence || [];
  const positiveIndicators = [];
  const missingGaps = [];

  // Deadline hard-stop
  if (match.deadline) {
    const d = new Date(match.deadline);
    if (!isNaN(d.getTime()) && d < new Date()) {
      return {
        match_percentage: 0,
        chance_level: 'Low Chance \uD83D\uDCC9',
        positive_indicators: [],
        missing_gaps: ['Application deadline has passed'],
      };
    }
  }

  const isBachelor = profile.target_degree && profile.target_degree.toLowerCase().includes('bachelor');
  const userGpa = isBachelor ? (profile.fsc_percentage || profile.cgpa) : profile.cgpa;
  const userField = profile.target_department || profile.target_field;

  // 1. Merit / CGPA (30%)
  let meritScore = 0;
  if (criteria.min_cgpa != null && userGpa != null) {
    const ratio = Math.min(Number(userGpa) / Number(criteria.min_cgpa), 1);
    meritScore = ratio * ANALYSIS_WEIGHTS.merit * 100;
    if (Number(userGpa) >= Number(criteria.min_cgpa)) {
      positiveIndicators.push(`Your ${isBachelor ? 'FSc' : 'CGPA'} (${userGpa}) meets the minimum (${criteria.min_cgpa})`);
    } else {
      missingGaps.push(`${isBachelor ? 'FSc' : 'CGPA'} is ${userGpa} — minimum required is ${criteria.min_cgpa}`);
    }
  } else if (userGpa != null) {
    meritScore = ANALYSIS_WEIGHTS.merit * 100;
    positiveIndicators.push(`${isBachelor ? 'FSc' : 'CGPA'} provided (${userGpa})`);
  } else {
    missingGaps.push('CGPA / FSc percentage not provided');
  }

  // 2. Field / Financial Fit (25%)
  let fieldScore = 0;
  if (userField && match.department) {
    const fm = fieldsMatch(userField, match.department);
    if (fm === 'exact') {
      fieldScore = ANALYSIS_WEIGHTS.fieldFit * 100;
      positiveIndicators.push(`Exact field match: ${userField}`);
    } else if (fm === 'related') {
      fieldScore = ANALYSIS_WEIGHTS.fieldFit * 75;
      positiveIndicators.push(`Related field accepted: ${userField}`);
    } else {
      missingGaps.push(`Field mismatch: your field (${userField}) does not align with ${match.department}`);
    }
  } else if (!userField) {
    missingGaps.push('Target field / department not specified');
  }

  // 3. IELTS (20%)
  let ieltsScore = 0;
  if (criteria.min_ielts != null && profile.ielts_score != null) {
    const ratio = Math.min(Number(profile.ielts_score) / Number(criteria.min_ielts), 1);
    ieltsScore = ratio * ANALYSIS_WEIGHTS.ielts * 100;
    if (Number(profile.ielts_score) >= Number(criteria.min_ielts)) {
      positiveIndicators.push(`IELTS score (${profile.ielts_score}) meets the minimum (${criteria.min_ielts})`);
    } else {
      missingGaps.push(`IELTS score (${profile.ielts_score}) is below minimum (${criteria.min_ielts})`);
    }
  } else if (profile.ielts_score != null) {
    ieltsScore = ANALYSIS_WEIGHTS.ielts * 100;
    positiveIndicators.push(`IELTS score provided (${profile.ielts_score})`);
  } else if (criteria.min_ielts != null) {
    missingGaps.push('IELTS score not provided');
  }

  // 4. CV Experience Depth (15%)
  let expScore = 0;
  const extracted = evidence.find(e => e.criterion === 'Experience');
  if (extracted && extracted.actual != null) {
    const years = Number(extracted.actual);
    if (years >= 2) {
      expScore = ANALYSIS_WEIGHTS.experience * 100;
      positiveIndicators.push(`${years}+ years of relevant experience`);
    } else if (years > 0) {
      expScore = ANALYSIS_WEIGHTS.experience * 50;
      positiveIndicators.push(`${years} year(s) of experience noted`);
    } else {
      missingGaps.push('No significant work experience detected');
    }
  } else {
    missingGaps.push('Upload a CV to boost experience-based matching');
  }

  // 5. Quota / Country Check (10%)
  let quotaScore = 0;
  if (match.country && profile.target_country) {
    if (match.country.toLowerCase() === profile.target_country.toLowerCase()) {
      quotaScore = ANALYSIS_WEIGHTS.quota * 100;
      positiveIndicators.push(`Target country matches: ${match.country}`);
    }
  }
  const countryEv = evidence.find(e => e.criterion === 'Country');
  if (countryEv && countryEv.result === 'Pass') {
    quotaScore = ANALYSIS_WEIGHTS.quota * 100;
    if (!positiveIndicators.some(s => s.includes('country'))) {
      positiveIndicators.push(`Country alignment: ${match.country || profile.target_country}`);
    }
  }

  const totalScore = Math.round(
    Math.max(0, Math.min(100, meritScore + fieldScore + ieltsScore + expScore + quotaScore))
  );

  let chanceLevel;
  if (totalScore >= 75) chanceLevel = 'High Chance \uD83D\uDD25';
  else if (totalScore >= 50) chanceLevel = 'Medium Chance \u26A1';
  else chanceLevel = 'Low Chance \uD83D\uDCC9';

  return {
    match_percentage: totalScore,
    chance_level: chanceLevel,
    positive_indicators: positiveIndicators,
    missing_gaps: missingGaps,
  };
}
