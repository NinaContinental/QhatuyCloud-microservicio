const express = require('express');
const pool = require('./db');
const app = express();

app.use(express.json());

// Crear la tabla de artesanos en la base de datos
const initSql = `
  CREATE TABLE IF NOT EXISTS artesanos (
    id SERIAL PRIMARY KEY,
    nombre VARCHAR(100) NOT NULL,
    especialidad VARCHAR(100) NOT NULL,
    telefono VARCHAR(20),
    email VARCHAR(100) UNIQUE NOT NULL,
    creado_en TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  );
`;
app.listo = pool.iniciar(initSql);

// Endpoint de verificacion de salud
app.get('/health', (req, res) => res.json({ servicio: 'artesanos', estado: 'ok' }));

// GET /artesanos - Listar todos los artesanos
app.get('/artesanos', async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT * FROM artesanos ORDER BY id ASC');
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /artesanos/:id - Obtener artesano por ID
app.get('/artesanos/:id', async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT * FROM artesanos WHERE id = $1', [req.params.id]);
    if (rows.length === 0) return res.status(404).json({ error: 'Artesano no encontrado' });
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /artesanos - Crear un nuevo artesano
app.post('/artesanos', async (req, res) => {
  const { nombre, especialidad, telefono, email } = req.body;
  if (!nombre || !especialidad || !email) {
    return res.status(400).json({ error: 'Campos requeridos: nombre, especialidad, email' });
  }
  try {
    const { rows } = await pool.query(
      'INSERT INTO artesanos (nombre, especialidad, telefono, email) VALUES ($1, $2, $3, $4) RETURNING *',
      [nombre, especialidad, telefono, email]
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /artesanos/:id - Actualizar datos de un artesano
app.put('/artesanos/:id', async (req, res) => {
  const { nombre, especialidad, telefono, email } = req.body;
  try {
    const { rows } = await pool.query(
      `UPDATE artesanos 
       SET nombre = COALESCE($1, nombre),
           especialidad = COALESCE($2, especialidad),
           telefono = COALESCE($3, telefono),
           email = COALESCE($4, email)
       WHERE id = $5 RETURNING *`,
      [nombre, especialidad, telefono, email, req.params.id]
    );
    if (rows.length === 0) return res.status(404).json({ error: 'Artesano no encontrado' });
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /artesanos/:id - Eliminar un artesano
app.delete('/artesanos/:id', async (req, res) => {
  try {
    const { rows } = await pool.query('DELETE FROM artesanos WHERE id = $1 RETURNING *', [req.params.id]);
    if (rows.length === 0) return res.status(404).json({ error: 'Artesano no encontrado' });
    res.json({ mensaje: 'Artesano eliminado exitosamente', artesano: rows[0] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = app;
