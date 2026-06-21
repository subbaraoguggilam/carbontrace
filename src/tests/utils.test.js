'use strict';

const { AppError } = require('../utils/errors');
const logger = require('../utils/logger');

describe('AppError', () => {
  test('sets message, statusCode, and isOperational', () => {
    const err = new AppError('Something went wrong', 400);
    expect(err.message).toBe('Something went wrong');
    expect(err.statusCode).toBe(400);
    expect(err.isOperational).toBe(true);
    expect(err.name).toBe('AppError');
    expect(err).toBeInstanceOf(Error);
  });

  test('defaults statusCode to 500 when not provided', () => {
    const err = new AppError('Unexpected failure');
    expect(err.statusCode).toBe(500);
  });
});

describe('logger', () => {
  test('exposes info, warn, and error methods', () => {
    expect(typeof logger.info).toBe('function');
    expect(typeof logger.warn).toBe('function');
    expect(typeof logger.error).toBe('function');
  });

  test('does not throw when logging in test environment', () => {
    expect(() => logger.info('test message', { foo: 'bar' })).not.toThrow();
    expect(() => logger.warn('test warning')).not.toThrow();
    expect(() => logger.error('test error', { requestId: '123' })).not.toThrow();
  });
});
