/**
 * Universities Controller — Strict Country Filtering & Profile Ranking
 */
const { supabase } = require('../config/supabase');

async function listUniversities(req, res) {
  const { country, degree_program, search } = req.query;
  let uniQuery = supabase.from('universities').select('*');
  if (country) uniQuery = uniQuery.eq('country', country);
  if (degree_program) uniQuery = uniQuery.contains('degree_programs', [degree_program]);
  if (search) uniQuery = uniQuery.ilike('name', `%${search}%`);

  const { data: universities, error } = await uniQuery;
  if (error) return res.status(500).json({ success: false, error: error.message });
  res.json({ success: true, universities: universities || [] });
}

async function getUniversity(req, res) {
  const { id } = req.params;
  const { data, error } = await supabase.from('universities').select('*').eq('id', id).single();
  if (error) return res.status(404).json({ success: false, error: error.message });
  res.json({ success: true, university: data });
}

async function topMatchUniversities(req, res) {
  const { profileId } = req.params;
  if (profileId !== req.userId) {
    return res.status(403).json({ success: false, error: 'Not authorized' });
  }

  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', profileId)
    .single();

  if (profileError || !profile) {
    return res.status(404).json({ success: false, error: 'Profile not found' });
  }

  let combinedProfile = { ...profile };
  try {
    const { data: extractedRows } = await supabase
      .from('extracted_profile_data')
      .select('raw_extraction')
      .eq('profile_id', profileId)
      .order('created_at', { ascending: false })
      .limit(1);

    if (extractedRows?.[0]?.raw_extraction) {
      const raw = extractedRows[0].raw_extraction;
      const academics = raw.academics || raw;
      const language = raw.language || raw;
      if (!combinedProfile.cgpa && academics.cgpa) combinedProfile.cgpa = academics.cgpa;
      if (!combinedProfile.ielts_score && language.ielts_score) combinedProfile.ielts_score = language.ielts_score;
      if (!combinedProfile.target_degree && (academics.degree_level || raw.degree_level)) combinedProfile.target_degree = academics.degree_level || raw.degree_level;
      if (!combinedProfile.target_field && (academics.field_of_study || raw.department)) combinedProfile.target_field = academics.field_of_study || raw.department;
    }
  } catch (err) {
    // ignore
  }

  const targetCountry = (combinedProfile.target_country || '').trim().toLowerCase();
  const studentCgpa = parseFloat(combinedProfile.cgpa) || 3.0;
  const studentField = (combinedProfile.target_field || combinedProfile.field_of_study || '').toLowerCase();

  // Fetch universities
  let uniQuery = supabase.from('universities').select('*');
  const { data: allUniversities } = await uniQuery;
  const universities = allUniversities || [];

  if (universities.length === 0) {
    return res.json({ success: true, universities: [] });
  }

  // Fetch scholarships
  const { data: scholarships } = await supabase
    .from('scholarships')
    .select('*')
    .eq('status', 'active');

  const allSchols = scholarships || [];

  // Filter STRICTLY by Target Country if specified
  let filteredUniversities = universities;
  if (targetCountry) {
    const matched = universities.filter(u => 
      (u.country || '').trim().toLowerCase() === targetCountry || 
      (u.country || '').toLowerCase().includes(targetCountry) ||
      targetCountry.includes((u.country || '').toLowerCase())
    );
    if (matched.length > 0) {
      filteredUniversities = matched;
    }
  }

  // Score only the relevant universities
  const ranked = filteredUniversities.map(uni => {
    let score = 75; // base score for target country universities
    const programs = (uni.degree_programs || []).map(p => String(p).toLowerCase());

    if (studentField && programs.some(p => p.includes(studentField) || studentField.includes(p) || p.includes('computer') || p.includes('ai'))) {
      score += 15;
    } else if (programs.length > 0) {
      score += 8;
    }

    if (studentCgpa >= 3.5) score += 8;
    else if (studentCgpa >= 3.0) score += 5;

    const uniSchols = allSchols.filter(s => 
      (s.university_id && s.university_id === uni.id) || 
      (s.country && s.country.toLowerCase() === (uni.country || '').toLowerCase())
    );

    score = Math.min(99, Math.max(70, score));

    return {
      ...uni,
      match_percentage: Math.round(score),
      scholarship_count: uniSchols.length,
    };
  });

  ranked.sort((a, b) => b.match_percentage - a.match_percentage);

  res.json({ success: true, universities: ranked });
}

module.exports = { listUniversities, getUniversity, topMatchUniversities };