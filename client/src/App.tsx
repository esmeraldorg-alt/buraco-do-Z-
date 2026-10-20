import { useCallback, useEffect, useState } from 'react';
import { api, lerToken, salvarToken, type Usuario } from './api';
import { useConexao } from './conexao';
import { Abertura } from './telas/Abertura';
import { Entrar } from './telas/Entrar';
import { Lobby } from './telas/Lobby';
import { Espera } from './telas/Espera';
import { Mesa } from './telas/Mesa';

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
  if (!viuAbertura) tela = <Abertura aoEntrar={() => setViuAbertura(true)} />;
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
  else if (sala && sala.jogo) tela = <Mesa sala={sala} usuario={usuario} emitir={emitir} />;
  else if (sala) tela = <Espera sala={sala} usuario={usuario} emitir={emitir} />;
  else tela = <Lobby usuario={usuario} abertas={abertas} emitir={emitir} aoSairDaConta={sairDaConta} />;

  return (
    <>
      {tela}
      {usuario && pronto && !conectado && <div className="faixa-offline">Sem conexão — tentando reconectar…</div>}
      {aviso && <div className="toast">{aviso}</div>}
    </>
  );
}
