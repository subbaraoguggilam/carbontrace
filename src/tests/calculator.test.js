'use strict';

const {
  calculateTransport,
  calculateHome,
  calculateFood,
  calculateShopping,
  calculateTotalFootprint,
  generateRecommendations,
  calculateEquivalencies,
  TRANSPORT_FACTORS,
} = require('../utils/carbonCalculator');

const {
  clampNumber,
  sanitizeCategory,
  sanitizeFood,
  validateCalculateInput,
  validateKgParam,
  ALLOWED_KEYS,
} = require('../utils/validator');

// ---------------------------------------------------------------------------
// Transport emission calculations
// ---------------------------------------------------------------------------
describe('calculateTransport', () => {
  test('calculates petrol car emissions correctly', () => {
    const result = calculateTransport({ car_petrol: 100 });
    expect(result.total).toBeCloseTo(100 * TRANSPORT_FACTORS.car_petrol, 2);
  });

  test('calculates electric car emissions lower than petrol for same distance', () => {
    const petrol = calculateTransport({ car_petrol: 100 });
    const electric = calculateTransport({ car_electric: 100 });
    expect(electric.total).toBeLessThan(petrol.total);
  });

  test('sums multiple transport modes', () => {
    const result = calculateTransport({ car_petrol: 50, train: 50 });
    const expected = 50 * TRANSPORT_FACTORS.car_petrol + 50 * TRANSPORT_FACTORS.train;
    expect(result.total).toBeCloseTo(expected, 2);
  });

  test('ignores unknown transport keys', () => {
    const result = calculateTransport({ teleporter: 1000 });
    expect(result.total).toBe(0);
    expect(result.breakdown.teleporter).toBeUndefined();
  });

  test('returns zero total for empty input', () => {
    expect(calculateTransport({}).total).toBe(0);
  });

  test('returns zero total for undefined input', () => {
    expect(calculateTransport(undefined).total).toBe(0);
  });

  test('flight emissions scale linearly with distance', () => {
    const short = calculateTransport({ flight_domestic: 500 });
    const long = calculateTransport({ flight_domestic: 1000 });
    expect(long.total).toBeCloseTo(short.total * 2, 1);
  });
});

// ---------------------------------------------------------------------------
// Home energy calculations
// ---------------------------------------------------------------------------
describe('calculateHome', () => {
  test('calculates electricity emissions correctly', () => {
    const result = calculateHome({ electricity_kwh: 300 });
    expect(result.total).toBeCloseTo(300 * 0.233, 2);
  });

  test('solar has lower emissions than grid electricity', () => {
    const grid = calculateHome({ electricity_kwh: 100 });
    const solar = calculateHome({ solar_kwh: 100 });
    expect(solar.total).toBeLessThan(grid.total);
  });

  test('sums gas and electricity together', () => {
    const result = calculateHome({ electricity_kwh: 100, natural_gas_m3: 10 });
    expect(result.breakdown.electricity_kwh).toBeGreaterThan(0);
    expect(result.breakdown.natural_gas_m3).toBeGreaterThan(0);
  });

  test('returns zero for empty input', () => {
    expect(calculateHome({}).total).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Food / diet calculations
// ---------------------------------------------------------------------------
describe('calculateFood', () => {
  test('vegan diet produces lower emissions than high_meat over same days', () => {
    const vegan = calculateFood({ diet: 'vegan', days: 7 });
    const highMeat = calculateFood({ diet: 'high_meat', days: 7 });
    expect(vegan.total).toBeLessThan(highMeat.total);
  });

  test('defaults to omnivore when diet is missing', () => {
    const result = calculateFood({ days: 7 });
    expect(result.breakdown.diet).toBe('omnivore');
  });

  test('defaults to 7 days when days is missing', () => {
    const result = calculateFood({ diet: 'vegan' });
    expect(result.breakdown.days).toBe(7);
  });

  test('scales linearly with number of days', () => {
    const oneDay = calculateFood({ diet: 'omnivore', days: 1 });
    const sevenDays = calculateFood({ diet: 'omnivore', days: 7 });
    expect(sevenDays.total).toBeCloseTo(oneDay.total * 7, 2);
  });

  test('handles unknown diet by defaulting to omnivore', () => {
    const result = calculateFood({ diet: 'carnivore-extreme', days: 7 });
    expect(result.breakdown.diet).toBe('omnivore');
  });

  test('handles fully empty input gracefully', () => {
    const result = calculateFood({});
    expect(result.total).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// Shopping calculations
// ---------------------------------------------------------------------------
describe('calculateShopping', () => {
  test('calculates clothing emissions correctly', () => {
    const result = calculateShopping({ clothing_item: 2 });
    expect(result.total).toBeCloseTo(2 * 8.4, 2);
  });

  test('large electronics contribute more than small electronics', () => {
    const small = calculateShopping({ electronics_small: 1 });
    const large = calculateShopping({ electronics_large: 1 });
    expect(large.total).toBeGreaterThan(small.total);
  });
});

// ---------------------------------------------------------------------------
// Total footprint aggregation
// ---------------------------------------------------------------------------
describe('calculateTotalFootprint', () => {
  test('aggregates all categories into a positive annual total', () => {
    const result = calculateTotalFootprint({
      transport: { car_petrol: 100 },
      home: { electricity_kwh: 300 },
      food: { diet: 'omnivore', days: 7 },
      shopping: { clothing_item: 2 },
    });
    expect(result.total_kg).toBeGreaterThan(0);
    expect(result.total_tonnes).toBeCloseTo(result.total_kg / 1000, 4);
  });

  test('comparison percentages are computed relative to benchmarks', () => {
    const result = calculateTotalFootprint({
      transport: {}, home: {}, food: { diet: 'vegan', days: 7 }, shopping: {},
    });
    expect(result.comparison.vs_global_avg).toBeGreaterThan(0);
    expect(result.comparison.vs_paris_target).toBeGreaterThan(0);
  });

  test('higher activity input produces a higher total than lower activity input', () => {
    const low = calculateTotalFootprint({
      transport: { car_petrol: 10 }, home: {}, food: { diet: 'vegan', days: 7 }, shopping: {},
    });
    const high = calculateTotalFootprint({
      transport: { car_petrol: 500, flight_international: 5000 },
      home: { electricity_kwh: 1000 },
      food: { diet: 'high_meat', days: 7 },
      shopping: { electronics_large: 3 },
    });
    expect(high.total_kg).toBeGreaterThan(low.total_kg);
  });

  test('handles completely empty input without throwing', () => {
    expect(() => calculateTotalFootprint({})).not.toThrow();
  });

  test('each category breakdown is present in the result', () => {
    const result = calculateTotalFootprint({
      transport: { car_petrol: 10 }, home: {}, food: {}, shopping: {},
    });
    expect(result.categories).toHaveProperty('transport');
    expect(result.categories).toHaveProperty('home');
    expect(result.categories).toHaveProperty('food');
    expect(result.categories).toHaveProperty('shopping');
  });
});

// ---------------------------------------------------------------------------
// Recommendation generation
// ---------------------------------------------------------------------------
describe('generateRecommendations', () => {
  test('returns at least one recommendation for a high-footprint profile', () => {
    const input = {
      transport: { car_petrol: 200, flight_international: 3000 },
      home: { electricity_kwh: 500 },
      food: { diet: 'high_meat', days: 7 },
      shopping: { electronics_large: 2 },
    };
    const footprint = calculateTotalFootprint(input);
    const recs = generateRecommendations(input, footprint);
    expect(recs.length).toBeGreaterThan(0);
  });

  test('recommendations are sorted by descending impact', () => {
    const input = {
      transport: { car_petrol: 200, flight_international: 3000 },
      home: { electricity_kwh: 500 },
      food: { diet: 'high_meat', days: 7 },
      shopping: { electronics_large: 2 },
    };
    const footprint = calculateTotalFootprint(input);
    const recs = generateRecommendations(input, footprint);
    for (let i = 1; i < recs.length; i++) {
      expect(recs[i - 1].impact_kg_per_year).toBeGreaterThanOrEqual(recs[i].impact_kg_per_year);
    }
  });

  test('returns a fallback recommendation when footprint is minimal', () => {
    const input = { transport: {}, home: {}, food: { diet: 'vegan', days: 7 }, shopping: {} };
    const footprint = calculateTotalFootprint(input);
    const recs = generateRecommendations(input, footprint);
    expect(recs.length).toBeGreaterThan(0);
  });

  test('every recommendation has the required shape', () => {
    const input = { transport: { car_petrol: 100 }, home: {}, food: {}, shopping: {} };
    const footprint = calculateTotalFootprint(input);
    const recs = generateRecommendations(input, footprint);
    recs.forEach((r) => {
      expect(r).toHaveProperty('category');
      expect(r).toHaveProperty('action');
      expect(r).toHaveProperty('impact_kg_per_year');
      expect(r).toHaveProperty('difficulty');
      expect(r).toHaveProperty('cost_saving');
    });
  });
});

// ---------------------------------------------------------------------------
// Equivalency calculation
// ---------------------------------------------------------------------------
describe('calculateEquivalencies', () => {
  test('computes tree offset equivalency', () => {
    const result = calculateEquivalencies(2100);
    expect(result.trees_to_offset_annual).toBe(100);
  });

  test('computes driving km equivalency', () => {
    const result = calculateEquivalencies(192);
    expect(result.km_driving_equivalent).toBe(1000);
  });

  test('computes phone charge equivalency', () => {
    const result = calculateEquivalencies(8.4);
    expect(result.smartphone_charges).toBe(1000);
  });

  test('handles zero kg input', () => {
    const result = calculateEquivalencies(0);
    expect(result.trees_to_offset_annual).toBe(0);
  });

  test('throws on negative input', () => {
    expect(() => calculateEquivalencies(-5)).toThrow(RangeError);
  });

  test('throws on non-numeric input', () => {
    expect(() => calculateEquivalencies('not-a-number')).toThrow(RangeError);
  });
});

// ---------------------------------------------------------------------------
// Input validation & sanitisation
// ---------------------------------------------------------------------------
describe('clampNumber', () => {
  test('clamps values above the maximum', () => {
    expect(clampNumber(999999999)).toBe(100000);
  });

  test('clamps negative values up to the minimum', () => {
    expect(clampNumber(-50)).toBe(0);
  });

  test('returns null for non-numeric strings', () => {
    expect(clampNumber('abc')).toBeNull();
  });

  test('returns null for NaN', () => {
    expect(clampNumber(NaN)).toBeNull();
  });

  test('returns null for Infinity', () => {
    expect(clampNumber(Infinity)).toBeNull();
  });

  test('coerces numeric strings', () => {
    expect(clampNumber('42')).toBe(42);
  });
});

describe('sanitizeCategory', () => {
  test('drops keys not in the whitelist', () => {
    const result = sanitizeCategory({ car_petrol: 10, malicious_key: 999 }, ALLOWED_KEYS.transport);
    expect(result.malicious_key).toBeUndefined();
    expect(result.car_petrol).toBe(10);
  });

  test('drops zero and negative values', () => {
    const result = sanitizeCategory({ car_petrol: 0, train: -5 }, ALLOWED_KEYS.transport);
    expect(result.car_petrol).toBeUndefined();
    expect(result.train).toBeUndefined();
  });

  test('returns empty object for non-object input', () => {
    expect(sanitizeCategory(null, ALLOWED_KEYS.transport)).toEqual({});
    expect(sanitizeCategory('string', ALLOWED_KEYS.transport)).toEqual({});
    expect(sanitizeCategory([1, 2, 3], ALLOWED_KEYS.transport)).toEqual({});
  });
});

describe('sanitizeFood', () => {
  test('accepts a valid diet and days', () => {
    const { value, errors } = sanitizeFood({ diet: 'vegan', days: 7 });
    expect(value).toEqual({ diet: 'vegan', days: 7 });
    expect(errors).toHaveLength(0);
  });

  test('flags an invalid diet string', () => {
    const { errors } = sanitizeFood({ diet: 'carnivore', days: 7 });
    expect(errors.length).toBeGreaterThan(0);
  });

  test('flags an out-of-range days value', () => {
    const { errors } = sanitizeFood({ diet: 'vegan', days: 9999 });
    expect(errors.length).toBeGreaterThan(0);
  });

  test('defaults safely when food is missing entirely', () => {
    const { value, errors } = sanitizeFood(undefined);
    expect(value).toEqual({ diet: 'omnivore', days: 7 });
    expect(errors).toHaveLength(0);
  });
});

describe('validateCalculateInput', () => {
  test('accepts a fully valid request body', () => {
    const { value, errors } = validateCalculateInput({
      transport: { car_petrol: 100 },
      home: { electricity_kwh: 300 },
      food: { diet: 'omnivore', days: 7 },
      shopping: { clothing_item: 2 },
    });
    expect(errors).toHaveLength(0);
    expect(value.transport.car_petrol).toBe(100);
  });

  test('rejects a non-object body', () => {
    const { errors } = validateCalculateInput('not-an-object');
    expect(errors.length).toBeGreaterThan(0);
  });

  test('rejects an array body', () => {
    const { errors } = validateCalculateInput([1, 2, 3]);
    expect(errors.length).toBeGreaterThan(0);
  });

  test('rejects completely empty input', () => {
    const { errors } = validateCalculateInput({});
    expect(errors.length).toBeGreaterThan(0);
  });

  test('strips malicious/unexpected keys without throwing', () => {
    const { value, errors } = validateCalculateInput({
      transport: { car_petrol: 50, __proto__: 'polluted' },
      home: {},
      food: { diet: 'vegan', days: 7 },
      shopping: {},
    });
    expect(errors).toHaveLength(0);
    expect(value.transport.car_petrol).toBe(50);
  });
});

describe('validateKgParam', () => {
  test('accepts a valid numeric string', () => {
    const { value, error } = validateKgParam('245.3');
    expect(error).toBeNull();
    expect(value).toBeCloseTo(245.3);
  });

  test('rejects a non-numeric string', () => {
    const { error } = validateKgParam('abc');
    expect(error).not.toBeNull();
  });

  test('clamps an excessively large value rather than rejecting it', () => {
    const { value } = validateKgParam('99999999');
    expect(value).toBe(100000);
  });
});
