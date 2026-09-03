/**
 * Profile Controller — profile CRUD, CV upload, AI CV analysis, matching
 *
 * The heavy analyze flow delegates to cv.service + ai.service with a deadline
 * budget so the request always returns structured JSON within the Vercel
 * function limit (no 504s).
 */
const { supabase } = require('../config/supabase');
const { createBudget } = require('../utils/budget');
const cvService = require('../services/cv.service');
const matchingService = require('../services/matching.service');
const { scrapeScholarshipsForCountry } = require('../services/scrape.service');

// Update own profile (linked to logged-in user, no duplicate rows)
async function updateProfile(req, res) {
  const { full_name, cgpa, ielts_score, target_country, target_degree, target_department, phone, gender, date_of_birth, cnic, residency_country, fsc_percentage, previous_degree, previous_university, previous_percentage, target_field } = req.body;

  const updates = {};
  if (full_name !== undefined) updates.full_name = full_name;
  if (cgpa !== undefined) updates.cgpa = cgpa;
  if (ielts_score !== undefined) updates.ielts_score = ielts_score;
  if (target_country !== undefined) updates.target_country = target_country;
  if (target_degree !== undefined) updates.target_degree = target_degree;
  if (target_department !== undefined) updates.target_department = target_department;
  if (phone !== undefined) updates.phone = phone;
  if (gender !== undefined) updates.gender = gender;
  if (date_of_birth !== undefined) updates.date_of_birth = date_of_birth;
  if (cnic !== undefined) updates.cnic = cnic;
  if (residency_country !== undefined) updates.residency_country = residency_country;
  if (fsc_percentage !== undefined) updates.fsc_percentage = fsc_percentage;
  if (previous_degree !== undefined) updates.previous_degree = previous_degree;
  if (previous_university !== undefined) updates.previous_university = previous_university;
  if (previous_percentage !== undefined) updates.previous_percentage = previous_percentage;
  if (target_field !== undefined) updates.target_field = target_field;

  // Also copy target_field to target_department for backward compat
  if (target_field !== undefined && !updates.target_department) {
    updates.target_department = target_field;
  }

  let updatedProfile = null;

  const { data, error } = await supabase
    .from('profiles')
    .update(updates)
    .eq('id', req.userId)
    .select();

  if (error) {
    // If extra columns don't exist yet, retry with core fields only
    if (error.message?.includes('column') || error.code === '42703') {
      const core = {};
      if (full_name !== undefined) core.full_name = full_name;
      if (cgpa !== undefined) core.cgpa = cgpa;
      if (ielts_score !== undefined) core.ielts_score = ielts_score;
      if (target_country !== undefined) core.target_country = target_country;
      if (target_degree !== undefined) core.target_degree = target_degree;
      if (target_department !== undefined) core.target_department = target_department;
      const { data: d2, error: e2 } = await supabase.from('profiles').update(core).eq('id', req.userId).select();
      if (e2) return res.status(500).json({ success: false, error: e2.message });
      updatedProfile = d2[0];
    } else {
      return res.status(500).json({ success: false, error: error.message });
    }
  } else {
    updatedProfile = data[0];
  }

  // 🚀 AUTO-FLOW: Save hote hi Live Scrape + CV Combination + Matching
  if (updatedProfile && (updates.target_country || updates.target_degree || updates.target_department || updates.target_field || updates.cgpa)) {
    const country = updatedProfile.target_country;
    if (country) {
      try {
        console.log(`\n🚀 [AUTO-FLOW] Target country "${country}" saved! Running Live Web Scrape & Combined Matching...`);
        // 1. Live scrape portals & discover fresh scholarships for this country
        await scrapeScholarshipsForCountry(supabase, country, null, { forceLive: true });
        // 2. Automatically compute and store matches based on Manual Data + CV Data
        const matches = await matchingService.runMatchAndStore(req.userId);
        console.log(`✅ [AUTO-FLOW] Successfully generated ${matches ? matches.length : 0} fresh matches for ${updatedProfile.full_name || 'User'}!\n`);
      } catch (autoErr) {
        console.warn('Auto-flow warning:', autoErr.message);
      }
    }
  }

  res.json({ success: true, profile: updatedProfile });
}

// Get profile by id
async function getProfile(req, res) {
  const { id } = req.params;
  if (id !== req.userId) {
    return res.status(403).json({ success: false, error: 'Not authorized to view this profile' });
  }

  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', id)
    .single();

  if (error) {
    return res.status(404).json({ success: false, error: error.message });
  }
  const { data: extractedRows } = await supabase
    .from('extracted_profile_data')
    .select('raw_extraction, created_at')
    .eq('profile_id', id)
    .order('created_at', { ascending: false })
    .limit(1);
  res.json({ success: true, profile: data, extracted: extractedRows?.[0]?.raw_extraction || null });
}

// Upload CV and link to profile
async function uploadCv(req, res) {
  const { id } = req.params;
  if (id !== req.userId) {
    return res.status(403).json({ success: false, error: 'Not authorized' });
  }
  const file = req.file;

  if (!file) {
    return res.status(400).json({ success: false, error: 'No file uploaded' });
  }

  const filePath = `${id}/${Date.now()}_${file.originalname}`;

  const { data, error } = await supabase.storage
    .from('cvs')
    .upload(filePath, file.buffer, {
      contentType: file.mimetype,
    });

  if (error) {
    return res.status(500).json({ success: false, error: error.message });
  }

  const { error: updateError } = await supabase
    .from('profiles')
    .update({ cv_file_path: filePath })
    .eq('id', id);

  if (updateError) {
    return res.status(500).json({ success: false, error: updateError.message });
  }

  res.json({ success: true, file_path: filePath });
}

// Analyze CV - AI Agent extracts academic data from uploaded CV (real PDF/DOCX parsing)
async function analyzeCv(req, res) {
  const { id } = req.params;
  if (id !== req.userId) {
    return res.status(403).json({ success: false, error: 'Not authorized' });
  }

  const budget = createBudget();

  let cvText = '';
  let fileBuf = null;
  let mimeType = '';

  if (req.file) {
    fileBuf = req.file.buffer;
    mimeType = req.file.mimetype;
  } else {
    const stored = await cvService.downloadStoredCv(id);
    if (stored) {
      fileBuf = stored.buffer;
      mimeType = stored.mimeType;
    }
  }

  if (fileBuf) {
    cvText = await cvService.extractTextFromFile(fileBuf, mimeType);
    if (req.file) {
      await cvService.uploadCv(id, fileBuf, mimeType, req.file.originalname);
    }
  }

  const extractedData = await cvService.extractAcademicData(cvText, budget);

  try {
    await cvService.persistExtractedData(id, extractedData);
  } catch (err) {
    return res.status(err.status || 500).json({ success: false, error: err.message });
  }

  // 🚀 Auto-recalculate matches combining fresh CV data + manual data
  try {
    const { data: prof } = await supabase.from('profiles').select('*').eq('id', req.userId).single();
    if (prof?.target_country) {
      console.log(`\n🚀 [AUTO-FLOW] Fresh CV uploaded! Live scraping & re-matching for ${prof.target_country}...`);
      await scrapeScholarshipsForCountry(supabase, prof.target_country, null, { forceLive: true });
      await matchingService.runMatchAndStore(req.userId);
      console.log('✅ [AUTO-FLOW] Matches updated with CV data!\n');
    }
  } catch (autoErr) {
    console.warn('Auto match with CV warning:', autoErr.message);
  }

  res.json({ success: true, extracted: extractedData, cv_text_length: cvText.length });
}

// Run matching for a profile against all scholarships - Weighted Engine with Reasons
async function matchScholarships(req, res) {
  const { id } = req.params;
  if (id !== req.userId) {
    return res.status(403).json({ success: false, error: 'Not authorized' });
  }

  try {
    const inserted = await matchingService.runMatchAndStore(id);
    res.json({ success: true, matches: inserted });
  } catch (err) {
    res.status(err.status || 500).json({ success: false, error: err.message });
  }
}

// Get stored matches for a profile
async function getMatches(req, res) {
  const { id } = req.params;

  if (id !== req.userId) {
    return res.status(403).json({ success: false, error: 'Not authorized' });
  }
  const { data, error } = await supabase
    .from('matches')
    .select('*, scholarships(title, country, deadline, apply_url, eligibility_criteria, department, degree_level), universities(name)')
    .eq('profile_id', id)
    .order('match_score', { ascending: false });

  if (error) {
    return res.status(500).json({ success: false, error: error.message });
  }

  const { data: profile } = await supabase.from('profiles').select('*').eq('id', id).single();
  const enriched = (data || []).map((m) => {
    const analysis = profile ? matchingService.computeMatchAnalysis(profile, m) : null;
    const { eligibility_criteria, ...scholarship } = m.scholarships || {};
    return { ...m, scholarships: scholarship, match_analysis: analysis };
  });

  res.json({ success: true, matches: enriched });
}

// Overview/Dashboard summary for a profile
async function getOverview(req, res) {
  const { id } = req.params;

  if (id !== req.userId) {
    return res.status(403).json({ success: false, error: 'Not authorized' });
  }

  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', id)
    .single();

  if (profileError || !profile) {
    return res.status(404).json({ success: false, error: 'Profile not found' });
  }

  const { data: matches, error: matchesError } = await supabase
    .from('matches')
    .select('*, scholarships(title, country, deadline), universities(name)')
    .eq('profile_id', id);

  if (matchesError) {
    return res.status(500).json({ success: false, error: matchesError.message });
  }

  const eligibleCount = matches.filter(m => m.status === 'Eligible').length;
  const missingCount = matches.filter(m => m.status === 'Partially Eligible').length;
  const notEligibleCount = matches.filter(m => m.status === 'Not Eligible').length;

  const topRecommendations = [...matches]
    .sort((a, b) => b.match_score - a.match_score)
    .slice(0, 3);

  const uniqueUniversities = [...new Set(matches.map(m => m.university_id))];

  res.json({
    success: true,
    overview: {
      profile_completeness: {
        has_cgpa: profile.cgpa != null,
        has_ielts: profile.ielts_score != null,
        has_cv: profile.cv_file_path != null,
        has_target_degree: profile.target_degree != null
      },
      summary: {
        total_scholarships_checked: matches.length,
        eligible: eligibleCount,
        missing_requirements: missingCount,
        not_eligible: notEligibleCount,
        universities_covered: uniqueUniversities.length
      },
      top_recommendations: topRecommendations
    }
  });
}

module.exports = { updateProfile, getProfile, uploadCv, analyzeCv, matchScholarships, getMatches, getOverview };