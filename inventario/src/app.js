const express = require('express');
const pool = require('./db');
const app = express();
app.use(express.json());

app.listo = pool.iniciar(`CREATE TABLE IF NOT EXISTS items (
  id SERIAL PRIMARY KEY,
  nombre VARCHAR(100) NOT NULL,
  tipo VARCHAR(10) NOT NULL CHECK (tipo IN ('producto', 'insumo')),
  stock INTEGER NOT NULL CHECK (stock >= 0),
  stock_minimo INTEGER NOT NULL DEFAULT 0,
  unidad VARCHAR(20) NOT NULL DEFAULT 'unidad'
)`);

app.param('id', (req, res, next, id) =>
  /^\d+$/.test(id) ? next() : res.status(400).json({ error: 'id inválido' })
);

async function avisarStockBajo(item) {
  if (!process.env.NOTIFICACIONES_URL) return;
  try {
    await fetch(`${process.env.NOTIFICACIONES_URL}/notificaciones/stock-bajo`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ itemId: item.id, nombre: item.nombre, stock: item.stock, stockMinimo: item.stock_minimo })
    });
  } catch (e) { console.error('Notificaciones no disponible'); }
}

app.get('/health', (req, res) => res.json({ servicio: 'inventario', estado: 'ok' }));

app.post('/items', async (req, res) => {
  const { nombre, tipo, stock, stock_minimo, unidad } = req.body;
  if (!nombre || !['producto', 'insumo'].includes(tipo) || !Number.isInteger(Number(stock)) || Number(stock) < 0) {
    return res.status(400).json({ error: 'nombre, tipo (producto o insumo) y stock entero >= 0 son obligatorios' });
  }
  try {
    const result = await pool.query(
      'INSERT INTO items (nombre, tipo, stock, stock_minimo, unidad) VALUES ($1, $2, $3, $4, $5) RETURNING *',
      [nombre, tipo, stock, stock_minimo || 0, unidad || 'unidad']
    );
    res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Error al crear item' });
  }
});

app.get('/items', async (req, res) => {
  try {
    const result = req.query.tipo
      ? await pool.query('SELECT * FROM items WHERE tipo = $1 ORDER BY id', [req.query.tipo])
      : await pool.query('SELECT * FROM items ORDER BY id');
    res.json(result.rows);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Error al consultar items' });
  }
});

app.get('/items/:id', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM items WHERE id = $1', [req.params.id]);
    if (result.rowCount === 0) return res.status(404).json({ error: 'Item no encontrado' });
    res.json(result.rows[0]);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Error al consultar item' });
  }
});

app.put('/items/:id', async (req, res) => {
  const { nombre, stock, stock_minimo, unidad } = req.body;
  if (!nombre || !Number.isInteger(Number(stock)) || Number(stock) < 0) {
    return res.status(400).json({ error: 'nombre y stock entero >= 0 son obligatorios' });
  }
  try {
    const result = await pool.query(
      'UPDATE items SET nombre = $1, stock = $2, stock_minimo = $3, unidad = $4 WHERE id = $5 RETURNING *',
      [nombre, stock, stock_minimo || 0, unidad || 'unidad', req.params.id]
    );
    if (result.rowCount === 0) return res.status(404).json({ error: 'Item no encontrado' });
    res.json(result.rows[0]);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Error al actualizar item' });
  }
});

app.delete('/items/:id', async (req, res) => {
  try {
    const result = await pool.query('DELETE FROM items WHERE id = $1 RETURNING *', [req.params.id]);
    if (result.rowCount === 0) return res.status(404).json({ error: 'Item no encontrado' });
    res.json({ mensaje: 'Item eliminado', item: result.rows[0] });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Error al eliminar item' });
  }
});

// Consulta de stock
app.get('/items/:id/stock', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM items WHERE id = $1', [req.params.id]);
    if (result.rowCount === 0) return res.status(404).json({ error: 'Item no encontrado' });
    const i = result.rows[0];
    res.json({ id: i.id, nombre: i.nombre, stock: i.stock, bajoStock: i.stock <= i.stock_minimo });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Error al consultar stock' });
  }
});

// Ajuste de stock
app.patch('/items/:id/stock', async (req, res) => {
  const cantidad = Number(req.body.cantidad);
  if (!Number.isInteger(cantidad)) {
    return res.status(400).json({ error: 'cantidad entera requerida' });
  }
  try {
    const result = await pool.query(
      'UPDATE items SET stock = stock + $1 WHERE id = $2 AND stock + $1 >= 0 RETURNING *',
      [cantidad, req.params.id]
    );
    if (result.rowCount === 0) {
      const existe = await pool.query('SELECT 1 FROM items WHERE id = $1', [req.params.id]);
      return existe.rowCount === 0
        ? res.status(404).json({ error: 'Item no encontrado' })
        : res.status(409).json({ error: 'Stock insuficiente' });
    }
    const item = result.rows[0];
    if (item.stock <= item.stock_minimo) await avisarStockBajo(item);
    res.json(item);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Error al ajustar stock' });
  }
});

// Alerta de bajo stock
app.get('/alertas/bajo-stock', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM items WHERE stock <= stock_minimo ORDER BY id');
    res.json(result.rows);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Error al consultar alertas' });
  }
});

module.exports = app;