# Arquitectura del Sistema — `reservas-app`

**Proyecto:** Variante B (`reservas-app`) — React + Vite, Node 20 + Express, MySQL 8.4""  
**Despliegue en Kubernetes:** Namespace `reservas-app`, chart de Helm `reservas-app/` (12 objetos) y manifiestos en `k8s/`""

---

## 1. Preguntas obligatorias del curso

### a) `API_HOST` en tiempo de ejecución vs. `VITE_API_URL` en tiempo de construcción

* **Por qué se configura con `API_HOST` en tiempo de ejecución:** Durante la compilación con Vite (`vite build`), las variables con prefijo `VITE_*` se evalúan y reemplazan como valores literales dentro del bundle JavaScript estático"". En cambio, el frontend inyecta la configuración en tiempo de ejecución mediante el `ConfigMap` `reservas-frontend-config` (`API_HOST: "reservas-api"`, `API_PORT: "3000"` y `NGINX_ENVSUBST_FILTER: "^API_"`)"", permitiendo que Nginx procese las variables al iniciar el contenedor sin recompilar ni reconstruir la imagen"".
* **Qué habría que rehacer si se usara `VITE_API_URL` en tiempo de construcción:** Si la URL quedara fija durante el build, pasar de un entorno de desarrollo a producción (o cambiar el host/ruta de destino) obligaría a modificar el valor de compilación, volver a ejecutar el build del frontend, generar una nueva imagen, publicarla en el registro y actualizar/redesplegar `reservas-frontend`"".

### b) Ausencia de CORS y qué habría que agregar si el SPA hablara directo con la API

* **Por qué no se necesita CORS en esta arquitectura:** El cliente accede a `http://reservas.local` a través del `Ingress` (`reservas-app-ingress`, `ingressClassName: nginx`), que enruta el tráfico hacia `reservas-frontend` (`8080`), mientras que Nginx resuelve/proxeea internamente hacia `reservas-api` (`reservas-api:3000`) bajo el mismo origen (`http://reservas.local`)"". Al mantenerse el mismo origen en el navegador, no se producen solicitudes *cross-origin* que requieran negociación CORS"".
* **Qué habría que agregar si la SPA se comunicara directamente con la API:** Si el navegador llamara directamente a otro origen (distinto dominio, esquema o puerto), el backend debería habilitar y responder con las cabeceras CORS adecuadas (`Access-Control-Allow-Origin` restringido a los orígenes autorizados, `Access-Control-Allow-Methods`, `Access-Control-Allow-Headers` y atención a solicitudes *preflight* `OPTIONS`)"".

### c) Un solo autoescalador (`HPA`) entre los doce objetos

* **Por qué hay un único HPA (`reservas-api-hpa`):** Entre los doce objetos del chart (`ConfigMaps`, `Secret`, `PVC`, `Deployments`, `Services`, `Ingress` y `HPA`), el escalado horizontal automático se aplica a `Deployment/reservas-api` (`minReplicas: 2`, `maxReplicas: 6`, `averageUtilization: 50` sobre `cpu`), apoyado en sus `resources.requests` (`100m` CPU / `128Mi` memoria) y `limits` (`500m` CPU / `512Mi` memoria)"". La API es stateless y absorbe carga de cómputo/solicitudes, por lo que multiplicar réplicas distribuye el trabajo sin requerir estado local por pod"".
* **Qué ocurriría si se asignara un HPA a `reservas-db`:** `reservas-db` ejecuta `mysql:8.4` (`replicas: 1`, puerto `3306`)"". Escalar horizontalmente réplicas de MySQL con un HPA sin una arquitectura de replicación/coordinación adecuada introduce conflictos de escritura/concurrencia, problemas de consistencia y bloqueos o fallos sobre el almacenamiento en vez de escalar de forma segura la base de datos"".
* **Por qué tampoco lo tiene `reservas-frontend`:** `reservas-frontend` (`replicaCount: 1`, `Service` tipo `NodePort` en `8080` / `30301`) sirve contenido estático compilado con un consumo de CPU bajo en comparación con la API, por lo que no requiere autoescalado horizontal"".

---

## 2. Concurrencia al pasar de una a tres réplicas de la API (Variante B)

Al pasar de **una** a **tres** réplicas de `reservas-api`, la comprobación previa de disponibilidad desde la capa de aplicación (`SELECT` antes de `INSERT`) **deja de garantizar la invariante de exclusión**"".

* **Condición de carrera en la lectura previa:** Con múltiples réplicas atendiendo peticiones simultáneas para la misma sala, fecha y franja, dos o más procesos pueden ejecutar la consulta de disponibilidad al mismo tiempo y ver la franja como **«libre»** antes de que cualquiera realice la inserción"". Si la lógica dependiera solo de esa lectura previa, podrían producirse reservas duplicadas"".
* **Garantía mediante restricción de unicidad en la base de datos:** La regla de negocio queda garantizada por la **restricción de unicidad (`UNIQUE`) sobre `(sala_id, fecha, franja)` aplicada por el motor MySQL**"". Ante inserciones concurrentes, solo una transacción completa la inserción (`201`) y las restantes son rechazadas por violación de unicidad (`409`), dejando un único registro (`COUNT(*) = 1`), tal como se evidencia en `INFORME.md`"".

---

## 3. Dificultades propias de MySQL en el curso

1. **Símbolo `$` en la comprobación de estado (`healthcheck`) y período de gracia inicial:**
   * **Cómo se manifestó:** Al escribir comandos de comprobación de estado o autenticación con caracteres `$` y evaluar el estado del contenedor antes de que MySQL terminara su arranque inicial, el chequeo fallaba o se ejecutaba con sustituciones inesperadas antes de que el servicio estuviera listo para aceptar conexiones"".
   * **Cómo se diagnosticó:** Revisando los registros del contenedor/pod y los resultados del *healthcheck*, comprobando el desfase entre el arranque inicial de MySQL y la primera evaluación de salud, así como la interpretación de `$`"".
   * **Cómo se resolvió:** Escapando adecuadamente `$` para evitar expansiones no deseadas del shell y ajustando el período de gracia inicial (`start_period` / `initialDelaySeconds`) y parámetros de reintento para dar tiempo a la inicialización completa de MySQL"".

2. **Restricciones de esquema (claves foráneas / índices) y montaje de datos en MySQL:**
   * **Cómo se manifestó:** Al intentar modificar índices o estructuras de tablas vinculadas a claves foráneas—o al trabajar con volúmenes/subrutas sobre el directorio de datos de MySQL—el motor rechazaba la operación por dependencias o por el estado del directorio de datos"".
   * **Cómo se diagnosticó:** Analizando el error devuelto por MySQL/Kubernetes durante la migración/aplicación del esquema o el montaje del volumen"".
   * **Cómo se resolvió:** Eliminando o ajustando primero la clave foránea antes de modificar el índice (manteniendo la restricción de unicidad requerida) y asegurando un directorio de datos vacío/compatible al inicializar MySQL con almacenamiento persistente"".

---

## 4. Pendientes para un entorno de producción real

* **Observabilidad:** Incorporar métricas (aplicación, Ingress y MySQL), recolección centralizada de logs y alertas sobre latencia, errores y uso de recursos"".
* **CI/CD:** Automatizar pruebas, *build* con etiquetas inmutables (evitando `latest`), validaciones y despliegues reproducibles hacia el clúster"".
* **Gestión externa de secretos:** Las credenciales presentes en `secret-reservas-db.yaml` (`reservas_user`, `reservas_pass`, `root_password_segura`) corresponden a un entorno de laboratorio"". En producción deben administrarse mediante un gestor externo de secretos o mecanismos equivalentes (como *External Secrets*, *Sealed Secrets* o *Vault*) sin almacenar secretos reales en el repositorio"".
* **Copias de respaldo de la base de datos:** Programar respaldos periódicos y consistentes de MySQL y verificar su restauración ante pérdida de datos"".
* **Por qué `Deployment` + volumen no es la solución en un entorno serio:** Un `Deployment` está orientado a cargas sin estado donde los pods son intercambiables y no ofrece garantías de identidad estable ni de ciclo de vida/replicación propias de una base de datos en producción"". Para una base de datos en producción real corresponde un `StatefulSet` con almacenamiento persistente por réplica (o servicio de base de datos gestionado/clúster) con estrategia de replicación, failover y backups probados"".