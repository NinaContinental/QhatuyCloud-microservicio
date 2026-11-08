const express = require('express');
const pool = require('./db');

const app = express();
app.use(express.json());

const PEDIDOS_URL = process.env.PEDIDOS_URL || 'http://localhost:3003';
const ESTADOS_PERMITIDOS = ['pendiente', 'en_produccion', 'terminado', 'cancelado'];

app.listo = pool.iniciar(`
  CREATE TABLE IF NOT EXISTS producciones (
    id SERIAL PRIMARY KEY,
    pedido_id INTEGER UNIQUE NOT NULL,
    comprador VARCHAR(150) NOT NULL,
    producto_id INTEGER NOT NULL,
    cantidad INTEGER NOT NULL CHECK (cantidad > 0),
    estado VARCHAR(20) NOT NULL DEFAULT 'pendiente' CHECK (estado IN ('pendiente', 'en_produccion', 'terminado', 'cancelado')),
    fecha_inicio TIMESTAMP NOT NULL DEFAULT NOW(),
    fecha_actualizacion TIMESTAMP NOT NULL DEFAULT NOW()
  )
`);

app.param('id', (req, res, next, id) => 
  /^\d+$/.test(id) ? next() : res.status(400).json({ error: 'ID inválido' })
);

async function notificarPedidos(pedidoId, estadoProduccion) {
  let estadoPedido = null;
  if (estadoProduccion === 'en_produccion') estadoPedido = 'en_produccion';
  if (estadoProduccion === 'terminado') estadoPedido = 'listo';

  if (!estadoPedido) return true;

  try {
    const res = await fetch(`${PEDIDOS_URL}/pedidos/${pedidoId}/estado`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ estado: estadoPedido })
    });

    return res.ok;
  } catch (error) {
    console.error(`Error de conexión con Pedidos (${PEDIDOS_URL}):`, error.message);
    return false;
  }
}

app.get('/health', (req, res) => {
  res.json({ servicio: 'produccion', estado: 'ok' });
});

app.post('/produccion', async (req, res) => {
  const { pedido_id, comprador, producto_id, cantidad } = req.body;

  if (
    !Number.isInteger(Number(pedido_id)) || Number(pedido_id) <= 0 ||
    !Number.isInteger(Number(producto_id)) || Number(producto_id) <= 0 ||
    !Number.isInteger(Number(cantidad)) || Number(cantidad) <= 0 ||
    typeof comprador !== 'string' || !comprador.trim()
  ) {
    return res.status(400).json({ error: 'Todos los campos son obligatorios y deben ser válidos' });
  }

  try {
    const existente = await pool.query('SELECT * FROM producciones WHERE pedido_id = $1', [pedido_id]);
    if (existente.rowCount > 0) {
      return res.status(409).json({ 
        mensaje: 'La orden para este pedido ya existe', 
        orden: existente.rows[0] 
      });
    }

    const result = await pool.query(
      `INSERT INTO producciones (pedido_id, comprador, producto_id, cantidad, estado) 
       VALUES ($1, $2, $3, $4, 'pendiente') 
       RETURNING *`,
      [pedido_id, comprador.trim(), producto_id, cantidad]
    );

    res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Error al registrar la orden de producción' });
  }
});

app.get('/produccion', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM producciones ORDER BY id ASC');
    res.json(result.rows);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Error al consultar órdenes de producción' });
  }
});

app.get('/produccion/:id', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM producciones WHERE id = $1', [req.params.id]);
    if (result.rowCount === 0) {
      return res.status(404).json({ error: 'Orden de producción no encontrada' });
    }
    res.json(result.rows[0]);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Error al consultar la orden' });
  }
});

app.patch('/produccion/:id/estado', async (req, res) => {
  const { estado } = req.body;

  if (!ESTADOS_PERMITIDOS.includes(estado)) {
    return res.status(400).json({ 
      error: `Estado inválido. Estados permitidos: ${ESTADOS_PERMITIDOS.join(', ')}` 
    });
  }

  try {
    const ordenPrev = await pool.query('SELECT * FROM producciones WHERE id = $1', [req.params.id]);
    if (ordenPrev.rowCount === 0) {
      return res.status(404).json({ error: 'Orden de producción no encontrada' });
    }

    const orden = ordenPrev.rows[0];

    if (['en_produccion', 'terminado'].includes(estado)) {
      const notificado = await notificarPedidos(orden.pedido_id, estado);
      if (!notificado) {
        return res.status(503).json({ 
          error: 'No se pudo actualizar el estado en el servicio Pedidos. Operación cancelada.' 
        });
      }
    }

    const result = await pool.query(
      `UPDATE producciones 
       SET estado = $1, fecha_actualizacion = NOW() 
       WHERE id = $2 
       RETURNING *`,
      [estado, req.params.id]
    );

    res.json(result.rows[0]);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Error al actualizar el estado de producción' });
  }
});

module.exports = app;
