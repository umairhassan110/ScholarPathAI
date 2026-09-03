/**
 * Applications Controller — application tracker CRUD
 */
const { supabase } = require('../config/supabase');

// Create or start tracking an application
async function createApplication(req, res) {
  const { profile_id, scholarship_id, status, notes, next_action, next_action_date } = req.body;

  if (!profile_id || !scholarship_id) {
    return res.status(400).json({ success: false, error: 'profile_id and scholarship_id are required' });
  }

  // Prevent creating an application under someone else's profile_id
  // (createApplication was the one CRUD op here that never checked
  // ownership, unlike update/delete below).
  if (profile_id !== req.userId) {
    return res.status(403).json({ success: false, error: 'Not authorized' });
  }

  const { data, error } = await supabase
    .from('applications')
    .insert([{
      profile_id,
      scholarship_id,
      status: status || 'saved',
      notes,
      next_action,
      next_action_date
    }])
    .select();

  if (error) {
    return res.status(500).json({ success: false, error: error.message });
  }
  res.json({ success: true, application: data[0] });
}

// Update an application's status/notes
async function updateApplication(req, res) {
  const { id } = req.params;
  const { status, notes, next_action, next_action_date } = req.body;

  // Check if the user is authorized to update this application
  // Fetch existing application to verify ownership
  const { data: existing, error: fetchError } = await supabase
    .from('applications')
    .select('profile_id')
    .eq('id', id)
    .single();

  if (fetchError || !existing) {
    return res.status(404).json({ success: false, error: 'Application not found' });
  }

  if (existing.profile_id !== req.userId) {
    return res.status(403).json({ success: false, error: 'Not authorized' });
  }

  const updates = { updated_at: new Date().toISOString() };
  if (status) updates.status = status;
  if (notes !== undefined) updates.notes = notes;
  if (next_action !== undefined) updates.next_action = next_action;
  if (next_action_date !== undefined) updates.next_action_date = next_action_date;

  const { data, error } = await supabase
    .from('applications')
    .update(updates)
    .eq('id', id)
    .select();

  if (error) {
    return res.status(500).json({ success: false, error: error.message });
  }
  res.json({ success: true, application: data[0] });
}

// Get all applications for a profile (with scholarship details)
async function getApplications(req, res) {
  const { profileId } = req.params;

  // Check if the user is authorized to view this profile's applications
  if (profileId !== req.userId) {
    return res.status(403).json({ success: false, error: 'Not authorized' });
  }

  const { data, error } = await supabase
    .from('applications')
    .select('*, scholarships(title, country, deadline, apply_url)')
    .eq('profile_id', profileId)
    .order('updated_at', { ascending: false });

  if (error) {
    return res.status(500).json({ success: false, error: error.message });
  }
  res.json({ success: true, applications: data });
}

// Delete/remove an application from tracker
async function deleteApplication(req, res) {
  const { id } = req.params;

  // Check if the user is authorized to delete this application
  const { data: existing, error: fetchError } = await supabase
    .from('applications')
    .select('profile_id')
    .eq('id', id)
    .single();

  if (fetchError || !existing) {
    return res.status(404).json({ success: false, error: 'Application not found' });
  }

  if (existing.profile_id !== req.userId) {
    return res.status(403).json({ success: false, error: 'Not authorized' });
  }

  const { error } = await supabase.from('applications').delete().eq('id', id);

  if (error) {
    return res.status(500).json({ success: false, error: error.message });
  }
  res.json({ success: true, message: 'Application removed from tracker' });
}

module.exports = { createApplication, updateApplication, getApplications, deleteApplication };
