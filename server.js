'use strict';

const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const compression = require('compression');
const rateLimit = require('express-rate-limit');
const { randomUUID } = require('crypto');
const path = require('path');
const fs = require('fs');

const {
  calculateTotalFootprint,
  generateRecommendations,
  calculateEquivalencies,
  TRANSPORT_FACTORS,
  HOME_FACTORS,
  DIET_FACTORS,
  SHOPPING_FACTORS,
} = require('./src/utils/carbonCalculator');

const { validateCalculateInput, validateKgParam } = require('./src/utils/validator');
const logger = require('./src/utils/logger');
const { AppError } = require('./src/utils/errors');

const app = express();
const PORT = process.env.PORT || 3000;
const ALLOWED_ORIGIN = process.env.ALLOWED_ORIGIN || '*';

// ---------------------------------------------------------------------------
// Security middleware
// ---------------------------------------------------------------------------

app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        styleSrc: ["'self'", 'https://fonts.googleapis.com', "'unsafe-inline'"],
        fontSrc: ["'self'", 'https://fonts.gstatic.com'],
        // NOTE: 'unsafe-inline' is required because the frontend is a single
        // static index.html with its app logic in one inline <script> block
        // (no per-request nonce is generated for static files). All onclick
        // attributes have been removed in favour of a delegated listener
        // with a function whitelist (see public/index.html), so this CSP
        // setting does not re-open inline-event-handler injection risk —
        // it only permits the one first-party script block to execute.
        scriptSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", 'data:'],
        connectSrc: ["'self'"],
      },
    },
  })
);

app.use(
  cors({
    origin: ALLOWED_ORIGIN,
    methods: ['GET', 'POST'],
  })
);

// Gzip/deflate compression for all responses (JSON API + static assets).
app.use(compression());

// Request ID for audit/log correlation, attached before any logging happens.
app.use((req, res, next) => {
  req.requestId = randomUUID();
  res.setHeader('X-Request-Id', req.requestId);
  next();
});

// Body size cap to mitigate large-payload abuse.
app.use(express.json({ limit: '10kb' }));

// General API rate limit.
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, error: 'Too many requests. Please try again later.' },
});
app.use('/api/', apiLimiter);

// Tighter limit specifically on the calculation endpoint.
const calculateLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, error: 'Too many calculation requests. Please slow down.' },
});

// ---------------------------------------------------------------------------
// Response helpers
// ---------------------------------------------------------------------------

/**
 * Sends a consistent JSON error response, avoiding the same
 * { success: false, error, requestId } shape being hand-typed in every route.
 * @param {import('express').Response} res
 * @param {number} statusCode
 * @param {string|string[]} errorOrErrors - single error message or array of errors
 * @param {string} requestId
 */
function sendError(res, statusCode, errorOrErrors, requestId) {
  const body = { success: false, requestId };
  if (Array.isArray(errorOrErrors)) {
    body.errors = errorOrErrors;
  } else {
    body.error = errorOrErrors;
  }
  return res.status(statusCode).json(body);
}

app.use(express.static(path.join(__dirname, 'public'), { maxAge: '1d', etag: true }));

// SPA fallback HTML is read once at startup and served from memory,
// avoiding a disk read on every non-API GET request.
const indexHtml = fs.readFileSync(path.join(__dirname, 'public', 'index.html'));

// ---------------------------------------------------------------------------
// API routes
// ---------------------------------------------------------------------------

app.get('/api/health', (req, res) => {
  res.json({ success: true, status: 'ok', timestamp: new Date().toISOString() });
});

app.get('/api/emission-factors', (req, res) => {
  // Static reference data that never changes per-deploy; safe to cache.
  res.set('Cache-Control', 'public, max-age=3600');
  res.json({
    success: true,
    data: {
      transport: TRANSPORT_FACTORS,
      home: HOME_FACTORS,
      diet_presets: DIET_FACTORS,
      shopping: SHOPPING_FACTORS,
    },
  });
});

app.post('/api/calculate', calculateLimiter, (req, res) => {
  const { value: sanitizedInput, errors } = validateCalculateInput(req.body);

  if (errors.length > 0) {
    return sendError(res, 400, errors, req.requestId);
  }

  try {
    const footprint = calculateTotalFootprint(sanitizedInput);
    const recommendations = generateRecommendations(sanitizedInput, footprint);
    const equivalencies = calculateEquivalencies(footprint.total_kg);

    res.json({
      success: true,
      data: { footprint, recommendations, equivalencies },
      requestId: req.requestId,
    });
  } catch (err) {
    const appErr =
      err instanceof AppError ? err : new AppError('Failed to calculate footprint', 500);
    logger.error('calculate failed', { requestId: req.requestId, message: err.message });
    sendError(res, appErr.statusCode, appErr.message, req.requestId);
  }
});

app.get('/api/equivalencies/:kg', (req, res) => {
  const { value, error } = validateKgParam(req.params.kg);

  if (error) {
    return sendError(res, 400, error, req.requestId);
  }

  res.json({
    success: true,
    data: calculateEquivalencies(value),
    requestId: req.requestId,
  });
});

// ---------------------------------------------------------------------------
// Fallbacks
// ---------------------------------------------------------------------------

app.use('/api', (req, res) => {
  sendError(res, 404, 'Not found', req.requestId);
});

// SPA fallback: any non-API GET route serves the frontend shell from memory.
app.get('*', (req, res) => {
  res.set('Content-Type', 'text/html');
  res.send(indexHtml);
});

// Centralised error handler (e.g. malformed JSON bodies from express.json()).
app.use((err, req, res, next) => {
  if (err.type === 'entity.too.large') {
    return sendError(res, 413, 'Payload too large', req.requestId);
  }
  if (err instanceof SyntaxError) {
    return sendError(res, 400, 'Invalid JSON body', req.requestId);
  }
  logger.error('unhandled error', { requestId: req.requestId, message: err.message });
  sendError(res, 500, 'Internal server error', req.requestId);
});

// Only start listening when run directly (not when imported by tests).
if (require.main === module) {
  app.listen(PORT, () => {
    logger.info('CarbonTrace server started', { port: PORT });
  });
}

module.exports = app;
