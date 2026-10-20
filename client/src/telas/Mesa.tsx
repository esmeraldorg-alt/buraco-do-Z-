// Mesa de jogo
import { useEffect, useMemo, useState } from 'react';
import { analisarJogo, type Carta as TCarta, type VisaoJogador } from '@buraco-do-ze/engine';
import type { Usuario } from '../api';
import type { Resposta, VisaoSala } from '../conexao';
import { Carta, VersoCarta, ordenarMao } from '../Carta';

interface Props {
  sala: VisaoSala;
  usuario: Usuario;
  emitir: (ev: string, dados?: unknown) => Promise<Resposta>;
  aoMenu: () => void;
}

const NOME_CANASTRA = { limpa: 'Limpa', suja: 'Suja', asAAs: 'Ás a Ás' } as const;

/** Monta a jogada de pegar o lixo a partir das cartas selecionadas: um par que casa + (opcional) um jogo extra */
function montarJogadaLixo(topo: TCarta, selecionadas: TCarta[]) {
  for (let i = 0; i < selecionadas.length; i++) {
    for (let j = i + 1; j < selecionadas.length; j++) {
      const par = [selecionadas[i], selecionadas[j]];
      if (!analisarJogo([topo, ...par]).valido) continue;
      const resto = selecionadas.filter((_, k) => k !== i && k !== j);
      if (resto.length === 0) return { par: [par[0].id, par[1].id] as [string, string] };
      if (analisarJogo(resto).valido) return { par: [par[0].id, par[1].id] as [string, string], novosJogos: [resto.map((c) => c.id)] };
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

  const mao = useMemo(() => ordenarMao(jogo.minhaMao), [jogo.minhaMao]);
  const selecionadas = mao.filter((c) => sel.includes(c.id));

  // Limpa a seleção de cartas que saíram da mão
  useEffect(() => {
    setSel((s) => s.filter((id) => jogo.minhaMao.some((c) => c.id === id)));
  }, [jogo.minhaMao]);

  useEffect(() => {
    if (!erro) return;
    const t = setTimeout(() => setErro(null), 3500);
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
    const jogada = montarJogadaLixo(topo, selecionadas);
    if (!jogada) return setErro('As cartas selecionadas não formam jogo com a carta do lixo');
    void jogar({ tipo: 'lixo', ...jogada });
  }

  function tocarJogo(indice: number) {
    if (!minhaVez || jogo.fase !== 'jogar') return;
    if (sel.length === 0) return setErro('Selecione cartas da mão para colocar nesse jogo');
    void jogar({ tipo: 'adicionar', jogo: indice, cartas: sel });
  }

  const outros = Array.from({ length: n - 1 }, (_, k) => (eu + k + 1) % n);

  let dica: string;
  if (jogo.fase === 'fimRodada' || jogo.fase === 'fimPartida') dica = 'Rodada encerrada';
  else if (!minhaVez) dica = `Vez de ${nomeJogador(jogo.vez)}`;
  else if (jogo.fase === 'comprar') dica = 'Sua vez: compre do monte, ou selecione o par e pegue o lixo';
  else dica = 'Baixe jogos, toque num jogo seu para encaixar cartas e descarte para passar a vez';

  return (
    <main className="mesa">
      <header className="placar">
        {[minhaEquipe, outraEquipe].map((eq) => (
          <div key={eq} className={`placar-equipe ${eq === minhaEquipe ? 'nos' : 'eles'}`}>
            <span className="placar-nome">{nomeEquipe(eq)}</span>
            {n === 4 && <span className="placar-desc">{descEquipe(eq)}</span>}
            <span className="placar-pontos">{jogo.equipes[eq].pontos}</span>
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
          {[minhaEquipe, outraEquipe].map((eq) => (
            <div key={eq} className={`morto ${jogo.mortoDisponivel[eq] ? '' : 'pego'}`}>
              {jogo.mortoDisponivel[eq] ? <VersoCarta tamanho="mini" /> : <span className="morto-vazio">✓</span>}
              <span className="rotulo">Morto {eq === minhaEquipe ? (n === 2 ? 'seu' : 'nosso') : n === 2 ? 'dele' : 'deles'}</span>
            </div>
          ))}
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
              onClick={() => jogar({ tipo: 'baixar', cartas: sel })}
              disabled={ocupado || sel.length < 3}
            >
              Baixar jogo
            </button>
            <button
              className="botao botao-secundario"
              onClick={() => jogar({ tipo: 'descartar', carta: sel[0] })}
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

      {erro && <div className="toast toast-erro">{erro}</div>}

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
