/**
 * Shortlist Controller — bookmark scholarships/universities
 */
const { supabase } = require('../config/supabase');

// Add item to shortlist
async function addShortlistItem(req, res) {
  const { profile_id, item_type, item_id } = req.body;

  if (!profile_id || !item_type || !item_id) {
    return res.status(400).json({ success: false, error: 'profile_id, item_type, and item_id are required' });
  }

  // Prevent adding a shortlist item under someone else's profile_id
  if (profile_id !== req.userId) {
    return res.status(403).json({ success: false, error: 'Not authorized' });
  }

  if (!['scholarship', 'university'].includes(item_type)) {
    return res.status(400).json({ success: false, error: "item_type must be 'scholarship' or 'university'" });
  }

  const { data, error } = await supabase
    .from('shortlist')
    .insert([{ profile_id, item_type, item_id }])
    .select();

  if (error) {
    return res.status(500).json({ success: false, error: error.message });
  }
  res.json({ success: true, shortlisted: data[0] });
}

// Remove item from shortlist
async function removeShortlistItem(req, res) {
  const { id } = req.params;

  // Verify ownership before deleting (mirrors applications.controller's
  // updateApplication/deleteApplication pattern) — without this check any
  // logged-in user could remove any other user's shortlist entry by guessing
  // its id.
  const { data: existing, error: fetchError } = await supabase
    .from('shortlist')
    .select('profile_id')
    .eq('id', id)
    .single();

  if (fetchError || !existing) {
    return res.status(404).json({ success: false, error: 'Shortlist item not found' });
  }

  if (existing.profile_id !== req.userId) {
    return res.status(403).json({ success: false, error: 'Not authorized' });
  }

  const { error } = await supabase.from('shortlist').delete().eq('id', id);

  if (error) {
    return res.status(500).json({ success: false, error: error.message });
  }
  res.json({ success: true, message: 'Removed from shortlist' });
}

// Get a profile's full shortlist (with scholarship/university details)
async function getShortlist(req, res) {
  const { profileId } = req.params;

  // Check if the user is authorized to view this shortlist
  if (profileId !== req.userId) {
    return res.status(403).json({ success: false, error: 'Not authorized' });
  }

  const { data: items, error } = await supabase
    .from('shortlist')
    .select('*')
    .eq('profile_id', profileId);

  if (error) {
    return res.status(500).json({ success: false, error: error.message });
  }

  const scholarshipIds = items.filter(i => i.item_type === 'scholarship').map(i => i.item_id);
  const universityIds = items.filter(i => i.item_type === 'university').map(i => i.item_id);

  let scholarships = [];
  let universities = [];

  if (scholarshipIds.length > 0) {
    const { data } = await supabase.from('scholarships').select('*').in('id', scholarshipIds);
    scholarships = data || [];
  }

  if (universityIds.length > 0) {
    const { data } = await supabase.from('universities').select('*').in('id', universityIds);
    universities = data || [];
  }

  res.json({ success: true, scholarships, universities });
}

module.exports = { addShortlistItem, removeShortlistItem, getShortlist };
