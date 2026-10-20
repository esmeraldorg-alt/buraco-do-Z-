import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { AddressInfo } from 'node:net';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { io as conectar, Socket } from 'socket.io-client';
import { carta } from '@buraco-do-ze/engine';
import { criarServidor } from '../src/index';
import type { VisaoSala } from '../src/salas';

type Opcoes = Parameters<typeof criarServidor>[0];

// Roda tudo com SQLite; e também com MongoDB se MONGODB_URI_TESTE estiver definida
const bancos: [string, () => Opcoes][] = [
  ['SQLite', () => ({ caminhoBanco: join(mkdtempSync(join(tmpdir(), 'buraco-')), 'teste.db') })],
];
if (process.env.MONGODB_URI_TESTE) {
  bancos.push(['MongoDB', () => ({ caminhoBanco: ':memory:', mongoUri: process.env.MONGODB_URI_TESTE, mongoBanco: `buraco_teste_${Date.now()}` })]);
}

describe.each(bancos)('servidor com %s', (_nome, criarOpcoes) => {
let srv: Awaited<ReturnType<typeof criarServidor>>;
let url = '';
let opcoes: Opcoes;

async function subir() {
  srv = await criarServidor(opcoes);
  await new Promise<void>((r) => srv.http.listen(0, r));
  url = `http://localhost:${(srv.http.address() as AddressInfo).port}`;
}

beforeAll(async () => {
  opcoes = criarOpcoes();
  await subir();
});

afterAll(async () => {
  await srv.encerrar();
});

async function post(caminho: string, corpo: unknown) {
  const r = await fetch(url + caminho, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(corpo) });
  return { status: r.status, dados: await r.json() };
}

interface Cliente {
  socket: Socket;
  ultimo: VisaoSala | null;
  id: number;
  emitir: (ev: string, dados?: unknown) => Promise<{ ok: boolean; erro?: string; codigo?: string }>;
  esperar: (cond: (v: VisaoSala | null) => boolean) => Promise<VisaoSala | null>;
}

async function cliente(apelido: string): Promise<Cliente> {
  const { dados } = await post('/api/cadastro', { apelido, senha: 'segredo' });
  const socket = conectar(url, { auth: { token: dados.token }, transports: ['websocket'] });
  const c: Cliente = {
    socket,
    ultimo: null,
    id: dados.usuario.id,
    emitir: (ev, d = {}) => new Promise((r) => socket.emit(ev, d, r)),
    esperar: (cond) =>
      new Promise((resolve, reject) => {
        if (cond(c.ultimo)) return resolve(c.ultimo);
        const t = setTimeout(() => reject(new Error('tempo esgotado')), 3000);
        const h = (v: VisaoSala | null) => {
          if (cond(v)) {
            clearTimeout(t);
            socket.off('sala:estado', h);
            resolve(v);
          }
        };
        socket.on('sala:estado', h);
      }),
  };
  socket.on('sala:estado', (v) => (c.ultimo = v));
  await new Promise<void>((r) => socket.on('connect', () => r()));
  return c;
}

describe('cadastro e login', () => {
  it('cadastra, recusa apelido repetido e faz login', async () => {
    const a = await post('/api/cadastro', { apelido: 'Zé', senha: '1234' });
    expect(a.status).toBe(200);
    expect(a.dados.token).toBeTruthy();

    const rep = await post('/api/cadastro', { apelido: 'zé', senha: '1234' });
    expect(rep.status).toBe(400);
    expect(rep.dados.erro).toContain('já está em uso');

    const errado = await post('/api/login', { apelido: 'Zé', senha: 'xxxx' });
    expect(errado.status).toBe(400);

    const ok = await post('/api/login', { apelido: 'Zé', senha: '1234' });
    expect(ok.status).toBe(200);
    const eu = await fetch(url + '/api/eu', { headers: { Authorization: `Bearer ${ok.dados.token}` } });
    expect((await eu.json()).usuario.apelido).toBe('Zé');
  });

  it('socket sem token é recusado', async () => {
    const s = conectar(url, { auth: {}, transports: ['websocket'] });
    const erro = await new Promise<Error>((r) => s.on('connect_error', r));
    expect(erro.message).toBe('nao-autenticado');
    s.close();
  });
});

describe('sala e partida', () => {
  it('cria sala, entra pelo código, joga e registra no ranking', async () => {
    const dil = await cliente('Dil');
    const anderson = await cliente('Anderson');

    const criada = await dil.emitir('sala:criar', { numJogadores: 2 });
    expect(criada.ok).toBe(true);
    const codigo = criada.codigo!;

    expect((await anderson.emitir('sala:entrar', { codigo: codigo.toLowerCase() })).ok).toBe(true);
    await dil.esperar((v) => !!v && v.lugares.every((l) => l !== null));

    // Só o dono começa
    expect((await anderson.emitir('sala:iniciar')).erro).toContain('Só quem criou');
    expect((await dil.emitir('sala:iniciar')).ok).toBe(true);

    const v = await dil.esperar((v) => !!v?.jogo);
    expect(v!.jogo!.minhaMao).toHaveLength(11);
    expect(v!.jogo!.cartasNaMao).toEqual([11, 11]);

    // Fora da vez
    expect((await anderson.emitir('jogo:acao', { tipo: 'comprar' })).erro).toBe('Não é a sua vez');

    // Dil compra e descarta
    expect((await dil.emitir('jogo:acao', { tipo: 'comprar' })).ok).toBe(true);
    const depois = await dil.esperar((v) => v?.jogo?.minhaMao.length === 12);
    const descarte = depois!.jogo!.minhaMao[0].id;
    expect((await dil.emitir('jogo:acao', { tipo: 'descartar', carta: descarte })).ok).toBe(true);
    const va = await anderson.esperar((v) => v?.jogo?.vez === 1);
    expect(va!.jogo!.lixo.at(-1)!.id).toBe(descarte);
    // Anderson não vê a mão do Dil
    expect(JSON.stringify(va)).not.toContain(depois!.jogo!.minhaMao[1].id);

    // Prepara o fim da partida: Anderson bate com canastra limpa e passa de 3000
    const sala = srv.salas.obter(codigo);
    const e = sala.estado!;
    e.equipes[1].pontos = 2950;
    e.equipes[1].pegouMorto = true;
    e.mortos[1] = null;
    e.equipes[1].jogos = [['3C', '4C', '5C', '6C', '7C', '8C', '9C'].map((t, i) => carta(t, 50 + i))];
    e.maos[1] = [carta('KP', 60)];
    e.fase = 'jogar';
    expect((await anderson.emitir('jogo:acao', { tipo: 'descartar', carta: 'KP-60' })).ok).toBe(true);
    const fim = await dil.esperar((v) => v?.jogo?.fase === 'fimPartida');
    expect(fim!.jogo!.vencedor).toBe(1);

    const ranking = await (await fetch(url + '/api/ranking')).json();
    expect(ranking.ranking[0]).toEqual({ apelido: 'Anderson', vitorias: 1, partidas: 1 });
    expect(ranking.ranking[1]).toEqual({ apelido: 'Dil', vitorias: 0, partidas: 1 });

    // Volta para a sala de espera
    expect((await dil.emitir('sala:reiniciar')).ok).toBe(true);
    await anderson.esperar((v) => !!v && !v.iniciada);

    dil.socket.close();
    anderson.socket.close();
  });

  it('reconecta na mesma partida ao voltar', async () => {
    const a = await cliente('Ana');
    const b = await cliente('Beto');
    const { codigo } = await a.emitir('sala:criar', { numJogadores: 2 });
    await b.emitir('sala:entrar', { codigo });
    await a.emitir('sala:iniciar');
    await b.esperar((v) => !!v?.jogo);

    const token = (b.socket as unknown as { auth: { token: string } }).auth.token;
    b.socket.close();
    await a.esperar((v) => v?.lugares[1]?.conectado === false);

    const volta = conectar(url, { auth: { token }, transports: ['websocket'] });
    const v = await new Promise<VisaoSala>((r) => volta.on('sala:estado', (x) => x && r(x)));
    expect(v.codigo).toBe(codigo);
    expect(v.jogo!.minhaMao).toHaveLength(11);
    await a.esperar((v) => v?.lugares[1]?.conectado === true);
    volta.close();
    a.socket.close();
  });

  it('sala de 4: escolhe lugar para formar a dupla', async () => {
    const cs = await Promise.all(['P1', 'P2', 'P3', 'P4'].map(cliente));
    const { codigo } = await cs[0].emitir('sala:criar', { numJogadores: 4 });
    await cs[1].emitir('sala:entrar', { codigo });
    // P2 está no lugar 1; vai para o lugar 2 (parceiro do P1)
    expect((await cs[1].emitir('sala:lugar', { lugar: 2 })).ok).toBe(true);
    await cs[2].emitir('sala:entrar', { codigo });
    await cs[3].emitir('sala:entrar', { codigo });
    const v = await cs[0].esperar((v) => !!v && v.lugares.every((l) => l));
    expect(v!.lugares.map((l) => l!.apelido)).toEqual(['P1', 'P3', 'P2', 'P4']);
    expect((await cs[0].emitir('sala:iniciar')).ok).toBe(true);
    cs.forEach((c) => c.socket.close());
  });
});

describe('servidor reinicia (Render dormiu ou publicou versão nova)', () => {
  it('a partida continua depois que o servidor volta', async () => {
    const a = await cliente('Rita');
    const b = await cliente('Caio');
    const { codigo } = await a.emitir('sala:criar', { numJogadores: 2 });
    await b.emitir('sala:entrar', { codigo });
    await a.emitir('sala:iniciar');
    const antes = (await a.esperar((v) => !!v?.jogo))!.jogo!.minhaMao.map((c) => c.id);
    const tokenA = (a.socket as unknown as { auth: { token: string } }).auth.token;
    a.socket.close();
    b.socket.close();

    await new Promise((r) => setTimeout(r, 400)); // dá tempo de gravar
    await srv.encerrar();
    await subir();

    const volta = conectar(url, { auth: { token: tokenA }, transports: ['websocket'] });
    const v = await new Promise<VisaoSala>((r) => volta.on('sala:estado', (x) => x && r(x)));
    expect(v.codigo).toBe(codigo);
    expect(v.jogo!.minhaMao.map((c) => c.id)).toEqual(antes);
    expect(v.lugares[1]!.conectado).toBe(false);
    volta.close();

    // O cadastro também continua valendo
    const login = await post('/api/login', { apelido: 'Caio', senha: 'segredo' });
    expect(login.status).toBe(200);
  });
});
});
