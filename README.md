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

## Configuración del Healthcheck para la Base de Datos (`reservas-db`)

El servicio de base de datos incluye un control de salud (*healthcheck*) adaptado a las características de inicialización de MySQL:

```yaml
    healthcheck:
      test:
        - CMD-SHELL
        - mysqladmin ping -h 127.0.0.1 -u root -p"$$MYSQL_ROOT_PASSWORD" --silent
      interval: 5s
      timeout: 5s
      retries: 20
      start_period: 40s

Justificación Técnica y Decisiones de Diseño

¿Por qué se escribe `$$` y no `$`?
Con un solo `$`, la interpolación de la variable la realiza Compose al leer el archivo, y la contraseña queda escrita en la línea de comando del healthcheck, visible mediante `docker inspect`. Con `$$`, Compose escribe un `$` literal y la variable la expande el intérprete dentro del contenedor, evitando exponer credenciales en texto plano.
  
¿Por qué hace falta `start_period 40s`?
La primera inicialización del directorio de datos de MySQL es lenta debido a la creación de tablas del sistema y estructuras internas. Sin ese período de gracia, el contenedor puede quedar marcado como `unhealthy` cuando en realidad se encontraba arrancando de manera correcta.
```

### Configuración del Healthcheck para la API (`reservas-api`)

Para verificar que el backend se encuentra respondiendo peticiones HTTP de manera correcta, se implementó un control de salud (*healthcheck*) aprovechando los recursos nativos del entorno de ejecución:

```yaml
healthcheck:
  test:
    - CMD
    - node
    - -e
    - "fetch('[http://127.0.0.1:3000/health').then(r](http://127.0.0.1:3000/health').then(r) => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))"
  interval: 5s
  timeout: 5s
  retries: 20
  start_period: 10s

Justificación Técnica y Decisiones de Diseño

¿Por que no corresponde instalar`curl` (u otras herramientas externas) en la imagen?
Instalar utilidades del sistema como `curl` o `wget` exclusivamente para realizar el sondeo del *healthcheck* rompe con las buenas prácticas de contenerización. Esto incrementa innecesariamente el tamaño de la imagen Docker, añade capas adicionales al árbol de dependencias del sistema operativo y amplía la superficie de ataque ante posibles vulnerabilidades de seguridad. Al estar ejecutándose una aplicación sobre Node.js (versión 18 en adelante), el motor ya incorpora de forma nativa la función global `fetch`, permitiendo resolver la validación HTTP de manera autónoma, limpia y sin incorporar paquetes externos adicionales.
```

### Configuración del Healthcheck para el Frontend (`reservas-frontend`)

El contenedor del frontend (construido sobre una imagen basada en Nginx / Alpine) incorpora un control de salud (*healthcheck*) utilizando `wget` para consultar el endpoint de disponibilidad `/healthz`:

```yaml
healthcheck:
  test: ["CMD", "wget", "-qO-", "[http://127.0.0.1:8080/healthz](http://127.0.0.1:8080/healthz)"]
  interval: 5s
  timeout: 5s
  retries: 3
  start_period: 10s

Justificación Técnica y Decisiones de Diseño

¿Por qué se utiliza wget en lugar de instalar nuevas herramientas?
Las imágenes basadas en Alpine Linux incluyen por defecto BusyBox, el cual provee de forma nativa utilidades esenciales del sistema, entre ellas el comando wget. Utilizar wget (-qO- para modo silencioso e impresión del contenido por salida estándar) permite realizar el sondeo HTTP contra el servidor Nginx interno sin necesidad de alterar la imagen base, instalar paquetes adicionales (curl), ni inflar el tamaño final del contenedor, manteniendo la arquitectura ligera y segura.
```

### 5. Configuración de dependencias condicionales (`depends_on` con `condition: service_healthy`)

Para establecer un orden de arranque robusto y sincronizado entre los servicios, se configuró la opción `depends_on` utilizando la condición de salud de los contenedores previos:

```yaml
  reservas-api:
    depends_on:
      reservas-db:
        condition: service_healthy

  reservas-frontend:
    depends_on:
      reservas-api:
        condition: service_healthy

Justificación Técnica y Decisiones de Diseño

reservas-api respecto de reservas-db:

El problema es que la API necesita establecer una conexión activa con la base de datos, pero la primera inicialización del motor de MySQL requiere un tiempo considerable para preparar su directorio de datos.

¿Por qué no basta la forma corta? La sintaxis simplificada depends_on: [reservas-db] únicamente espera a que el contenedor de la base de datos comience a ejecutarse (su proceso PID 1 inicie), pero no garantiza que esté lista para aceptar consultas SQL.

El rol de service_healthy y la resiliencia en Kubernetes
Con condition: service_healthy, la API espera de manera estricta a que el healthcheck de MySQL responda de forma positiva. Adicionalmente, la API implementa una lógica interna de reintentos de conexión durante aproximadamente 60 segundos. Esta estrategia de reintentos es fundamental ya que es la única que subsistirá en entornos de orquestación avanzados como Kubernetes, donde el concepto nativo de depends_on no existe y la resiliencia recae enteramente en la aplicación y en las sondas de arranque (startup probes).

reservas-frontend respecto de reservas-api:

El problema es que si el frontend inicia antes que el backend, Nginx intenta resolver el nombre del host del upstream al momento de levantar su servicio. Si dicho host aún no existe en la red interna de Docker, Nginx genera un error fatal de resolución (host not found in upstream) y termina abortando su ejecución.

Diferencia operativa: A Nginx le alcanza técnicamente con que el contenedor del backend comience a existir para resolver el nombre de red (por lo que la forma corta también evitaría el error de resolución). Sin embargo, utilizar condition: service_healthy aporta una ventaja adicional: asegura que el frontend arranque con la API ya completamente inicializada y lista para procesar peticiones, evitando por completo las respuestas con errores HTTP 502 Bad Gateway en las primeras consultas del cliente durante los segundos iniciales de despliegue.

```

### Comprobación del error del Frontend y comparación histórica

Tras desplegar el pod `reservas-frontend`, la revisión de los registros mediante `kubectl logs reservas-frontend` arrojó por tercera vez en el curso el mensaje de error:
`host not found in upstream`.

**Análisis comparativo con la tercera semana (Docker / Docker Compose):**
* **Identidad del síntoma:** El error en el comportamiento de Nginx es técnicamente idéntico (`host not found in upstream`), ya que el servidor web no puede resolver el dominio de destino del backend.
* **Diferencia en la causa raíz:** 
  * En la *tercera semana* (Docker Compose), el fallo ocurría porque los contenedores no compartían la misma red lógica definida o el puente de red no estaba correctamente enlazado.
  * En el *entorno actual* (Kubernetes con Pods sueltos), la red del clúster existe y es funcional, pero el fallo radica en la **ausencia de un objeto `Service`**, el cual es el único componente autorizado en Kubernetes para registrar nombres DNS estables y realizar el descubrimiento de servicios interno.

  ### Acceso mediante `port-forward` y naturaleza de la herramienta

Mediante el uso de `kubectl port-forward pod/reservas-api 3001:3000`, se estableció un túnel directo desde la máquina local hacia el contenedor de la API dentro del clúster. Las peticiones a `localhost:3001/health` y `localhost:3001/reservas` respondieron correctamente, permitiendo validar la funcionalidad del servicio de forma aislada.

**Conclusión:** El comando `kubectl port-forward` interactúa directamente con el servidor de la API de Kubernetes para tunelizar tráfico hacia un Pod específico. Constituye una **herramienta de diagnóstico y depuración temporal** para desarrolladores, pero **no un mecanismo de publicación** en producción, ya que no ofrece balanceo de carga entre réplicas, no tolera la muerte o recreación del Pod de manera transparente y requiere acceso directo al clúster con privilegios de `kubectl`.

### Cheatsheet de comandos de `kubectl` utilizados

1. `kubectl apply -f [archivo.yaml]`  
   * **Descripción:** Lee un archivo de manifiesto YAML y crea o actualiza los recursos descritos en él dentro del clúster de Kubernetes.

2. `kubectl get pods`  
   * **Descripción:** Lista todos los Pods activos en el espacio de nombres actual, permitiendo revisar de forma rápida su nombre, estado, número de reinicios y antigüedad.

3. `kubectl get pods -o wide`  
   * **Descripción:** Extiende la información del listado de Pods mostrando detalles adicionales de red, como la dirección IP interna asignada a cada Pod y el nodo del clúster donde corren.

4. `kubectl get pods -w`  
   * **Descripción:** Mantiene la consulta de Pods abierta en modo *watch* (seguimiento en tiempo real), actualizando automáticamente la pantalla ante cualquier cambio de estado o ciclo de vida.

5. `kubectl logs [nombre-pod]`  
   * **Descripción:** Extrae y muestra en la terminal la salida estándar (`stdout` y `stderr`) generada por los contenedores internos de un Pod específico para realizar depuración.

6. `kubectl exec -it [nombre-pod] -- [comando]`  
   * **Descripción:** Abre una sesión interactiva o ejecuta un comando puntual dentro del contenedor en ejecución de un Pod determinado (por ejemplo, para probar conectividad o inspeccionar archivos).

7. `kubectl delete pod [nombre-pod]`  
   * **Descripción:** Elimina de manera inmediata un Pod específico del clúster, forzando su ciclo de destrucción sin la intervención de un controlador.

8. `kubectl port-forward pod/[nombre-pod] [local]:[remoto]`  
   * **Descripción:** Establece un túnel temporal de red entre la máquina local y un puerto específico del Pod, permitiendo el acceso directo para tareas de diagnóstico sin exponer servicios públicamente.

9. `kubectl get namespaces`  
   * **Descripción:** Permite listar todos los espacios de nombres (*namespaces*) disponibles en el clúster para verificar el entorno de trabajo actual.

10. `kubectl describe pod [nombre-pod]`  
    * **Descripción:** Muestra información detallada y diagnósticos avanzados sobre el estado, eventos recientes, configuración y errores de un Pod específico.

### Comparativa: Docker Compose - Manifiestos de Pods

Esta sección analiza las similitudes y diferencias arquitectónicas entre el enfoque de orquestación local mediante `docker-compose.yml` y el despliegue nativo mediante tres manifiestos de Pods independientes en Kubernetes.

| Dimensión | `docker-compose.yml` (Semana anterior) | Tres Manifiestos de Pods (Entrega actual) |
| :--- | :--- | :--- |
| **Definición de recursos** | Un archivo único y centralizado que define todos los contenedores, volúmenes y redes. | Tres manifiestos independientes y desacoplados (`pod-reservas-db.yaml`, `pod-reservas-api.yaml`, `pod-reservas-frontend.yaml`). |
| **Redes y Resolución DNS** | Crea automáticamente una red interna tipo *bridge* donde los contenedores se resuelven por el nombre de su servicio de forma estática. | Los Pods comparten la red del clúster y tienen IPs propias, pero **no existe resolución DNS automática** entre ellos al carecer de objetos `Service`. |
| **Ciclo de vida y Resiliencia** | El motor maneja el reinicio básico y mantiene los contenedores en ejecución a nivel local (políticas `restart`). | Los Pods sueltos son **mortales y efímeros**; si un pod se elimina o cae, no hay un controlador que lo resucite. |

---

#### ¿Qué se conservó?
* **Las imágenes de contenedores:** Se utilizaron exactamente las mismas imágenes Docker desarrolladas para la base de datos (`reservas-db`), el backend (`reservas-api`) y el frontend (`reservas-frontend`).
* **Las variables de entorno y configuración:** Los parámetros de conexión esenciales (como las credenciales de base de datos o los endpoints de comunicación) se mantuvieron mapeados en los contenedores mediante variables de entorno similares.
* **El diseño modular de la aplicación:** La arquitectura de tres capas (perspectiva de datos, lógica de negocio y capa de presentación) permaneció intacta en su división lógica.

#### ¿Qué desapareció?
* **La red integrada y el descubrimiento automático de nombres:** Desapareció la abstracción de red de Docker Compose que resolvía automáticamente los nombres de host de manera transparente para los contenedores.
* **La orquestación centralizada en un único archivo:** Se perdió la facilidad de gestionar toda la infraestructura con un solo comando central (`docker compose up`), debiendo aplicar y administrar manifiestos de forma individual.
* **El control automático del ciclo de vida:** Desapareció el comportamiento de reintento automático y persistencia local que proveía el demonio de Docker Compose por defecto frente a fallas de contenedores.

#### ¿Qué todavía falta?
* **Los objetos `Service`:** Componentes fundamentales en Kubernetes para proveer abstracción de red, IPs estables y balanceo de carga interno mediante nombres DNS fijos.
* **Los controladores de carga de trabajo (`Deployments` / `ReplicaSets`):** Mecanismos de abstracción superiores necesarios para garantizar la resiliencia, escalabilidad horizontal, autorreparación y persistencia de los Pods ante caídas.
* **Los objetos de configuración y almacenamiento persistente avanzados (`ConfigMaps`, `Secrets` y `PersistentVolumeClaims`):** Capas de abstracción nativas para desacoplar por completo la configuración y los datos de la vida útil de los Pods.


## Trabajo Práctico N° 6 — Despliegue en Kubernetes (Variante B)

### Endpoints verificados (`kubectl get endpoints -n reservas-app`)
- `reservas-api`: 2 endpoints en puerto `3000`
- `reservas-db`: 1 endpoint en puerto `3306`
- `reservas-frontend`: 2 endpoints en puerto `8080`

### Notas de arquitectura y decisiones
* **Orden de aplicación:** Los `Services` deben aplicarse antes que los `Deployments`. Si `reservas-frontend` arranca antes de que exista el DNS del servicio `reservas-api`, Nginx falla al iniciar con el error `host not found in upstream "reservas-api"`.
* **Servicio de depuración (`reservas-api-nodeport`):** Expuesto en el puerto `30501` exclusivamente para pruebas y depuración directa de la API. Este objeto no formará parte del chart de Helm en la semana 8.
* **Garantía de unicidad en concurrencia:** Con 3 réplicas de la API atendiendo 30 solicitudes simultáneas sobre el mismo turno, solo se registra 1 reserva (`201 Created`) y 29 son rechazadas (`409 Conflict`). La invariante la garantiza el motor MySQL mediante la restricción `UNIQUE (sala_id, fecha, franja)`, y no una validación previa en el código de la aplicación.
* **Limitación conocida (sin persistencia):** `reservas-db` corre actualmente como un Deployment sin volumen persistente. Al eliminar su Pod, Kubernetes lo recrea automáticamente pero se pierden todas las reservas almacenadas. Esta limitación se resolverá en el TP N° 7 incorporando un `PersistentVolumeClaim`.

## Trabajo Práctico N° 7 — Configuración, Secretos, Persistencia e Ingress (Variante B)

### Inventario de recursos desplegados (`namespace: reservas-app`)

| # | Objeto | Tipo (`Kind`) | Función en el proyecto |
|---|---|---|---|
| 1 | `reservas-app` | `Namespace` | Aísla lógicamente todos los recursos de la aplicación dentro del clúster. |
| 2 | `reservas-api-config` | `ConfigMap` | Almacena la configuración no sensible de la API (`DB_HOST`, `DB_PORT`, `DB_NAME`, `PORT`, `SEED_DEMO`). |
| 3 | `reservas-frontend-config` | `ConfigMap` | Almacena los parámetros de conexión hacia el backend (`API_HOST`, `API_PORT`) usados por Nginx. |
| 4 | `reservas-db-secret` | `Secret` | Guarda las credenciales de MySQL (`MYSQL_USER`, `MYSQL_PASSWORD`, `MYSQL_ROOT_PASSWORD`). |
| 5 | `reservas-db-pvc` | `PersistentVolumeClaim` | Solicita 1 GiB de almacenamiento persistente (`ReadWriteOnce`) para conservar los datos de MySQL. |
| 6 | `reservas-db` | `Deployment` | Gestiona el contenedor MySQL 8.4 montando el volumen persistente mediante `subPath: mysql`. |
| 7 | `reservas-api` | `Deployment` | Gestiona las réplicas de la API Node/Express consumiendo variables desde `ConfigMap` y `Secret`. |
| 8 | `reservas-frontend` | `Deployment` | Gestiona las réplicas del servidor Nginx que sirve la SPA en React y actúa como proxy inverso. |
| 9 | `reservas-db` | `Service` (`ClusterIP`) | Expone internamente la base de datos en el puerto `3306` mediante DNS estable dentro del namespace. |
| 10 | `reservas-api` | `Service` (`ClusterIP`) | Balancea el tráfico interno hacia los pods de la API en el puerto `3000`. |
| 11 | `reservas-app-ingress` | `Ingress` | Enruta el tráfico HTTP externo del host `reservas.local` (`/`) hacia `reservas-frontend:8080`. |

*(Nota: El servicio `reservas-frontend` (`NodePort` `30301`) sigue activo como acceso alternativo de la etapa anterior, y `reservas-api-nodeport` (`30501`) se mantiene exclusivamente para depuración puntual).*

### Notas técnicas y verificaciones

* **Seguridad en `Secret`:** Kubernetes almacena los valores de un `Secret` codificados en Base64 (`base64 -d` devuelve el texto plano), lo cual no constituye cifrado. Para proteger credenciales reales en producción es necesario habilitar el **cifrado en reposo en `etcd`** (*EncryptionConfiguration*) o delegar la gestión a un **gestor de secretos externo** (como External Secrets Operator o HashiCorp Vault).
* **Persistencia y uso de `subPath` en MySQL:** Al montar un volumen que ya contiene archivos en su raíz (`viejo.txt`), MySQL aborta la inicialización con el error `--initialize specified but the data directory has files in it. Aborting.`. El uso de `subPath: mysql` aísla los archivos del motor en un subdirectorio limpio dentro del mismo volumen, permitiendo que las reservas sobrevivan al eliminar y recrear el Pod de `reservas-db`.
* **Comportamiento del Ingress y SPA (falso positivo):** El `Ingress` define una única regla `/` hacia `reservas-frontend:8080` sin ruta `/api`, delegando el enrutamiento interno al proxy inverso de Nginx. Consultar `curl -i http://reservas.local` devuelve `200 OK` con el documento `index.html` (falso positivo provocado por la directiva `try_files` de la SPA), mientras que `curl -s http://reservas.local` atraviesa el proxy de Nginx y devuelve el JSON real de la base de datos.

