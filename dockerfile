FROM node:18

WORKDIR /ttc-backend
COPY *.json ./
RUN npm ci --omit=dev
COPY src src
COPY app.ts app.ts
RUN npm install typescript
RUN npm run build
COPY prod.env .env
COPY *.pem ./

EXPOSE 8080
EXPOSE 8081
CMD [ "node", "build/app.js"]