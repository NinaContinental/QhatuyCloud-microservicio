const request = require('supertest');
const app = require('../src/app');
const pool = require('../src/db');
beforeAll(() => app.listo);
afterAll(async () => { await pool.end(); });
test('GET /health debe responder correctamente', async () => {
  const response = await request(app).get('/health');
  expect(response.statusCode).toBe(200);
  expect(response.body.servicio).toBe('pedidos');
});
