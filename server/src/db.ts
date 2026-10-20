// Banco de dados (SQLite embutido no Node) — usuários, sessões, partidas e ranking
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { createRequire } from 'node:module';

// Carregado via require para funcionar também nos testes (Vitest não reconhece 'node:sqlite' no import)
const { DatabaseSync } = createRequire(import.meta.url)('node:sqlite') as typeof import('node:sqlite');

export type BancoDeDados = ReturnType<typeof abrirBanco>;

export interface Usuario {
  id: number;
  apelido: string;
}

export interface LinhaRanking {
  apelido: string;
  vitorias: number;
  partidas: number;
}

/** Mês atual (AAAA-MM) no fuso da Bahia */
export function mesAtual(data = new Date()): string {
  const partes = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Bahia', year: 'numeric', month: '2-digit' })
    .formatToParts(data);
  const ano = partes.find((p) => p.type === 'year')!.value;
  const mes = partes.find((p) => p.type === 'month')!.value;
  return `${ano}-${mes}`;
}

export function abrirBanco(caminho: string) {
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
  `);

  return {
    criarUsuario(apelido: string, senhaHash: string): Usuario {
      const r = db.prepare('INSERT INTO usuarios (apelido, senha_hash) VALUES (?, ?)').run(apelido, senhaHash);
      return { id: Number(r.lastInsertRowid), apelido };
    },

    buscarPorApelido(apelido: string): (Usuario & { senhaHash: string }) | null {
      const r = db.prepare('SELECT id, apelido, senha_hash FROM usuarios WHERE apelido = ?').get(apelido) as
        | { id: number; apelido: string; senha_hash: string }
        | undefined;
      return r ? { id: r.id, apelido: r.apelido, senhaHash: r.senha_hash } : null;
    },

    criarSessao(token: string, usuarioId: number): void {
      db.prepare('INSERT INTO sessoes (token, usuario_id) VALUES (?, ?)').run(token, usuarioId);
    },

    usuarioDaSessao(token: string): Usuario | null {
      const r = db
        .prepare('SELECT u.id, u.apelido FROM sessoes s JOIN usuarios u ON u.id = s.usuario_id WHERE s.token = ?')
        .get(token) as Usuario | undefined;
      return r ? { id: r.id, apelido: r.apelido } : null;
    },

    apagarSessao(token: string): void {
      db.prepare('DELETE FROM sessoes WHERE token = ?').run(token);
    },

    registrarPartida(dados: {
      numJogadores: number;
      pontos: [number, number];
      equipeVencedora: number;
      jogadores: { usuarioId: number; equipe: number }[];
    }): number {
      const r = db
        .prepare(
          'INSERT INTO partidas (mes, num_jogadores, pontos_equipe0, pontos_equipe1, equipe_vencedora) VALUES (?, ?, ?, ?, ?)',
        )
        .run(mesAtual(), dados.numJogadores, dados.pontos[0], dados.pontos[1], dados.equipeVencedora);
      const partidaId = Number(r.lastInsertRowid);
      const ins = db.prepare('INSERT INTO partida_jogadores (partida_id, usuario_id, equipe, venceu) VALUES (?, ?, ?, ?)');
      for (const j of dados.jogadores) {
        ins.run(partidaId, j.usuarioId, j.equipe, j.equipe === dados.equipeVencedora ? 1 : 0);
      }
      return partidaId;
    },

    /** Ranking do mês: mais vitórias primeiro; empate → quem jogou menos partidas */
    ranking(mes: string): LinhaRanking[] {
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
        .all(mes) as unknown as LinhaRanking[];
    },

    /** Meses que têm partidas (para escolher o histórico) */
    mesesComPartidas(): string[] {
      return (db.prepare('SELECT DISTINCT mes FROM partidas ORDER BY mes DESC').all() as { mes: string }[]).map((r) => r.mes);
    },
  };
}
