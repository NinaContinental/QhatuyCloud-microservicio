const request = require('supertest');
const app = require('../src/app');
const pool = require('../src/db');

beforeAll(async () => {
  await app.listo;
});

afterAll(async () => {
  await pool.end();
});

describe('Pruebas del Microservicio Producción', () => {
  let ordenId;
  const pedidoTestId = 9999;

  afterEach(async () => {
    await pool.query('DELETE FROM producciones WHERE pedido_id = $1', [pedidoTestId]);
  });

  test('1. GET /health responde correctamente', async () => {
    const res = await request(app).get('/health');
    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({ servicio: 'produccion', estado: 'ok' });
  });

  test('2. POST /produccion registra una orden', async () => {
    const res = await request(app).post('/produccion').send({
      pedido_id: pedidoTestId,
      comprador: 'Asociación Chinchero',
      producto_id: 1,
      cantidad: 5
    });
    expect(res.statusCode).toBe(201);
    expect(res.body.estado).toBe('pendiente');
    ordenId = res.body.id;
  });

  test('3. POST /produccion rechaza datos incompletos', async () => {
    const res = await request(app).post('/produccion').send({
      pedido_id: pedidoTestId,
      comprador: ''
    });
    expect(res.statusCode).toBe(400);
  });

  test('4. POST /produccion rechaza cantidades inválidas', async () => {
    const res = await request(app).post('/produccion').send({
      pedido_id: pedidoTestId,
      comprador: 'Test',
      producto_id: 1,
      cantidad: -2
    });
    expect(res.statusCode).toBe(400);
  });

  test('5. POST /produccion evita órdenes duplicadas', async () => {
    await request(app).post('/produccion').send({
      pedido_id: pedidoTestId,
      comprador: 'Test 1',
      producto_id: 1,
      cantidad: 2
    });

    const res = await request(app).post('/produccion').send({
      pedido_id: pedidoTestId,
      comprador: 'Test 2',
      producto_id: 1,
      cantidad: 2
    });
    expect(res.statusCode).toBe(409);
  });

  test('6. GET /produccion devuelve una lista', async () => {
    const res = await request(app).get('/produccion');
    expect(res.statusCode).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });

  test('7 y 8. GET /produccion/:id encuentra orden existente y da 404 si no existe', async () => {
    const creacion = await request(app).post('/produccion').send({
      pedido_id: pedidoTestId,
      comprador: 'Test',
      producto_id: 1,
      cantidad: 1
    });

    const resOk = await request(app).get(`/produccion/${creacion.body.id}`);
    expect(resOk.statusCode).toBe(200);

    const res404 = await request(app).get('/produccion/999999');
    expect(res404.statusCode).toBe(404);
  });

  test('9 y 10. PATCH /produccion/:id/estado actualiza y rechaza estados inválidos', async () => {
    const creacion = await request(app).post('/produccion').send({
      pedido_id: pedidoTestId,
      comprador: 'Test',
      producto_id: 1,
      cantidad: 1
    });

    const resBad = await request(app).patch(`/produccion/${creacion.body.id}/estado`).send({ estado: 'invalido' });
    expect(resBad.statusCode).toBe(400);

    const resOk = await request(app).patch(`/produccion/${creacion.body.id}/estado`).send({ estado: 'cancelado' });
    expect(resOk.statusCode).toBe(200);
    expect(resOk.body.estado).toBe('cancelado');
  });

  test('11. Manejo de error de comunicación con Pedidos', async () => {
    const creacion = await request(app).post('/produccion').send({
      pedido_id: pedidoTestId,
      comprador: 'Test',
      producto_id: 1,
      cantidad: 1
    });

    const res = await request(app).patch(`/produccion/${creacion.body.id}/estado`).send({ estado: 'en_produccion' });
    expect(res.statusCode).toBe(503);
  });
});
