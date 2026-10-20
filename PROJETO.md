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

## Placar e mão
- **Placar em tempo real:** embaixo do total de cada equipe aparece **"+N na mesa"** — quanto ela já tem baixado nesta rodada (valor das cartas + canastras), atualizando a cada jogada
- O desconto das cartas na mão só entra no fim da rodada (a mão do adversário é escondida)
- **Ordem da mão:** botão **↕** acima da mão troca entre **Por naipe** (junta o mesmo naipe, bom para ver sequências), **Por número** (mistura os naipes) e **Como veio** (sem organizar); a escolha fica salva no aparelho
- O embaralhamento é aleatório a cada rodada (testado em 3.000 partidas: em média 5 a 6 cartas vermelhas em 11)

## Botão Voltar
- **Na sala ou na partida:** o Voltar do celular (ou o botão **← Menu** no placar) leva ao **menu principal**
  - Se a partida estava no meio, o lugar fica guardado e o menu mostra **Voltar para a partida**
- **No menu principal:** pergunta **"Quer sair do Buraco do Zé?"** (Não, continuar / Sim, sair)

## Músicas
- Arquivos em `client/public/musica/` (enviados pelo usuário, comprimidos para 112 kbps):
  - `menu.mp3` — "We Will Empty This Casino" (viktoryuriev): toca na **tela inicial, login, menu e sala de espera**, em loop
  - `jogo-1.mp3` — "Casino Music" (sigmamusicart) e `jogo-2.mp3` — "Casino" (kulakovka): tocam **durante a partida**, uma depois da outra
- Troca de música com fade ao entrar/sair da partida
- No app Android a música começa sozinha; no navegador começa no primeiro toque na tela (regra dos navegadores)
- Botão 🔊/🔇 liga/desliga (escolha salva no aparelho); pausa quando o app vai para segundo plano
- O som de cassino gerado pelo navegador (burburinho/fichas) foi removido

## Robôs
- Dá para jogar contra robôs: no lobby, **Jogar contra robô** (mano a mano: você x 1 robô; duplas: você + robô x 2 robôs)
- Na sala de espera, quem criou a sala pode **Colocar robô** / **Tirar** em qualquer lugar vazio (ex.: 2 amigos + 2 robôs)
- O robô joga sozinho, com um intervalo entre as jogadas para dar para acompanhar
- Estratégia: pega o lixo quando tem o par (vulnerável, junta jogos para os 75 pontos), prefere sequências (viram canastra), guarda o 2 até ter canastra limpa, descarta a carta menos útil e evita dar carta que encaixa no jogo do adversário
- **Partida com robô conta no ranking** para as pessoas da mesa; robô não aparece no ranking

## Cadastro e ranking
- **Cadastro de usuário:** apelido + senha (simples, para jogar entre amigos)
- **Ranking:** por **partidas vencidas**, **individual** (por jogador, não por dupla)
  - Em duplas, a vitória conta para os dois parceiros
  - **Zera todo mês** (ranking mensal); manter histórico dos meses anteriores
- Banco de dados: **MongoDB** em produção (mesmo esquema do Dominó do Meladinha, variável `MONGODB_URI`, banco `buraco`); sem `MONGODB_URI` usa **SQLite** local (`server/dados/buraco.db` ou `DB_PATH`)
- As mesas em andamento também são guardadas: se o servidor dormir/reiniciar, a partida continua de onde parou
- Senhas guardadas com hash (scrypt); login fica salvo no aparelho

## Stack (confirmada)
- **Motor de regras:** TypeScript puro (`engine/`), sem dependências, com testes (Vitest)
- **Frontend:** React + Vite (TypeScript), layout responsivo para celular (`client/`)
- **Servidor:** Node.js 22+ com Express + Socket.IO (tempo real) + MongoDB/SQLite (`server/`); a lógica roda toda no servidor (evita trapaça)
- **Android depois:** mesmo esquema do dominó (app que abre o jogo do servidor, APK gerado pelo GitHub Actions)
- **Hospedagem:** **Render, plano grátis** (`render.yaml`), igual ao Dominó do Meladinha

## App Android
- Pasta `android/`: app simples que abre o jogo do servidor (`https://buraco-do-ze.onrender.com/`) em tela cheia, em pé
- Mudanças no jogo chegam sozinhas pelo servidor — **não precisa de APK novo** a cada mudança
- O APK é gerado pelo GitHub Actions (`.github/workflows/apk.yml`) quando algo em `android/` muda, ou manualmente em Actions → Gerar APK → Run workflow
- **Link fixo para baixar a versão mais nova:** https://github.com/esmeraldorg-alt/buraco-do-Z-/releases/latest/download/BuracoDoZe.apk
- Instalar: abrir o link no celular, baixar e permitir "instalar apps desconhecidos" para o navegador
- No navegador do Android, o menu do jogo mostra o botão **📲 Baixar o app para Android**
- Botão Voltar do celular funciona igual ao do navegador; "Sim, sair" fecha o app
- Assinatura: `android/debug.keystore` (mesma chave sempre, para as atualizações instalarem por cima)

## Publicar no Render (uma vez)
1. No Render: **New → Blueprint** → escolher o repositório `buraco-do-Z-` (ele lê o `render.yaml`)
2. Em **Environment**, preencher `MONGODB_URI` com a **mesma** conexão do MongoDB do dominó (o buraco usa outro banco, `buraco`, então não mistura os dados)
3. Esperar o deploy; o link fica tipo `https://buraco-do-ze.onrender.com`
4. Plano grátis dorme depois de ~15 min sem uso; a primeira abertura demora ~1 minuto para acordar
5. Cada push na `main` publica a versão nova sozinho

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
- **Sequência** do **mesmo naipe**, com no mínimo 3 cartas
  - O Ás pode ficar antes do 2 (A-2-3) ou depois do Rei (Q-K-A)
  - **Canastra:** sequência com 7 cartas ou mais
- **Trinca** = jogo de **3 cartas em sequência** do mesmo naipe (ex.: 7♥ 8♥ 9♥); vale só o valor das cartas
  - O **2 pode entrar** no lugar de uma carta (ex.: 7♥ 8♥ 2♥)
- **Cartas iguais de naipes diferentes NÃO valem** (ex.: 3♠ 3♦ 3♥ não é jogo)

### Variante
- **Buraco aberto:** pode baixar jogos a qualquer momento na sua vez

### Distribuição
- 11 cartas para cada jogador
- O lixo começa vazio

### Lixo
- Só pode pegar o lixo se tiver **duas cartas na mão** que formem **sequência** com a **última carta do lixo**
- Ao pegar, esse jogo (as duas da mão + a última do lixo) **é baixado obrigatoriamente** na mesa e o resto do lixo vai para a mão

### Vulnerável
- Quando a equipe chega a **1500 pontos**, fica **vulnerável**
- Vulnerável, para pegar o lixo, precisa descer na mesa pelo menos **75 pontos em cartas da mão** na mesma jogada (o par conta; a carta do lixo não conta)

### Morto
- **Dois montes de 11 cartas** — um para cada equipe (no mano a mano, cada jogador é uma equipe)
- Em duplas, **qualquer um dos parceiros** pode bater e pegar o morto da dupla
- Quem não pega o morto **não perde pontos** por isso
- Se o monte acabar, um morto que ninguém pegou vira monte; se não houver mais, a rodada termina

### Batidas
1. **Primeira batida** (zerar a mão): **não precisa de canastra** → pega o morto
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
- Não pode ficar com **1 carta só** se ainda não pode bater (descartar a última carta é bater); o jogo avisa para ficar com pelo menos 2

### Fim da partida
- Partida termina quando uma equipe chega a **3000 pontos**
- Se empatar acima de 3000, joga mais uma rodada

## Pendências
- [x] Primeira batida (pegar o morto) não precisa de canastra; a segunda precisa de canastra limpa
- [x] "Trinca" = 3 cartas em sequência (soma só o valor das cartas); cartas iguais de naipes diferentes não valem
- [x] O 2 pode entrar no lugar de uma carta da trinca
- [x] Criar repositório separado no GitHub
- [x] Hospedagem: Render grátis + MongoDB (igual ao dominó)
- [ ] Criar o serviço no Render e colocar `MONGODB_URI`
- [ ] Ícone/nome para o app Android

## Lembretes
- Repositório próprio no Git para este projeto
- **Fazer commit e push** a cada etapa concluída

## Roadmap
1. [x] Motor de regras (baralho, validação de jogos, canastras, lixo, morto, vulnerável, pontuação) + testes
2. [x] Servidor: cadastro/login (apelido + senha), salas (criar/entrar por código, 2 ou 4 jogadores), ranking mensal
3. [x] Telas: abertura, login, lobby, espera, mesa (mão, lixo, morto, jogos baixados)
4. [x] Placar e fim de partida
5. [ ] Deploy web (Render + MongoDB — configuração pronta, falta criar o serviço)
6. [x] Robôs para jogar sozinho ou completar a mesa
7. [x] Músicas de cassino (menu e partida)
8. [x] App Android (mesmo esquema do dominó)
