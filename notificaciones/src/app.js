const express = require('express');
const pool = require('./db');
const app = express();
app.use(express.json());
app.listo = pool.iniciar('SELECT 1');
app.get('/health', (req, res) => res.json({ servicio: 'notificaciones', estado: 'ok' }));
module.exports = app;
