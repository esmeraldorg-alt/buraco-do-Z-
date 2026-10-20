// Conexão em tempo real com o servidor (Socket.IO)
import { useCallback, useEffect, useRef, useState } from 'react';
import { io, Socket } from 'socket.io-client';
import type { VisaoJogador } from '@buraco-do-ze/engine';

export interface Lugar {
  usuarioId: number;
  apelido: string;
  conectado: boolean;
  robo?: boolean;
}

export interface VisaoSala {
  codigo: string;
  numJogadores: 2 | 4;
  donoId: number;
  lugares: (Lugar | null)[];
  meuLugar: number | null;
  iniciada: boolean;
  jogo: VisaoJogador | null;
}

export interface ResumoSala {
  codigo: string;
  numJogadores: 2 | 4;
  jogadores: string[];
  vagas: number;
}

export interface Resposta {
  ok: boolean;
  erro?: string;
  codigo?: string;
}

export function useConexao(token: string | null, aoExpirar: () => void) {
  const socketRef = useRef<Socket | null>(null);
  const [sala, setSala] = useState<VisaoSala | null>(null);
  const [abertas, setAbertas] = useState<ResumoSala[]>([]);
  const [conectado, setConectado] = useState(false);
  const [pronto, setPronto] = useState(false);

  useEffect(() => {
    if (!token) return;
    const s = io({ auth: { token } });
    socketRef.current = s;
    s.on('connect', () => setConectado(true));
    s.on('disconnect', () => setConectado(false));
    s.on('connect_error', (e) => {
      if (e.message === 'nao-autenticado') aoExpirar();
    });
    s.on('sala:estado', (v: VisaoSala | null) => {
      setSala(v);
      setPronto(true);
    });
    s.on('salas:abertas', (l: ResumoSala[]) => setAbertas(l));
    return () => {
      s.close();
      socketRef.current = null;
      setSala(null);
      setPronto(false);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  const emitir = useCallback(
    (evento: string, dados: unknown = {}): Promise<Resposta> =>
      new Promise((resolve) => {
        const s = socketRef.current;
        if (!s || !s.connected) return resolve({ ok: false, erro: 'Sem conexão com o servidor' });
        s.timeout(8000).emit(evento, dados, (err: Error | null, r: Resposta) =>
          resolve(err ? { ok: false, erro: 'O servidor não respondeu' } : r),
        );
      }),
    [],
  );

  return { sala, abertas, conectado, pronto, emitir };
}
