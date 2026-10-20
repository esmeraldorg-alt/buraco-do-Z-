import { describe, expect, it } from 'vitest';
import { Carta, carta } from '../src/cartas';
import {
  Estado,
  adicionarAoJogo,
  baixarJogo,
  comprarMonte,
  criarPartida,
  descartar,
  novaRodada,
  pegarLixo,
  visaoDoJogador,
} from '../src/partida';

let seq = 0;
/** Cria cartas com ids únicos para montar cenários */
const cs = (...t: string[]): Carta[] => t.map((x) => carta(x, 100 + seq++));
const ids = (c: Carta[]) => c.map((x) => x.id);

function cenario(numJogadores: 2 | 4, ajustes: (e: Estado) => void): Estado {
  const e = criarPartida({ numJogadores, semente: 42 });
  ajustes(e);
  return e;
}

const canastraLimpa = () => cs('3C', '4C', '5C', '6C', '7C', '8C', '9C');
const canastraSuja = () => cs('3O', '4O', '5O', '2O', '7O', '8O', '9O');

describe('distribuição', () => {
  it('2 jogadores: 11 cartas cada, 2 mortos de 11, monte com 60', () => {
    const e = criarPartida({ numJogadores: 2, semente: 1 });
    expect(e.maos.map((m) => m.length)).toEqual([11, 11]);
    expect(e.mortos.map((m) => m!.length)).toEqual([11, 11]);
    expect(e.monte).toHaveLength(60);
    expect(e.lixo).toHaveLength(0);
  });

  it('4 jogadores: monte com 38', () => {
    const e = criarPartida({ numJogadores: 4, semente: 1 });
    expect(e.maos.map((m) => m.length)).toEqual([11, 11, 11, 11]);
    expect(e.monte).toHaveLength(38);
  });

  it('mesma semente gera a mesma partida', () => {
    const a = criarPartida({ numJogadores: 4, semente: 7 });
    const b = criarPartida({ numJogadores: 4, semente: 7 });
    expect(a.maos).toEqual(b.maos);
  });
});

describe('turno', () => {
  it('compra, baixa jogo, descarta e passa a vez', () => {
    const mao = cs('3P', '4P', '5P', 'KC', 'QE');
    let e = cenario(2, (e) => {
      e.maos[0] = [...mao];
    });
    e = comprarMonte(e, 0);
    expect(e.fase).toBe('jogar');
    e = baixarJogo(e, 0, ids(mao.slice(0, 3)));
    expect(e.equipes[0].jogos).toHaveLength(1);
    e = descartar(e, 0, mao[3].id);
    expect(e.vez).toBe(1);
    expect(e.fase).toBe('comprar');
    expect(e.lixo.at(-1)!.id).toBe(mao[3].id);
  });

  it('não pode jogar fora da vez', () => {
    const e = criarPartida({ numJogadores: 2, semente: 3 });
    expect(() => comprarMonte(e, 1)).toThrow('Não é a sua vez');
  });

  it('não pode baixar sem comprar', () => {
    const mao = cs('3P', '4P', '5P', 'KC');
    const e = cenario(2, (e) => (e.maos[0] = [...mao]));
    expect(() => baixarJogo(e, 0, ids(mao.slice(0, 3)))).toThrow('Primeiro compre');
  });

  it('jogada inválida não altera o estado', () => {
    const mao = cs('3P', '4P', '6O', 'KC');
    const e = comprarMonte(cenario(2, (e) => (e.maos[0] = [...mao])), 0);
    const antes = structuredClone(e);
    expect(() => baixarJogo(e, 0, ids(mao.slice(0, 3)))).toThrow();
    expect(e).toEqual(antes);
  });

  it('adicionar carta a jogo da mesa', () => {
    const jogo = cs('3P', '4P', '5P');
    const mao = cs('6P', 'KC', 'QC');
    let e = cenario(2, (e) => {
      e.maos[0] = [...mao];
      e.equipes[0].jogos = [jogo];
    });
    e = comprarMonte(e, 0);
    e = adicionarAoJogo(e, 0, 0, [mao[0].id]);
    expect(e.equipes[0].jogos[0].map((c) => c.valor)).toEqual([3, 4, 5, 6]);
  });
});

describe('lixo', () => {
  it('pega o lixo com par que casa com a última carta', () => {
    const lixo = cs('KO', '9E', '7C');
    const mao = cs('5C', '6C', 'JP');
    let e = cenario(2, (e) => {
      e.lixo = [...lixo];
      e.maos[0] = [...mao];
    });
    e = pegarLixo(e, 0, { par: [mao[0].id, mao[1].id] });
    expect(e.equipes[0].jogos[0].map((c) => c.valor)).toEqual([5, 6, 7]);
    expect(e.lixo).toHaveLength(0);
    expect(ids(e.maos[0]).sort()).toEqual([mao[2].id, lixo[0].id, lixo[1].id].sort());
    expect(e.fase).toBe('jogar');
  });

  it('não pega o lixo com cartas iguais (só sequência)', () => {
    const mao = cs('7O', '7E', 'JP');
    const e = cenario(2, (e) => {
      e.lixo = cs('KO', '7C');
      e.maos[0] = [...mao];
    });
    expect(() => pegarLixo(e, 0, { par: [mao[0].id, mao[1].id] })).toThrow('Cartas iguais');
  });

  it('pega o lixo com o 2 completando a sequência', () => {
    const mao = cs('9C', '2C', 'JP');
    let e = cenario(2, (e) => {
      e.lixo = cs('10C');
      e.maos[0] = [...mao];
    });
    e = pegarLixo(e, 0, { par: [mao[0].id, mao[1].id] });
    expect(e.equipes[0].jogos[0]).toHaveLength(3);
  });

  it('jogo de 3 cartas soma só o valor das cartas na rodada', () => {
    const ultima = cs('KP');
    let e = cenario(2, (e) => {
      e.equipes[0].jogos = [canastraLimpa(), cs('QE', 'KE', 'AE')];
      e.equipes[0].pegouMorto = true;
      e.mortos[0] = null;
      e.maos[0] = [...ultima];
      e.maos[1] = [];
      e.fase = 'jogar';
    });
    e = descartar(e, 0, ultima[0].id);
    // canastra 45 + Q-K-A 35 = 80 de cartas; bônus só da canastra (200) + batida (100)
    expect(e.historico[0].equipes[0]).toMatchObject({ pontosMesa: 80, bonusCanastras: 200, bonusBatida: 100 });
  });

  it('não pega o lixo se o par não casa', () => {
    const mao = cs('5C', '9C', 'JP');
    const e = cenario(2, (e) => {
      e.lixo = cs('7C');
      e.maos[0] = [...mao];
    });
    expect(() => pegarLixo(e, 0, { par: [mao[0].id, mao[1].id] })).toThrow();
  });

  it('vulnerável: precisa descer 75 pontos da mão', () => {
    const mao = cs('5C', '6C', 'JP');
    const e = cenario(2, (e) => {
      e.equipes[0].pontos = 1500;
      e.lixo = cs('7C');
      e.maos[0] = [...mao];
    });
    expect(() => pegarLixo(e, 0, { par: [mao[0].id, mao[1].id] })).toThrow('vulnerável');
  });

  it('vulnerável: pega o lixo descendo 75 pontos ou mais', () => {
    // par 5+6 = 10 pontos; extra Q-K-A de espadas = 35; 8-9-10 de paus = 30 → 75
    const par = cs('5C', '6C');
    const extra1 = cs('QE', 'KE', 'AE');
    const extra2 = cs('8P', '9P', '10P');
    const sobra = cs('3O');
    let e = cenario(2, (e) => {
      e.equipes[0].pontos = 1600;
      e.lixo = cs('7C');
      e.maos[0] = [...par, ...extra1, ...extra2, ...sobra];
    });
    e = pegarLixo(e, 0, { par: [par[0].id, par[1].id], novosJogos: [ids(extra1), ids(extra2)] });
    expect(e.equipes[0].jogos).toHaveLength(3);
  });

  it('não vulnerável abaixo de 1500', () => {
    const mao = cs('5C', '6C', 'JP');
    const e = cenario(2, (e) => {
      e.equipes[0].pontos = 1495;
      e.lixo = cs('7C');
      e.maos[0] = [...mao];
    });
    expect(() => pegarLixo(e, 0, { par: [mao[0].id, mao[1].id] })).not.toThrow();
  });
});

describe('batidas e morto', () => {
  it('primeira batida descartando com canastra suja: pega o morto e passa a vez', () => {
    const ultima = cs('KP');
    let e = cenario(2, (e) => {
      e.equipes[0].jogos = [canastraSuja()];
      e.maos[0] = [...ultima];
      e.fase = 'jogar';
    });
    const morto = e.mortos[0]!;
    e = descartar(e, 0, ultima[0].id);
    expect(e.equipes[0].pegouMorto).toBe(true);
    expect(e.mortos[0]).toBeNull();
    expect(ids(e.maos[0])).toEqual(ids(morto));
    expect(e.vez).toBe(1);
  });

  it('primeira batida baixando tudo: pega o morto e continua jogando', () => {
    const mao = cs('JP', 'QP', 'KP');
    let e = cenario(2, (e) => {
      e.equipes[0].jogos = [canastraSuja()];
      e.maos[0] = [...mao];
      e.fase = 'jogar';
    });
    e = baixarJogo(e, 0, ids(mao));
    expect(e.maos[0]).toHaveLength(11);
    expect(e.vez).toBe(0);
    expect(e.fase).toBe('jogar');
  });

  it('primeira batida não precisa de canastra', () => {
    const ultima = cs('KP');
    let e = cenario(2, (e) => {
      e.equipes[0].jogos = [cs('3P', '4P', '5P')];
      e.maos[0] = [...ultima];
      e.fase = 'jogar';
    });
    e = descartar(e, 0, ultima[0].id);
    expect(e.equipes[0].pegouMorto).toBe(true);
    expect(e.maos[0]).toHaveLength(11);
  });

  it('primeira batida sem nenhum jogo na mesa também pega o morto', () => {
    const mao = cs('JP', 'QP', 'KP');
    let e = cenario(2, (e) => {
      e.maos[0] = [...mao];
      e.fase = 'jogar';
    });
    e = baixarJogo(e, 0, ids(mao));
    expect(e.equipes[0].pegouMorto).toBe(true);
  });

  it('se configurado, pode exigir canastra para pegar o morto', () => {
    const ultima = cs('KP');
    const e = cenario(2, (e) => {
      e.config.exigeCanastraParaMorto = true;
      e.equipes[0].jogos = [cs('3P', '4P', '5P')];
      e.maos[0] = [...ultima];
      e.fase = 'jogar';
    });
    expect(() => descartar(e, 0, ultima[0].id)).toThrow('canastra');
  });

  it('segunda batida só com canastra limpa', () => {
    const ultima = cs('KP');
    const e = cenario(2, (e) => {
      e.equipes[0].jogos = [canastraSuja()];
      e.equipes[0].pegouMorto = true;
      e.mortos[0] = null;
      e.maos[0] = [...ultima];
      e.fase = 'jogar';
    });
    expect(() => descartar(e, 0, ultima[0].id)).toThrow('canastra limpa');
  });

  it('segunda batida com canastra limpa encerra a rodada e soma +100', () => {
    const ultima = cs('KP');
    const limpa = canastraLimpa(); // 3..7 = 5×5=25, 8,9 = 20 → 45 pontos de cartas
    const maoAdv = cs('AE', 'QE'); // 25 pontos de desconto
    let e = cenario(2, (e) => {
      e.equipes[0].jogos = [limpa];
      e.equipes[0].pegouMorto = true;
      e.mortos[0] = null;
      e.maos[0] = [...ultima];
      e.maos[1] = [...maoAdv];
      e.fase = 'jogar';
    });
    e = descartar(e, 0, ultima[0].id);
    expect(e.fase).toBe('fimRodada');
    const r = e.historico[0];
    expect(r.equipeQueBateu).toBe(0);
    expect(r.equipes[0]).toEqual({ pontosMesa: 45, bonusCanastras: 200, bonusBatida: 100, descontoMao: 0, total: 345 });
    expect(r.equipes[1].descontoMao).toBe(25);
    expect(e.equipes[0].pontos).toBe(345);
    expect(e.equipes[1].pontos).toBe(-25);
  });

  it('em duplas, o parceiro pode bater e o morto é da dupla', () => {
    const ultima = cs('KP');
    let e = cenario(4, (e) => {
      e.equipes[0].jogos = [canastraSuja()];
      e.maos[2] = [...ultima];
      e.vez = 2;
      e.fase = 'jogar';
    });
    e = descartar(e, 2, ultima[0].id);
    expect(e.equipes[0].pegouMorto).toBe(true);
    expect(e.maos[2]).toHaveLength(11);
    // o parceiro (jogador 0) não pega outro morto
    expect(e.mortos[0]).toBeNull();
    expect(e.mortos[1]).not.toBeNull();
  });

  it('desconto em duplas soma a mão dos dois parceiros', () => {
    const ultima = cs('KP');
    let e = cenario(4, (e) => {
      e.equipes[0].jogos = [canastraLimpa()];
      e.equipes[0].pegouMorto = true;
      e.mortos[0] = null;
      e.maos[0] = [...ultima];
      e.maos[1] = cs('AE'); // 15
      e.maos[2] = cs('3E'); // 5 (parceiro de quem bateu)
      e.maos[3] = cs('KE'); // 10
      e.fase = 'jogar';
    });
    e = descartar(e, 0, ultima[0].id);
    expect(e.historico[0].equipes[0].descontoMao).toBe(5);
    expect(e.historico[0].equipes[1].descontoMao).toBe(25);
  });
});

describe('monte acabando', () => {
  it('morto não pego vira monte', () => {
    let e = cenario(2, (e) => {
      e.monte = [];
    });
    e = comprarMonte(e, 0);
    expect(e.mortos.filter((m) => m === null)).toHaveLength(1);
    expect(e.monte).toHaveLength(10);
  });

  it('sem monte e sem morto, a rodada termina', () => {
    let e = cenario(2, (e) => {
      e.monte = [];
      e.mortos = [null, null];
    });
    e = comprarMonte(e, 0);
    expect(e.fase).toBe('fimRodada');
    expect(e.historico[0].equipeQueBateu).toBeNull();
  });
});

describe('fim da partida', () => {
  it('termina ao atingir 3000 pontos', () => {
    const ultima = cs('KP');
    let e = cenario(2, (e) => {
      e.equipes[0].pontos = 2900;
      e.equipes[0].jogos = [canastraLimpa()];
      e.equipes[0].pegouMorto = true;
      e.mortos[0] = null;
      e.maos[0] = [...ultima];
      e.fase = 'jogar';
    });
    e = descartar(e, 0, ultima[0].id);
    expect(e.fase).toBe('fimPartida');
    expect(e.vencedor).toBe(0);
  });

  it('nova rodada redistribui e gira quem começa', () => {
    let e = cenario(2, (e) => {
      e.monte = [];
      e.mortos = [null, null];
    });
    e = comprarMonte(e, 0);
    e = novaRodada(e);
    expect(e.rodada).toBe(1);
    expect(e.vez).toBe(1);
    expect(e.maos.map((m) => m.length)).toEqual([11, 11]);
    expect(e.equipes[0].jogos).toHaveLength(0);
  });
});

describe('visão do jogador', () => {
  it('esconde a mão dos outros e o conteúdo do monte e do morto', () => {
    const e = criarPartida({ numJogadores: 4, semente: 5 });
    const v = visaoDoJogador(e, 1);
    expect(v.minhaMao).toEqual(e.maos[1]);
    expect(v.cartasNaMao).toEqual([11, 11, 11, 11]);
    expect(v.cartasNoMonte).toBe(38);
    expect(JSON.stringify(v)).not.toContain(e.maos[0][0].id);
  });
});
