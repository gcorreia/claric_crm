# Apps (Frontend)

Estrutura por aplicativo (módulo) para facilitar programação:

- `apps/<appId>/manifest.ts`: metadados do app e menu interno
- `apps/<appId>/routes.tsx`: rotas internas do app
- `apps/<appId>/pages/*`: páginas do app
- `apps/<appId>/components/*`: componentes do app (opcional)

`src/apps/registry.ts` agrega todos os apps e expõe para o launcher e roteamento.
