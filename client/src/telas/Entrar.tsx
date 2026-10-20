// Login e cadastro por apelido + senha
import { FormEvent, useState } from 'react';
import { api, type Usuario } from '../api';

export function Entrar({ aoEntrar }: { aoEntrar: (u: Usuario, token: string) => void }) {
  const [modo, setModo] = useState<'entrar' | 'cadastrar'>('entrar');
  const [apelido, setApelido] = useState('');
  const [senha, setSenha] = useState('');
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  async function enviar(e: FormEvent) {
    e.preventDefault();
    setErro(null);
    setEnviando(true);
    try {
      const r = modo === 'entrar' ? await api.entrar(apelido, senha) : await api.cadastrar(apelido, senha);
      aoEntrar(r.usuario, r.token);
    } catch (x) {
      setErro((x as Error).message);
    } finally {
      setEnviando(false);
    }
  }

  return (
    <main className="pagina pagina-estreita">
      <h1 className="titulo titulo-pequeno">
        Buraco <span>do Zé</span>
      </h1>
      <div className="abas" role="tablist">
        <button role="tab" aria-selected={modo === 'entrar'} onClick={() => setModo('entrar')}>
          Entrar
        </button>
        <button role="tab" aria-selected={modo === 'cadastrar'} onClick={() => setModo('cadastrar')}>
          Criar conta
        </button>
      </div>
      <form className="cartao formulario" onSubmit={enviar}>
        <label>
          Apelido
          <input
            value={apelido}
            onChange={(e) => setApelido(e.target.value)}
            autoComplete="username"
            maxLength={20}
            required
          />
        </label>
        <label>
          Senha
          <input
            type="password"
            value={senha}
            onChange={(e) => setSenha(e.target.value)}
            autoComplete={modo === 'entrar' ? 'current-password' : 'new-password'}
            required
          />
        </label>
        {modo === 'cadastrar' && <p className="dica">O apelido é como seus amigos vão te ver na mesa e no ranking.</p>}
        {erro && <p className="erro">{erro}</p>}
        <button className="botao" disabled={enviando}>
          {enviando ? 'Aguarde…' : modo === 'entrar' ? 'Entrar' : 'Criar conta'}
        </button>
      </form>
    </main>
  );
}
