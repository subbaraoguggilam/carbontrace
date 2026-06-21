'use strict';

/**
 * logger.js
 * Minimal structured logger. Centralising this avoids bare `console.*`
 * calls scattered through route handlers, and makes it trivial to swap
 * in a real logging library (pino/winston) later without touching callers.
 */

const isTest = process.env.NODE_ENV === 'test';

function format(level, message, meta) {
  const entry = {
    level,
    message,
    time: new Date().toISOString(),
    ...meta,
  };
  return JSON.stringify(entry);
}

const logger = {
  info(message, meta = {}) {
    if (!isTest) {
      console.log(format('info', message, meta));
    }
  },
  warn(message, meta = {}) {
    if (!isTest) {
      console.warn(format('warn', message, meta));
    }
  },
  error(message, meta = {}) {
    if (!isTest) {
      console.error(format('error', message, meta));
    }
  },
};

module.exports = logger;
