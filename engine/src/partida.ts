// Estado da partida e jogadas — Buraco do Zé
import { Carta, criarAleatorio, criarBaralho, embaralhar, somaPontos } from './cartas';
import { analisarJogo, pontosBonusJogo, temCanastra, temCanastraLimpa } from './jogos';

export interface Config {
  meta: number;
  pontosVulneravel: number;
  minimoVulneravel: number;
  bonusBatida: number;
  cartasPorJogador: number;
  cartasPorMorto: number;
  /** Para a primeira batida (pegar o morto) é preciso ter ao menos uma canastra — regra combinada: NÃO precisa */
  exigeCanastraParaMorto: boolean;
}

export const CONFIG_PADRAO: Config = {
  meta: 3000,
  pontosVulneravel: 1500,
  minimoVulneravel: 75,
  bonusBatida: 100,
  cartasPorJogador: 11,
  cartasPorMorto: 11,
  exigeCanastraParaMorto: false,
};

export type Fase = 'comprar' | 'jogar' | 'fimRodada' | 'fimPartida';

export interface Equipe {
  pontos: number;
  jogos: Carta[][];
  pegouMorto: boolean;
}

export interface ResultadoEquipe {
  pontosMesa: number;
  bonusCanastras: number;
  bonusBatida: number;
  descontoMao: number;
  total: number;
}

export interface ResultadoRodada {
  rodada: number;
  equipeQueBateu: number | null;
  equipes: ResultadoEquipe[];
}

export interface Estado {
  config: Config;
  numJogadores: 2 | 4;
  semente: number;
  rodada: number;
  iniciante: number;
  vez: number;
  fase: Fase;
  maos: Carta[][];
  monte: Carta[];
  lixo: Carta[];
  /** Um morto por equipe; null = já foi pego ou virou monte */
  mortos: (Carta[] | null)[];
  equipes: Equipe[];
  historico: ResultadoRodada[];
  vencedor: number | null;
}

export class ErroJogada extends Error {
  constructor(mensagem: string) {
    super(mensagem);
    this.name = 'ErroJogada';
  }
}

/** Em duplas: jogadores 0 e 2 são a equipe 0; 1 e 3 a equipe 1. No mano a mano, cada um é sua equipe. */
export function equipeDe(jogador: number): number {
  return jogador % 2;
}

export function jogadoresDaEquipe(estado: Estado, equipe: number): number[] {
  return Array.from({ length: estado.numJogadores }, (_, i) => i).filter((j) => equipeDe(j) === equipe);
}

export function estaVulneravel(estado: Estado, equipe: number): boolean {
  return estado.equipes[equipe].pontos >= estado.config.pontosVulneravel;
}

// ---------- criação ----------

export function criarPartida(opcoes: { numJogadores: 2 | 4; semente?: number; config?: Partial<Config> }): Estado {
  const estado: Estado = {
    config: { ...CONFIG_PADRAO, ...opcoes.config },
    numJogadores: opcoes.numJogadores,
    semente: opcoes.semente ?? Math.floor(Math.random() * 2 ** 31),
    rodada: 0,
    iniciante: 0,
    vez: 0,
    fase: 'fimRodada',
    maos: [],
    monte: [],
    lixo: [],
    mortos: [],
    equipes: [0, 1].map(() => ({ pontos: 0, jogos: [], pegouMorto: false })),
    historico: [],
    vencedor: null,
  };
  distribuir(estado);
  return estado;
}

function distribuir(estado: Estado): void {
  const { cartasPorJogador, cartasPorMorto } = estado.config;
  const aleatorio = criarAleatorio(estado.semente + estado.rodada * 7919);
  const baralho = embaralhar(criarBaralho(), aleatorio);

  estado.maos = [];
  for (let j = 0; j < estado.numJogadores; j++) estado.maos.push(baralho.splice(0, cartasPorJogador));
  estado.mortos = [baralho.splice(0, cartasPorMorto), baralho.splice(0, cartasPorMorto)];
  estado.lixo = [];
  estado.monte = baralho;
  estado.equipes.forEach((e) => {
    e.jogos = [];
    e.pegouMorto = false;
  });
  estado.vez = estado.iniciante;
  estado.fase = 'comprar';
}

/** Começa a próxima rodada (quem começa gira a cada rodada) */
export function novaRodada(estadoAtual: Estado): Estado {
  if (estadoAtual.fase !== 'fimRodada') throw new ErroJogada('A rodada atual ainda não terminou');
  const estado = clonar(estadoAtual);
  estado.rodada += 1;
  estado.iniciante = (estado.iniciante + 1) % estado.numJogadores;
  distribuir(estado);
  return estado;
}

// ---------- utilitários internos ----------

function clonar(estado: Estado): Estado {
  return structuredClone(estado);
}

function conferirVez(estado: Estado, jogador: number, fase: Fase): void {
  if (estado.fase === 'fimRodada' || estado.fase === 'fimPartida') throw new ErroJogada('A rodada já terminou');
  if (estado.vez !== jogador) throw new ErroJogada('Não é a sua vez');
  if (estado.fase !== fase) {
    throw new ErroJogada(fase === 'comprar' ? 'Você já comprou nesta vez' : 'Primeiro compre do monte ou pegue o lixo');
  }
}

/** Retira da mão as cartas pedidas (por id), na ordem dada */
function tirarDaMao(mao: Carta[], ids: string[]): Carta[] {
  if (new Set(ids).size !== ids.length) throw new ErroJogada('Carta repetida na jogada');
  return ids.map((id) => {
    const i = mao.findIndex((c) => c.id === id);
    if (i < 0) throw new ErroJogada('Essa carta não está na sua mão');
    return mao.splice(i, 1)[0];
  });
}

function validarNovoJogo(cartas: Carta[]): Carta[] {
  const a = analisarJogo(cartas);
  if (!a.valido) throw new ErroJogada(a.motivo ?? 'Jogo inválido');
  return a.ordenadas;
}

function aplicarAdicao(estado: Estado, equipe: number, indiceJogo: number, cartas: Carta[]): void {
  const jogo = estado.equipes[equipe].jogos[indiceJogo];
  if (!jogo) throw new ErroJogada('Esse jogo não existe na mesa da sua equipe');
  const a = analisarJogo([...jogo, ...cartas]);
  if (!a.valido) throw new ErroJogada('Essas cartas não encaixam nesse jogo');
  estado.equipes[equipe].jogos[indiceJogo] = a.ordenadas;
}

/**
 * Chamado sempre que a mão do jogador pode ter ficado vazia.
 * - Primeira batida: pega o morto (com canastra, suja serve, se configurado)
 * - Segunda batida: precisa de canastra limpa e encerra a rodada
 */
function verificarBatida(estado: Estado, jogador: number): 'nada' | 'morto' | 'fim' {
  if (estado.maos[jogador].length > 0) return 'nada';
  const eq = equipeDe(jogador);
  const equipe = estado.equipes[eq];
  const morto = estado.mortos[eq];

  if (!equipe.pegouMorto && morto) {
    if (estado.config.exigeCanastraParaMorto && !temCanastra(equipe.jogos)) {
      throw new ErroJogada('Para bater e pegar o morto, sua equipe precisa ter uma canastra');
    }
    estado.maos[jogador] = morto;
    estado.mortos[eq] = null;
    equipe.pegouMorto = true;
    return 'morto';
  }

  if (!temCanastraLimpa(equipe.jogos)) {
    throw new ErroJogada('Para bater e encerrar a rodada, sua equipe precisa ter uma canastra limpa');
  }
  fecharRodada(estado, eq);
  return 'fim';
}

function proximaVez(estado: Estado): void {
  estado.vez = (estado.vez + 1) % estado.numJogadores;
  estado.fase = 'comprar';
}

// ---------- jogadas ----------

/** Compra uma carta do monte */
export function comprarMonte(estadoAtual: Estado, jogador: number): Estado {
  const estado = clonar(estadoAtual);
  conferirVez(estado, jogador, 'comprar');

  if (estado.monte.length === 0) {
    const i = estado.mortos.findIndex((m) => m !== null);
    if (i < 0) {
      fecharRodada(estado, null);
      return estado;
    }
    estado.monte = estado.mortos[i]!;
    estado.mortos[i] = null;
  }

  estado.maos[jogador].push(estado.monte.pop()!);
  estado.fase = 'jogar';
  return estado;
}

export interface JogadaLixo {
  /** As duas cartas da mão que formam jogo com a última carta do lixo */
  par: [string, string];
  /** Jogos novos baixados junto (necessário quando vulnerável, para somar 75 pontos) */
  novosJogos?: string[][];
  /** Cartas adicionadas a jogos que já estão na mesa */
  adicoes?: { jogo: number; cartas: string[] }[];
}

/** Pega o lixo: a última carta + o par da mão vão para a mesa; o resto do lixo vai para a mão */
export function pegarLixo(estadoAtual: Estado, jogador: number, jogada: JogadaLixo): Estado {
  const estado = clonar(estadoAtual);
  conferirVez(estado, jogador, 'comprar');
  if (estado.lixo.length === 0) throw new ErroJogada('O lixo está vazio');

  const eq = equipeDe(jogador);
  const mao = estado.maos[jogador];
  const topo = estado.lixo[estado.lixo.length - 1];

  const par = tirarDaMao(mao, jogada.par);
  const jogoDoLixo = validarNovoJogo([topo, ...par]);

  // Cartas extras da mão (antes de receber o lixo)
  const extrasNovos = (jogada.novosJogos ?? []).map((ids) => tirarDaMao(mao, ids));
  const extrasAdicoes = (jogada.adicoes ?? []).map((a) => ({ jogo: a.jogo, cartas: tirarDaMao(mao, a.cartas) }));

  if (estaVulneravel(estado, eq)) {
    const pontos =
      somaPontos(par) +
      extrasNovos.reduce((s, cs) => s + somaPontos(cs), 0) +
      extrasAdicoes.reduce((s, a) => s + somaPontos(a.cartas), 0);
    if (pontos < estado.config.minimoVulneravel) {
      throw new ErroJogada(
        `Sua equipe está vulnerável: precisa descer pelo menos ${estado.config.minimoVulneravel} pontos da mão para pegar o lixo (você desceria ${pontos})`,
      );
    }
  }

  estado.equipes[eq].jogos.push(jogoDoLixo);
  for (const cs of extrasNovos) estado.equipes[eq].jogos.push(validarNovoJogo(cs));
  for (const a of extrasAdicoes) aplicarAdicao(estado, eq, a.jogo, a.cartas);

  mao.push(...estado.lixo.slice(0, -1));
  estado.lixo = [];
  estado.fase = 'jogar';

  verificarBatida(estado, jogador);
  return estado;
}

/** Baixa um jogo novo na mesa da equipe */
export function baixarJogo(estadoAtual: Estado, jogador: number, ids: string[]): Estado {
  const estado = clonar(estadoAtual);
  conferirVez(estado, jogador, 'jogar');
  const cartas = tirarDaMao(estado.maos[jogador], ids);
  estado.equipes[equipeDe(jogador)].jogos.push(validarNovoJogo(cartas));
  verificarBatida(estado, jogador);
  return estado;
}

/** Adiciona cartas a um jogo da equipe que já está na mesa */
export function adicionarAoJogo(estadoAtual: Estado, jogador: number, indiceJogo: number, ids: string[]): Estado {
  const estado = clonar(estadoAtual);
  conferirVez(estado, jogador, 'jogar');
  const cartas = tirarDaMao(estado.maos[jogador], ids);
  aplicarAdicao(estado, equipeDe(jogador), indiceJogo, cartas);
  verificarBatida(estado, jogador);
  return estado;
}

/** Descarta uma carta no lixo e passa a vez */
export function descartar(estadoAtual: Estado, jogador: number, id: string): Estado {
  const estado = clonar(estadoAtual);
  conferirVez(estado, jogador, 'jogar');
  const [c] = tirarDaMao(estado.maos[jogador], [id]);
  estado.lixo.push(c);
  const r = verificarBatida(estado, jogador);
  if (r !== 'fim') proximaVez(estado);
  return estado;
}

// ---------- pontuação ----------

function fecharRodada(estado: Estado, equipeQueBateu: number | null): void {
  const resultados: ResultadoEquipe[] = estado.equipes.map((equipe, eq) => {
    const pontosMesa = equipe.jogos.reduce((s, j) => s + somaPontos(j), 0);
    const bonusCanastras = equipe.jogos.reduce((s, j) => s + pontosBonusJogo(j), 0);
    const bonusBatida = equipeQueBateu === eq ? estado.config.bonusBatida : 0;
    const descontoMao = jogadoresDaEquipe(estado, eq).reduce((s, j) => s + somaPontos(estado.maos[j]), 0);
    const total = pontosMesa + bonusCanastras + bonusBatida - descontoMao;
    equipe.pontos += total;
    return { pontosMesa, bonusCanastras, bonusBatida, descontoMao, total };
  });

  estado.historico.push({ rodada: estado.rodada, equipeQueBateu, equipes: resultados });

  const [a, b] = estado.equipes.map((e) => e.pontos);
  const meta = estado.config.meta;
  if ((a >= meta || b >= meta) && a !== b) {
    estado.fase = 'fimPartida';
    estado.vencedor = a > b ? 0 : 1;
  } else {
    estado.fase = 'fimRodada';
  }
}

// ---------- visão de cada jogador (o que o servidor manda para cada um) ----------

export interface VisaoJogador {
  eu: number;
  minhaEquipe: number;
  minhaMao: Carta[];
  cartasNaMao: number[];
  lixo: Carta[];
  cartasNoMonte: number;
  mortoDisponivel: boolean[];
  equipes: { pontos: number; jogos: Carta[][]; pegouMorto: boolean; vulneravel: boolean }[];
  vez: number;
  fase: Fase;
  rodada: number;
  historico: ResultadoRodada[];
  vencedor: number | null;
}

export function visaoDoJogador(estado: Estado, jogador: number): VisaoJogador {
  return {
    eu: jogador,
    minhaEquipe: equipeDe(jogador),
    minhaMao: structuredClone(estado.maos[jogador]),
    cartasNaMao: estado.maos.map((m) => m.length),
    lixo: structuredClone(estado.lixo),
    cartasNoMonte: estado.monte.length,
    mortoDisponivel: estado.mortos.map((m) => m !== null),
    equipes: estado.equipes.map((e, i) => ({
      pontos: e.pontos,
      jogos: structuredClone(e.jogos),
      pegouMorto: e.pegouMorto,
      vulneravel: estaVulneravel(estado, i),
    })),
    vez: estado.vez,
    fase: estado.fase,
    rodada: estado.rodada,
    historico: structuredClone(estado.historico),
    vencedor: estado.vencedor,
  };
}
