let app;
try {
  app = require('../index.js');
} catch (err) {
  const express = require('express');
  app = express();
  app.use((req, res) => {
    res.status(500).json({ error: 'Server startup failed', message: err.message, stack: err.stack });
  });
}

module.exports = app;
