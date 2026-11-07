# Microservicio Notificaciones (puerto 3005)

Recibe, valida y guarda en PostgreSQL los avisos internos de QhatuyCloud:

- **Pedido nuevo**: lo envía Pedidos cada vez que registra un pedido.
- **Stock bajo**: lo envía Inventario cuando un item queda en su stock mínimo o por debajo.

> Alcance: en esta versión los avisos se **almacenan y consultan por la API**. No se envían
> mensajes reales por WhatsApp, SMS ni correo. La función `registrar()` de `src/app.js` es el
> punto donde se conectaría un proveedor de mensajería en una versión futura.

## Estructura

```
notificaciones/
├── src/
│   ├── app.js            # Rutas Express y creación de la tabla
│   ├── db.js             # Conexión a PostgreSQL con reintentos
│   ├── server.js         # Arranque del servidor (espera a PostgreSQL)
│   └── validaciones.js   # Validación de los avisos recibidos
├── tests/
│   ├── health.test.js
│   └── notificaciones.test.js
├── Dockerfile
└── package.json
```

## Variables de entorno

| Variable | Ejemplo | Uso |
|---|---|---|
| `DATABASE_URL` | `postgresql://postgres:postgres@db:5432/notificaciones_db` | Conexión a su base de datos propia |
| `PORT` | `3005` | Puerto de Express (por defecto 3005) |

Quien envía avisos a este servicio usa `NOTIFICACIONES_URL=http://notificaciones:3005`
(ya definido para Inventario y Pedidos en `docker-compose.yml`).

## Base de datos

Tabla `notificaciones` en `notificaciones_db`, creada automáticamente al iniciar
(`CREATE TABLE IF NOT EXISTS`):

| Columna | Tipo | Descripción |
|---|---|---|
| `id` | `SERIAL PRIMARY KEY` | Identificador |
| `tipo` | `VARCHAR(20)` | `pedido` o `stock_bajo` (restricción `CHECK`) |
| `referencia_id` | `INTEGER` | `pedido_id` o `itemId` según el tipo |
| `mensaje` | `TEXT` | Texto legible del aviso |
| `datos` | `JSONB` | Cuerpo original recibido |
| `fecha` | `TIMESTAMPTZ` | Fecha de creación (`NOW()`) |
| `leida` | `BOOLEAN` | `false` al crear |

## Endpoints

| Método | Ruta | Descripción | Respuestas |
|---|---|---|---|
| GET | `/health` | Estado del servicio | 200 |
| POST | `/notificaciones/pedido` | Aviso de pedido nuevo (desde Pedidos) | 201, 400, 500 |
| POST | `/notificaciones/stock-bajo` | Alerta de stock bajo (desde Inventario) | 201, 400, 500 |
| GET | `/notificaciones` | Lista, de la más reciente a la más antigua. Filtros opcionales `?tipo=pedido\|stock_bajo` y `?leida=true\|false` | 200, 400 |
| GET | `/notificaciones/:id` | Una notificación | 200, 400, 404 |
| PATCH | `/notificaciones/:id/leida` | Marcar como leída | 200, 400, 404 |

**Contrato con Pedidos** (`POST /notificaciones/pedido`):

```json
{ "pedido_id": 3, "comprador": "Asociación de Artesanos de Chinchero", "producto_id": 1, "cantidad": 3, "estado": "pendiente" }
```

Mensaje guardado: `Nuevo pedido registrado por Asociación de Artesanos de Chinchero. Producto ID: 1. Cantidad: 3.`

**Contrato con Inventario** (`POST /notificaciones/stock-bajo`, formato que Inventario ya envía):

```json
{ "itemId": 1, "nombre": "Chompa de alpaca", "stock": 2, "stockMinimo": 3 }
```

Mensaje guardado: `Stock bajo: Chompa de alpaca. Stock actual: 2. Stock mínimo: 3.`

Los datos inválidos devuelven 400 con la lista de errores en `detalles`. Todas las consultas SQL
están parametrizadas.

## Cómo ejecutar (desde la raíz del repositorio)

```bash
docker compose up -d --build
docker compose exec notificaciones npm test
curl http://localhost:3005/health
curl http://localhost:3005/notificaciones
```

## Pruebas

Se ejecutan contra la base `notificaciones_db` del contenedor de PostgreSQL. Cada prueba borra lo que crea.

| Prueba | Funcionalidad que verifica | Microservicio | Comportamiento esperado |
|---|---|---|---|
| GET /health debe responder correctamente | Disponibilidad | Notificaciones | 200 con `{ servicio: "notificaciones", estado: "ok" }` |
| registra una notificación de pedido nuevo | Aviso desde Pedidos | Notificaciones | 201, tipo `pedido`, mensaje correcto, `leida` en false, datos originales guardados |
| rechaza datos incompletos con 400 | Validación de pedido | Notificaciones | 400 con detalle de los errores; no se guarda nada |
| rechaza cantidad cero o comprador vacío | Validación de pedido | Notificaciones | 400 |
| registra una alerta con el formato de Inventario | Alerta desde Inventario | Notificaciones | 201, tipo `stock_bajo`, contrato `itemId/nombre/stock/stockMinimo` respetado |
| acepta stock igual a cero | Validación de stock bajo | Notificaciones | 201 |
| rechaza datos inválidos con 400 | Validación de stock bajo | Notificaciones | 400 con stock negativo, itemId no numérico o sin stockMinimo |
| GET /notificaciones devuelve una lista | Consulta general | Notificaciones | 200, arreglo ordenado de la más reciente a la más antigua |
| GET /notificaciones?tipo=stock_bajo filtra por tipo | Filtro | Notificaciones | Solo avisos `stock_bajo` |
| GET /notificaciones/:id devuelve una notificación | Consulta por id | Notificaciones | 200 con el registro |
| GET /notificaciones/:id devuelve 404 si no existe | Registro inexistente | Notificaciones | 404 |
| GET /notificaciones/:id con id no numérico devuelve 400 | Validación de id | Notificaciones | 400 |
| marca la notificación como leída | PATCH leída | Notificaciones | 200 y `leida` en true al volver a consultar |
| PATCH devuelve 404 si no existe | Registro inexistente | Notificaciones | 404 |
| la notificación persiste en PostgreSQL | Persistencia | Notificaciones | El registro se lee con otra conexión a la base de datos |

## Limitaciones pendientes

- No hay envío real por WhatsApp, SMS ni correo. Solo se almacenan y consultan los avisos.
- Si PostgreSQL no está disponible al recibir un aviso, se responde 500 y el cuerpo queda en el log
  del contenedor. No hay cola de reintentos. Pedidos conserva el pedido aunque el aviso falle.
- No hay autenticación en los endpoints, igual que en el resto de los microservicios.
