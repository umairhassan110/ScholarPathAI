/**
 * Smart Agent Controller — the intelligent matching entry point
 *
 * All heavy orchestration lives in smartAgent.service with a deadline
 * budget; the controller only wires HTTP input/output.
 */
const { runSmartAgent } = require('../services/smartAgent.service');

// Smart Agent test endpoint (GET) - verify route exists
function getStatus(req, res) {
  res.json({ status: 'ok', message: 'Smart Agent is active', version: '2.0' });
}

// Smart Agent endpoint - the main entry point
async function match(req, res) {
  const targetId = req.body.profileId;
  if (!targetId || targetId !== req.userId) {
    return res.status(403).json({ success: false, error: 'Not authorized' });
  }

  try {
    const payload = await runSmartAgent(targetId);
    res.json(payload);
  } catch (err) {
    console.error('Smart Agent error:', err.message, err.stack);
    return res.status(err.status || 500).json({ success: false, error: 'Smart Agent error: ' + err.message });
  }
}

module.exports = { getStatus, match };
