// Validação de jogos (sequências), canastras e pontuação — Buraco do Zé
import { Carta } from './cartas';

export type TipoCanastra = 'limpa' | 'suja' | 'asAAs';

export type TipoJogo = 'sequencia' | 'trinca';

export interface AnaliseJogo {
  valido: boolean;
  tipo: TipoJogo | null;
  motivo?: string;
  /** Cartas ordenadas na sequência (o curinga já na posição que ocupa) */
  ordenadas: Carta[];
  /** O 2 que está substituindo outra carta, se houver */
  curinga: Carta | null;
  /** Posição que o curinga ocupa (1 = Ás baixo … 14 = Ás alto) */
  posicaoCuringa: number | null;
  limpo: boolean;
  canastra: TipoCanastra | null;
}

export const PONTOS_CANASTRA: Record<TipoCanastra, number> = {
  limpa: 200,
  suja: 150,
  asAAs: 1000,
};

export const TAMANHO_CANASTRA = 7;

const ORDEM_NAIPE: Record<string, number> = { P: 0, C: 1, E: 2, O: 3 };

function invalido(motivo: string): AnaliseJogo {
  return { valido: false, tipo: null, motivo, ordenadas: [], curinga: null, posicaoCuringa: null, limpo: false, canastra: null };
}

/**
 * Analisa se as cartas formam um jogo válido.
 *
 * Trinca: 3 ou mais cartas do mesmo valor (naipes quaisquer).
 *   Um 2 pode entrar no lugar de uma delas (no máximo um, e precisa de pelo menos 2 cartas naturais).
 *   Vale só a soma das cartas — nunca dá bônus de canastra.
 *
 * Sequência do mesmo naipe:
 * - Mínimo 3 cartas, máximo 14 (Ás a Ás)
 * - Ás vale 1 (antes do 2) ou 14 (depois do Rei)
 * - No máximo um 2 servindo de curinga; um 2 na posição natural não é curinga
 * - Prefere sempre a leitura "limpa" quando existir
 */
export function analisarJogo(cartas: Carta[]): AnaliseJogo {
  if (cartas.length < 3) return invalido('Um jogo precisa de pelo menos 3 cartas');
  if (cartas.length > 14) return invalido('Um jogo tem no máximo 14 cartas');

  // Trinca: cartas do mesmo valor; um 2 pode entrar no lugar de uma delas
  const naturais = cartas.filter((c) => c.valor !== 2);
  const doisNaTrinca = cartas.filter((c) => c.valor === 2);
  if (naturais.length >= 2 && naturais.every((c) => c.valor === naturais[0].valor)) {
    if (doisNaTrinca.length > 1) return invalido('Na trinca só pode entrar um 2');
    const curinga = doisNaTrinca[0] ?? null;
    return {
      valido: true,
      tipo: 'trinca',
      ordenadas: [...naturais.sort((a, b) => ORDEM_NAIPE[a.naipe] - ORDEM_NAIPE[b.naipe]), ...doisNaTrinca],
      curinga,
      posicaoCuringa: null,
      limpo: !curinga,
      canastra: null,
    };
  }

  const naipe = cartas[0].naipe;
  if (cartas.some((c) => c.naipe !== naipe)) {
    return invalido('Sequência precisa ser do mesmo naipe (ou trinca: cartas do mesmo valor)');
  }

  const ases = cartas.filter((c) => c.valor === 1);
  const dois = cartas.filter((c) => c.valor === 2);
  const outras = cartas.filter((c) => c.valor !== 1 && c.valor !== 2);
  if (ases.length > 2) return invalido('No máximo dois Ases num jogo');
  if (dois.length > 2) return invalido('No máximo dois 2 num jogo');

  // Possíveis posições dos Ases
  const opcoesAs: number[][] =
    ases.length === 0 ? [[]] : ases.length === 1 ? [[1], [14]] : [[1, 14]];

  // Qual 2 é curinga (-1 = nenhum)
  const opcoesCuringa = [-1, ...dois.map((_, i) => i)];

  let melhor: AnaliseJogo | null = null;

  for (const curingaIdx of opcoesCuringa) {
    for (const posAs of opcoesAs) {
      const posicionadas: { pos: number; carta: Carta }[] = [];
      outras.forEach((c) => posicionadas.push({ pos: c.valor, carta: c }));
      ases.forEach((c, i) => posicionadas.push({ pos: posAs[i], carta: c }));
      dois.forEach((c, i) => {
        if (i !== curingaIdx) posicionadas.push({ pos: 2, carta: c });
      });

      const posicoes = posicionadas.map((p) => p.pos);
      if (new Set(posicoes).size !== posicoes.length) continue; // repetida

      const temCuringa = curingaIdx >= 0;
      let posCuringa: number | null = null;

      if (posicoes.length > 0) {
        const min = Math.min(...posicoes);
        const max = Math.max(...posicoes);
        const buracos = max - min + 1 - posicoes.length;
        if (!temCuringa) {
          if (buracos !== 0) continue;
        } else {
          if (buracos > 1) continue;
          if (buracos === 1) {
            for (let p = min; p <= max; p++) if (!posicoes.includes(p)) posCuringa = p;
          } else if (max < 14) {
            posCuringa = max + 1;
          } else if (min > 1) {
            posCuringa = min - 1;
          } else continue;
        }
      }

      const todas = [...posicionadas];
      if (temCuringa && posCuringa !== null) todas.push({ pos: posCuringa, carta: dois[curingaIdx] });
      todas.sort((a, b) => a.pos - b.pos);

      const limpo = !temCuringa;
      const tamanho = cartas.length;
      let canastra: TipoCanastra | null = null;
      if (tamanho >= TAMANHO_CANASTRA) {
        if (limpo && tamanho === 14) canastra = 'asAAs';
        else canastra = limpo ? 'limpa' : 'suja';
      }

      const analise: AnaliseJogo = {
        valido: true,
        tipo: 'sequencia',
        ordenadas: todas.map((t) => t.carta),
        curinga: temCuringa ? dois[curingaIdx] : null,
        posicaoCuringa: posCuringa,
        limpo,
        canastra,
      };
      if (limpo) return analise; // leitura limpa é sempre a melhor
      if (!melhor) melhor = analise;
    }
  }

  return melhor ?? invalido('As cartas não formam uma sequência');
}

export function pontosBonusJogo(cartas: Carta[]): number {
  const a = analisarJogo(cartas);
  return a.valido && a.canastra ? PONTOS_CANASTRA[a.canastra] : 0;
}

export function temCanastra(jogos: Carta[][]): boolean {
  return jogos.some((j) => analisarJogo(j).canastra !== null);
}

export function temCanastraLimpa(jogos: Carta[][]): boolean {
  return jogos.some((j) => {
    const t = analisarJogo(j).canastra;
    return t === 'limpa' || t === 'asAAs';
  });
}
