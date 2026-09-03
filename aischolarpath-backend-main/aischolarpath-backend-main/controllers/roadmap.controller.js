/**
 * Roadmap Controller — personalized application roadmap
 */
const { supabase } = require('../config/supabase');
const { buildRoadmap } = require('../services/roadmap.service');

// Get personalized application roadmap for a profile, based on their nearest scholarship deadline
async function getRoadmap(req, res) {
  const { profileId } = req.params;
  if (profileId !== req.userId) {
    return res.status(403).json({ success: false, error: 'Not authorized' });
  }

  const { data: matches, error: matchesError } = await supabase
    .from('matches')
    .select('*, scholarships(title, deadline)')
    .eq('profile_id', profileId)
    // Matching engine emits 'Partially Eligible', never 'Missing Requirements'
    // (that literal string is a leftover DB column default that the engine
    // never writes) — use the real status value so partially-eligible
    // scholarships are included when building the roadmap.
    .in('status', ['Eligible', 'Partially Eligible'])
    .order('match_score', { ascending: false });

  if (matchesError) {
    return res.status(500).json({ success: false, error: matchesError.message });
  }

  const withDeadlines = matches
    .filter(m => m.scholarships?.deadline)
    .sort((a, b) => new Date(a.scholarships.deadline) - new Date(b.scholarships.deadline));

  if (withDeadlines.length === 0) {
    return res.json({ success: true, message: 'No upcoming deadlines found among your matches to build a roadmap from.', roadmap: [] });
  }

  const targetScholarship = withDeadlines[0].scholarships;
  const deadline = new Date(targetScholarship.deadline);
  const roadmap = buildRoadmap(deadline);

  res.json({
    success: true,
    based_on_scholarship: targetScholarship.title,
    deadline: targetScholarship.deadline,
    roadmap
  });
}

module.exports = { getRoadmap };
