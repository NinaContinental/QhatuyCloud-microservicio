const request = require('supertest');
const app = require('../app');

describe('Microservicio Pedidos', () => {

  test('Debe comprobar el estado del servicio', async () => {
    const respuesta = await request(app).get('/health');

    expect(respuesta.statusCode).toBe(200);
    expect(respuesta.body.estado).toBe('activo');
  });

  test('Debe devolver una lista de pedidos', async () => {
    const respuesta = await request(app).get('/pedidos');

    expect(respuesta.statusCode).toBe(200);
    expect(Array.isArray(respuesta.body)).toBe(true);
  });

  test('Debe rechazar un pedido sin comprador', async () => {
    const respuesta = await request(app)
      .post('/pedidos')
      .send({
        producto_id: 1,
        cantidad: 2
      });

    expect(respuesta.statusCode).toBe(400);
  });

  test('Debe rechazar una cantidad igual a cero', async () => {
    const respuesta = await request(app)
      .post('/pedidos')
      .send({
        comprador: 'Cliente de prueba',
        producto_id: 1,
        cantidad: 0
      });

    expect(respuesta.statusCode).toBe(400);
  });

  test('Debe rechazar una cantidad negativa', async () => {
    const respuesta = await request(app)
      .post('/pedidos')
      .send({
        comprador: 'Cliente de prueba',
        producto_id: 1,
        cantidad: -2
      });

    expect(respuesta.statusCode).toBe(400);
  });

  test('Debe rechazar un estado no permitido', async () => {
    const respuesta = await request(app)
      .patch('/pedidos/1/estado')
      .send({
        estado: 'desconocido'
      });

    expect(respuesta.statusCode).toBe(400);
  });

  test('Debe indicar que un pedido inexistente no fue encontrado', async () => {
    const respuesta = await request(app)
      .patch('/pedidos/999/estado')
      .send({
        estado: 'listo'
      });

    expect(respuesta.statusCode).toBe(404);
  });

});
