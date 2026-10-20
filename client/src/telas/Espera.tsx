// Sala de espera: código para compartilhar, lugares e botão de começar
import { useState } from 'react';
import type { Usuario } from '../api';
import type { Resposta, VisaoSala } from '../conexao';

interface Props {
  sala: VisaoSala;
  usuario: Usuario;
  emitir: (ev: string, dados?: unknown) => Promise<Resposta>;
}

export function Espera({ sala, usuario, emitir }: Props) {
  const [erro, setErro] = useState<string | null>(null);
  const [copiado, setCopiado] = useState(false);
  const souDono = sala.donoId === usuario.id;
  const cheia = sala.lugares.every((l) => l !== null);
  const link = `${location.origin}/?sala=${sala.codigo}`;

  async function acao(ev: string, dados: unknown = {}) {
    setErro(null);
    const r = await emitir(ev, dados);
    if (!r.ok) setErro(r.erro ?? 'Algo deu errado');
  }

  async function compartilhar() {
    const texto = `Bora jogar Buraco do Zé! Sala ${sala.codigo}`;
    try {
      if (navigator.share) await navigator.share({ title: 'Buraco do Zé', text: texto, url: link });
      else {
        await navigator.clipboard.writeText(`${texto} — ${link}`);
        setCopiado(true);
        setTimeout(() => setCopiado(false), 2000);
      }
    } catch {
      /* cancelado */
    }
  }

  const nomeLugar = (i: number) =>
    sala.numJogadores === 2 ? `Jogador ${i + 1}` : `Dupla ${i % 2 === 0 ? 'A' : 'B'}`;

  return (
    <main className="pagina pagina-estreita">
      <section className="cartao centro">
        <p className="sutil">Código da sala</p>
        <p className="codigo-sala">{sala.codigo}</p>
        <button className="botao botao-secundario" onClick={compartilhar}>
          {copiado ? 'Link copiado!' : 'Chamar os amigos'}
        </button>
      </section>

      <section className="cartao">
        <h2>{sala.numJogadores === 2 ? 'Mano a mano' : 'Duplas'}</h2>
        {sala.numJogadores === 4 && <p className="sutil">Toque num lugar vazio para escolher sua dupla.</p>}
        {souDono && <p className="sutil">Sem gente para jogar? Coloque robôs nos lugares vazios.</p>}
        <ul className={`lugares lugares-${sala.numJogadores}`}>
          {sala.lugares.map((l, i) => (
            <li key={i} className={`lugar ${sala.numJogadores === 4 ? (i % 2 === 0 ? 'dupla-a' : 'dupla-b') : ''}`}>
              <span className="sutil">{nomeLugar(i)}</span>
              {l?.robo ? (
                <div className="lugar-linha">
                  <strong>🤖 {l.apelido}</strong>
                  {souDono && (
                    <button className="link" onClick={() => acao('sala:robo', { lugar: i, colocar: false })}>
                      Tirar
                    </button>
                  )}
                </div>
              ) : l ? (
                <strong>
                  {l.apelido}
                  {l.usuarioId === sala.donoId && ' ★'}
                  {l.usuarioId === usuario.id && ' (você)'}
                </strong>
              ) : (
                <div className="lugar-linha">
                  {sala.numJogadores === 2 ? (
                    <span className="vazio">Aguardando…</span>
                  ) : (
                    <button className="link" onClick={() => acao('sala:lugar', { lugar: i })}>
                      Sentar aqui
                    </button>
                  )}
                  {souDono && (
                    <button className="botao botao-pequeno botao-secundario" onClick={() => acao('sala:robo', { lugar: i, colocar: true })}>
                      🤖 Colocar robô
                    </button>
                  )}
                </div>
              )}
            </li>
          ))}
        </ul>
        {erro && <p className="erro">{erro}</p>}
        {souDono ? (
          <button className="botao botao-grande" disabled={!cheia} onClick={() => acao('sala:iniciar')}>
            {cheia ? 'Começar partida' : 'Aguardando jogadores…'}
          </button>
        ) : (
          <p className="vazio">{cheia ? 'Aguardando o dono da sala começar…' : 'Aguardando jogadores…'}</p>
        )}
        <button className="link link-sair" onClick={() => acao('sala:sair')}>
          Sair da sala
        </button>
      </section>
    </main>
  );
}
