const app = require('./app');
const PORT = process.env.PORT || 3003;
app.listo.then(() => app.listen(PORT, () => console.log('pedidos escuchando en puerto 3003')));
