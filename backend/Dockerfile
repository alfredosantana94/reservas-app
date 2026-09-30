#Etapa 1 para construir la imagen solo con las dependencias y con ALPINE que es mas liviano
FROM node:20-slim AS deps
WORKDIR /app
#Cumplimiento del requisito b
COPY ./backend/package*.json ./
#Cumplimiento del requisito a
RUN npm ci --omit=dev

#Etapa 2 para construir la imagen con una base mínima y la variable ENV  NODE_ENV=production;
FROM node:20-slim AS final
WORKDIR /app
#Cumplimiento del requisito c
ENV NODE_ENV=production;
#Cumplimiento del requisito e
ARG APP_VERSION=v1
ENV APP_VERSION=${APP_VERSION}
#Copiando los módulos de node
COPY --from=deps /app/node_modules ./node_modules
#Copiando el resto del código
COPY . .
#Cumplimiento del requisito d
USER node
#Cumplimiento del requisito f
EXPOSE 3000
CMD ["npm","start"]