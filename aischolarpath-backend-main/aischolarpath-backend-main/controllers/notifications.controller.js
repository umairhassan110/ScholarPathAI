/**
 * Notifications Controller — creation, listing, read state, deadline checks
 */
const { supabase } = require('../config/supabase');

// Create a notification (used internally or by other routes)
async function createNotification(req, res) {
  const { profile_id, type, title, message } = req.body;

  if (!profile_id || !type || !title) {
    return res.status(400).json({ success: false, error: 'profile_id, type, and title are required' });
  }

  // Same IDOR gap as the other create* endpoints — without this check any
  // authenticated user could write a notification into someone else's account.
  if (profile_id !== req.userId) {
    return res.status(403).json({ success: false, error: 'Not authorized' });
  }

  const { data, error } = await supabase
    .from('notifications')
    .insert([{ profile_id, type, title, message }])
    .select();

  if (error) {
    return res.status(500).json({ success: false, error: error.message });
  }
  res.json({ success: true, notification: data[0] });
}

// Get all notifications for a profile
async function getNotifications(req, res) {
  const { profileId } = req.params;

  // Check if the user is authorized to view this profile's notifications
  if (profileId !== req.userId) {
    return res.status(403).json({ success: false, error: 'Not authorized' });
  }

  const { data, error } = await supabase
    .from('notifications')
    .select('*')
    .eq('profile_id', profileId)
    .order('created_at', { ascending: false });

  if (error) {
    return res.status(500).json({ success: false, error: error.message });
  }
  res.json({ success: true, notifications: data });
}

// Mark a notification as read
async function markRead(req, res) {
  const { id } = req.params;

  // Check if the user is authorized to update this notification
  const { data: existing, error: fetchError } = await supabase
    .from('notifications')
    .select('profile_id')
    .eq('id', id)
    .single();

  if (fetchError || !existing) {
    return res.status(404).json({ success: false, error: 'Notification not found' });
  }

  if (existing.profile_id !== req.userId) {
    return res.status(403).json({ success: false, error: 'Not authorized' });
  }

  const { data, error } = await supabase
    .from('notifications')
    .update({ is_read: true })
    .eq('id', id)
    .select();

  if (error) {
    return res.status(500).json({ success: false, error: error.message });
  }
  res.json({ success: true, notification: data[0] });
}

// Check for scholarships nearing deadline (run manually or via cron later) and create reminders
async function checkDeadlines(req, res) {
  const { profileId } = req.params;
  if (profileId !== req.userId) {
    return res.status(403).json({ success: false, error: 'Not authorized' });
  }
  // Find applications with scholarships whose deadline is within 14 days
  const twoWeeksFromNow = new Date();
  twoWeeksFromNow.setDate(twoWeeksFromNow.getDate() + 14);

  const { data: applications, error } = await supabase
    .from('applications')
    .select('*, scholarships(title, deadline)')
    .eq('profile_id', profileId)
    .in('status', ['saved', 'preparing']);

  if (error) {
    return res.status(500).json({ success: false, error: error.message });
  }

  const dueApps = applications.filter(app => {
    if (!app.scholarships?.deadline) return false;
    const deadline = new Date(app.scholarships.deadline);
    return deadline <= twoWeeksFromNow && deadline >= new Date();
  });

  const notificationsToCreate = dueApps.map(app => ({
    profile_id: profileId,
    type: 'deadline_reminder',
    title: `Deadline approaching: ${app.scholarships.title}`,
    message: `The deadline for ${app.scholarships.title} is ${app.scholarships.deadline}. Current status: ${app.status}.`
  }));

  if (notificationsToCreate.length === 0) {
    return res.json({ success: true, message: 'No upcoming deadlines found', notifications: [] });
  }

  const { data: created, error: insertError } = await supabase
    .from('notifications')
    .insert(notificationsToCreate)
    .select();

  if (insertError) {
    return res.status(500).json({ success: false, error: insertError.message });
  }

  res.json({ success: true, notifications: created });
}

module.exports = { createNotification, getNotifications, markRead, checkDeadlines };
