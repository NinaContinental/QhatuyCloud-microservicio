const request = require('supertest');
const { Pool } = require('pg');
const app = require('../src/app');
const pool = require('../src/db');

beforeAll(() => app.listo);
afterAll(async () => { await pool.end(); });

const pedido = {
  pedido_id: 3,
  comprador: 'Asociación de Artesanos de Chinchero',
  producto_id: 1,
  cantidad: 3,
  estado: 'pendiente'
};

// Mismo formato que envía Inventario hoy
const stockBajo = { itemId: 1, nombre: 'Chompa de alpaca', stock: 2, stockMinimo: 3 };

const creados = [];
afterEach(async () => {
  if (creados.length) await pool.query('DELETE FROM notificaciones WHERE id = ANY($1)', [creados.splice(0)]);
});

async function crear(ruta, body) {
  const r = await request(app).post(ruta).send(body);
  if (r.body.id) creados.push(r.body.id);
  return r;
}

describe('POST /notificaciones/pedido', () => {
  test('registra una notificación de pedido nuevo', async () => {
    const r = await crear('/notificaciones/pedido', pedido);
    expect(r.statusCode).toBe(201);
    expect(r.body.tipo).toBe('pedido');
    expect(r.body.referencia_id).toBe(3);
    expect(r.body.leida).toBe(false);
    expect(r.body.mensaje).toBe('Nuevo pedido registrado por Asociación de Artesanos de Chinchero. Producto ID: 1. Cantidad: 3.');
    expect(r.body.datos).toEqual(pedido);
  });

  test('rechaza datos incompletos con 400', async () => {
    const r = await crear('/notificaciones/pedido', { pedido_id: 3 });
    expect(r.statusCode).toBe(400);
    expect(r.body.detalles.length).toBeGreaterThan(0);
  });

  test('rechaza cantidad cero o comprador vacío', async () => {
    const r1 = await crear('/notificaciones/pedido', { ...pedido, cantidad: 0 });
    const r2 = await crear('/notificaciones/pedido', { ...pedido, comprador: '   ' });
    expect(r1.statusCode).toBe(400);
    expect(r2.statusCode).toBe(400);
  });
});

describe('POST /notificaciones/stock-bajo', () => {
  test('registra una alerta con el formato de Inventario', async () => {
    const r = await crear('/notificaciones/stock-bajo', stockBajo);
    expect(r.statusCode).toBe(201);
    expect(r.body.tipo).toBe('stock_bajo');
    expect(r.body.referencia_id).toBe(1);
    expect(r.body.mensaje).toBe('Stock bajo: Chompa de alpaca. Stock actual: 2. Stock mínimo: 3.');
    expect(r.body.datos).toEqual(stockBajo);
  });

  test('acepta stock igual a cero', async () => {
    const r = await crear('/notificaciones/stock-bajo', { ...stockBajo, stock: 0 });
    expect(r.statusCode).toBe(201);
  });

  test('rechaza datos inválidos con 400', async () => {
    const r1 = await crear('/notificaciones/stock-bajo', { ...stockBajo, stock: -1 });
    const r2 = await crear('/notificaciones/stock-bajo', { ...stockBajo, itemId: 'abc' });
    const r3 = await crear('/notificaciones/stock-bajo', { itemId: 1, nombre: 'Lana', stock: 2 });
    expect(r1.statusCode).toBe(400);
    expect(r2.statusCode).toBe(400);
    expect(r3.statusCode).toBe(400);
  });
});

describe('Consultas', () => {
  test('GET /notificaciones devuelve una lista, la más reciente primero', async () => {
    const a = await crear('/notificaciones/pedido', pedido);
    const b = await crear('/notificaciones/stock-bajo', stockBajo);
    const r = await request(app).get('/notificaciones');
    expect(r.statusCode).toBe(200);
    expect(Array.isArray(r.body)).toBe(true);
    const ids = r.body.map(n => n.id);
    expect(ids.indexOf(b.body.id)).toBeLessThan(ids.indexOf(a.body.id));
    expect(r.body[0]).toHaveProperty('fecha');
    expect(r.body[0]).toHaveProperty('datos');
  });

  test('GET /notificaciones?tipo=stock_bajo filtra por tipo', async () => {
    await crear('/notificaciones/pedido', pedido);
    await crear('/notificaciones/stock-bajo', stockBajo);
    const r = await request(app).get('/notificaciones?tipo=stock_bajo');
    expect(r.statusCode).toBe(200);
    expect(r.body.length).toBeGreaterThan(0);
    expect(r.body.every(n => n.tipo === 'stock_bajo')).toBe(true);
  });

  test('GET /notificaciones/:id devuelve una notificación', async () => {
    const n = await crear('/notificaciones/pedido', pedido);
    const r = await request(app).get(`/notificaciones/${n.body.id}`);
    expect(r.statusCode).toBe(200);
    expect(r.body.id).toBe(n.body.id);
    expect(r.body.tipo).toBe('pedido');
  });

  test('GET /notificaciones/:id devuelve 404 si no existe', async () => {
    const r = await request(app).get('/notificaciones/999999999');
    expect(r.statusCode).toBe(404);
  });

  test('GET /notificaciones/:id con id no numérico devuelve 400', async () => {
    const r = await request(app).get('/notificaciones/abc');
    expect(r.statusCode).toBe(400);
  });
});

describe('PATCH /notificaciones/:id/leida', () => {
  test('marca la notificación como leída', async () => {
    const n = await crear('/notificaciones/stock-bajo', stockBajo);
    const r = await request(app).patch(`/notificaciones/${n.body.id}/leida`);
    expect(r.statusCode).toBe(200);
    expect(r.body.leida).toBe(true);
    const g = await request(app).get(`/notificaciones/${n.body.id}`);
    expect(g.body.leida).toBe(true);
  });

  test('devuelve 404 si no existe', async () => {
    const r = await request(app).patch('/notificaciones/999999999/leida');
    expect(r.statusCode).toBe(404);
  });
});

test('la notificación persiste en PostgreSQL (consultada con otra conexión)', async () => {
  const n = await crear('/notificaciones/pedido', pedido);
  const otraConexion = new Pool({ connectionString: process.env.DATABASE_URL });
  try {
    const r = await otraConexion.query('SELECT tipo, referencia_id, datos FROM notificaciones WHERE id = $1', [n.body.id]);
    expect(r.rowCount).toBe(1);
    expect(r.rows[0].tipo).toBe('pedido');
    expect(r.rows[0].datos.comprador).toBe(pedido.comprador);
  } finally {
    await otraConexion.end();
  }
});
