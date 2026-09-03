/**
 * Language Prep Controller — static guides + personalized gap analysis
 */
const { supabase } = require('../config/supabase');
const { languagePrepGuides, getGuide } = require('../services/languagePrep.service');

// Get static guide for a test type
function getTestGuide(req, res) {
  const { testType } = req.params;
  const guide = getGuide(testType);

  if (!guide) {
    return res.status(404).json({ success: false, error: 'Unknown test type. Use IELTS, TOEFL, or PTE.' });
  }
  res.json({ success: true, test_type: testType.toUpperCase(), guide });
}

// Get personalized language prep info for a profile (compares current score to what their matches require)
async function getProfilePrep(req, res) {
  const { profileId } = req.params;
  if (profileId !== req.userId) {
    return res.status(403).json({ success: false, error: 'Not authorized' });
  }

  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('ielts_score')
    .eq('id', profileId)
    .single();

  if (profileError || !profile) {
    return res.status(404).json({ success: false, error: 'Profile not found' });
  }

  const { data: matches, error: matchesError } = await supabase
    .from('matches')
    .select('*, scholarships(title, eligibility_criteria)')
    .eq('profile_id', profileId);

  if (matchesError) {
    return res.status(500).json({ success: false, error: matchesError.message });
  }

  const currentScore = profile.ielts_score;
  const requirements = matches
    .filter(m => m.scholarships?.eligibility_criteria?.min_ielts != null)
    .map(m => ({
      scholarship: m.scholarships.title,
      required: m.scholarships.eligibility_criteria.min_ielts,
      gap: currentScore != null ? (m.scholarships.eligibility_criteria.min_ielts - currentScore).toFixed(1) : null
    }));

  const highestRequirement = requirements.length > 0
    ? Math.max(...requirements.map(r => r.required))
    : null;

  res.json({
    success: true,
    current_ielts_score: currentScore,
    highest_required_score: highestRequirement,
    needs_improvement: currentScore != null && highestRequirement != null ? currentScore < highestRequirement : null,
    requirements_by_scholarship: requirements,
    guide: languagePrepGuides.IELTS
  });
}

module.exports = { getTestGuide, getProfilePrep };
