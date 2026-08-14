FROM node:20-alpine
WORKDIR /app
COPY . .
RUN npm install -g serve
EXPOSE 8080
CMD ["sh", "-c", "serve . -l ${PORT:-8080}"]
