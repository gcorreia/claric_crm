#!/usr/bin/env bash
set -euo pipefail

echo "== PATH =="
pwd
ls -la | head -n 30

echo
echo "== TOOLING =="
echo "node: $(node -v 2>/dev/null || echo 'N/A')"
echo "npm : $(npm -v 2>/dev/null || echo 'N/A')"
echo "python: $(python3 --version 2>/dev/null || echo 'N/A')"
echo "docker: $(docker --version 2>/dev/null || echo 'N/A')"
echo "compose: $(docker compose version 2>/dev/null || echo 'N/A')"

echo
echo "== DOCKER COMPOSE (parse/validate) =="
if [ -f docker-compose.yml ]; then
  docker compose config >/dev/null && echo "OK: docker-compose.yml válido" || echo "ERRO: docker-compose.yml inválido"
else
  echo "WARN: docker-compose.yml não encontrado"
fi

echo
echo "== WEB package.json (vite/node engines check) =="
if [ -f web/package.json ]; then
  node -e "const p=require('./web/package.json'); console.log('web deps ok'); console.log('vite:', p.devDependencies?.vite); console.log('plugin-react:', p.devDependencies?.['@vitejs/plugin-react']);"
else
  echo "WARN: web/package.json não encontrado"
fi

echo
echo "== WEB install/build sanity =="
if [ -f web/package.json ]; then
  (cd web && npm ci >/dev/null 2>&1 && echo "OK: npm ci" || echo "ERRO: npm ci falhou")
  (cd web && npm run build >/dev/null 2>&1 && echo "OK: npm run build" || echo "ERRO: npm run build falhou")
else
  echo "SKIP: web"
fi

echo
echo "== API python deps sanity =="
if [ -f api/requirements.txt ]; then
  echo "requirements.txt encontrado: $(wc -l < api/requirements.txt) linhas"
  python3 -c "import sys; print('python ok')"
else
  echo "WARN: api/requirements.txt não encontrado"
fi

echo
echo "== DONE =="
