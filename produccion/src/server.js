const app = require('./app');
const PORT = process.env.PORT || 3004;
app.listo.then(() => app.listen(PORT, () => console.log('produccion escuchando en puerto 3004')));
