// Chamadas HTTP e guarda do login
export interface Usuario {
  id: number;
  apelido: string;
}

const CHAVE = 'buraco-do-ze:token';

export function lerToken(): string | null {
  try {
    return localStorage.getItem(CHAVE);
  } catch {
    return null;
  }
}

export function salvarToken(token: string | null): void {
  try {
    if (token) localStorage.setItem(CHAVE, token);
    else localStorage.removeItem(CHAVE);
  } catch {
    /* navegador sem armazenamento: o login vale só nesta aba */
  }
}

async function pedir<T>(caminho: string, opcoes: RequestInit = {}, token?: string | null): Promise<T> {
  const r = await fetch(caminho, {
    ...opcoes,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...opcoes.headers,
    },
  });
  const dados = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(dados.erro ?? 'Não foi possível falar com o servidor');
  return dados as T;
}

export const api = {
  cadastrar: (apelido: string, senha: string) =>
    pedir<{ usuario: Usuario; token: string }>('/api/cadastro', { method: 'POST', body: JSON.stringify({ apelido, senha }) }),
  entrar: (apelido: string, senha: string) =>
    pedir<{ usuario: Usuario; token: string }>('/api/login', { method: 'POST', body: JSON.stringify({ apelido, senha }) }),
  eu: (token: string) => pedir<{ usuario: Usuario }>('/api/eu', {}, token),
  sair: (token: string) => pedir('/api/sair', { method: 'POST' }, token),
  ranking: (mes?: string) =>
    pedir<{ mes: string; meses: string[]; ranking: { apelido: string; vitorias: number; partidas: number }[] }>(
      '/api/ranking' + (mes ? `?mes=${mes}` : ''),
    ),
};
