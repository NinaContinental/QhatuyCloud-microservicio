const request = require('supertest');
const app = require('../src/app');
const pool = require('../src/db');

beforeAll(() => app.listo);
afterAll(async () => { await pool.end(); });

describe('Pruebas del Microservicio Artesanos', () => {
  test('GET /health debe devolver respuesta exitosa', async () => {
    const res = await request(app).get('/health');
    expect(res.statusCode).toBe(200);
    expect(res.body.servicio).toBe('artesanos');
  });

  test('POST /artesanos debe validar campos vacios', async () => {
    const res = await request(app).post('/artesanos').send({ nombre: 'Juan' });
    expect(res.statusCode).toBe(400);
  });
});
