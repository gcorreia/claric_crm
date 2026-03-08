FROM node:20-alpine

WORKDIR /web

COPY package*.json ./

# npm ci exige package-lock 100% sincronizado; o seu não está.
# npm install --no-package-lock ignora o lock e usa apenas package.json (build fica previsível via imagem).
RUN npm install --no-audit --no-fund --no-package-lock

COPY . .

EXPOSE 5173
CMD ["sh", "-lc", "npm run typecheck && npm run dev -- --host 0.0.0.0 --port 5173"]