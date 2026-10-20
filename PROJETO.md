# Buraco do Zé — Projeto

Jogo de buraco próprio para jogar online com amigos (inspirado no BuracoON).

- **Nome:** Buraco do Zé
- **Repositório:** https://github.com/esmeraldorg-alt/buraco-do-Z- (privado)

## Visão geral
- **Plataforma:** Web primeiro (celular e PC pelo navegador), depois app Android
- **Modo:** Online em salas — cria a sala, compartilha o código, cada um joga do seu aparelho
- **Mesa:** 2 jogadores (mano a mano) ou 4 jogadores (2 duplas)

## Tela de abertura
Antes de abrir o jogo, aparece a mensagem:

> Este jogo é para lembrar os velhos tempos em que Dil e Anderson jogavam o buraco aberto.

## Cadastro e ranking
- **Cadastro de usuário:** apelido + senha (simples, para jogar entre amigos)
- **Ranking:** por **partidas vencidas**, **individual** (por jogador, não por dupla)
  - Em duplas, a vitória conta para os dois parceiros
  - **Zera todo mês** (ranking mensal); manter histórico dos meses anteriores
- Banco de dados: **SQLite** embutido no Node (arquivo `server/dados/buraco.db`, ou `DB_PATH`)
- Senhas guardadas com hash (scrypt); login fica salvo no aparelho

## Stack (confirmada)
- **Motor de regras:** TypeScript puro (`engine/`), sem dependências, com testes (Vitest)
- **Frontend:** React + Vite (TypeScript), layout responsivo para celular (`client/`)
- **Servidor:** Node.js 22+ com Express + Socket.IO (tempo real) + SQLite (`server/`); a lógica roda toda no servidor (evita trapaça)
- **Android depois:** Capacitor empacotando o mesmo frontend web
- **Hospedagem:** a definir (Render, Railway ou VPS)

## Estrutura do código
```
engine/   motor de regras (cartas, jogos, partida, pontuação) + testes
server/   API (cadastro, login, ranking) + Socket.IO (salas e jogadas) + testes
client/   telas: abertura, entrar/criar conta, lobby, sala de espera, mesa
```

## Como rodar no computador
```bash
npm install          # na raiz, instala tudo
npm test             # testes do motor e do servidor
npm run dev:server   # servidor em http://localhost:3001
npm run dev:client   # telas em http://localhost:5173 (outro terminal)
```
Produção: `npm run build` e depois `npm start` (o servidor entrega as telas na porta `PORT`).

## Como jogar (telas)
- Abertura com a homenagem → entrar ou criar conta → lobby
- Lobby: criar sala (mano a mano ou duplas), entrar com código, salas abertas, ranking do mês
- Sala de espera: código + botão "Chamar os amigos" (link `?sala=CÓDIGO`); em duplas, cada um escolhe o lugar (1 e 3 x 2 e 4)
- Mesa: toque nas cartas para selecionar
  - **Comprar** (ou tocar no monte) / **Pegar lixo** (selecione o par; vulnerável: selecione também o jogo extra para somar 75)
  - **Baixar jogo** (3+ cartas) / tocar num jogo seu para **encaixar** / **Descartar** (1 carta)
- Fim de rodada mostra os pontos; fim de partida registra a vitória no ranking
- Se a internet cair ou fechar a página, ao voltar a pessoa cai de novo na mesma partida

## Regras do jogo

### Baralho
- Dois baralhos (104 cartas), **sem coringa**
- **Carta 2 (curinga):** substitui qualquer carta **do seu próprio naipe**
- No máximo **um 2 como curinga** por jogo; um 2 na posição natural (Ás-2-3) não conta como curinga

### Jogos
- Sequências do **mesmo naipe**, com no mínimo 3 cartas
- O Ás pode ficar antes do 2 (A-2-3) ou depois do Rei (Q-K-A)
- **Canastra:** jogo com 7 cartas ou mais

### Variante
- **Buraco aberto:** pode baixar jogos a qualquer momento na sua vez

### Distribuição
- 11 cartas para cada jogador
- O lixo começa vazio

### Lixo
- Só pode pegar o lixo se tiver **duas cartas na mão** que formem jogo com a **última carta do lixo**
- Ao pegar, esse jogo vai direto para a mesa e o resto do lixo vai para a mão

### Vulnerável
- Quando a equipe chega a **1500 pontos**, fica **vulnerável**
- Vulnerável, para pegar o lixo, precisa descer na mesa pelo menos **75 pontos em cartas da mão** na mesma jogada (o par conta; a carta do lixo não conta)

### Morto
- **Dois montes de 11 cartas** — um para cada equipe (no mano a mano, cada jogador é uma equipe)
- Em duplas, **qualquer um dos parceiros** pode bater e pegar o morto da dupla
- Quem não pega o morto **não perde pontos** por isso
- Se o monte acabar, um morto que ninguém pegou vira monte; se não houver mais, a rodada termina

### Batidas
1. **Primeira batida** (zerar a mão): pode ser com **canastra suja** → pega o morto
   - Bateu descartando: pega o morto e espera a próxima vez
   - Bateu baixando tudo: pega o morto e continua jogando
2. **Segunda batida** (encerra a rodada): só se tiver **canastra limpa na mesa** → **+100 pontos**

### Pontuação das canastras
| Canastra | Pontos |
|---|---|
| Limpa (sem 2 substituindo) | 200 |
| Suja (com 2 no lugar de alguma carta) | 150 |
| De Ás a Ás (**precisa ser limpa**, 14 cartas) | 1000 |

### Valor das cartas
| Carta | Pontos |
|---|---|
| 2 | 10 |
| 3 a 7 | 5 |
| 8 a Rei | 10 |
| Ás | 15 |

- Cartas baixadas na mesa **somam**
- Cartas que sobram na mão de quem não bateu **descontam**

### Fim da partida
- Partida termina quando uma equipe chega a **3000 pontos**
- Se empatar acima de 3000, joga mais uma rodada

## Pendências
- [ ] Confirmar: para a primeira batida (pegar o morto) é **obrigatório** ter ao menos uma canastra (suja serve)? Hoje está **sim** (configurável)
- [ ] Confirmar: pode formar trinca (três cartas iguais de naipes diferentes)? Hoje está **não**, só sequência
- [x] Criar repositório separado no GitHub
- [ ] Escolher hospedagem com **disco permanente** (o SQLite precisa guardar contas e ranking): Railway com volume, Fly.io com volume ou Render com disco pago
- [ ] Ícone/nome para o app Android

## Lembretes
- Repositório próprio no Git para este projeto
- **Fazer commit e push** a cada etapa concluída

## Roadmap
1. [x] Motor de regras (baralho, validação de jogos, canastras, lixo, morto, vulnerável, pontuação) + testes
2. [x] Servidor: cadastro/login (apelido + senha), salas (criar/entrar por código, 2 ou 4 jogadores), ranking mensal
3. [x] Telas: abertura, login, lobby, espera, mesa (mão, lixo, morto, jogos baixados)
4. [x] Placar e fim de partida
5. [ ] Deploy web
6. [ ] App Android (Capacitor)
