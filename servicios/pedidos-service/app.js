const express = require('express');

const app = express();
app.use(express.json());

// URL del microservicio de Inventario
const INVENTARIO_URL = process.env.INVENTARIO_URL || 'http://localhost:3002';

// Almacenamiento temporal de pedidos
let pedidos = [];
let siguienteId = 1;

// Estados permitidos
const ESTADOS = [
  'pendiente',
  'confirmado',
  'en_produccion',
  'listo',
  'entregado',
  'rechazado'
];

// Verificar funcionamiento
app.get('/health', (req, res) => {
  res.status(200).json({
    servicio: 'pedidos-service',
    estado: 'activo'
  });
});

// Obtener todos los pedidos
app.get('/pedidos', (req, res) => {
  res.json(pedidos);
});

// Registrar un pedido
app.post('/pedidos', async (req, res) => {
  try {
    const { comprador, producto_id, cantidad } = req.body;

    if (!comprador || !producto_id || !Number.isInteger(cantidad) || cantidad <= 0) {
      return res.status(400).json({
        mensaje: 'Debe proporcionar comprador, producto_id y una cantidad entera mayor que cero'
      });
    }

    // Consultar disponibilidad en Inventario
    const respuesta = await fetch(
      `${INVENTARIO_URL}/inventario/${producto_id}`
    );

    if (respuesta.status === 404) {
      return res.status(404).json({
        mensaje: 'El producto no existe en Inventario'
      });
    }

    if (!respuesta.ok) {
      return res.status(502).json({
        mensaje: 'No se pudo consultar el servicio de Inventario'
      });
    }

    const producto = await respuesta.json();

    if (producto.stock < cantidad) {
      return res.status(409).json({
        mensaje: 'Stock insuficiente',
        stock_disponible: producto.stock
      });
    }

    // Registrar el pedido
    const nuevoPedido = {
      id: siguienteId++,
      comprador,
      producto_id,
      cantidad,
      estado: 'pendiente',
      fecha: new Date().toISOString()
    };

    pedidos.push(nuevoPedido);

    return res.status(201).json({
      mensaje: 'Pedido registrado correctamente',
      pedido: nuevoPedido
    });

  } catch (error) {
    return res.status(503).json({
      mensaje: 'No se pudo conectar con Inventario',
      error: error.message
    });
  }
});

// Actualizar estado de un pedido
app.patch('/pedidos/:id/estado', (req, res) => {
  const id = Number(req.params.id);
  const { estado } = req.body;

  if (!ESTADOS.includes(estado)) {
    return res.status(400).json({
      mensaje: 'Estado no válido',
      estados_permitidos: ESTADOS
    });
  }

  const pedido = pedidos.find(p => p.id === id);

  if (!pedido) {
    return res.status(404).json({
      mensaje: 'Pedido no encontrado'
    });
  }

  pedido.estado = estado;

  return res.json({
    mensaje: 'Estado actualizado correctamente',
    pedido
  });
});

// Exportar aplicación para pruebas
module.exports = app;

// Iniciar servidor solamente cuando se ejecuta directamente
if (require.main === module) {
  const PORT = process.env.PORT || 3003;

  app.listen(PORT, () => {
    console.log(`Pedidos funcionando en el puerto ${PORT}`);
  });
}
