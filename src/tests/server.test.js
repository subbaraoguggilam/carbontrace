'use strict';

const request = require('supertest');
const app = require('../../server');

describe('GET /api/health', () => {
  test('returns 200 and ok status', async () => {
    const res = await request(app).get('/api/health');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.status).toBe('ok');
  });
});

describe('GET /api/emission-factors', () => {
  test('returns all factor groups', async () => {
    const res = await request(app).get('/api/emission-factors');
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveProperty('transport');
    expect(res.body.data).toHaveProperty('home');
    expect(res.body.data).toHaveProperty('diet_presets');
    expect(res.body.data).toHaveProperty('shopping');
  });
});

describe('POST /api/calculate', () => {
  test('returns a full footprint response for valid input', async () => {
    const res = await request(app)
      .post('/api/calculate')
      .send({
        transport: { car_petrol: 100, train: 50 },
        home: { electricity_kwh: 300, natural_gas_m3: 20 },
        food: { diet: 'omnivore', days: 7 },
        shopping: { clothing_item: 2 },
      });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.footprint.total_kg).toBeGreaterThan(0);
    expect(res.body.data.recommendations.length).toBeGreaterThan(0);
    expect(res.body.data.equivalencies).toHaveProperty('trees_to_offset_annual');
  });

  test('rejects empty body with 400', async () => {
    const res = await request(app).post('/api/calculate').send({});
    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.errors.length).toBeGreaterThan(0);
  });

  test('strips unknown/malicious fields instead of erroring', async () => {
    const res = await request(app)
      .post('/api/calculate')
      .send({
        transport: { car_petrol: 50, evil_field: 99999 },
        home: {},
        food: { diet: 'vegan', days: 7 },
        shopping: {},
      });
    expect(res.status).toBe(200);
    expect(res.body.data.footprint.categories.transport.breakdown.evil_field).toBeUndefined();
  });

  test('rejects a non-JSON-object body sent as an array', async () => {
    const res = await request(app).post('/api/calculate').send([1, 2, 3]);
    expect([400, 500]).toContain(res.status);
  });

  test('response includes a request ID header for traceability', async () => {
    const res = await request(app)
      .post('/api/calculate')
      .send({ transport: { car_petrol: 10 }, home: {}, food: {}, shopping: {} });
    expect(res.headers['x-request-id']).toBeDefined();
  });
});

describe('GET /api/equivalencies/:kg', () => {
  test('returns equivalencies for a valid kg value', async () => {
    const res = await request(app).get('/api/equivalencies/1000');
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveProperty('trees_to_offset_annual');
  });

  test('rejects a non-numeric kg value', async () => {
    const res = await request(app).get('/api/equivalencies/notanumber');
    expect(res.status).toBe(400);
  });
});

describe('Security headers', () => {
  test('helmet security headers are present', async () => {
    const res = await request(app).get('/api/health');
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers['content-security-policy']).toBeDefined();
  });
});

describe('Unknown API routes', () => {
  test('returns 404 for unrecognised API paths', async () => {
    const res = await request(app).get('/api/does-not-exist');
    expect(res.status).toBe(404);
  });
});
