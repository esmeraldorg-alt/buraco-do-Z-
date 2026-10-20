import { describe, expect, it } from 'vitest';
import { carta, criarBaralho, pontosCarta, somaPontos } from '../src/cartas';
import { analisarJogo, pontosBonusJogo } from '../src/jogos';

const cs = (...t: string[]) => t.map((x, i) => carta(x, i));

describe('cartas', () => {
  it('baralho tem 104 cartas com ids únicos', () => {
    const b = criarBaralho();
    expect(b).toHaveLength(104);
    expect(new Set(b.map((c) => c.id)).size).toBe(104);
  });

  it('valores: 2=10, 3-7=5, 8-K=10, A=15', () => {
    expect(pontosCarta(carta('2C'))).toBe(10);
    expect(pontosCarta(carta('3C'))).toBe(5);
    expect(pontosCarta(carta('7C'))).toBe(5);
    expect(pontosCarta(carta('8C'))).toBe(10);
    expect(pontosCarta(carta('KC'))).toBe(10);
    expect(pontosCarta(carta('AC'))).toBe(15);
    expect(somaPontos(cs('AC', '2C', '3C'))).toBe(30);
  });
});

describe('analisarJogo', () => {
  it('sequência simples limpa', () => {
    const a = analisarJogo(cs('5C', '3C', '4C'));
    expect(a.valido).toBe(true);
    expect(a.limpo).toBe(true);
    expect(a.ordenadas.map((c) => c.valor)).toEqual([3, 4, 5]);
  });

  it('naipes diferentes é inválido', () => {
    expect(analisarJogo(cs('3C', '4C', '5O')).valido).toBe(false);
  });

  it('menos de 3 cartas é inválido', () => {
    expect(analisarJogo(cs('3C', '4C')).valido).toBe(false);
  });

  it('aceita trinca (mesmo valor, naipes quaisquer)', () => {
    const a = analisarJogo([carta('7C'), carta('7O'), carta('7E')]);
    expect(a.valido).toBe(true);
    expect(a.tipo).toBe('trinca');
    expect(a.canastra).toBeNull();
  });

  it('trinca pode repetir naipe (dois baralhos) e crescer', () => {
    const a = analisarJogo([carta('QC', 0), carta('QC', 1), carta('QE'), carta('QO')]);
    expect(a.valido).toBe(true);
    expect(a.tipo).toBe('trinca');
  });

  it('trinca nunca vira canastra, mesmo com 7 cartas', () => {
    const j = ['9C', '9O', '9E', '9P', '9C', '9O', '9E'].map((t, i) => carta(t, i));
    expect(analisarJogo(j).valido).toBe(true);
    expect(pontosBonusJogo(j)).toBe(0);
  });

  it('2 pode entrar na trinca no lugar de uma carta', () => {
    const a = analisarJogo([carta('7C'), carta('2E'), carta('7O')]);
    expect(a.valido).toBe(true);
    expect(a.tipo).toBe('trinca');
    expect(a.curinga?.valor).toBe(2);
    expect(a.limpo).toBe(false);
  });

  it('só um 2 por trinca', () => {
    expect(analisarJogo([carta('7C'), carta('7O'), carta('2E'), carta('2C')]).valido).toBe(false);
  });

  it('trinca precisa de pelo menos duas cartas naturais', () => {
    expect(analisarJogo([carta('7C'), carta('2E'), carta('2C')]).valido).toBe(false);
  });

  it('não vale trinca de 2', () => {
    expect(analisarJogo([carta('2C'), carta('2O'), carta('2E')]).valido).toBe(false);
  });

  it('trinca com carta de valor diferente é inválida', () => {
    expect(analisarJogo([carta('7C'), carta('7O'), carta('8E')]).valido).toBe(false);
  });

  it('2 substitui carta do mesmo naipe (suja)', () => {
    const a = analisarJogo(cs('4E', '2E', '6E'));
    expect(a.valido).toBe(true);
    expect(a.limpo).toBe(false);
    expect(a.posicaoCuringa).toBe(5);
  });

  it('2 de outro naipe não serve de curinga', () => {
    expect(analisarJogo(cs('4E', '2C', '6E')).valido).toBe(false);
  });

  it('só um 2 pode ser curinga', () => {
    expect(analisarJogo(cs('4E', '2E', '6E', '2E', '8E')).valido).toBe(false);
  });

  it('2 na posição natural (A-2-3) é limpo', () => {
    const a = analisarJogo(cs('AC', '2C', '3C'));
    expect(a.valido).toBe(true);
    expect(a.limpo).toBe(true);
  });

  it('2 natural + 2 curinga no mesmo jogo', () => {
    const a = analisarJogo(cs('AC', '2C', '3C', '2C', '5C'));
    expect(a.valido).toBe(true);
    expect(a.limpo).toBe(false);
    expect(a.posicaoCuringa).toBe(4);
  });

  it('Ás alto (Q-K-A)', () => {
    const a = analisarJogo(cs('QO', 'AO', 'KO'));
    expect(a.valido).toBe(true);
    expect(a.ordenadas.map((c) => c.valor)).toEqual([12, 13, 1]);
  });

  it('não dá a volta (K-A-2)', () => {
    expect(analisarJogo(cs('KO', 'AO', '3O')).valido).toBe(false);
  });

  it('2 curinga na ponta quando não há buraco', () => {
    const a = analisarJogo(cs('5P', '6P', '2P'));
    expect(a.valido).toBe(true);
    expect(a.limpo).toBe(false);
  });

  it('canastra limpa (7 cartas) vale 200', () => {
    const j = cs('3C', '4C', '5C', '6C', '7C', '8C', '9C');
    expect(analisarJogo(j).canastra).toBe('limpa');
    expect(pontosBonusJogo(j)).toBe(200);
  });

  it('canastra suja vale 150', () => {
    const j = cs('3C', '4C', '5C', '2C', '7C', '8C', '9C');
    expect(analisarJogo(j).canastra).toBe('suja');
    expect(pontosBonusJogo(j)).toBe(150);
  });

  it('6 cartas não é canastra', () => {
    expect(pontosBonusJogo(cs('3C', '4C', '5C', '6C', '7C', '8C'))).toBe(0);
  });

  it('Ás a Ás limpa vale 1000', () => {
    const j = cs('AE', '2E', '3E', '4E', '5E', '6E', '7E', '8E', '9E', '10E', 'JE', 'QE', 'KE', 'AE');
    expect(analisarJogo(j).canastra).toBe('asAAs');
    expect(pontosBonusJogo(j)).toBe(1000);
  });

  it('Ás a Ás com 2 curinga é só suja (150)', () => {
    // 2 natural na posição 2 e outro 2 no lugar do 9
    const j = cs('AE', '2E', '3E', '4E', '5E', '6E', '7E', '8E', '2E', '10E', 'JE', 'QE', 'KE', 'AE');
    expect(analisarJogo(j).canastra).toBe('suja');
    expect(pontosBonusJogo(j)).toBe(150);
  });
});
