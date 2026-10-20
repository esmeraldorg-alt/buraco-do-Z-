// Servidor do Buraco do Zé — API de cadastro/ranking + Socket.IO para as salas e jogadas
import express from 'express';
import { createServer } from 'node:http';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Server, Socket } from 'socket.io';
import { ErroJogada } from '@buraco-do-ze/engine';
import { abrirArmazenamento, mesAtual, type Usuario } from './armazenamento';
import { ErroAuth, cadastrar, entrar } from './auth';
import { Acao, ErroSala, GerenciadorSalas, Sala } from './salas';

const SEIS_HORAS = 6 * 60 * 60 * 1000;

export async function criarServidor(opcoes: {
  caminhoBanco: string;
  mongoUri?: string;
  mongoBanco?: string;
  pastaCliente?: string;
  /** Tempo entre as jogadas do robô (para dar tempo de ver) */
  atrasoRoboMs?: number;
}) {
  const atrasoRobo = opcoes.atrasoRoboMs ?? 900;
  const db = await abrirArmazenamento({ mongoUri: opcoes.mongoUri, mongoBanco: opcoes.mongoBanco, caminhoSqlite: opcoes.caminhoBanco });

  // Guarda as salas com um pequeno atraso, juntando várias jogadas seguidas numa gravação só
  const pendentes = new Map<string, ReturnType<typeof setTimeout>>();
  const gravar = (sala: Sala) => {
    clearTimeout(pendentes.get(sala.codigo));
    pendentes.set(
      sala.codigo,
      setTimeout(() => {
        pendentes.delete(sala.codigo);
        db.salvarSala(sala.codigo, sala).catch((e) => console.error('Não consegui guardar a sala:', e.message));
      }, 300),
    );
  };

  const salas = new GerenciadorSalas({
    aoTerminarPartida: (r) => db.registrarPartida(r).catch((e) => console.error('Não consegui registrar a partida:', e)),
    aoMudar: gravar,
    aoApagar: (codigo) => {
      clearTimeout(pendentes.get(codigo));
      pendentes.delete(codigo);
      db.apagarSala(codigo).catch(() => {});
    },
  });
  salas.restaurar((await db.carregarSalas(SEIS_HORAS)) as Sala[]);

  const app = express();
  app.use(express.json());

  const responderErro = (res: express.Response, e: unknown) => {
    if (e instanceof ErroAuth) return res.status(400).json({ erro: e.message });
    console.error(e);
    return res.status(500).json({ erro: 'Erro no servidor' });
  };

  const tokenDoPedido = (req: express.Request) => (req.headers.authorization ?? '').replace(/^Bearer\s+/i, '');

  app.get('/healthz', (_req, res) => res.send('ok'));

  app.post('/api/cadastro', async (req, res) => {
    try {
      res.json(await cadastrar(db, req.body?.apelido, req.body?.senha));
    } catch (e) {
      responderErro(res, e);
    }
  });

  app.post('/api/login', async (req, res) => {
    try {
      res.json(await entrar(db, req.body?.apelido, req.body?.senha));
    } catch (e) {
      responderErro(res, e);
    }
  });

  app.get('/api/eu', async (req, res) => {
    try {
      const token = tokenDoPedido(req);
      const u = token ? await db.usuarioDaSessao(token) : null;
      if (!u) return res.status(401).json({ erro: 'Faça login de novo' });
      res.json({ usuario: u });
    } catch (e) {
      responderErro(res, e);
    }
  });

  app.post('/api/sair', async (req, res) => {
    const token = tokenDoPedido(req);
    if (token) await db.apagarSessao(token).catch(() => {});
    res.json({ ok: true });
  });

  app.get('/api/ranking', async (req, res) => {
    try {
      const mes = typeof req.query.mes === 'string' && /^\d{4}-\d{2}$/.test(req.query.mes) ? req.query.mes : mesAtual();
      const meses = await db.mesesComPartidas();
      if (!meses.includes(mesAtual())) meses.unshift(mesAtual());
      res.json({ mes, meses, ranking: await db.ranking(mes) });
    } catch (e) {
      responderErro(res, e);
    }
  });

  // Em produção, o servidor também entrega as telas (client/dist)
  if (opcoes.pastaCliente && existsSync(opcoes.pastaCliente)) {
    app.use(express.static(opcoes.pastaCliente));
    app.get(/^\/(?!api|socket\.io|healthz).*/, (_req, res) => res.sendFile(join(opcoes.pastaCliente!, 'index.html')));
  }

  const http = createServer(app);
  const io = new Server(http, { cors: { origin: true } });

  // Autenticação do socket pelo token
  io.use(async (socket, next) => {
    try {
      const token = socket.handshake.auth?.token;
      const u = typeof token === 'string' ? await db.usuarioDaSessao(token) : null;
      if (!u) return next(new Error('nao-autenticado'));
      socket.data.usuario = u;
      next();
    } catch {
      next(new Error('erro-servidor'));
    }
  });

  const sala$ = (codigo: string) => `sala:${codigo}`;

  async function enviarEstado(sala: Sala) {
    const sockets = await io.in(sala$(sala.codigo)).fetchSockets();
    for (const s of sockets) {
      const u = s.data.usuario as Usuario;
      s.emit('sala:estado', salas.visao(sala, u.id));
    }
  }

  // Robôs: quando é a vez de um, ele joga sozinho depois de um intervalo
  const timersRobo = new Map<string, ReturnType<typeof setTimeout>>();
  function agendarRobo(sala: Sala) {
    if (timersRobo.has(sala.codigo) || !salas.vezDeRobo(sala)) return;
    const espera = sala.estado!.fase === 'comprar' ? atrasoRobo : Math.round(atrasoRobo * 0.8);
    timersRobo.set(
      sala.codigo,
      setTimeout(() => {
        timersRobo.delete(sala.codigo);
        try {
          const s = salas.jogarRobo(sala.codigo);
          if (s) {
            void enviarEstado(s);
            agendarRobo(s);
          }
        } catch (e) {
          console.error('Erro na vez do robô:', e);
        }
      }, espera),
    );
  }

  function enviarSalasAbertas() {
    io.emit('salas:abertas', salas.abertas());
  }

  type Resposta = (r: { ok: boolean; erro?: string; codigo?: string }) => void;

  function tratar(socket: Socket, fn: () => Sala | null | void, responder?: Resposta) {
    try {
      const sala = fn();
      if (sala) {
        socket.join(sala$(sala.codigo));
        void enviarEstado(sala);
        agendarRobo(sala);
      }
      enviarSalasAbertas();
      responder?.({ ok: true, codigo: sala ? sala.codigo : undefined });
    } catch (e) {
      if (e instanceof ErroSala || e instanceof ErroJogada) responder?.({ ok: false, erro: e.message });
      else {
        console.error(e);
        responder?.({ ok: false, erro: 'Erro no servidor' });
      }
    }
  }

  io.on('connection', (socket) => {
    const usuario = socket.data.usuario as Usuario;

    // Se estava numa sala (caiu a conexão / recarregou a página / o servidor reiniciou), volta para ela
    const anterior = salas.salaDe(usuario.id);
    if (anterior) {
      tratar(socket, () => salas.entrar(usuario, anterior.codigo));
    } else {
      socket.emit('sala:estado', null);
    }
    socket.emit('salas:abertas', salas.abertas());

    socket.on('sala:criar', (dados: { numJogadores: number }, responder: Resposta) =>
      tratar(socket, () => salas.criar(usuario, Number(dados?.numJogadores)), responder),
    );

    socket.on('sala:entrar', (dados: { codigo: string }, responder: Resposta) =>
      tratar(socket, () => salas.entrar(usuario, String(dados?.codigo ?? '')), responder),
    );

    socket.on('sala:lugar', (dados: { lugar: number }, responder: Resposta) =>
      tratar(socket, () => salas.escolherLugar(usuario.id, Number(dados?.lugar)), responder),
    );

    socket.on('sala:robo', (dados: { lugar: number; colocar: boolean }, responder: Resposta) =>
      tratar(
        socket,
        () => (dados?.colocar ? salas.colocarRobo(usuario.id, Number(dados.lugar)) : salas.tirarRobo(usuario.id, Number(dados?.lugar))),
        responder,
      ),
    );

    socket.on('sala:iniciar', (_d: unknown, responder: Resposta) => tratar(socket, () => salas.iniciar(usuario.id), responder));

    socket.on('sala:reiniciar', (_d: unknown, responder: Resposta) =>
      tratar(socket, () => salas.reiniciar(usuario.id), responder),
    );

    socket.on('sala:sair', (_d: unknown, responder: Resposta) => {
      const sala = salas.sair(usuario.id);
      if (sala) {
        socket.leave(sala$(sala.codigo));
        if (salas.salas.has(sala.codigo)) void enviarEstado(sala);
      }
      socket.emit('sala:estado', null);
      enviarSalasAbertas();
      responder?.({ ok: true });
    });

    socket.on('jogo:acao', (acao: Acao, responder: Resposta) => tratar(socket, () => salas.jogar(usuario.id, acao), responder));

    socket.on('disconnect', async () => {
      // Só marca desconectado se não houver outra aba aberta do mesmo usuário
      const sala = salas.salaDe(usuario.id);
      if (!sala) return;
      const sockets = await io.in(sala$(sala.codigo)).fetchSockets();
      if (sockets.some((s) => (s.data.usuario as Usuario).id === usuario.id)) return;
      salas.desconectar(usuario.id);
      void enviarEstado(sala);
    });
  });

  const limpeza = setInterval(() => salas.limpar(SEIS_HORAS), 30 * 60 * 1000);
  limpeza.unref();

  // Mesas que voltaram depois de reiniciar: se era a vez de um robô, ele continua
  for (const s of salas.salas.values()) agendarRobo(s);

  /** Grava o que estiver pendente e fecha tudo */
  async function encerrar() {
    for (const t of timersRobo.values()) clearTimeout(t);
    timersRobo.clear();
    for (const [codigo, t] of pendentes) {
      clearTimeout(t);
      const s = salas.salas.get(codigo);
      if (s) await db.salvarSala(codigo, s).catch(() => {});
    }
    pendentes.clear();
    io.close();
    await new Promise((r) => http.close(r));
    await db.fechar();
  }

  return { app, http, io, db, salas, encerrar };
}

// Execução direta: `tsx src/index.ts`
const aqui = dirname(fileURLToPath(import.meta.url));
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const porta = Number(process.env.PORT ?? 3001);
  const srv = await criarServidor({
    caminhoBanco: process.env.DB_PATH ?? join(aqui, '..', 'dados', 'buraco.db'),
    mongoUri: process.env.MONGODB_URI,
    mongoBanco: process.env.MONGODB_DB ?? 'buraco',
    pastaCliente: join(aqui, '..', '..', 'client', 'dist'),
  });
  srv.http.listen(porta, () => console.log(`Buraco do Zé rodando na porta ${porta} — dados em ${srv.db.tipo}`));
  for (const sinal of ['SIGTERM', 'SIGINT'] as const) {
    process.on(sinal, () => void srv.encerrar().finally(() => process.exit(0)));
  }
}
