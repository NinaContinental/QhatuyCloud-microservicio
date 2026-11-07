const express = require('express');
const pool = require('./db');

const app = express();
app.use(express.json());

const INVENTARIO_URL =
  process.env.INVENTARIO_URL || 'http://localhost:3002';

const NOTIFICACIONES_URL =
  process.env.NOTIFICACIONES_URL || 'http://localhost:3005';

const PRODUCCION_URL =
  process.env.PRODUCCION_URL || 'http://localhost:3004';

const ESTADOS = [
  'pendiente',
  'confirmado',
  'en_produccion',
  'listo',
  'entregado',
  'rechazado'
];

// Crear tabla de pedidos en PostgreSQL
app.listo = pool.iniciar(`
  CREATE TABLE IF NOT EXISTS pedidos (
    id SERIAL PRIMARY KEY,
    comprador VARCHAR(150) NOT NULL,
    producto_id INTEGER NOT NULL,
    cantidad INTEGER NOT NULL CHECK (cantidad > 0),
    estado VARCHAR(20) NOT NULL DEFAULT 'pendiente'
      CHECK (estado IN (
        'pendiente',
        'confirmado',
        'en_produccion',
        'listo',
        'entregado',
        'rechazado'
      )),
    fecha TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )
`);

// Validar identificadores
app.param('id', (req, res, next, id) => {
  if (!/^[1-9]\d*$/.test(id)) {
    return res.status(400).json({
      mensaje: 'El ID debe ser un número entero positivo'
    });
  }

  next();
});

// Verificar funcionamiento
app.get('/health', (req, res) => {
  res.status(200).json({
    servicio: 'pedidos',
    estado: 'ok'
  });
});

// Obtener todos los pedidos
app.get('/pedidos', async (req, res) => {
  try {
    const resultado = await pool.query(
      'SELECT * FROM pedidos ORDER BY id DESC'
    );

    res.json(resultado.rows);
  } catch (error) {
    console.error('Error al consultar pedidos:', error.message);

    res.status(500).json({
      mensaje: 'Error al consultar los pedidos'
    });
  }
});

// Obtener un pedido por ID
app.get('/pedidos/:id', async (req, res) => {
  try {
    const resultado = await pool.query(
      'SELECT * FROM pedidos WHERE id = $1',
      [req.params.id]
    );

    if (resultado.rowCount === 0) {
      return res.status(404).json({
        mensaje: 'Pedido no encontrado'
      });
    }

    res.json(resultado.rows[0]);
  } catch (error) {
    console.error('Error al consultar pedido:', error.message);

    res.status(500).json({
      mensaje: 'Error al consultar el pedido'
    });
  }
});

// Registrar un pedido, descontar stock y notificar
app.post('/pedidos', async (req, res) => {
  const { comprador, producto_id, cantidad } = req.body;

  if (
    typeof comprador !== 'string' ||
    !comprador.trim() ||
    !Number.isInteger(producto_id) ||
    producto_id <= 0 ||
    !Number.isInteger(cantidad) ||
    cantidad <= 0
  ) {
    return res.status(400).json({
      mensaje: 'Debe proporcionar comprador, producto_id positivo y cantidad entera mayor que cero'
    });
  }

  // Descontar stock de manera atómica en Inventario
  let respuestaInventario;

  try {
    respuestaInventario = await fetch(
      `${INVENTARIO_URL}/items/${producto_id}/stock`,
      {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          cantidad: -cantidad
        })
      }
    );
  } catch (error) {
    return res.status(503).json({
      mensaje: 'No se pudo conectar con el servicio de Inventario'
    });
  }

  if (respuestaInventario.status === 404) {
    return res.status(404).json({
      mensaje: 'El producto no existe en Inventario'
    });
  }

  if (respuestaInventario.status === 409) {
    return res.status(409).json({
      mensaje: 'Stock insuficiente'
    });
  }

  if (!respuestaInventario.ok) {
    return res.status(502).json({
      mensaje: 'Error al descontar el stock en Inventario'
    });
  }

  // Registrar pedido en PostgreSQL
  let pedidoRegistrado;

  try {
    const resultado = await pool.query(
      `INSERT INTO pedidos (comprador, producto_id, cantidad)
       VALUES ($1, $2, $3)
       RETURNING *`,
      [comprador.trim(), producto_id, cantidad]
    );

    pedidoRegistrado = resultado.rows[0];
  } catch (error) {
    console.error('Error al registrar pedido:', error.message);

    // Compensar el descuento si falla el registro
    try {
      const compensacion = await fetch(
        `${INVENTARIO_URL}/items/${producto_id}/stock`,
        {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ cantidad })
        }
      );

      if (!compensacion.ok) {
        console.error('No se pudo devolver el stock descontado');
      }
    } catch (errorCompensacion) {
      console.error('Falló la compensación del stock');
    }

    return res.status(500).json({
      mensaje: 'No se pudo registrar el pedido. Se intentó devolver el stock.'
    });
  }

  // Notificar el nuevo pedido.
  // Si Notificaciones falla, el pedido se conserva.
  let notificacionEnviada = true;

  try {
    const respuestaNotificacion = await fetch(
      `${NOTIFICACIONES_URL}/notificaciones/pedido`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          pedido_id: pedidoRegistrado.id,
          comprador: pedidoRegistrado.comprador,
          producto_id: pedidoRegistrado.producto_id,
          cantidad: pedidoRegistrado.cantidad,
          estado: pedidoRegistrado.estado
        })
      }
    );

    if (!respuestaNotificacion.ok) {
      notificacionEnviada = false;
      console.error(
        'Notificaciones respondió con error:',
        respuestaNotificacion.status
      );
    }
  } catch (error) {
    notificacionEnviada = false;
    console.error(
      'No se pudo conectar con Notificaciones:',
      error.message
    );
  }

  return res.status(201).json({
    mensaje: 'Pedido registrado correctamente',
    pedido: pedidoRegistrado,
    notificacion: notificacionEnviada
      ? 'Enviada correctamente'
      : 'Pedido registrado, pero no se pudo enviar la notificación'
  });
});

// Actualizar estado de un pedido
app.patch('/pedidos/:id/estado', async (req, res) => {
  const { estado } = req.body;

  if (!ESTADOS.includes(estado)) {
    return res.status(400).json({
      mensaje: 'Estado no válido',
      estados_permitidos: ESTADOS
    });
  }

  try {
    // Consultar el pedido y su estado anterior
    const consulta = await pool.query(
      'SELECT * FROM pedidos WHERE id = $1',
      [req.params.id]
    );

    if (consulta.rowCount === 0) {
      return res.status(404).json({
        mensaje: 'Pedido no encontrado'
      });
    }

    const pedidoAnterior = consulta.rows[0];

    // Actualizar el estado en PostgreSQL
    const actualizacion = await pool.query(
      `UPDATE pedidos
       SET estado = $1
       WHERE id = $2
       RETURNING *`,
      [estado, req.params.id]
    );

    const pedidoActualizado = actualizacion.rows[0];

    // Al confirmar por primera vez, enviar el pedido a Producción
    if (
      estado === 'confirmado' &&
      pedidoAnterior.estado !== 'confirmado'
    ) {
      let respuestaProduccion;

      try {
        respuestaProduccion = await fetch(
          `${PRODUCCION_URL}/produccion`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({
              pedido_id: pedidoActualizado.id,
              comprador: pedidoActualizado.comprador,
              producto_id: pedidoActualizado.producto_id,
              cantidad: pedidoActualizado.cantidad
            })
          }
        );
      } catch (error) {
        respuestaProduccion = null;
        console.error(
          'No se pudo conectar con Producción:',
          error.message
        );
      }

      if (!respuestaProduccion || !respuestaProduccion.ok) {
        // Restaurar el estado anterior si Producción falla
        try {
          await pool.query(
            'UPDATE pedidos SET estado = $1 WHERE id = $2',
            [pedidoAnterior.estado, req.params.id]
          );
        } catch (errorRestauracion) {
          console.error(
            'No se pudo restaurar el estado anterior:',
            errorRestauracion.message
          );
        }

        return res.status(502).json({
          mensaje: 'No se pudo registrar el pedido en Producción. Se intentó restaurar el estado anterior.'
        });
      }
    }

    return res.json({
      mensaje: 'Estado actualizado correctamente',
      pedido: pedidoActualizado
    });
  } catch (error) {
    console.error('Error al actualizar pedido:', error.message);

    return res.status(500).json({
      mensaje: 'Error al actualizar el estado del pedido'
    });
  }
});

module.exports = app;
