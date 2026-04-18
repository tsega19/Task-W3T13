FROM node:20-alpine AS build
WORKDIR /app
COPY package.json ./
RUN npm install --no-audit --no-fund --loglevel=error
COPY tsconfig.json tsconfig.app.json tsconfig.spec.json angular.json ngsw-config.json ./
COPY src ./src
RUN npx ng build --configuration=production

FROM nginx:1.27-alpine AS runtime
COPY --from=build /app/dist/flowcanvas/browser /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY docker-entrypoint.sh /docker-entrypoint-fc.sh
RUN chmod +x /docker-entrypoint-fc.sh
EXPOSE 80
ENTRYPOINT ["/docker-entrypoint-fc.sh"]
CMD ["nginx", "-g", "daemon off;"]
