// Mesa de jogo
import { useEffect, useMemo, useState } from 'react';
import { analisarJogo, somaPontos, type Carta as TCarta, type VisaoJogador } from '@buraco-do-ze/engine';
import type { Usuario } from '../api';
import type { Resposta, VisaoSala } from '../conexao';
import { Carta, NOME_ORDEM, VersoCarta, ordenarMao, type OrdemMao } from '../Carta';

interface Props {
  sala: VisaoSala;
  usuario: Usuario;
  emitir: (ev: string, dados?: unknown) => Promise<Resposta>;
  aoMenu: () => void;
}

const NOME_CANASTRA = { limpa: 'Limpa', suja: 'Suja', asAAs: 'Ás a Ás' } as const;

type Adicao = { jogo: number; cartas: string[] };

/**
 * Divide as cartas selecionadas em jogos novos e/ou encaixes nos jogos que a equipe já tem na mesa.
 * Usado no "Pegar lixo" do vulnerável: o par + as cartas para somar 75 pontos.
 */
function dividirEmJogos(cartas: TCarta[], jogosMesa: TCarta[][]): { novos: string[][]; adicoes: Adicao[] } | null {
  const extras = new Map<number, TCarta[]>(); // cartas encaixadas em cada jogo da mesa

  function resolver(resto: TCarta[], novos: TCarta[][]): TCarta[][] | null {
    if (resto.length === 0) return novos;
    const [c, ...outras] = resto;
    // (a) encaixar num jogo da mesa
    for (let i = 0; i < jogosMesa.length; i++) {
      const ja = extras.get(i) ?? [];
      if (analisarJogo([...jogosMesa[i], ...ja, c]).valido) {
        extras.set(i, [...ja, c]);
        const r = resolver(outras, novos);
        if (r) return r;
        extras.set(i, ja);
      }
    }
    // (b) começar um jogo novo com essa carta e outras do mesmo naipe (ou um 2)
    const candidatas = outras.filter((o) => o.naipe === c.naipe || o.valor === 2);
    const total = 1 << candidatas.length;
    for (let m = 1; m < total && candidatas.length <= 12; m++) {
      const grupo = [c, ...candidatas.filter((_, k) => m & (1 << k))];
      if (grupo.length < 3 || !analisarJogo(grupo).valido) continue;
      const r = resolver(
        outras.filter((o) => !grupo.includes(o)),
        [...novos, grupo],
      );
      if (r) return r;
    }
    return null;
  }

  const novos = resolver(cartas, []);
  if (!novos) return null;
  return {
    novos: novos.map((g) => g.map((x) => x.id)),
    adicoes: [...extras.entries()].filter(([, cs]) => cs.length).map(([jogo, cs]) => ({ jogo, cartas: cs.map((x) => x.id) })),
  };
}

/** Monta a jogada de pegar o lixo: um par que casa com a carta do lixo + (opcional) outros jogos/encaixes */
function montarJogadaLixo(topo: TCarta, selecionadas: TCarta[], jogosMesa: TCarta[][]) {
  for (let i = 0; i < selecionadas.length; i++) {
    for (let j = i + 1; j < selecionadas.length; j++) {
      const par = [selecionadas[i], selecionadas[j]];
      if (!analisarJogo([topo, ...par]).valido) continue;
      const resto = selecionadas.filter((_, k) => k !== i && k !== j);
      const ids = [par[0].id, par[1].id] as [string, string];
      if (resto.length === 0) return { par: ids };
      const div = dividirEmJogos(resto, jogosMesa);
      if (div) return { par: ids, novosJogos: div.novos, adicoes: div.adicoes };
    }
  }
  return null;
}

export function Mesa({ sala, usuario, emitir, aoMenu }: Props) {
  const jogo = sala.jogo as VisaoJogador;
  const eu = jogo.eu;
  const n = sala.numJogadores;
  const minhaEquipe = jogo.minhaEquipe;
  const outraEquipe = 1 - minhaEquipe;
  const minhaVez = jogo.vez === eu && (jogo.fase === 'comprar' || jogo.fase === 'jogar');

  const [sel, setSel] = useState<string[]>([]);
  const [erro, setErro] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const [verLixo, setVerLixo] = useState(false);

  const [ordem, setOrdem] = useState<OrdemMao>(() => {
    try {
      const o = localStorage.getItem('buraco-do-ze:ordem');
      return o === 'numero' || o === 'chegada' ? o : 'naipe';
    } catch {
      return 'naipe';
    }
  });
  function trocarOrdem() {
    const proxima: OrdemMao = ordem === 'naipe' ? 'numero' : ordem === 'numero' ? 'chegada' : 'naipe';
    setOrdem(proxima);
    try {
      localStorage.setItem('buraco-do-ze:ordem', proxima);
    } catch {
      /* sem armazenamento */
    }
  }
  const mao = useMemo(() => ordenarMao(jogo.minhaMao, ordem), [jogo.minhaMao, ordem]);
  const selecionadas = mao.filter((c) => sel.includes(c.id));

  // Limpa a seleção de cartas que saíram da mão
  useEffect(() => {
    setSel((s) => s.filter((id) => jogo.minhaMao.some((c) => c.id === id)));
  }, [jogo.minhaMao]);

  useEffect(() => {
    if (!erro) return;
    const t = setTimeout(() => setErro(null), 6000);
    return () => clearTimeout(t);
  }, [erro]);

  const nomeJogador = (i: number) => sala.lugares[i]?.apelido ?? `Jogador ${i + 1}`;
  const membros = (eq: number) => sala.lugares.map((_, i) => i).filter((i) => i % 2 === eq);
  const nomeEquipe = (eq: number) =>
    n === 2 ? (eq === minhaEquipe ? 'Você' : nomeJogador(1 - eu)) : eq === minhaEquipe ? 'Nós' : 'Eles';
  const descEquipe = (eq: number) => (n === 4 ? membros(eq).map(nomeJogador).join(' e ') : '');

  async function jogar(acao: Record<string, unknown>) {
    if (ocupado) return;
    setOcupado(true);
    setErro(null);
    const r = await emitir('jogo:acao', acao);
    setOcupado(false);
    if (!r.ok) setErro(r.erro ?? 'Jogada inválida');
    else setSel([]);
  }

  function alternar(id: string) {
    setSel((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));
  }

  function pegarLixo() {
    const topo = jogo.lixo.at(-1);
    if (!topo) return setErro('O lixo está vazio');
    if (selecionadas.length < 2) return setErro('Selecione as duas cartas da mão que fazem sequência com a carta do lixo');
    const jogada = montarJogadaLixo(topo, selecionadas, minhaEq.jogos);
    if (!jogada)
      return setErro(
        vulneravel
          ? 'Selecione o par que casa com a carta do lixo e as cartas dos jogos que somam 75 pontos (todas precisam formar jogo)'
          : 'As cartas selecionadas não formam jogo com a carta do lixo',
      );
    if (vulneravel) {
      const pontos = somaPontos(selecionadas);
      if (pontos < jogo.minimoVulneravel)
        return setErro(
          `Vulnerável: para pegar o lixo, desça pelo menos ${jogo.minimoVulneravel} pontos da mão. As cartas selecionadas somam ${pontos}.`,
        );
    }
    void jogar({ tipo: 'lixo', ...jogada });
  }

  /** Avisa antes de mandar uma jogada que deixaria a mão vazia ou com 1 carta sem poder bater */
  function bloqueiaBatida(quantasSaem: number, descartando = false, pontosDescendo = 0): boolean {
    const sobram = mao.length - quantasSaem;
    if (sobram >= 2 || (descartando && sobram === 1)) return false;
    if (temLimpa) return false;
    if (!minhaEq.pegouMorto && sobraMorto) {
      // Vai pegar o morto: vulnerável precisa ter descido 75 nesta jogada
      const total = jogo.descidoNaVez + pontosDescendo;
      if (!vulneravel || total >= jogo.minimoVulneravel) return false;
      setErro(
        `Vulnerável: para bater e pegar o morto, desça pelo menos ${jogo.minimoVulneravel} pontos nesta jogada (até agora: ${total}). Fique com pelo menos 2 cartas.`,
      );
      return true;
    }
    setErro(
      'Ainda não dá para bater: sua equipe precisa de uma canastra limpa. Baixe deixando pelo menos 2 cartas na mão, ou descarte uma carta.',
    );
    return true;
  }

  function tocarJogo(indice: number) {
    if (!minhaVez || jogo.fase !== 'jogar') return;
    if (sel.length === 0) return setErro('Selecione cartas da mão para colocar nesse jogo');
    if (bloqueiaBatida(sel.length, false, somaPontos(selecionadas))) return;
    void jogar({ tipo: 'adicionar', jogo: indice, cartas: sel });
  }

  const outros = Array.from({ length: n - 1 }, (_, k) => (eu + k + 1) % n);

  // Pode zerar a mão agora? 1ª batida (pegar o morto) sempre pode; a 2ª precisa de canastra limpa
  const minhaEq = jogo.equipes[minhaEquipe];
  const temLimpa = minhaEq.jogos.some((j) => {
    const c = analisarJogo(j).canastra;
    return c === 'limpa' || c === 'asAAs';
  });
  // Os mortos são de quem bater primeiro: se ainda tem algum na mesa e a equipe não pegou, pode bater
  const sobraMorto = jogo.mortoDisponivel.some(Boolean);
  const vulneravel = minhaEq.vulneravel;
  const faltaVulneravel = vulneravel && jogo.descidoNaVez < jogo.minimoVulneravel;
  const podeBater = (!minhaEq.pegouMorto && sobraMorto && !faltaVulneravel) || temLimpa;

  let dica: string;
  if (jogo.fase === 'fimRodada' || jogo.fase === 'fimPartida') dica = 'Rodada encerrada';
  else if (!minhaVez) dica = `Vez de ${nomeJogador(jogo.vez)}`;
  else if (jogo.fase === 'comprar')
    dica = vulneravel
      ? `Vulnerável: para pegar o lixo, selecione o par + jogos que somem ${jogo.minimoVulneravel} pontos e toque em "Pegar lixo". Ou compre do monte.`
      : 'Sua vez: compre do monte, ou selecione o par e pegue o lixo';
  else if (!minhaEq.pegouMorto && sobraMorto && faltaVulneravel && mao.length <= 6)
    dica = `Vulnerável: para bater e pegar o morto, desça ${jogo.minimoVulneravel} pontos nesta jogada (já desceu ${jogo.descidoNaVez}).`;
  else if (!podeBater && mao.length <= 5)
    dica = minhaEq.pegouMorto
      ? 'Para bater (zerar a mão) sua equipe precisa de uma canastra LIMPA. Fique com pelo menos 2 cartas e descarte uma.'
      : 'Os mortos viraram monte: para bater, sua equipe precisa de uma canastra LIMPA. Fique com pelo menos 2 cartas.';
  else dica = 'Baixe jogos, toque num jogo seu para encaixar cartas e descarte para passar a vez';

  return (
    <main className="mesa">
      <header className="placar">
        {[minhaEquipe, outraEquipe].map((eq) => (
          <div key={eq} className={`placar-equipe ${eq === minhaEquipe ? 'nos' : 'eles'}`}>
            <span className="placar-nome">{nomeEquipe(eq)}</span>
            {n === 4 && <span className="placar-desc">{descEquipe(eq)}</span>}
            <span className="placar-pontos">{jogo.equipes[eq].pontos}</span>
            {(jogo.equipes[eq].rodadaMesa > 0 || jogo.equipes[eq].rodadaCanastras > 0) && (
              <span className="placar-rodada" title="Pontos na mesa nesta rodada (cartas + canastras)">
                +{jogo.equipes[eq].rodadaMesa + jogo.equipes[eq].rodadaCanastras} na mesa
              </span>
            )}
            {jogo.equipes[eq].vulneravel && <span className="selo selo-vulneravel">Vulnerável</span>}
          </div>
        ))}
        <div className="placar-info">
          <span>Rodada {jogo.rodada + 1}</span>
          <span className="sutil">Sala {sala.codigo}</span>
          <button className="link link-menu" onClick={aoMenu}>
            ← Menu
          </button>
        </div>
      </header>

      <div className="adversarios">
        {outros.map((i) => (
          <div
            key={i}
            className={`adversario ${jogo.vez === i ? 'na-vez' : ''} ${i % 2 === minhaEquipe ? 'parceiro' : ''} ${
              sala.lugares[i]?.conectado === false ? 'offline' : ''
            }`}
          >
            <span className="adv-nome">
              {sala.lugares[i]?.robo && '🤖 '}
              {nomeJogador(i)}
              {i % 2 === minhaEquipe && n === 4 && <small> (parceiro)</small>}
            </span>
            <span className="adv-cartas">
              <VersoCarta tamanho="mini" /> {jogo.cartasNaMao[i]}
            </span>
            {sala.lugares[i]?.conectado === false && <span className="selo">saiu</span>}
          </div>
        ))}
      </div>

      <AreaJogos titulo={n === 2 ? `Jogos de ${nomeEquipe(outraEquipe)}` : 'Jogos deles'} jogos={jogo.equipes[outraEquipe].jogos} />

      <section className="centro-mesa">
        <button
          className="monte"
          onClick={() => jogar({ tipo: 'comprar' })}
          disabled={!minhaVez || jogo.fase !== 'comprar' || ocupado}
          aria-label="Comprar do monte"
        >
          <VersoCarta />
          <span className="contador">{jogo.cartasNoMonte}</span>
          <span className="rotulo">Monte</span>
        </button>

        <div className="mortos">
          {[0, 1].map((i) => {
            const destino = jogo.destinoMortos?.[i] ?? (jogo.mortoDisponivel[i] ? null : 'monte');
            const quem = (eq: number) => (eq === minhaEquipe ? (n === 2 ? 'Você pegou' : 'Nós pegamos') : n === 2 ? 'Ele pegou' : 'Eles pegaram');
            return (
              <div key={i} className={`morto ${destino === null ? '' : 'pego'}`}>
                {destino === null ? (
                  <VersoCarta tamanho="mini" />
                ) : (
                  <span className="morto-vazio">{destino === 'monte' ? '↻' : '✓'}</span>
                )}
                <span className="rotulo">
                  {destino === null ? `Morto ${i + 1}` : destino === 'monte' ? 'Virou monte' : quem(destino)}
                </span>
              </div>
            );
          })}
        </div>

        <button
          className="lixo"
          onClick={() => (minhaVez && jogo.fase === 'comprar' && sel.length >= 2 ? pegarLixo() : setVerLixo(true))}
          aria-label="Lixo"
        >
          {jogo.lixo.length === 0 ? (
            <span className="lixo-vazio">vazio</span>
          ) : (
            <span className="lixo-pilha">
              {jogo.lixo.slice(-4, -1).map((c) => (
                <span key={c.id} className="lixo-baixo">
                  <Carta carta={c} tamanho="mini" />
                </span>
              ))}
              <Carta carta={jogo.lixo.at(-1)!} tamanho="mesa" />
            </span>
          )}
          <span className="rotulo">Lixo ({jogo.lixo.length})</span>
        </button>
      </section>

      <AreaJogos
        titulo={n === 2 ? 'Seus jogos' : 'Nossos jogos'}
        jogos={jogo.equipes[minhaEquipe].jogos}
        aoTocar={minhaVez && jogo.fase === 'jogar' ? tocarJogo : undefined}
        destaque={minhaVez && jogo.fase === 'jogar' && sel.length > 0}
      />

      <div className={`dica ${minhaVez ? 'minha-vez' : ''}`}>{dica}</div>

      <div className="mao-topo">
        <span className="sutil">
          Sua mão · {mao.length} cartas
          {selecionadas.length > 0 && <strong className="pontos-sel"> · selecionadas: {somaPontos(selecionadas)} pts</strong>}
        </span>
        <button className="link link-ordem" onClick={trocarOrdem} title="Mudar a ordem das cartas">
          ↕ {NOME_ORDEM[ordem]}
        </button>
      </div>

      <div className="mao" role="group" aria-label="Sua mão">
        {mao.map((c) => (
          <Carta key={c.id} carta={c} selecionada={sel.includes(c.id)} onClick={() => alternar(c.id)} />
        ))}
      </div>

      <div className="acoes">
        {minhaVez && jogo.fase === 'comprar' && (
          <>
            <button className="botao" onClick={() => jogar({ tipo: 'comprar' })} disabled={ocupado}>
              Comprar
            </button>
            <button className="botao botao-secundario" onClick={pegarLixo} disabled={ocupado || jogo.lixo.length === 0}>
              Pegar lixo
            </button>
          </>
        )}
        {minhaVez && jogo.fase === 'jogar' && (
          <>
            <button
              className="botao"
              onClick={() => !bloqueiaBatida(sel.length, false, somaPontos(selecionadas)) && jogar({ tipo: 'baixar', cartas: sel })}
              disabled={ocupado || sel.length < 3}
            >
              Baixar jogo
            </button>
            <button
              className="botao botao-secundario"
              onClick={() => !bloqueiaBatida(1, true) && jogar({ tipo: 'descartar', carta: sel[0] })}
              disabled={ocupado || sel.length !== 1}
            >
              Descartar
            </button>
          </>
        )}
        {sel.length > 0 && (
          <button className="botao botao-fantasma" onClick={() => setSel([])}>
            Limpar ({sel.length})
          </button>
        )}
      </div>

      {erro && (
        <div className="toast toast-erro" role="alert" onClick={() => setErro(null)}>
          {erro}
        </div>
      )}

      {verLixo && (
        <div className="sobreposicao" onClick={() => setVerLixo(false)}>
          <div className="janela" onClick={(e) => e.stopPropagation()}>
            <h2>Lixo ({jogo.lixo.length} cartas)</h2>
            <div className="lixo-todo">
              {jogo.lixo.map((c) => (
                <Carta key={c.id} carta={c} tamanho="mesa" />
              ))}
              {jogo.lixo.length === 0 && <p className="vazio">O lixo está vazio.</p>}
            </div>
            <p className="sutil">Para pegar: na sua vez, selecione o par da mão e toque em "Pegar lixo".</p>
            <button className="botao" onClick={() => setVerLixo(false)}>
              Fechar
            </button>
          </div>
        </div>
      )}

      {(jogo.fase === 'fimRodada' || jogo.fase === 'fimPartida') && (
        <FimRodada sala={sala} usuario={usuario} emitir={emitir} nomeEquipe={nomeEquipe} />
      )}
    </main>
  );
}

function AreaJogos({
  titulo,
  jogos,
  aoTocar,
  destaque,
}: {
  titulo: string;
  jogos: TCarta[][];
  aoTocar?: (i: number) => void;
  destaque?: boolean;
}) {
  return (
    <section className={`area-jogos ${destaque ? 'destaque' : ''}`}>
      <h3>{titulo}</h3>
      {jogos.length === 0 ? (
        <p className="vazio">Nenhum jogo baixado</p>
      ) : (
        <div className="jogos">
          {jogos.map((j, i) => {
            const a = analisarJogo(j);
            return (
              <button
                key={i}
                className={`jogo ${a.canastra ? `canastra canastra-${a.canastra}` : ''} ${a.tipo === 'trinca' ? 'trinca' : ''}`}
                onClick={aoTocar ? () => aoTocar(i) : undefined}
                disabled={!aoTocar}
              >
                {a.canastra && <span className="selo-canastra">{NOME_CANASTRA[a.canastra]}</span>}
                {a.tipo === 'trinca' && <span className="selo-canastra">Trinca</span>}
                <span className="jogo-cartas">
                  {j.map((c) => (
                    <Carta key={c.id} carta={c} tamanho="mini" curinga={a.curinga?.id === c.id} />
                  ))}
                </span>
              </button>
            );
          })}
        </div>
      )}
    </section>
  );
}

function FimRodada({
  sala,
  usuario,
  emitir,
  nomeEquipe,
}: {
  sala: VisaoSala;
  usuario: Usuario;
  emitir: (ev: string, dados?: unknown) => Promise<Resposta>;
  nomeEquipe: (eq: number) => string;
}) {
  const jogo = sala.jogo!;
  const r = jogo.historico.at(-1);
  const fimPartida = jogo.fase === 'fimPartida';
  const souDono = sala.donoId === usuario.id;
  const [erro, setErro] = useState<string | null>(null);
  const venci = fimPartida && jogo.vencedor === jogo.minhaEquipe;
  const n2 = sala.numJogadores === 2;

  async function acao(ev: string, dados: unknown = {}) {
    const x = await emitir(ev, dados);
    if (!x.ok) setErro(x.erro ?? 'Algo deu errado');
  }

  const ordem = [jogo.minhaEquipe, 1 - jogo.minhaEquipe];

  return (
    <div className="sobreposicao">
      <div className="janela">
        {fimPartida ? (
          <h2 className={venci ? 'vitoria' : ''}>{venci ? 'Vitória! 🏆' : n2 ? `${nomeEquipe(jogo.vencedor!)} venceu` : 'Eles venceram'}</h2>
        ) : (
          <h2>Fim da rodada {jogo.rodada + 1}</h2>
        )}
        {r && (
          <p className="sutil">
            {r.equipeQueBateu === null
              ? 'O monte acabou.'
              : r.equipeQueBateu === jogo.minhaEquipe
                ? n2 ? 'Você bateu.' : 'Nós batemos.'
                : n2 ? `${nomeEquipe(r.equipeQueBateu)} bateu.` : 'Eles bateram.'}
          </p>
        )}
        {r && (
          <table className="tabela-pontos">
            <thead>
              <tr>
                <th />
                {ordem.map((eq) => (
                  <th key={eq}>{nomeEquipe(eq)}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>Cartas na mesa</td>
                {ordem.map((eq) => (
                  <td key={eq}>{r.equipes[eq].pontosMesa}</td>
                ))}
              </tr>
              <tr>
                <td>Canastras</td>
                {ordem.map((eq) => (
                  <td key={eq}>{r.equipes[eq].bonusCanastras}</td>
                ))}
              </tr>
              <tr>
                <td>Batida</td>
                {ordem.map((eq) => (
                  <td key={eq}>{r.equipes[eq].bonusBatida}</td>
                ))}
              </tr>
              <tr>
                <td>Cartas na mão</td>
                {ordem.map((eq) => (
                  <td key={eq} className="negativo">
                    −{r.equipes[eq].descontoMao}
                  </td>
                ))}
              </tr>
              <tr className="total">
                <td>Rodada</td>
                {ordem.map((eq) => (
                  <td key={eq}>{r.equipes[eq].total}</td>
                ))}
              </tr>
              <tr className="total">
                <td>Placar</td>
                {ordem.map((eq) => (
                  <td key={eq}>{jogo.equipes[eq].pontos}</td>
                ))}
              </tr>
            </tbody>
          </table>
        )}
        {erro && <p className="erro">{erro}</p>}
        {!fimPartida && (
          <button className="botao botao-grande" onClick={() => acao('jogo:acao', { tipo: 'novaRodada' })}>
            Próxima rodada
          </button>
        )}
        {fimPartida && (
          <div className="botoes-coluna">
            {souDono && (
              <button className="botao botao-grande" onClick={() => acao('sala:reiniciar')}>
                Jogar de novo
              </button>
            )}
            <button className="botao botao-secundario" onClick={() => acao('sala:sair')}>
              Voltar ao início
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
