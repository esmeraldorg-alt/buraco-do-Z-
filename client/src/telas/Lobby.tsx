// Lobby: criar sala, entrar por código, salas abertas e ranking do mês
import { FormEvent, useEffect, useState } from 'react';
import { api, type Usuario } from '../api';
import type { Resposta, ResumoSala } from '../conexao';

interface Props {
  usuario: Usuario;
  abertas: ResumoSala[];
  emitir: (ev: string, dados?: unknown) => Promise<Resposta>;
  aoSairDaConta: () => void;
}

export function Lobby({ usuario, abertas, emitir, aoSairDaConta }: Props) {
  const [codigo, setCodigo] = useState('');
  const [erro, setErro] = useState<string | null>(null);

  async function acao(ev: string, dados: unknown) {
    setErro(null);
    const r = await emitir(ev, dados);
    if (!r.ok) setErro(r.erro ?? 'Algo deu errado');
  }

  function entrarPorCodigo(e: FormEvent) {
    e.preventDefault();
    if (codigo.trim()) void acao('sala:entrar', { codigo: codigo.trim() });
  }

  return (
    <main className="pagina">
      <header className="topo">
        <h1 className="titulo titulo-pequeno">
          Buraco <span>do Zé</span>
        </h1>
        <div className="topo-usuario">
          <span>Olá, {usuario.apelido}</span>
          <button className="link" onClick={aoSairDaConta}>
            Sair
          </button>
        </div>
      </header>

      <section className="cartao">
        <h2>Nova partida</h2>
        <div className="botoes-lado">
          <button className="botao" onClick={() => acao('sala:criar', { numJogadores: 2 })}>
            Mano a mano
            <small>2 jogadores</small>
          </button>
          <button className="botao" onClick={() => acao('sala:criar', { numJogadores: 4 })}>
            Em duplas
            <small>4 jogadores</small>
          </button>
        </div>
      </section>

      <section className="cartao">
        <h2>Entrar com código</h2>
        <form className="linha-form" onSubmit={entrarPorCodigo}>
          <input
            value={codigo}
            onChange={(e) => setCodigo(e.target.value.toUpperCase())}
            placeholder="Ex.: K7MQ2"
            maxLength={5}
            aria-label="Código da sala"
            className="input-codigo"
          />
          <button className="botao">Entrar</button>
        </form>
        {erro && <p className="erro">{erro}</p>}
      </section>

      {abertas.length > 0 && (
        <section className="cartao">
          <h2>Salas esperando gente</h2>
          <ul className="lista-salas">
            {abertas.map((s) => (
              <li key={s.codigo}>
                <div>
                  <strong>{s.jogadores.join(', ')}</strong>
                  <span className="sutil">
                    {s.numJogadores === 2 ? 'Mano a mano' : 'Duplas'} · {s.vagas} {s.vagas === 1 ? 'vaga' : 'vagas'}
                  </span>
                </div>
                <button className="botao botao-pequeno" onClick={() => acao('sala:entrar', { codigo: s.codigo })}>
                  Entrar
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      <Ranking destaque={usuario.apelido} />
    </main>
  );
}

const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];

function nomeMes(m: string) {
  const [ano, mes] = m.split('-');
  return `${MESES[Number(mes) - 1]} de ${ano}`;
}

export function Ranking({ destaque }: { destaque?: string }) {
  const [mes, setMes] = useState<string | undefined>();
  const [dados, setDados] = useState<Awaited<ReturnType<typeof api.ranking>> | null>(null);
  const [erro, setErro] = useState(false);

  useEffect(() => {
    let vivo = true;
    api
      .ranking(mes)
      .then((d) => vivo && (setDados(d), setErro(false)))
      .catch(() => vivo && setErro(true));
    return () => {
      vivo = false;
    };
  }, [mes]);

  return (
    <section className="cartao">
      <div className="ranking-topo">
        <h2>Ranking</h2>
        {dados && (
          <select value={dados.mes} onChange={(e) => setMes(e.target.value)} aria-label="Mês do ranking">
            {dados.meses.map((m) => (
              <option key={m} value={m}>
                {nomeMes(m)}
              </option>
            ))}
          </select>
        )}
      </div>
      <p className="sutil">Partidas vencidas no mês. Zera todo mês.</p>
      {erro && <p className="erro">Não foi possível carregar o ranking.</p>}
      {dados && dados.ranking.length === 0 && <p className="vazio">Ninguém venceu ainda este mês. Bora jogar!</p>}
      {dados && dados.ranking.length > 0 && (
        <ol className="ranking">
          {dados.ranking.map((r, i) => (
            <li key={r.apelido} className={r.apelido === destaque ? 'eu' : ''}>
              <span className={`posicao p${i + 1}`}>{i + 1}</span>
              <span className="nome">{r.apelido}</span>
              <span className="vitorias">
                <strong>{r.vitorias}</strong> {r.vitorias === 1 ? 'vitória' : 'vitórias'}
              </span>
              <span className="sutil">{r.partidas} jogadas</span>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
