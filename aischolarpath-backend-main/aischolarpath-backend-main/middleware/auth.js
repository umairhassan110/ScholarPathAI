/**
 * Auth Middleware — custom JWT authentication (unchanged logic)
 * Verifies the Bearer token and attaches the user id as req.userId.
 */
const jwt = require('jsonwebtoken');
const env = require('../config/env');

function authenticateToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ success: false, error: 'No token provided' });
  }

  jwt.verify(token, env.jwtSecret, (err, decoded) => {
    if (err) {
      return res.status(403).json({ success: false, error: 'Invalid or expired token' });
    }
    req.userId = decoded.id;
    next();
  });
}

module.exports = { authenticateToken };
