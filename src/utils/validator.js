'use strict';

/**
 * validator.js
 * Input validation and sanitisation for the /api/calculate endpoint.
 *
 * Defence-in-depth principles applied here:
 *  - Whitelist: only known keys per category are accepted; anything else
 *    is silently dropped rather than processed, so unexpected fields can't
 *    influence calculations or be reflected back.
 *  - Type coercion is explicit and rejects non-finite/garbage values.
 *  - Numeric clamping bounds every value to a sane range, preventing
 *    overflow-style abuse (e.g. submitting 1e308 to break downstream math).
 *  - No value is ever passed to calculation logic without first
 *    passing through this module.
 */

const MIN_VALUE = 0;
const MAX_VALUE = 100000;

const ALLOWED_KEYS = {
  transport: [
    'car_petrol',
    'car_electric',
    'motorcycle',
    'bus',
    'train',
    'flight_domestic',
    'flight_international',
  ],
  home: ['electricity_kwh', 'solar_kwh', 'natural_gas_m3', 'heating_oil_l'],
  shopping: ['clothing_item', 'electronics_small', 'electronics_large', 'streaming_hour'],
};

const ALLOWED_DIETS = ['vegan', 'vegetarian', 'pescatarian', 'omnivore', 'high_meat'];

/**
 * Clamps a numeric value into [MIN_VALUE, MAX_VALUE], rejecting
 * non-numeric or non-finite input by returning null.
 */
function clampNumber(value) {
  const n = typeof value === 'number' ? value : parseFloat(value);
  if (!isFinite(n) || isNaN(n)) {
    return null;
  }
  return Math.min(Math.max(n, MIN_VALUE), MAX_VALUE);
}

/**
 * Filters an object down to whitelisted keys with clamped numeric values.
 * Unknown keys and invalid values are dropped (not errored), keeping the
 * endpoint resilient to noisy/partial client input.
 */
function sanitizeCategory(obj, allowedKeys) {
  const result = {};
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) {
    return result;
  }

  for (const key of allowedKeys) {
    if (!(key in obj)) {
      continue;
    }
    const clamped = clampNumber(obj[key]);
    if (clamped !== null && clamped > 0) {
      result[key] = clamped;
    }
  }
  return result;
}

/**
 * Validates and sanitises the `food` category, which has a different
 * shape ({ diet, days }) from the numeric-map categories.
 */
function sanitizeFood(food) {
  const errors = [];
  if (!food || typeof food !== 'object' || Array.isArray(food)) {
    return { value: { diet: 'omnivore', days: 7 }, errors };
  }

  let diet = 'omnivore';
  if (food.diet !== undefined) {
    if (typeof food.diet === 'string' && ALLOWED_DIETS.includes(food.diet)) {
      diet = food.diet;
    } else {
      errors.push(`Invalid diet value: must be one of ${ALLOWED_DIETS.join(', ')}`);
    }
  }

  let days = 7;
  if (food.days !== undefined) {
    const clamped = clampNumber(food.days);
    if (clamped !== null && clamped > 0 && clamped <= 366) {
      days = clamped;
    } else {
      errors.push('Invalid days value: must be a number between 1 and 366');
    }
  }

  return { value: { diet, days }, errors };
}

/**
 * Validates the full request body for POST /api/calculate.
 * Returns { value, errors }. `value` is always a safe, fully-sanitised
 * object even when errors are present, so callers can decide whether
 * to reject or proceed with best-effort data.
 */
function validateCalculateInput(body) {
  const errors = [];

  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return {
      value: { transport: {}, home: {}, food: { diet: 'omnivore', days: 7 }, shopping: {} },
      errors: ['Request body must be a JSON object'],
    };
  }

  const transport = sanitizeCategory(body.transport, ALLOWED_KEYS.transport);
  const home = sanitizeCategory(body.home, ALLOWED_KEYS.home);
  const shopping = sanitizeCategory(body.shopping, ALLOWED_KEYS.shopping);
  const { value: food, errors: foodErrors } = sanitizeFood(body.food);
  errors.push(...foodErrors);

  const hasAnyInput =
    Object.keys(transport).length > 0 ||
    Object.keys(home).length > 0 ||
    Object.keys(shopping).length > 0 ||
    (body.food && Object.keys(body.food).length > 0);

  if (!hasAnyInput) {
    errors.push('At least one category must contain valid activity data');
  }

  return { value: { transport, home, food, shopping }, errors };
}

/**
 * Validates a kg value used in the /api/equivalencies/:kg route param.
 */
function validateKgParam(rawKg) {
  const n = clampNumber(rawKg);
  if (n === null) {
    return { value: null, error: 'kg must be a finite number between 0 and 100000' };
  }
  return { value: n, error: null };
}

module.exports = {
  MIN_VALUE,
  MAX_VALUE,
  ALLOWED_KEYS,
  ALLOWED_DIETS,
  clampNumber,
  sanitizeCategory,
  sanitizeFood,
  validateCalculateInput,
  validateKgParam,
};
