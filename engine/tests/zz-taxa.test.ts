import { it } from 'vitest';
import { comprarMonte, criarPartida, novaRodada, pegarLixo, baixarJogo, adicionarAoJogo, descartar, decidirJogadaRobo } from '../src/index';
it('taxa', () => {
  for (const n of [2,4] as const) { let rods=0, bat=0;
    for (let s=100;s<112;s++) {
      let e = criarPartida({ numJogadores: n, semente: s });
      while (e.fase !== 'fimPartida') {
        if (e.fase === 'fimRodada') { rods++; if (e.historico.at(-1)!.equipeQueBateu!==null) bat++; e = novaRodada(e); continue; }
        const a: any = decidirJogadaRobo(e, e.vez); const j = e.vez;
        e = a.tipo==='comprar'?comprarMonte(e,j):a.tipo==='lixo'?pegarLixo(e,j,a):a.tipo==='baixar'?baixarJogo(e,j,a.cartas):a.tipo==='adicionar'?adicionarAoJogo(e,j,a.jogo,a.cartas):descartar(e,j,a.carta);
      }
      rods++; if (e.historico.at(-1)!.equipeQueBateu!==null) bat++;
    }
    console.log('N', n, 'rodadas', rods, 'batidas', bat);
  }
}, 600000);
