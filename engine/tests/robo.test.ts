import { describe, expect, it } from 'vitest';
import { carta } from '../src/cartas';
import {
  Estado,
  adicionarAoJogo,
  baixarJogo,
  comprarMonte,
  criarPartida,
  descartar,
  novaRodada,
  pegarLixo,
} from '../src/partida';
import { decidirJogadaRobo, procurarJogos, type JogadaRobo } from '../src/robo';

function aplicar(e: Estado, j: number, a: JogadaRobo): Estado {
  switch (a.tipo) {
    case 'comprar':
      return comprarMonte(e, j);
    case 'lixo':
      return pegarLixo(e, j, a);
    case 'baixar':
      return baixarJogo(e, j, a.cartas);
    case 'adicionar':
      return adicionarAoJogo(e, j, a.jogo, a.cartas);
    case 'descartar':
      return descartar(e, j, a.carta);
  }
}

/** Robôs jogam uma partida inteira entre si */
function simular(numJogadores: 2 | 4, semente: number) {
  let e = criarPartida({ numJogadores, semente });
  let passos = 0;
  const tipos: Record<string, number> = {};
  while (e.fase !== 'fimPartida' && passos < 60000) {
    if (e.fase === 'fimRodada') {
      e = novaRodada(e);
      continue;
    }
    const a = decidirJogadaRobo(e, e.vez)!;
    tipos[a.tipo] = (tipos[a.tipo] ?? 0) + 1;
    e = aplicar(e, e.vez, a);
    passos++;
  }
  return { e, passos, tipos };
}

describe('robô', () => {
  it('acha sequências na mão e ignora cartas iguais', () => {
    const mao = ['7C', '7O', '7E', '3P', '4P', '5P', 'KO', '2C'].map((t, i) => carta(t, i));
    const jogos = procurarJogos(mao, false).map((j) => j.map((c) => c.id).sort().join(','));
    expect(jogos).toContain(['3P-3', '4P-4', '5P-5'].sort().join(','));
    expect(jogos).not.toContain(['7C-0', '7O-1', '7E-2'].sort().join(','));
  });

  it('pega o lixo quando tem o par', () => {
    const e = criarPartida({ numJogadores: 2, semente: 1 });
    e.maos[0] = ['5C', '6C', 'KP', 'JO'].map((t, i) => carta(t, 10 + i));
    e.lixo = [carta('9E', 30), carta('7C', 31)];
    expect(decidirJogadaRobo(e, 0)).toMatchObject({ tipo: 'lixo' });
  });

  it('compra do monte quando o lixo não serve', () => {
    const e = criarPartida({ numJogadores: 2, semente: 1 });
    e.maos[0] = ['5C', '9O', 'KP', 'JO'].map((t, i) => carta(t, 10 + i));
    e.lixo = [carta('7E', 31)];
    expect(decidirJogadaRobo(e, 0)).toEqual({ tipo: 'comprar' });
  });

  for (const n of [2, 4] as const) {
    for (const semente of [1, 2, 3, 4, 5]) {
      it(`robôs terminam uma partida inteira (${n} jogadores, semente ${semente})`, () => {
        const { e, tipos } = simular(n, semente);
        expect(e.fase).toBe('fimPartida');
        expect(e.vencedor).not.toBeNull();
        expect(Math.max(e.equipes[0].pontos, e.equipes[1].pontos)).toBeGreaterThanOrEqual(3000);
        expect(tipos.lixo ?? 0).toBeGreaterThan(0);
        expect(tipos.baixar ?? 0).toBeGreaterThan(0);
      });
    }
  }

  it('não fica travado com uma carta sem poder bater', () => {
    // Já pegou o morto, só tem canastra suja: não pode baixar e ficar com 1 carta
    const e = criarPartida({ numJogadores: 2, semente: 9 });
    e.equipes[0].pegouMorto = true;
    e.mortos[0] = null;
    e.equipes[0].jogos = [['3O', '4O', '5O', '2O', '7O', '8O', '9O'].map((t, i) => carta(t, 40 + i))];
    e.maos[0] = ['JP', 'QP', 'KP', '4C'].map((t, i) => carta(t, 50 + i));
    e.fase = 'jogar';
    expect(() => baixarJogo(e, 0, ['JP-50', 'QP-51', 'KP-52'])).toThrow('pelo menos 2 cartas');
  });
});
