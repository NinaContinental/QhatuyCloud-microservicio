const app = require('./app');
const PORT = process.env.PORT || 3005;

app.listo
  .then(() => app.listen(PORT, () => console.log(`notificaciones escuchando en puerto ${PORT}`)))
  .catch(error => {
    console.error('No se pudo conectar a PostgreSQL:', error.message);
    process.exit(1);
  });
