# Linea Project Planner

Planejador de cronogramas local-first inspirado no MS Project, com interface moderna, grade editavel de tarefas e grafico de Gantt pronto para deploy na Vercel.

## O que ja existe

- projetos locais salvos em `IndexedDB`
- grade com nome, tipo, inicio, fim, duracao, predecessoras, sucessoras e progresso
- hierarquia com `indent/outdent`, linhas-resumo e marcos
- sincronizacao entre grade e Gantt
- recalculo basico com dependencias `FS`
- exportacao em `JSON`, `CSV`, `XLSX`, `PNG` e `PDF`
- snapshots locais
- validacao inicial de ciclos e importacao JSON com `zod`

## Rodando localmente

```bash
npm install
npm run dev
```

Abra `http://localhost:3000`.

## Validacao

```bash
npm run lint
npm test
npm run build
```

## Deploy na Vercel

Como o app e local-first, ele nao depende de backend para funcionar.

```bash
vercel
```

Sugestao para uso privado inicial:
- habilitar protecao do projeto na Vercel
- usar a mesma URL/dominio para nao criar bancos locais diferentes no navegador
- exportar JSON periodicamente como backup

## Estrutura principal

- `src/components/planner/planner-workspace.tsx`: shell principal e fluxo do produto
- `src/components/planner/task-grid.tsx`: grade editavel
- `src/components/planner/gantt-panel.tsx`: integracao do Gantt
- `src/lib/planner-db.ts`: persistencia local com Dexie
- `src/lib/planner-engine.ts`: regras de cronograma e hierarquia
- `src/lib/planner-export.ts`: exportacoes
