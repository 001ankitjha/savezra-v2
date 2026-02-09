const express = require('express');
const path = require('path'); // NEW
const webhookRoutes = require('./routes/webhook');
const adminRoutes = require('./routes/admin');
const logger = require('./utils/logger');

const app = express();

// WhatsApp sends JSON payloads
app.use(express.json({ limit: '5mb' }));

// Simple request logger (helps debug webhooks)
app.use((req, res, next) => {
  console.log(`[REQ] ${new Date().toISOString()} ${req.method} ${req.url}`);
  next();
});

// Serve static website from /public (index.html, styles.css, images, etc.)
app.use(express.static(path.join(__dirname, '..', 'public')));
// __dirname is src/, so we go one level up (..) to reach the project root,
// then into /public.

// Health check endpoint
app.get('/health', (req, res) => {
  res.status(200).json({
    status: 'ok',
    service: 'savezra',
    timestamp: new Date().toISOString(),
  });
});

// Admin routes
app.use('/admin', adminRoutes);

// Webhook routes (for WhatsApp)
app.use('/webhook', webhookRoutes);

// 404 handler (for anything not matched above)
app.use((req, res) => {
  res.status(404).json({ error: 'Not found' });
});

// Global error handler
app.use((err, req, res, _next) => {
  logger.error('Unhandled express error', {
    error: err.message,
    stack: err.stack,
    path: req.path,
  });
  res.status(500).json({ error: 'Internal server error' });
});

module.exports = app;