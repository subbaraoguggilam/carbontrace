'use strict';

/**
 * errors.js
 * A single custom error type for expected, "operational" failures
 * (bad input, calculation faults) so the centralised error handler in
 * server.js can distinguish them from unexpected bugs and respond with
 * the right status code consistently, instead of every route inventing
 * its own status/shape inline.
 */

class AppError extends Error {
  /**
   * @param {string} message - human-readable error message
   * @param {number} statusCode - HTTP status to respond with
   */
  constructor(message, statusCode = 500) {
    super(message);
    this.name = 'AppError';
    this.statusCode = statusCode;
    this.isOperational = true;
    Error.captureStackTrace(this, this.constructor);
  }
}

module.exports = { AppError };
