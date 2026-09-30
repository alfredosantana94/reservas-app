# app-reservas-backend

API REST para reservar salas por franja horaria. Guarda salas y reservas en **MySQL** y las
expone en JSON. Está escrita en **Node.js 20 con Express**.

Al arrancar crea las tablas si no existen y, si `SEED_DEMO` está activo, carga unas salas de
ejemplo. Reintenta la conexión un minuto: MySQL tarda bastante la primera vez que inicializa
sus datos.

Una reserva es única por sala, fecha y franja: si se pide una franja ya tomada, la API responde
**409**.

## Qué expone

Escucha en el puerto **3000** (configurable con `PORT`).

| Método | Ruta | Qué hace |
|---|---|---|
| `GET` | `/health` | Estado del servicio y de la base |
| `GET` | `/franjas` | Las seis franjas horarias, con su número y su horario |
| `GET` | `/salas` | Lista las salas |
| `POST` | `/salas` | Crea una sala. Body: `nombre`, y `capacidad` y `ubicacion` opcionales |
| `DELETE` | `/salas/:id` | Borra una sala (falla si tiene reservas) |
| `GET` | `/reservas` | Lista reservas; acepta `?fecha=AAAA-MM-DD` |
| `POST` | `/reservas` | Crea una reserva. Body: `sala_id`, `fecha` (`AAAA-MM-DD`), `franja` (1 a 6), `responsable` y `motivo` opcional. **409** si esa franja ya está tomada |
| `DELETE` | `/reservas/:id` | Cancela una reserva |

## Variables de entorno

| Variable | Por defecto | Para qué |
|---|---|---|
| `PORT` | `3000` | Puerto en el que escucha |
| `DB_HOST` | `localhost` | Host de MySQL |
| `DB_PORT` | `3306` | Puerto de MySQL |
| `DB_NAME` | `reservasdb` | Nombre de la base |
| `DB_USER` | `reservas_user` | Usuario |
| `DB_PASSWORD` | `reservas_pass` | Contraseña |
| `DB_POOL_SIZE` | `10` | Conexiones del pool |
| `APP_VERSION` | `v1` | Lo que devuelve `/health` en `version` |
| `SEED_DEMO` | `true` | Carga salas de ejemplo al arrancar. `false` para no hacerlo |

## Cómo correrlo

**1. La base de datos.** Hace falta un MySQL 8.4:

```bash
docker run -d --name reservas-db \
  -e MYSQL_DATABASE=reservasdb \
  -e MYSQL_USER=reservas_user \
  -e MYSQL_PASSWORD=reservas_pass \
  -e MYSQL_ROOT_PASSWORD=reservas_root_pass \
  -p 3306:3306 \
  mysql:8.4
```

La primera vez tarda cerca de un minuto en aceptar conexiones.

**2. La API.**

```bash
npm install

export DB_HOST=localhost DB_PORT=3306
export DB_NAME=reservasdb DB_USER=reservas_user DB_PASSWORD=reservas_pass

npm start
```

**3. Probar que anda.**

```bash
curl -s http://localhost:3000/health
curl -s http://localhost:3000/salas

# franja es el NÚMERO de franja (1 a 6); `GET /franjas` devuelve a qué hora
# corresponde cada uno. La 1 es 08:00-10:00.
curl -s -X POST http://localhost:3000/reservas \
  -H 'Content-Type: application/json' \
  -d '{"sala_id":1,"fecha":"2026-10-01","franja":1,"responsable":"Ana","motivo":"Clase"}'

# la misma sala, fecha y franja otra vez: devuelve 409
curl -s -o /dev/null -w '%{http_code}\n' -X POST http://localhost:3000/reservas \
  -H 'Content-Type: application/json' \
  -d '{"sala_id":1,"fecha":"2026-10-01","franja":1,"responsable":"Beto","motivo":"Otra"}'
```

## Estructura

```
server.js           las rutas de la API
db.js               pool de conexiones, esquema y datos de ejemplo
package.json        dependencias y el script `npm start`
```
