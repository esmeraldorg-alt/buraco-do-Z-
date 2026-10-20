// Robô jogador do Buraco do Zé
// Decide UMA jogada por vez. Toda jogada candidata é testada no próprio motor de regras,
// então o robô nunca faz nada que um jogador de verdade não poderia fazer.
import { Carta, pontosCarta, somaPontos } from './cartas';
import { analisarJogo, temCanastraLimpa } from './jogos';
import {
  Estado,
  adicionarAoJogo,
  baixarJogo,
  descartar,
  equipeDe,
  estaVulneravel,
  pegarLixo,
  type JogadaLixo,
} from './partida';

export type JogadaRobo =
  | { tipo: 'comprar' }
  | ({ tipo: 'lixo' } & JogadaLixo)
  | { tipo: 'baixar'; cartas: string[] }
  | { tipo: 'adicionar'; jogo: number; cartas: string[] }
  | { tipo: 'descartar'; carta: string };

/** Testa uma jogada no motor; devolve o novo estado ou null se não for permitida */
function tentar(fn: () => Estado): Estado | null {
  try {
    return fn();
  } catch {
    return null;
  }
}

const ehDois = (c: Carta) => c.valor === 2;

/** Procura jogos que dá para baixar com as cartas da mão */
export function procurarJogos(mao: Carta[], usarCuringa: boolean): Carta[][] {
  const achados: Carta[][] = [];
  const naturais = mao.filter((c) => !ehDois(c));
  const dois = mao.filter(ehDois);

  // Trincas: 3+ do mesmo valor
  const porValor = new Map<number, Carta[]>();
  for (const c of naturais) porValor.set(c.valor, [...(porValor.get(c.valor) ?? []), c]);
  for (const grupo of porValor.values()) if (grupo.length >= 3) achados.push(grupo);

  // Sequências do mesmo naipe (sem repetir valor; Ás pode ser alto)
  const porNaipe = new Map<string, Carta[]>();
  for (const c of naturais) porNaipe.set(c.naipe, [...(porNaipe.get(c.naipe) ?? []), c]);
  for (const cartas of porNaipe.values()) {
    const porPosicao = new Map<number, Carta>();
    for (const c of cartas) {
      if (!porPosicao.has(c.valor)) porPosicao.set(c.valor, c);
      if (c.valor === 1 && !porPosicao.has(14)) porPosicao.set(14, c);
    }
    let corrida: Carta[] = [];
    for (let p = 1; p <= 15; p++) {
      const c = porPosicao.get(p);
      if (c && !corrida.includes(c)) corrida.push(c);
      else {
        if (corrida.length >= 3) achados.push(corrida);
        corrida = c ? [c] : [];
      }
    }
  }

  if (usarCuringa && dois.length > 0) {
    // Par do mesmo valor + um 2 = trinca
    for (const grupo of porValor.values()) if (grupo.length === 2) achados.push([...grupo, dois[0]]);
    // Duas cartas do mesmo naipe, vizinhas ou com um buraco, + um 2 do mesmo naipe
    for (const c1 of naturais) {
      for (const c2 of naturais) {
        if (c1.naipe !== c2.naipe || c2.valor <= c1.valor || c2.valor - c1.valor > 2) continue;
        const curinga = dois.find((d) => d.naipe === c1.naipe);
        if (curinga) achados.push([c1, c2, curinga]);
      }
    }
  }

  return achados.filter((j) => analisarJogo(j).valido);
}

/** Quanto uma carta ajuda a mão (para escolher o descarte) */
function utilidade(c: Carta, mao: Carta[], jogosAdversarios: Carta[][]): number {
  if (ehDois(c)) return 100;
  let u = 0;
  for (const o of mao) {
    if (o.id === c.id) continue;
    if (o.valor === c.valor) u += 3;
    if (o.naipe === c.naipe && !ehDois(o)) {
      const d = Math.abs(o.valor - c.valor);
      if (d === 1) u += 4;
      else if (d === 2) u += 2;
      if (c.valor === 1 && o.valor >= 12) u += 2; // Ás alto
    }
  }
  // Evita entregar carta que encaixa no jogo do adversário
  if (jogosAdversarios.some((j) => analisarJogo([...j, c]).valido)) u += 5;
  return u;
}

function escolherDescarte(estado: Estado, jogador: number): JogadaRobo {
  const mao = estado.maos[jogador];
  const adv = estado.equipes[1 - equipeDe(jogador)].jogos;
  const ordenadas = [...mao].sort(
    (a, b) => utilidade(a, mao, adv) - utilidade(b, mao, adv) || pontosCarta(b) - pontosCarta(a),
  );
  for (const c of ordenadas) {
    if (tentar(() => descartar(estado, jogador, c.id))) return { tipo: 'descartar', carta: c.id };
  }
  return { tipo: 'descartar', carta: ordenadas[0].id };
}

function decidirCompra(estado: Estado, jogador: number): JogadaRobo {
  const topo = estado.lixo.at(-1);
  if (topo) {
    const mao = estado.maos[jogador];
    const pares: [Carta, Carta][] = [];
    for (let i = 0; i < mao.length; i++)
      for (let k = i + 1; k < mao.length; k++)
        if (analisarJogo([topo, mao[i], mao[k]]).valido) pares.push([mao[i], mao[k]]);
    // Prefere pares sem 2; só gasta um 2 se o lixo for grande
    // e prefere formar sequência (vira canastra) a trinca
    const peso = (p: [Carta, Carta]) => p.filter(ehDois).length * 10 + (analisarJogo([topo, ...p]).tipo === 'trinca' ? 1 : 0);
    pares.sort((a, b) => peso(a) - peso(b));

    for (const par of pares) {
      if (par.some(ehDois) && estado.lixo.length < 4) continue;
      const jogada: JogadaLixo = { par: [par[0].id, par[1].id] };

      if (estaVulneravel(estado, equipeDe(jogador))) {
        // Precisa descer 75 pontos da mão: junta jogos extras até chegar lá
        let pontos = somaPontos(par);
        const resto = mao.filter((c) => c !== par[0] && c !== par[1]);
        const usados = new Set<string>();
        const novos: string[][] = [];
        for (const j of procurarJogos(resto, true).sort((a, b) => somaPontos(b) - somaPontos(a))) {
          if (pontos >= estado.config.minimoVulneravel) break;
          if (j.some((c) => usados.has(c.id))) continue;
          j.forEach((c) => usados.add(c.id));
          novos.push(j.map((c) => c.id));
          pontos += somaPontos(j);
        }
        if (pontos < estado.config.minimoVulneravel) continue;
        jogada.novosJogos = novos;
      }

      if (tentar(() => pegarLixo(estado, jogador, jogada))) return { tipo: 'lixo', ...jogada };
    }
  }
  return { tipo: 'comprar' };
}

function decidirNaVez(estado: Estado, jogador: number): JogadaRobo {
  const eq = equipeDe(jogador);
  const mao = estado.maos[jogador];
  const jogos = estado.equipes[eq].jogos;

  const ehSeq = (j: Carta[]) => analisarJogo(j).tipo === 'sequencia';
  const poucas = mao.length <= 4;
  // Carta que ainda pode crescer uma sequência (vizinha do mesmo naipe na mão) não vai para trinca
  const potencialSequencia = (c: Carta) =>
    mao.some((o) => o.id !== c.id && !ehDois(o) && o.naipe === c.naipe && o.valor !== c.valor &&
      (Math.abs(o.valor - c.valor) <= 2 || (c.valor === 1 && o.valor >= 12) || (o.valor === 1 && c.valor >= 12)));

  // 1) Encaixar cartas normais nas sequências da equipe (é o que vira canastra)
  for (const c of mao.filter((c) => !ehDois(c))) {
    for (let i = 0; i < jogos.length; i++) {
      if (!ehSeq(jogos[i])) continue;
      if (tentar(() => adicionarAoJogo(estado, jogador, i, [c.id]))) return { tipo: 'adicionar', jogo: i, cartas: [c.id] };
    }
  }

  // 2) Baixar sequências limpas (as maiores primeiro)
  for (const j of procurarJogos(mao, false).filter(ehSeq).sort((a, b) => b.length - a.length)) {
    const ids = j.map((c) => c.id);
    if (tentar(() => baixarJogo(estado, jogador, ids))) return { tipo: 'baixar', cartas: ids };
  }

  // 3) Trincas: só com cartas que não servem para sequência (ou quando sobram poucas cartas)
  for (const c of mao.filter((c) => !ehDois(c) && (poucas || !potencialSequencia(c)))) {
    for (let i = 0; i < jogos.length; i++) {
      if (ehSeq(jogos[i])) continue;
      if (tentar(() => adicionarAoJogo(estado, jogador, i, [c.id]))) return { tipo: 'adicionar', jogo: i, cartas: [c.id] };
    }
  }
  for (const j of procurarJogos(mao, false).filter((j) => !ehSeq(j))) {
    const livres = poucas ? j : j.filter((c) => !potencialSequencia(c));
    if (livres.length < 3) continue;
    const ids = livres.map((c) => c.id);
    if (tentar(() => baixarJogo(estado, jogador, ids))) return { tipo: 'baixar', cartas: ids };
  }

  // Enquanto a equipe não tem canastra limpa, guarda as sequências limpas (o 2 vai para trincas)
  const temLimpa = temCanastraLimpa(jogos);
  const podeSujar = (jogo: Carta[]) => temLimpa || analisarJogo(jogo).tipo === 'trinca';

  // 3) Usar um 2 para fechar canastra (sequência com 6 cartas), se já tem limpa
  if (temLimpa) {
    for (const d of mao.filter(ehDois)) {
      for (let i = 0; i < jogos.length; i++) {
        if (jogos[i].length === 6 && analisarJogo(jogos[i]).tipo === 'sequencia') {
          if (tentar(() => adicionarAoJogo(estado, jogador, i, [d.id]))) return { tipo: 'adicionar', jogo: i, cartas: [d.id] };
        }
      }
    }
  }

  // 4) Com poucas cartas, vale usar o 2 para baixar e tentar bater
  if (mao.length <= 7) {
    for (const j of procurarJogos(mao, true)) {
      if (!podeSujar(j)) continue;
      const ids = j.map((c) => c.id);
      if (tentar(() => baixarJogo(estado, jogador, ids))) return { tipo: 'baixar', cartas: ids };
    }
    for (const d of mao.filter(ehDois)) {
      for (let i = 0; i < jogos.length; i++) {
        if (!podeSujar(jogos[i])) continue;
        if (tentar(() => adicionarAoJogo(estado, jogador, i, [d.id]))) return { tipo: 'adicionar', jogo: i, cartas: [d.id] };
      }
    }
  }

  // 5) Descarta e passa a vez
  return escolherDescarte(estado, jogador);
}

/** Próxima jogada do robô sentado no lugar `jogador` (null se não for a vez dele) */
export function decidirJogadaRobo(estado: Estado, jogador: number): JogadaRobo | null {
  if (estado.vez !== jogador) return null;
  if (estado.fase === 'comprar') return decidirCompra(estado, jogador);
  if (estado.fase === 'jogar') return decidirNaVez(estado, jogador);
  return null;
}
