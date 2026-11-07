const request = require('supertest');
const app = require('../src/app');
const pool = require('../src/db');

beforeAll(async () => {
  await app.listo;
});

beforeEach(async () => {
  await pool.query('DELETE FROM pedidos');
  global.fetch = jest.fn();
});

afterAll(async () => {
  await pool.end();
});

describe('Microservicio Pedidos', () => {

  test('GET /pedidos debe devolver una lista', async () => {
    const response = await request(app).get('/pedidos');

    expect(response.statusCode).toBe(200);
    expect(Array.isArray(response.body)).toBe(true);
  });

  test('POST /pedidos debe rechazar datos incompletos', async () => {
    const response = await request(app)
      .post('/pedidos')
      .send({
        comprador: '',
        producto_id: 1,
        cantidad: 3
      });

    expect(response.statusCode).toBe(400);
    expect(global.fetch).not.toHaveBeenCalled();
  });

  test('POST /pedidos debe registrar el pedido, descontar stock y notificar', async () => {
    global.fetch
      .mockResolvedValueOnce({
        status: 200,
        ok: true
      })
      .mockResolvedValueOnce({
        status: 201,
        ok: true
      });

    const response = await request(app)
      .post('/pedidos')
      .send({
        comprador: 'Asociación de Artesanos de Chinchero',
        producto_id: 1,
        cantidad: 3
      });

    expect(response.statusCode).toBe(201);
    expect(response.body.pedido.comprador)
      .toBe('Asociación de Artesanos de Chinchero');
    expect(response.body.pedido.cantidad).toBe(3);
    expect(response.body.notificacion).toBe('Enviada correctamente');

    // Primera llamada: descuento de stock en Inventario
    expect(global.fetch.mock.calls[0][1].method).toBe('PATCH');
    expect(global.fetch.mock.calls[0][1].body)
      .toBe(JSON.stringify({ cantidad: -3 }));

    // Segunda llamada: notificación del nuevo pedido
    expect(global.fetch.mock.calls[1][0])
      .toContain('/notificaciones/pedido');
    expect(global.fetch.mock.calls[1][1].method).toBe('POST');

    const datosNotificacion = JSON.parse(
      global.fetch.mock.calls[1][1].body
    );

    expect(datosNotificacion.pedido_id).toBe(response.body.pedido.id);
    expect(datosNotificacion.comprador)
      .toBe('Asociación de Artesanos de Chinchero');
  });

  test('POST /pedidos debe conservar el pedido si falla Notificaciones', async () => {
    global.fetch
      .mockResolvedValueOnce({
        status: 200,
        ok: true
      })
      .mockRejectedValueOnce(new Error('Servicio no disponible'));

    const response = await request(app)
      .post('/pedidos')
      .send({
        comprador: 'Tienda artesanal Cusco',
        producto_id: 1,
        cantidad: 2
      });

    expect(response.statusCode).toBe(201);
    expect(response.body.pedido).toBeDefined();
    expect(response.body.notificacion)
      .toContain('no se pudo enviar');
  });

  test('POST /pedidos debe rechazar pedidos sin stock suficiente', async () => {
    global.fetch.mockResolvedValueOnce({
      status: 409,
      ok: false
    });

    const response = await request(app)
      .post('/pedidos')
      .send({
        comprador: 'Tienda artesanal Cusco',
        producto_id: 1,
        cantidad: 1000
      });

    expect(response.statusCode).toBe(409);
    expect(response.body.mensaje).toBe('Stock insuficiente');
  });

  test('POST /pedidos debe rechazar productos inexistentes', async () => {
    global.fetch.mockResolvedValueOnce({
      status: 404,
      ok: false
    });

    const response = await request(app)
      .post('/pedidos')
      .send({
        comprador: 'Tienda artesanal Cusco',
        producto_id: 9999,
        cantidad: 2
      });

    expect(response.statusCode).toBe(404);
  });

  test('PATCH /pedidos/:id/estado debe actualizar y enviar a Producción', async () => {
    const insertado = await pool.query(
      `INSERT INTO pedidos (comprador, producto_id, cantidad)
       VALUES ($1, $2, $3)
       RETURNING id`,
      ['Asociación artesanal', 1, 2]
    );

    const id = insertado.rows[0].id;

    global.fetch.mockResolvedValueOnce({
      status: 201,
      ok: true
    });

    const response = await request(app)
      .patch(`/pedidos/${id}/estado`)
      .send({ estado: 'confirmado' });

    expect(response.statusCode).toBe(200);
    expect(response.body.pedido.estado).toBe('confirmado');

    expect(global.fetch).toHaveBeenCalledTimes(1);
    expect(global.fetch.mock.calls[0][0]).toContain('/produccion');
    expect(global.fetch.mock.calls[0][1].method).toBe('POST');

    const datosProduccion = JSON.parse(
      global.fetch.mock.calls[0][1].body
    );

    expect(datosProduccion.pedido_id).toBe(id);
    expect(datosProduccion.comprador).toBe('Asociación artesanal');
    expect(datosProduccion.producto_id).toBe(1);
    expect(datosProduccion.cantidad).toBe(2);
  });

  test('PATCH debe restaurar el estado si Producción rechaza el pedido', async () => {
    const insertado = await pool.query(
      `INSERT INTO pedidos (comprador, producto_id, cantidad)
       VALUES ($1, $2, $3)
       RETURNING id`,
      ['Tienda artesanal', 1, 2]
    );

    const id = insertado.rows[0].id;

    global.fetch.mockResolvedValueOnce({
      status: 500,
      ok: false
    });

    const response = await request(app)
      .patch(`/pedidos/${id}/estado`)
      .send({ estado: 'confirmado' });

    expect(response.statusCode).toBe(502);

    const consulta = await pool.query(
      'SELECT estado FROM pedidos WHERE id = $1',
      [id]
    );

    expect(consulta.rows[0].estado).toBe('pendiente');
  });

  test('PATCH /pedidos/:id/estado debe rechazar estados inválidos', async () => {
    const response = await request(app)
      .patch('/pedidos/1/estado')
      .send({ estado: 'cancelado' });

    expect(response.statusCode).toBe(400);
    expect(global.fetch).not.toHaveBeenCalled();
  });

});
