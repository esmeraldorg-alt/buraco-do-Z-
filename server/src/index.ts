// Servidor do Buraco do Zé — API de cadastro/ranking + Socket.IO para as salas e jogadas
import express from 'express';
import { createServer } from 'node:http';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Server, Socket } from 'socket.io';
import { ErroJogada } from '@buraco-do-ze/engine';
import { abrirBanco, mesAtual, type Usuario } from './db';
import { ErroAuth, cadastrar, entrar } from './auth';
import { Acao, ErroSala, GerenciadorSalas, Sala } from './salas';

export function criarServidor(opcoes: { caminhoBanco: string; pastaCliente?: string }) {
  const db = abrirBanco(opcoes.caminhoBanco);
  const salas = new GerenciadorSalas((r) => db.registrarPartida(r));

  const app = express();
  app.use(express.json());

  const responderErro = (res: express.Response, e: unknown) => {
    if (e instanceof ErroAuth) return res.status(400).json({ erro: e.message });
    console.error(e);
    return res.status(500).json({ erro: 'Erro no servidor' });
  };

  app.post('/api/cadastro', (req, res) => {
    try {
      const { usuario, token } = cadastrar(db, req.body?.apelido, req.body?.senha);
      res.json({ usuario, token });
    } catch (e) {
      responderErro(res, e);
    }
  });

  app.post('/api/login', (req, res) => {
    try {
      const { usuario, token } = entrar(db, req.body?.apelido, req.body?.senha);
      res.json({ usuario, token });
    } catch (e) {
      responderErro(res, e);
    }
  });

  const usuarioDoPedido = (req: express.Request): Usuario | null => {
    const token = (req.headers.authorization ?? '').replace(/^Bearer\s+/i, '');
    return token ? db.usuarioDaSessao(token) : null;
  };

  app.get('/api/eu', (req, res) => {
    const u = usuarioDoPedido(req);
    if (!u) return res.status(401).json({ erro: 'Faça login de novo' });
    res.json({ usuario: u });
  });

  app.post('/api/sair', (req, res) => {
    const token = (req.headers.authorization ?? '').replace(/^Bearer\s+/i, '');
    if (token) db.apagarSessao(token);
    res.json({ ok: true });
  });

  app.get('/api/ranking', (req, res) => {
    const mes = typeof req.query.mes === 'string' && /^\d{4}-\d{2}$/.test(req.query.mes) ? req.query.mes : mesAtual();
    const meses = db.mesesComPartidas();
    if (!meses.includes(mesAtual())) meses.unshift(mesAtual());
    res.json({ mes, meses, ranking: db.ranking(mes) });
  });

  // Em produção, o servidor também entrega as telas (client/dist)
  if (opcoes.pastaCliente && existsSync(opcoes.pastaCliente)) {
    app.use(express.static(opcoes.pastaCliente));
    app.get(/^\/(?!api|socket\.io).*/, (_req, res) => res.sendFile(join(opcoes.pastaCliente!, 'index.html')));
  }

  const http = createServer(app);
  const io = new Server(http, { cors: { origin: true } });

  // Autenticação do socket pelo token
  io.use((socket, next) => {
    const token = socket.handshake.auth?.token;
    const u = typeof token === 'string' ? db.usuarioDaSessao(token) : null;
    if (!u) return next(new Error('nao-autenticado'));
    socket.data.usuario = u;
    next();
  });

  const sala$ = (codigo: string) => `sala:${codigo}`;

  async function enviarEstado(sala: Sala) {
    const sockets = await io.in(sala$(sala.codigo)).fetchSockets();
    for (const s of sockets) {
      const u = s.data.usuario as Usuario;
      s.emit('sala:estado', salas.visao(sala, u.id));
    }
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

    // Se estava numa sala (caiu a conexão / recarregou a página), volta para ela
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

  const limpeza = setInterval(() => salas.limpar(), 30 * 60 * 1000);
  limpeza.unref();

  return { app, http, io, db, salas };
}

// Execução direta: `tsx src/index.ts`
const aqui = dirname(fileURLToPath(import.meta.url));
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const porta = Number(process.env.PORT ?? 3001);
  const { http } = criarServidor({
    caminhoBanco: process.env.DB_PATH ?? join(aqui, '..', 'dados', 'buraco.db'),
    pastaCliente: join(aqui, '..', '..', 'client', 'dist'),
  });
  http.listen(porta, () => console.log(`Buraco do Zé rodando em http://localhost:${porta}`));
}
