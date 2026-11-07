const app = require('./app');
const PORT = process.env.PORT || 3002;
app.listo.then(() => app.listen(PORT, () => console.log('inventario escuchando en puerto 3002')));
