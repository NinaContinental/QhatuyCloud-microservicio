const { Pool } = require('pg');
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
async function iniciar(sql, intentos = 20) {
  for (let i = 1; i <= intentos; i++) {
    try { await pool.query(sql); return; }
    catch (e) {
      if (i === intentos) throw e;
      await new Promise(r => setTimeout(r, 2000));
    }
  }
}
pool.iniciar = iniciar;
module.exports = pool;
