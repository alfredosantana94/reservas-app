## Arquitectura

    navegador ──► reservas-frontend ──────► reservas-api ──────► reservas-db
                  React + Vite              Node 20 + Express    MySQL 8.4
                  nginx :8080               :3000                :3306
                  (host 3000)               (host 3001, solo     (sin puerto
                                            depuración)          publicado)

| Capa | Imagen | Puerto interno | Puerto publicado |
| --- | --- | --- | --- |
| `reservas-frontend` | React + Vite servido por nginx | 8080 | 3000 |
| `reservas-api` | Node 20 + Express | 3000 | 3001 (solo depuración) |
| `reservas-db` | MySQL 8.4 | 3306 | — |

El frontend es el único punto de entrada: nadie le habla a la base 
directamente, y a la API le habla el frontend.

## Configuración de Nginx y Sustitución de Variables de Entorno

En la imagen del frontend se definen las siguientes variables de entorno para la resolución dinámica de la API al arrancar el contenedor:

- `API_HOST`: Nombre del servicio o host del backend (`reservas-api`).
- `API_PORT`: Puerto en el que escucha el backend (`3000`).
- `NGINX_ENVSUBST_FILTER`: Filtro para la plantilla de Nginx (`^API_`).

### ¿Por qué es obligatoria la variable `NGINX_ENVSUBST_FILTER`?

La imagen oficial de Nginx utiliza internamente la herramienta `envsubst` al arrancar el contenedor para reemplazar variables en las plantillas de configuración.

Si no se define `NGINX_ENVSUBST_FILTER=^API_`, el proceso de sustitución intentará reemplazar **todas** las variables que encuentre en el archivo de configuración, incluyendo las variables nativas de Nginx como `$uri`, `$host`, `$proxy_add_x_forwarded_for`, etc. Al no estar definidas en el sistema operativo, `envsubst` las reemplazará por cadenas vacías, corrompiendo silenciosamente la configuración de Nginx e impidiendo el correcto funcionamiento del servidor.

Al usar el filtro `^API_`, le indicamos a Nginx que **únicamente** reemplace las variables de entorno que comiencen con el prefijo `API_`, preservando intactas las variables nativas de Nginx.

## Tabla Comparativa de Imágenes y Medición de Optimizaciones

| Imagen / Servicio | Imagen Base Utilizada | Tamaño Versión Ingenua | Tamaño Versión Definitiva | Reducción Obtenida (%) |
| :--- | :--- | :--- | :--- | :--- |
| **Backend (`reservas-api`)** | `node:20-slim` | 1.1 GB *(imagen sin optimizar)* | 206 MB | **~81.2%** |
| **Frontend (`reservas-frontend`)** | `nginxinc/nginx-unprivileged:1.27-alpine` | ~1.1 GB - 1.2 GB *(con Node/npm)* | 48.4 MB | **~95.6%** |

---

### Justificación de Decisiones de Arquitectura y Optimización

- **Uso de la imagen base `node:20-slim` (Backend):** Reduce drásticamente el tamaño inicial del backend al eliminar paquetes del sistema operativo no esenciales para el entorno de ejecución de Node.js.
- **Instalación con `npm ci --omit=dev` (Backend):** Realiza instalaciones desde el `package-lock.json` omitiendo dependencias de desarrollo (`devDependencies`), reduciendo peso en el directorio `node_modules`.
- **Construcción Multi-Etapa (Frontend):** Separa la fase de compilación del artefacto de producción, descartando Node.js, npm, dependencias de compilación y el código fuente en la imagen final.
- **Imagen base `nginxinc/nginx-unprivileged:1.27-alpine` (Frontend):** Proporciona un servidor web enfocado en seguridad (sin root) y ligero basado en Alpine Linux, logrando un peso final pequeño.
- **Uso de `.dockerignore`:** Evita la transferencia inútil de archivos pesados de desarrollo (como `node_modules` locales, carpetas de compilación `.git` o `.env`) hacia el contexto del demonio de Docker durante el `build`.