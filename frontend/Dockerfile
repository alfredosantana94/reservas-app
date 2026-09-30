#Etapa 1 para construir la imagen solo con las dependencias y con ALPINE que es mas liviano
FROM node:20-alpine AS build
WORKDIR /app
#Copiamos el archivo con dependencias
COPY ./package*.json ./
#Instalación de dependencias y contrucción del front
RUN npm ci
#Copiando el resto del código y construyecndo la aplicación
COPY . .
RUN npm run build

#Etapa 2 para para el proxy reverso que solo contenga la carpeta build correspondiente del proyecto construido
FROM nginxinc/nginx-unprivileged:1.27-alpine AS final
#Agrego versiónes
ARG APP_VERSION=v1
ENV APP_VERSION=${APP_VERSION}
#Copiamos unicamente la carpeta dist
COPY --from=build /app/dist /usr/share/nginx/html
#Variables de entorno
ENV API_HOST=reservas-api \
    API_PORT=3000 \
    NGINX_ENVSUBST_FILTER=^API_
#Documentar e iniciar
EXPOSE 8000
CMD ["nginx", "-g", "daemon off;"]