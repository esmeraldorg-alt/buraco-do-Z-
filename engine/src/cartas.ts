// Cartas, baralho e valores — Buraco do Zé

/** P = paus ♣, C = copas ♥, E = espadas ♠, O = ouros ♦ */
export type Naipe = 'P' | 'C' | 'E' | 'O';

/** 1 = Ás, 11 = Valete, 12 = Dama, 13 = Rei */
export type Valor = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12 | 13;

export interface Carta {
  id: string;
  naipe: Naipe;
  valor: Valor;
}

export const NAIPES: Naipe[] = ['P', 'C', 'E', 'O'];

export const SIMBOLO_NAIPE: Record<Naipe, string> = { P: '♣', C: '♥', E: '♠', O: '♦' };

const NOME_VALOR: Record<number, string> = { 1: 'A', 11: 'J', 12: 'Q', 13: 'K' };

export function nomeValor(v: Valor): string {
  return NOME_VALOR[v] ?? String(v);
}

export function nomeCarta(c: Carta): string {
  return nomeValor(c.valor) + SIMBOLO_NAIPE[c.naipe];
}

/** Pontos de cada carta: 2 = 10, 3–7 = 5, 8–Rei = 10, Ás = 15 */
export function pontosCarta(c: Carta): number {
  if (c.valor === 1) return 15;
  if (c.valor === 2) return 10;
  if (c.valor <= 7) return 5;
  return 10;
}

export function somaPontos(cartas: Carta[]): number {
  return cartas.reduce((s, c) => s + pontosCarta(c), 0);
}

/** Dois baralhos sem coringa = 104 cartas */
export function criarBaralho(): Carta[] {
  const cartas: Carta[] = [];
  for (let b = 0; b < 2; b++) {
    for (const naipe of NAIPES) {
      for (let v = 1; v <= 13; v++) {
        cartas.push({ id: `${nomeValor(v as Valor)}${naipe}-${b}`, naipe, valor: v as Valor });
      }
    }
  }
  return cartas;
}

/** Gerador pseudoaleatório com semente (mulberry32), para partidas reproduzíveis */
export function criarAleatorio(semente: number): () => number {
  let a = semente >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function embaralhar<T>(itens: T[], aleatorio: () => number): T[] {
  const r = [...itens];
  for (let i = r.length - 1; i > 0; i--) {
    const j = Math.floor(aleatorio() * (i + 1));
    [r[i], r[j]] = [r[j], r[i]];
  }
  return r;
}

/**
 * Cria uma carta a partir de texto, útil em testes: 'AC' (Ás de copas), '10E', 'KP', '2O'.
 * O último caractere é o naipe (P, C, E, O).
 */
export function carta(texto: string, baralho = 0): Carta {
  const naipe = texto.slice(-1).toUpperCase() as Naipe;
  const v = texto.slice(0, -1).toUpperCase();
  if (!NAIPES.includes(naipe)) throw new Error(`Naipe inválido: ${texto}`);
  const mapa: Record<string, number> = { A: 1, J: 11, Q: 12, K: 13 };
  const valor = (mapa[v] ?? Number(v)) as Valor;
  if (!(valor >= 1 && valor <= 13)) throw new Error(`Valor inválido: ${texto}`);
  return { id: `${nomeValor(valor)}${naipe}-${baralho}`, naipe, valor };
}
