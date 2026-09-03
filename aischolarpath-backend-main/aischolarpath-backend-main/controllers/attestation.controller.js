/**
 * Attestation Controller — authority guides + tracked steps
 */
const { supabase } = require('../config/supabase');
const { getGuide, buildStepRows } = require('../services/attestation.service');

// Get static guide for an authority
function getAuthorityGuide(req, res) {
  const { authority } = req.params;
  const guide = getGuide(authority);

  if (!guide) {
    return res.status(404).json({ success: false, error: 'Unknown authority. Use HEC, IBCC, or MOFA.' });
  }
  res.json({ success: true, authority: authority.toUpperCase(), steps: guide });
}

// Initialize tracked steps for a profile
async function initSteps(req, res) {
  const { authority, profileId } = req.params;
  if (profileId !== req.userId) {
    return res.status(403).json({ success: false, error: 'Not authorized' });
  }

  const rows = buildStepRows(profileId, authority);
  if (!rows) {
    return res.status(404).json({ success: false, error: 'Unknown authority. Use HEC, IBCC, or MOFA.' });
  }

  const { data, error } = await supabase.from('attestation_steps').insert(rows).select();

  if (error) {
    return res.status(500).json({ success: false, error: error.message });
  }
  res.json({ success: true, steps: data });
}

// Get a profile's tracked attestation steps
async function getSteps(req, res) {
  const { profileId } = req.params;

  // Check if the user is authorized to view this profile's attestation steps
  if (profileId !== req.userId) {
    return res.status(403).json({ success: false, error: 'Not authorized' });
  }

  const { data, error } = await supabase
    .from('attestation_steps')
    .select('*')
    .eq('profile_id', profileId)
    .order('authority')
    .order('step_order');

  if (error) {
    return res.status(500).json({ success: false, error: error.message });
  }
  res.json({ success: true, steps: data });
}

// Mark a step as done
async function completeStep(req, res) {
  const { id } = req.params;

  // Check if the user is authorized to update this step
  const { data: existing, error: fetchError } = await supabase
    .from('attestation_steps')
    .select('profile_id')
    .eq('id', id)
    .single();

  if (fetchError || !existing) {
    return res.status(404).json({ success: false, error: 'Step not found' });
  }

  if (existing.profile_id !== req.userId) {
    return res.status(403).json({ success: false, error: 'Not authorized' });
  }

  const { data, error } = await supabase
    .from('attestation_steps')
    .update({ status: 'done' })
    .eq('id', id)
    .select();

  if (error) {
    return res.status(500).json({ success: false, error: error.message });
  }
  res.json({ success: true, step: data[0] });
}

module.exports = { getAuthorityGuide, initSteps, getSteps, completeStep };
