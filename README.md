# Buraco do Zé

> Este jogo é para lembrar os velhos tempos em que Dil e Anderson jogavam o buraco aberto.

Jogo de buraco aberto online para jogar com os amigos — 2 jogadores ou 4 em duplas, com cadastro e ranking mensal.

Regras completas e planejamento em [PROJETO.md](PROJETO.md).

## Estrutura
- `engine/` — motor de regras (TypeScript puro)
- `server/` — Express + Socket.IO + SQLite (cadastro, salas, ranking)
- `client/` — telas em React + Vite

## Rodando
Precisa de Node.js 22.13 ou mais novo.
```bash
npm install
npm test
npm run dev:server   # terminal 1
npm run dev:client   # terminal 2 → http://localhost:5173
```

Produção:
```bash
npm install && npm run build
npm start            # usa PORT e DB_PATH, se definidos
```
