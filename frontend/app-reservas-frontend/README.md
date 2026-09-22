# app-reservas-frontend

Interfaz web para reservar salas: muestra una grilla de salas por franja horaria para la fecha
elegida, y permite reservar, cancelar y administrar salas. Es una SPA escrita en
**React + Vite**.

No conoce la URL de la API: pide siempre rutas relativas a `/api/...` de su propio origen, y
quien reenvía esas requests al backend es el servidor web que sirve la SPA.

## Cómo correrlo

Necesita **la API corriendo en `http://localhost:3001`**. Con eso:

```bash
npm install
npm run dev
```

Abre en **http://localhost:5173**. El servidor de desarrollo de Vite ya reenvía `/api/...` a
`localhost:3001`; está configurado en [`vite.config.js`](vite.config.js).

Para generar los archivos estáticos de producción:

```bash
npm run build      # deja el resultado en dist/
npm run preview    # sirve dist/ para revisarlo
```

## Servido como sitio estático

`dist/` son archivos estáticos: los sirve cualquier servidor web. En [`nginx/templates/`](nginx/templates/)
está la configuración de nginx que hace falta, y que resuelve tres cosas:

- reenvía `/api/...` al backend;
- responde `/healthz` con `ok`;
- manda cualquier otra ruta a `index.html`, porque el ruteo lo hace la SPA.

Esa configuración es una **plantilla**: toma el destino del backend de dos variables de entorno,
y hay que reemplazarlas al arrancar el servidor (la imagen oficial de nginx lo hace sola con
`envsubst` sobre `/etc/nginx/templates/*.template`).

| Variable | Ejemplo | Para qué |
|---|---|---|
| `API_HOST` | `reservas-api` | Host del backend |
| `API_PORT` | `3000` | Puerto del backend |

> nginx resuelve el nombre de `API_HOST` **una sola vez, al arrancar**. Si en ese momento no
> resuelve, el proceso no arranca: falla con `host not found in upstream`. El backend tiene que
> estar levantado y ser alcanzable por ese nombre antes de arrancar el servidor web.

El sitio escucha en el puerto **8080**.

## Estructura

```
src/App.jsx           pantalla principal
src/api.js            cliente HTTP contra /api
src/components/       grilla de reservas, selector de fecha y modales
nginx/templates/      configuración de nginx para servir dist/
vite.config.js        puerto de desarrollo y proxy hacia la API
```
