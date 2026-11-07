# QhatuyCloud-microservicio

Airton Waldir Nina Meza 

Frank Luis Gomez Cornejo

Jorcaef Vicente Rivera Cusihuaman

Iarley Josue Ranirez LLigua

Grimaldo Huacho Criollo


# Proyecto: QhatuyCloud



### 1. Proyecto



**QhatuyCloud** – Sistema de gestión de inventario y pedidos para artesanos textiles del Cusco.

---

### 2. Problema



En Chinchero y San Blas, las asociaciones de artesanos manejan su inventario en cuadernos, causando desabastecimiento de insumos (lana o tintes) y retrasos en las entregas por falta de visibilidad del stock entre talleres.

---

### 3. Usuarios



* **Artesanos:** Conectados desde smartphones básicos con datos limitados.


* **Tiendas y Mayoristas:** Compradores de productos terminados en Cusco.


* **Líderes de Asociación:** Coordinadores de producción y pedidos.



---

### 4. Solución



Plataforma ligera en la nube que permite a los artesanos actualizar stock e insumos desde su celular, agrupando pedidos automáticos y calculando tiempos de entrega.

---

### 5. Microservicios



| Servicio | Responsabilidad |
| --- | --- |
| **Artesanos** | Registro de productores, talleres y datos de contacto.

 |
| **Inventario** | Catálogo de productos terminados, insumos y alertas de bajo stock.

 |
| **Pedidos** | Registro de compras, validación contra stock y estado de entrega.

 |
| **Producción** | Asignación de tareas a talleres y seguimiento de avance de fabricación.

 |
| **Notificaciones** | Registro y consulta de avisos internos de pedido nuevo y stock bajo (envío por SMS/WhatsApp previsto como mejora futura). |

---

## 7. Pruebas

Las pruebas usan Jest y Supertest contra la base de datos PostgreSQL de cada servicio. Se ejecutan con:

```bash
docker compose exec <servicio> npm test
```

### 7.5 Notificaciones

Puerto 3005, base de datos `notificaciones_db`. Recibe los avisos de pedido nuevo (desde Pedidos) y de stock bajo (desde Inventario), los valida y los guarda en PostgreSQL. Detalle de endpoints y base de datos en [notificaciones/README.md](notificaciones/README.md).

| Prueba | Funcionalidad que verifica | Microservicio | Comportamiento esperado |
|---|---|---|---|
| GET /health debe responder correctamente | Disponibilidad | Notificaciones | 200 con `{ servicio: "notificaciones", estado: "ok" }` |
| registra una notificación de pedido nuevo | Aviso desde Pedidos | Notificaciones | 201, tipo `pedido`, mensaje correcto, `leida` en false y datos originales guardados |
| rechaza datos incompletos con 400 | Validación de pedido | Notificaciones | 400 con detalle de los errores; no se guarda nada |
| rechaza cantidad cero o comprador vacío | Validación de pedido | Notificaciones | 400 |
| registra una alerta con el formato de Inventario | Alerta desde Inventario | Notificaciones | 201, tipo `stock_bajo`, respeta el contrato `itemId`, `nombre`, `stock`, `stockMinimo` |
| acepta stock igual a cero | Validación de stock bajo | Notificaciones | 201 |
| rechaza datos inválidos con 400 | Validación de stock bajo | Notificaciones | 400 con stock negativo, `itemId` no numérico o sin `stockMinimo` |
| GET /notificaciones devuelve una lista | Consulta general | Notificaciones | 200 con un arreglo ordenado de la más reciente a la más antigua |
| GET /notificaciones?tipo=stock_bajo filtra por tipo | Filtro por tipo | Notificaciones | Solo devuelve avisos `stock_bajo` |
| GET /notificaciones/:id devuelve una notificación | Consulta por id | Notificaciones | 200 con el registro |
| GET /notificaciones/:id devuelve 404 si no existe | Registro inexistente | Notificaciones | 404 |
| GET /notificaciones/:id con id no numérico devuelve 400 | Validación de id | Notificaciones | 400 |
| marca la notificación como leída | PATCH leída | Notificaciones | 200 y `leida` en true al volver a consultar |
| PATCH devuelve 404 si no existe | Registro inexistente | Notificaciones | 404 |
| la notificación persiste en PostgreSQL | Persistencia | Notificaciones | El registro se lee desde otra conexión a la base de datos |

**Resultado de las pruebas** (`docker compose exec notificaciones npm test`): 15 de 15 pruebas aprobadas.

![Pruebas de Notificaciones en verde](docs/img/notificaciones-tests.png)

**Avisos consultados por la API** (`curl http://localhost:3005/notificaciones`): dos alertas de stock bajo enviadas por Inventario y un aviso de pedido nuevo enviado por Pedidos.

![Consulta de notificaciones por la API](docs/img/notificaciones-api.png)

**Datos guardados en PostgreSQL** (`notificaciones_db`):

![Tabla notificaciones en PostgreSQL](docs/img/notificaciones-db.png)

> Alcance: los avisos se almacenan y se consultan por la API. En esta versión no se envían mensajes reales por WhatsApp, SMS ni correo.
