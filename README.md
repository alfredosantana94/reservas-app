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

### Demostración y Explicación del Build Cache

- **Modificación de código fuente:** Mantener la copia del código fuente al final permite que las capas pesadas (`package*.json` y `npm ci`) se reutilicen desde la caché (`CACHED`), haciendo las reconstrucciones de desarrollo casi instantáneas.
- **Modificación del manifiesto de dependencias:** Al cambiar `package.json`, Docker detecta la alteración en el hash del archivo e invalida la caché en la instrucción `COPY ./package*.json ./`, obligando a reejecutar el comando `RUN npm ci`.

**¿Por qué el orden de las instrucciones lo hace posible?**
Docker evalúa las capas de forma secuencial. Al copiar e instalar primero las dependencias antes que el código fuente de la aplicación, se garantiza que los cambios frecuentes en el código no invaliden prematuramente la caché de las dependencias pesadas.

## Publicación de Imágenes en Docker Hub

Para permitir que el clúster de Kubernetes/Swarm pueda descargar las imágenes en etapas posteriores, se publicaron los artefactos en los repositorios públicos de Docker Hub:

### Nombres completos de las imágenes publicadas:
- **Backend:** `alfredosantana94/reservas-api`
- **Frontend:** `alfredosantana94/reservas-frontend`
- **Tag:** `:v1`

### Comandos utilizados para la publicación:

```bash
# 1. Autenticación en Docker Hub
docker login

# 2. Etiquetado de las imágenes locales
docker tag reservas-api:v1 MI_USUARIO/reservas-api:v1
docker tag reservas-frontend:v1 MI_USUARIO/reservas-frontend:v1

# 3. Publicación en el registro público
docker push MI_USUARIO/reservas-api:v1
docker push MI_USUARIO/reservas-frontend:v1
```

## Despliegue de la Base de Datos (`reservas-db`)

```
### Comando de ejecución
docker run -d \
  --name reservas-db \
  --network reservas-net \
  -v reservas-db-data:/var/lib/mysql \
  -e MYSQL_DATABASE=reservasdb \
  -e MYSQL_USER=reservas_user \
  -e MYSQL_PASSWORD=reservas_pass \
  -e MYSQL_ROOT_PASSWORD=reservas_root_pass \
  mysql:8.4

### Variables de Entorno Utilizadas:
- `MYSQL_DATABASE=reservasdb`: Define el nombre de la base de datos de la aplicación.
- `MYSQL_USER=reservas_user`: Define el usuario no raíz para las conexiones de la API.
- `MYSQL_PASSWORD=reservas_pass`: Establece la contraseña del usuario no raíz.
- `MYSQL_ROOT_PASSWORD=root_pass`: Establece la clave del usuario administrador (`root`).
```
### Errores durante la ejecución del Reverse Proxy sin red

Al ejecutar el contenedor del frontend sin conectarlo a la red privada (`--network reservas-net`):

```bash
docker run -d --name reservas-frontend -p 3000:8080 -e API_HOST=reservas-api -e API_PORT=3000 reservas-frontend:v1
```

### Error al iniciar el Reverse Proxy sin Red
- **Al chquear el estado del contenedor con el comando `docker ps -a`:** 
  ```
  Exited (1)
  ```
- **Al revisar el Log de error con el comando `docker logs reservas-frontend`:**
  ```text
  timestamp [emerg] 1#1: host not found in upstream "reservas-api" in /etc/nginx/conf.d/default.conf:24
  ```

### Explicación:
Nginx resuelve la dirección IP del host configurado en la directiva `proxy_pass http://${API_HOST}:${API_PORT}/;` una sola vez durante su proceso de inicialización. 
Al omitir el argumento `--network reservas-net`, el contenedor queda ubicado en la red predeterminada `bridge` y carece de acceso al servidor DNS interno de Docker. Como no puede resolver el nombre `reservas-api`, Nginx aborta la inicialización con un error fatal (`[emerg]`), provocando el colapso inmediato del contenedor con código de salida 1.

---

## Orden de Arranque

El despliegue manual mediante comandos de consola requiere respetar estrictamente la siguiente secuencia de dependencias:

$$\text{Red } (\texttt{reservas-net}) \longrightarrow \text{Volumen } (\texttt{reservas-data}) \longrightarrow \text{Base de Datos } (\texttt{reservas-db}) \longrightarrow \text{Backend } (\texttt{reservas-api}) \longrightarrow \text{Frontend } (\texttt{reservas-frontend})$$

### Inversión del orden: Ejecución del Frontend en primer lugar

Si se intenta levantar únicamente el frontend al inicio sin haber creado previamente la red, el volumen, la base de datos ni la API:

1. **Si se especifica `--network reservas-net`:** Docker rechaza el comando inmediatamente con un error de consola (`network reservas-net not found`), ya que la red virtual no existe en el motor.
2. **Si se omite la red (o se crea la red pero sin los otros contenedores):** El script de entrada de Nginx (`20-envsubst-on-templates.sh`) genera la configuración, pero el proceso principal falla al resolver la IP de `reservas-api`. Nginx arroja el error fatal `[emerg] host not found in upstream "reservas-api"` y el contenedor pasa inmediatamente a estado `Exited (1)`.
3. **Inoperatividad del sistema:** La aplicación web queda inaccesible y sin Backend/Base de Datos para procesar las peticiones HTTP.

### Matriz de fallos al invertir otros pasos intermedios:

- **Levantar la API antes que la Base de Datos:**
  El backend intenta abrir una conexión TCP hacia `reservas-db:3306`. Al no encontrar la base de datos lista en la red, la aplicación falla con `ECONNREFUSED` y el contenedor se detiene (`Exited (1)`).
- **Levantar la Base de Datos sin asociar el Volumen:**
  La base de datos arranca normalmente, pero almacena sus archivos en el almacenamiento efímero del contenedor. Al destruir o recrear `reservas-db`, toda la información guardada se pierde.
- **Destruir o reiniciar la Base de Datos con la API en ejecución:**
  La API pierde la conexión TCP. Aunque el contenedor de MySQL vuelva a estar activo, el pool de conexiones de Node.js no se recupera solo y requiere un reinicio explícito del contenedor (`docker restart reservas-api`).

---

## Limitación del Despliegue Manual

En la arquitectura actual, la orquestación y el cumplimiento del orden de dependencias residen **únicamente en el conocimiento operativo del administrador** que ejecuta los comandos por consola, sin existencia de ningún archivo ejecutable que automatice la secuencia.

Esta limitación se resolverá en la siguiente etapa mediante **Docker Compose**, utilizando la directiva `depends_on` combinada con comprobaciones de estado de salud (`condition: service_healthy`).