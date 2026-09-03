/**
 * Route Aggregator — mounts every domain router under /api
 *
 * Routers are mounted in an order that preserves the legacy registration
 * sequence; within each router, static segments (e.g. /pending/review) are
 * registered before dynamic ones (e.g. /:id) so resolution is unambiguous.
 */
const express = require('express');

const router = express.Router();

// Domain routers (paths map 1:1 to the legacy single-file routes)
// Health router defines GET /health and GET /test-db at its root, so it is
// mounted at the /api root; unmatched requests simply fall through.
router.use('/', require('./health.routes'));
router.use('/auth', require('./auth.routes'));
router.use('/profile', require('./profile.routes'));
router.use('/scholarships', require('./scholarships.routes'));
router.use('/universities', require('./universities.routes'));
router.use('/language-prep', require('./languagePrep.routes'));
router.use('/attestation', require('./attestation.routes'));
router.use('/shortlist', require('./shortlist.routes'));
router.use('/applications', require('./applications.routes'));
router.use('/documents', require('./documents.routes'));
router.use('/chat', require('./chat.routes'));
router.use('/notifications', require('./notifications.routes'));
router.use('/discovery', require('./discovery.routes'));
router.use('/roadmap', require('./roadmap.routes'));
router.use('/smart-agent', require('./smartAgent.routes'));

module.exports = router;
