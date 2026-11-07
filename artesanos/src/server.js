const app = require('./app');
const PORT = process.env.PORT || 3001;
app.listo.then(() => app.listen(PORT, () => console.log('artesanos escuchando en puerto 3001')));
