// Onde ficam guardados contas, sessões, partidas (ranking) e as mesas em andamento.
// Igual ao Dominó do Meladinha: com MONGODB_URI usa o MongoDB (dura para sempre);
// sem ela usa um arquivo SQLite local (bom para rodar no computador e nos testes).
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { createRequire } from 'node:module';

export interface Usuario {
  id: number;
  apelido: string;
}

export interface LinhaRanking {
  apelido: string;
  vitorias: number;
  partidas: number;
}

export interface PartidaTerminada {
  numJogadores: number;
  pontos: [number, number];
  equipeVencedora: number;
  jogadores: { usuarioId: number; apelido: string; equipe: number }[];
}

export class ApelidoEmUso extends Error {}

export interface Armazenamento {
  tipo: string;
  criarUsuario(apelido: string, senhaHash: string): Promise<Usuario>;
  buscarPorApelido(apelido: string): Promise<(Usuario & { senhaHash: string }) | null>;
  criarSessao(token: string, usuarioId: number): Promise<void>;
  usuarioDaSessao(token: string): Promise<Usuario | null>;
  apagarSessao(token: string): Promise<void>;
  registrarPartida(p: PartidaTerminada): Promise<void>;
  ranking(mes: string): Promise<LinhaRanking[]>;
  mesesComPartidas(): Promise<string[]>;
  /** Mesas em andamento, para sobreviver quando o servidor reinicia ou dorme (plano grátis do Render) */
  salvarSala(codigo: string, doc: unknown): Promise<void>;
  apagarSala(codigo: string): Promise<void>;
  carregarSalas(maxIdadeMs: number): Promise<unknown[]>;
  fechar(): Promise<void>;
}

/** Mês atual (AAAA-MM) no fuso da Bahia */
export function mesAtual(data = new Date()): string {
  const partes = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Bahia', year: 'numeric', month: '2-digit' }).formatToParts(
    data,
  );
  return `${partes.find((p) => p.type === 'year')!.value}-${partes.find((p) => p.type === 'month')!.value}`;
}

export async function abrirArmazenamento(opcoes: { mongoUri?: string; mongoBanco?: string; caminhoSqlite: string }): Promise<Armazenamento> {
  if (opcoes.mongoUri) return abrirMongo(opcoes.mongoUri, opcoes.mongoBanco ?? 'buraco');
  return abrirSqlite(opcoes.caminhoSqlite);
}

// ---------------------------------------------------------------- SQLite

function abrirSqlite(caminho: string): Armazenamento {
  // Carregado via require para funcionar também nos testes (o Vitest não reconhece 'node:sqlite' no import)
  const { DatabaseSync } = createRequire(import.meta.url)('node:sqlite') as typeof import('node:sqlite');
  if (caminho !== ':memory:') mkdirSync(dirname(caminho), { recursive: true });
  const db = new DatabaseSync(caminho);
  db.exec(`
    PRAGMA journal_mode = WAL;
    CREATE TABLE IF NOT EXISTS usuarios (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      apelido TEXT NOT NULL UNIQUE COLLATE NOCASE,
      senha_hash TEXT NOT NULL,
      criado_em TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS sessoes (
      token TEXT PRIMARY KEY,
      usuario_id INTEGER NOT NULL REFERENCES usuarios(id),
      criado_em TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS partidas (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      mes TEXT NOT NULL,
      terminada_em TEXT NOT NULL DEFAULT (datetime('now')),
      num_jogadores INTEGER NOT NULL,
      pontos_equipe0 INTEGER NOT NULL,
      pontos_equipe1 INTEGER NOT NULL,
      equipe_vencedora INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS partida_jogadores (
      partida_id INTEGER NOT NULL REFERENCES partidas(id),
      usuario_id INTEGER NOT NULL REFERENCES usuarios(id),
      equipe INTEGER NOT NULL,
      venceu INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_partidas_mes ON partidas(mes);
    CREATE TABLE IF NOT EXISTS salas (
      codigo TEXT PRIMARY KEY,
      doc TEXT NOT NULL,
      t INTEGER NOT NULL
    );
  `);

  return {
    tipo: caminho === ':memory:' ? 'SQLite em memória' : `SQLite (${caminho})`,

    async criarUsuario(apelido, senhaHash) {
      try {
        const r = db.prepare('INSERT INTO usuarios (apelido, senha_hash) VALUES (?, ?)').run(apelido, senhaHash);
        return { id: Number(r.lastInsertRowid), apelido };
      } catch (e) {
        if (String((e as Error).message).includes('UNIQUE')) throw new ApelidoEmUso();
        throw e;
      }
    },

    async buscarPorApelido(apelido) {
      const r = db.prepare('SELECT id, apelido, senha_hash FROM usuarios WHERE apelido = ?').get(apelido) as
        | { id: number; apelido: string; senha_hash: string }
        | undefined;
      return r ? { id: r.id, apelido: r.apelido, senhaHash: r.senha_hash } : null;
    },

    async criarSessao(token, usuarioId) {
      db.prepare('INSERT INTO sessoes (token, usuario_id) VALUES (?, ?)').run(token, usuarioId);
    },

    async usuarioDaSessao(token) {
      const r = db
        .prepare('SELECT u.id, u.apelido FROM sessoes s JOIN usuarios u ON u.id = s.usuario_id WHERE s.token = ?')
        .get(token) as Usuario | undefined;
      return r ? { id: r.id, apelido: r.apelido } : null;
    },

    async apagarSessao(token) {
      db.prepare('DELETE FROM sessoes WHERE token = ?').run(token);
    },

    async registrarPartida(p) {
      const r = db
        .prepare(
          'INSERT INTO partidas (mes, num_jogadores, pontos_equipe0, pontos_equipe1, equipe_vencedora) VALUES (?, ?, ?, ?, ?)',
        )
        .run(mesAtual(), p.numJogadores, p.pontos[0], p.pontos[1], p.equipeVencedora);
      const partidaId = Number(r.lastInsertRowid);
      const ins = db.prepare('INSERT INTO partida_jogadores (partida_id, usuario_id, equipe, venceu) VALUES (?, ?, ?, ?)');
      for (const j of p.jogadores) ins.run(partidaId, j.usuarioId, j.equipe, j.equipe === p.equipeVencedora ? 1 : 0);
    },

    async ranking(mes) {
      return db
        .prepare(
          `SELECT u.apelido AS apelido, SUM(pj.venceu) AS vitorias, COUNT(*) AS partidas
           FROM partida_jogadores pj
           JOIN partidas p ON p.id = pj.partida_id
           JOIN usuarios u ON u.id = pj.usuario_id
           WHERE p.mes = ?
           GROUP BY u.id
           ORDER BY vitorias DESC, partidas ASC, u.apelido ASC`,
        )
        .all(mes)
        .map((r) => ({ apelido: String(r.apelido), vitorias: Number(r.vitorias), partidas: Number(r.partidas) }));
    },

    async mesesComPartidas() {
      return (db.prepare('SELECT DISTINCT mes FROM partidas ORDER BY mes DESC').all() as { mes: string }[]).map((r) => r.mes);
    },

    async salvarSala(codigo, doc) {
      db.prepare('INSERT OR REPLACE INTO salas (codigo, doc, t) VALUES (?, ?, ?)').run(codigo, JSON.stringify(doc), Date.now());
    },

    async apagarSala(codigo) {
      db.prepare('DELETE FROM salas WHERE codigo = ?').run(codigo);
    },

    async carregarSalas(maxIdadeMs) {
      db.prepare('DELETE FROM salas WHERE t < ?').run(Date.now() - maxIdadeMs);
      return (db.prepare('SELECT doc FROM salas').all() as { doc: string }[]).map((r) => JSON.parse(r.doc));
    },

    async fechar() {
      db.close();
    },
  };
}

// ---------------------------------------------------------------- MongoDB

async function abrirMongo(uri: string, nomeBanco: string): Promise<Armazenamento> {
  const { MongoClient } = await import('mongodb');
  const cliente = new MongoClient(uri);
  await cliente.connect();
  const db = cliente.db(nomeBanco);

  interface DocUsuario {
    _id: number;
    apelido: string;
    apelidoMin: string;
    senhaHash: string;
    criadoEm: Date;
  }
  interface DocPartida {
    mes: string;
    terminadaEm: Date;
    numJogadores: number;
    pontos: [number, number];
    equipeVencedora: number;
    jogadores: { usuarioId: number; apelido: string; equipe: number; venceu: number }[];
  }

  const usuarios = db.collection<DocUsuario>('usuarios');
  const sessoes = db.collection<{ _id: string; usuarioId: number; criadoEm: Date }>('sessoes');
  const partidas = db.collection<DocPartida>('partidas');
  const salas = db.collection<{ _id: string; doc: string; t: number }>('salas');

  await usuarios.createIndex({ apelidoMin: 1 }, { unique: true });
  await partidas.createIndex({ mes: 1 });

  const minusculo = (a: string) => a.trim().toLocaleLowerCase('pt-BR');

  return {
    tipo: `MongoDB (${nomeBanco})`,

    async criarUsuario(apelido, senhaHash) {
      if (await usuarios.findOne({ apelidoMin: minusculo(apelido) })) throw new ApelidoEmUso();
      // Id numérico aleatório (sem contador central, então não há corrida entre cadastros simultâneos)
      for (let tentativa = 0; tentativa < 5; tentativa++) {
        const id = Math.floor(Math.random() * 2 ** 48) + 1;
        try {
          await usuarios.insertOne({ _id: id, apelido, apelidoMin: minusculo(apelido), senhaHash, criadoEm: new Date() });
          return { id, apelido };
        } catch (e) {
          if ((e as { code?: number }).code !== 11000) throw e;
          if (await usuarios.findOne({ apelidoMin: minusculo(apelido) })) throw new ApelidoEmUso();
          // senão foi o id repetido (raríssimo): tenta outro
        }
      }
      throw new Error('Não consegui criar o usuário');
    },

    async buscarPorApelido(apelido) {
      const u = await usuarios.findOne({ apelidoMin: minusculo(apelido) });
      return u ? { id: u._id, apelido: u.apelido, senhaHash: u.senhaHash } : null;
    },

    async criarSessao(token, usuarioId) {
      await sessoes.insertOne({ _id: token, usuarioId, criadoEm: new Date() });
    },

    async usuarioDaSessao(token) {
      const s = await sessoes.findOne({ _id: token });
      if (!s) return null;
      const u = await usuarios.findOne({ _id: s.usuarioId });
      return u ? { id: u._id, apelido: u.apelido } : null;
    },

    async apagarSessao(token) {
      await sessoes.deleteOne({ _id: token });
    },

    async registrarPartida(p) {
      await partidas.insertOne({
        mes: mesAtual(),
        terminadaEm: new Date(),
        numJogadores: p.numJogadores,
        pontos: p.pontos,
        equipeVencedora: p.equipeVencedora,
        jogadores: p.jogadores.map((j) => ({ ...j, venceu: j.equipe === p.equipeVencedora ? 1 : 0 })),
      });
    },

    async ranking(mes) {
      // Conta por jogador; o apelido vem do cadastro
      const contagem = new Map<number, { vitorias: number; partidas: number }>();
      for await (const p of partidas.find({ mes })) {
        for (const j of p.jogadores) {
          const c = contagem.get(j.usuarioId) ?? { vitorias: 0, partidas: 0 };
          c.vitorias += j.venceu;
          c.partidas += 1;
          contagem.set(j.usuarioId, c);
        }
      }
      const ids = [...contagem.keys()];
      const nomes = new Map((await usuarios.find({ _id: { $in: ids } }).toArray()).map((u) => [u._id, u.apelido]));
      return ids
        .map((id) => ({ apelido: nomes.get(id) ?? '?', ...contagem.get(id)! }))
        .sort((a, b) => b.vitorias - a.vitorias || a.partidas - b.partidas || a.apelido.localeCompare(b.apelido, 'pt-BR'));
    },

    async mesesComPartidas() {
      return ((await partidas.distinct('mes')) as string[]).sort().reverse();
    },

    async salvarSala(codigo, doc) {
      // Guardado como texto JSON (a mesa tem listas dentro de listas)
      await salas.replaceOne({ _id: codigo }, { doc: JSON.stringify(doc), t: Date.now() }, { upsert: true });
    },

    async apagarSala(codigo) {
      await salas.deleteOne({ _id: codigo });
    },

    async carregarSalas(maxIdadeMs) {
      await salas.deleteMany({ t: { $lt: Date.now() - maxIdadeMs } });
      return (await salas.find({}).toArray()).map((s) => JSON.parse(s.doc));
    },

    async fechar() {
      await cliente.close();
    },
  };
}
