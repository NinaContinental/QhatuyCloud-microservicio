const express = require('express');
const pool = require('./db');
const { validarPedido, validarStockBajo } = require('./validaciones');

const app = express();
app.use(express.json());

// Tabla de avisos. Se guarda el cuerpo original en "datos" (JSONB) para no perder información.
app.listo = pool.iniciar(`CREATE TABLE IF NOT EXISTS notificaciones (
  id SERIAL PRIMARY KEY,
  tipo VARCHAR(20) NOT NULL CHECK (tipo IN ('pedido', 'stock_bajo')),
  referencia_id INTEGER,
  mensaje TEXT NOT NULL,
  datos JSONB NOT NULL,
  fecha TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  leida BOOLEAN NOT NULL DEFAULT false
)`);

app.param('id', (req, res, next, id) =>
  /^[1-9]\d*$/.test(id) ? next() : res.status(400).json({ error: 'El id debe ser un entero positivo' })
);

// Punto único de registro. Para enviar avisos reales (WhatsApp, SMS o correo) en el futuro,
// se agregaría aquí la llamada al proveedor después de guardar en PostgreSQL.
async function registrar(tipo, referenciaId, mensaje, datos) {
  const result = await pool.query(
    'INSERT INTO notificaciones (tipo, referencia_id, mensaje, datos) VALUES ($1, $2, $3, $4) RETURNING *',
    [tipo, referenciaId, mensaje, JSON.stringify(datos)]
  );
  return result.rows[0];
}

app.get('/health', (req, res) => res.json({ servicio: 'notificaciones', estado: 'ok' }));

// Aviso enviado por Pedidos al registrar un pedido nuevo
app.post('/notificaciones/pedido', async (req, res) => {
  const errores = validarPedido(req.body);
  if (errores.length) return res.status(400).json({ error: 'Datos inválidos', detalles: errores });

  const { pedido_id, comprador, producto_id, cantidad, estado } = req.body;
  const mensaje = `Nuevo pedido registrado por ${comprador.trim()}. Producto ID: ${producto_id}. Cantidad: ${cantidad}.`;
  try {
    const notificacion = await registrar('pedido', pedido_id, mensaje,
      { pedido_id, comprador: comprador.trim(), producto_id, cantidad, estado: estado.trim() });
    res.status(201).json(notificacion);
  } catch (error) {
    // Se deja el cuerpo recibido en el log para no perder el aviso si falla la base de datos
    console.error('Error al registrar aviso de pedido:', error.message, JSON.stringify(req.body));
    res.status(500).json({ error: 'Error al registrar la notificación de pedido' });
  }
});

// Alerta enviada por Inventario cuando un item queda en su stock mínimo o por debajo
app.post('/notificaciones/stock-bajo', async (req, res) => {
  const errores = validarStockBajo(req.body);
  if (errores.length) return res.status(400).json({ error: 'Datos inválidos', detalles: errores });

  const { itemId, nombre, stock, stockMinimo } = req.body;
  const mensaje = `Stock bajo: ${nombre.trim()}. Stock actual: ${stock}. Stock mínimo: ${stockMinimo}.`;
  try {
    const notificacion = await registrar('stock_bajo', itemId, mensaje,
      { itemId, nombre: nombre.trim(), stock, stockMinimo });
    res.status(201).json(notificacion);
  } catch (error) {
    console.error('Error al registrar alerta de stock bajo:', error.message, JSON.stringify(req.body));
    res.status(500).json({ error: 'Error al registrar la alerta de stock bajo' });
  }
});

// Lista de avisos, del más reciente al más antiguo. Filtros opcionales: ?tipo= y ?leida=
app.get('/notificaciones', async (req, res) => {
  const { tipo, leida } = req.query;
  if (tipo !== undefined && !['pedido', 'stock_bajo'].includes(tipo)) {
    return res.status(400).json({ error: 'tipo debe ser pedido o stock_bajo' });
  }
  if (leida !== undefined && !['true', 'false'].includes(leida)) {
    return res.status(400).json({ error: 'leida debe ser true o false' });
  }
  const condiciones = [];
  const valores = [];
  if (tipo !== undefined) { valores.push(tipo); condiciones.push(`tipo = $${valores.length}`); }
  if (leida !== undefined) { valores.push(leida === 'true'); condiciones.push(`leida = $${valores.length}`); }
  const where = condiciones.length ? `WHERE ${condiciones.join(' AND ')}` : '';
  try {
    const result = await pool.query(`SELECT * FROM notificaciones ${where} ORDER BY fecha DESC, id DESC`, valores);
    res.json(result.rows);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Error al consultar notificaciones' });
  }
});

app.get('/notificaciones/:id', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM notificaciones WHERE id = $1', [req.params.id]);
    if (result.rowCount === 0) return res.status(404).json({ error: 'Notificación no encontrada' });
    res.json(result.rows[0]);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Error al consultar la notificación' });
  }
});

app.patch('/notificaciones/:id/leida', async (req, res) => {
  try {
    const result = await pool.query('UPDATE notificaciones SET leida = true WHERE id = $1 RETURNING *', [req.params.id]);
    if (result.rowCount === 0) return res.status(404).json({ error: 'Notificación no encontrada' });
    res.json(result.rows[0]);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Error al marcar la notificación como leída' });
  }
});

// JSON mal formado u otros errores no controlados
app.use((err, req, res, next) => {
  if (err.type === 'entity.parse.failed') return res.status(400).json({ error: 'JSON mal formado' });
  console.error(err);
  res.status(500).json({ error: 'Error interno del servidor' });
});

module.exports = app;
