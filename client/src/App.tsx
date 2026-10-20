import { useCallback, useEffect, useRef, useState } from 'react';
import { api, lerToken, salvarToken, type Usuario } from './api';
import { useConexao } from './conexao';
import { Abertura } from './telas/Abertura';
import { Entrar } from './telas/Entrar';
import { Lobby } from './telas/Lobby';
import { Espera } from './telas/Espera';
import { Mesa } from './telas/Mesa';
import { desligarSom, ligarSom, somLigadoSalvo } from './som';

/** Código de sala vindo do link compartilhado (?sala=ABCDE) */
function salaDoLink(): string | null {
  const c = new URLSearchParams(location.search).get('sala');
  return c ? c.toUpperCase() : null;
}

export function App() {
  const [viuAbertura, setViuAbertura] = useState(false);
  const [token, setToken] = useState<string | null>(lerToken);
  const [usuario, setUsuario] = useState<Usuario | null>(null);
  const [conviteSala, setConviteSala] = useState<string | null>(salaDoLink);
  const [aviso, setAviso] = useState<string | null>(null);
  const [somLigado, setSomLigado] = useState(somLigadoSalvo);

  function alternarSom() {
    if (somLigado) desligarSom();
    else ligarSom();
    setSomLigado(!somLigado);
  }

  const sairDaConta = useCallback(() => {
    if (token) void api.sair(token).catch(() => {});
    salvarToken(null);
    setToken(null);
    setUsuario(null);
  }, [token]);

  const expirou = useCallback(() => {
    salvarToken(null);
    setToken(null);
    setUsuario(null);
  }, []);

  const { sala, abertas, conectado, pronto, emitir } = useConexao(usuario ? token : null, expirou);

  // ---------- botão Voltar (celular / navegador) ----------
  // Na sala ou na partida: volta ao menu principal. No menu: pergunta se quer sair.
  const [confirmarSaida, setConfirmarSaida] = useState(false);
  /** Partida que a pessoa deixou no meio (para poder voltar) */
  const [partidaPendente, setPartidaPendente] = useState<string | null>(null);
  const saindoRef = useRef(false);

  const voltarAoMenu = useCallback(() => {
    if (sala?.jogo && sala.jogo.fase !== 'fimPartida') setPartidaPendente(sala.codigo);
    void emitir('sala:sair');
  }, [sala, emitir]);

  const voltarAoMenuRef = useRef(voltarAoMenu);
  voltarAoMenuRef.current = voltarAoMenu;
  const naSalaRef = useRef(false);
  naSalaRef.current = !!sala;

  useEffect(() => {
    if (!viuAbertura) return;
    // Entrada extra no histórico: o Voltar cai aqui em vez de sair do jogo
    history.pushState({ buraco: true }, '');
    const aoVoltar = () => {
      if (saindoRef.current) return;
      history.pushState({ buraco: true }, '');
      if (naSalaRef.current) voltarAoMenuRef.current();
      else setConfirmarSaida(true);
    };
    window.addEventListener('popstate', aoVoltar);
    return () => window.removeEventListener('popstate', aoVoltar);
  }, [viuAbertura]);

  function sairDoJogo() {
    setConfirmarSaida(false);
    saindoRef.current = true;
    desligarSom();
    setSomLigado(somLigadoSalvo());
    history.go(-2);
    // Se não houver página anterior (app aberto direto), fica aqui e avisa
    setTimeout(() => {
      saindoRef.current = false;
      try {
        window.close();
      } catch {
        /* nada */
      }
      setAviso('Pode fechar o aplicativo');
    }, 500);
  }

  async function voltarParaPartida() {
    if (!partidaPendente) return;
    const r = await emitir('sala:entrar', { codigo: partidaPendente });
    setPartidaPendente(null);
    if (!r.ok) setAviso(r.erro ?? 'Essa partida já acabou');
  }

  useEffect(() => {
    if (sala) setPartidaPendente(null);
  }, [sala]);

  // Confere o login guardado
  useEffect(() => {
    if (!token || usuario) return;
    api
      .eu(token)
      .then((r) => setUsuario(r.usuario))
      .catch(() => expirou());
  }, [token, usuario, expirou]);

  // Entra na sala do link de convite
  useEffect(() => {
    if (!conviteSala || !pronto || sala) return;
    const codigo = conviteSala;
    setConviteSala(null);
    history.replaceState(null, '', location.pathname);
    void emitir('sala:entrar', { codigo }).then((r) => !r.ok && setAviso(r.erro ?? 'Não foi possível entrar na sala'));
  }, [conviteSala, pronto, sala, emitir]);

  useEffect(() => {
    if (!aviso) return;
    const t = setTimeout(() => setAviso(null), 3500);
    return () => clearTimeout(t);
  }, [aviso]);

  let tela;
  if (!viuAbertura) {
    tela = (
      <Abertura
        aoEntrar={() => {
          setViuAbertura(true);
          if (somLigado) ligarSom(); // o navegador só deixa tocar depois de um toque
        }}
      />
    );
  }
  else if (!token || !usuario) {
    tela = token ? (
      <div className="carregando">Carregando…</div>
    ) : (
      <Entrar
        aoEntrar={(u, t) => {
          salvarToken(t);
          setToken(t);
          setUsuario(u);
        }}
      />
    );
  } else if (!pronto) tela = <div className="carregando">Conectando…</div>;
  else if (sala && sala.jogo) tela = <Mesa sala={sala} usuario={usuario} emitir={emitir} aoMenu={voltarAoMenu} />;
  else if (sala) tela = <Espera sala={sala} usuario={usuario} emitir={emitir} />;
  else
    tela = (
      <Lobby
        usuario={usuario}
        abertas={abertas}
        emitir={emitir}
        aoSairDaConta={sairDaConta}
        partidaPendente={partidaPendente}
        aoVoltarParaPartida={voltarParaPartida}
      />
    );

  return (
    <>
      {tela}
      {viuAbertura && (
        <button
          className="botao-som"
          onClick={alternarSom}
          aria-label={somLigado ? 'Desligar som ambiente' : 'Ligar som ambiente'}
          title={somLigado ? 'Desligar som' : 'Ligar som'}
        >
          {somLigado ? '🔊' : '🔇'}
        </button>
      )}
      {usuario && pronto && !conectado && <div className="faixa-offline">Sem conexão — tentando reconectar…</div>}
      {aviso && <div className="toast">{aviso}</div>}
      {confirmarSaida && (
        <div className="sobreposicao" onClick={() => setConfirmarSaida(false)}>
          <div className="janela centro" role="alertdialog" aria-labelledby="titulo-sair" onClick={(e) => e.stopPropagation()}>
            <h2 id="titulo-sair">Quer sair do Buraco do Zé?</h2>
            <p className="sutil">Seu login fica salvo para a próxima vez.</p>
            <div className="botoes-lado">
              <button className="botao botao-secundario" onClick={() => setConfirmarSaida(false)} autoFocus>
                Não, continuar
              </button>
              <button className="botao" onClick={sairDoJogo}>
                Sim, sair
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
