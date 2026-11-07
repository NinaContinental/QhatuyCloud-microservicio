const request = require('supertest');
const app = require('../src/app');
const pool = require('../src/db');

beforeAll(() => app.listo);
afterAll(async () => { await pool.end(); });

const lana = { nombre: 'Lana test', tipo: 'insumo', stock: 10, stock_minimo: 5, unidad: 'kg' };
let id;

beforeEach(async () => {
  const r = await request(app).post('/items').send(lana);
  id = r.body.id;
});

afterEach(async () => { await pool.query('DELETE FROM items WHERE id = $1', [id]); });

test('POST /items crea un insumo', async () => {
  const r = await request(app).get(`/items/${id}`);
  expect(r.statusCode).toBe(200);
  expect(r.body.nombre).toBe('Lana test');
});

test('POST /items con tipo inválido devuelve 400', async () => {
  const r = await request(app).post('/items').send({ ...lana, tipo: 'otro' });
  expect(r.statusCode).toBe(400);
});

test('PATCH stock con más de lo disponible devuelve 409', async () => {
  const r = await request(app).patch(`/items/${id}/stock`).send({ cantidad: -50 });
  expect(r.statusCode).toBe(409);
  const s = await request(app).get(`/items/${id}/stock`);
  expect(s.body.stock).toBe(10);
});

test('GET /alertas/bajo-stock incluye items bajo el mínimo', async () => {
  await request(app).patch(`/items/${id}/stock`).send({ cantidad: -6 });
  const r = await request(app).get('/alertas/bajo-stock');
  expect(r.body.some(i => i.id === id)).toBe(true);
});