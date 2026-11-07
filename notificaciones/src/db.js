const { Pool } = require('pg');
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

// Reintenta mientras PostgreSQL termina de arrancar (útil dentro de Docker Compose)
async function iniciar(sql, intentos = 20) {
  for (let i = 1; i <= intentos; i++) {
    try { await pool.query(sql); return; }
    catch (e) {
      if (i === intentos) throw e;
      console.log(`Esperando a PostgreSQL (intento ${i}/${intentos})...`);
      await new Promise(r => setTimeout(r, 2000));
    }
  }
}
pool.iniciar = iniciar;
module.exports = pool;
