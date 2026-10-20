// Salas de jogo (em memória) — criar, entrar, escolher lugar, iniciar e jogar
import {
  Estado,
  VisaoJogador,
  adicionarAoJogo,
  baixarJogo,
  comprarMonte,
  criarPartida,
  descartar,
  equipeDe,
  novaRodada,
  pegarLixo,
  visaoDoJogador,
} from '@buraco-do-ze/engine';
import type { PartidaTerminada, Usuario } from './armazenamento';

export class ErroSala extends Error {}

export interface Lugar {
  usuarioId: number;
  apelido: string;
  conectado: boolean;
}

export interface Sala {
  codigo: string;
  numJogadores: 2 | 4;
  donoId: number;
  lugares: (Lugar | null)[];
  estado: Estado | null;
  partidaRegistrada: boolean;
  ultimaAtividade: number;
}

export type Acao =
  | { tipo: 'comprar' }
  | { tipo: 'lixo'; par: [string, string]; novosJogos?: string[][]; adicoes?: { jogo: number; cartas: string[] }[] }
  | { tipo: 'baixar'; cartas: string[] }
  | { tipo: 'adicionar'; jogo: number; cartas: string[] }
  | { tipo: 'descartar'; carta: string }
  | { tipo: 'novaRodada' };

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


const LETRAS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

export class GerenciadorSalas {
  salas = new Map<string, Sala>();
  /** Em qual sala cada usuário está */
  salaDoUsuario = new Map<number, string>();

  constructor(
    private ganchos: {
      aoTerminarPartida?: (r: PartidaTerminada) => void;
      /** A sala mudou (para guardar e sobreviver a reinício do servidor) */
      aoMudar?: (sala: Sala) => void;
      aoApagar?: (codigo: string) => void;
    } = {},
  ) {}

  private mudou(sala: Sala): Sala {
    this.ganchos.aoMudar?.(sala);
    return sala;
  }

  /** Recoloca salas guardadas (depois que o servidor reiniciou); todos começam desconectados */
  restaurar(salas: Sala[]): void {
    for (const s of salas) {
      if (!s?.codigo || !Array.isArray(s.lugares)) continue;
      s.lugares.forEach((l) => l && (l.conectado = false));
      this.salas.set(s.codigo, s);
      s.lugares.forEach((l) => l && this.salaDoUsuario.set(l.usuarioId, s.codigo));
    }
  }

  private novoCodigo(): string {
    let c: string;
    do {
      c = Array.from({ length: 5 }, () => LETRAS[Math.floor(Math.random() * LETRAS.length)]).join('');
    } while (this.salas.has(c));
    return c;
  }

  obter(codigo: string): Sala {
    const s = this.salas.get(codigo.trim().toUpperCase());
    if (!s) throw new ErroSala('Sala não encontrada');
    return s;
  }

  salaDe(usuarioId: number): Sala | null {
    const c = this.salaDoUsuario.get(usuarioId);
    return c ? (this.salas.get(c) ?? null) : null;
  }

  lugarDe(sala: Sala, usuarioId: number): number | null {
    const i = sala.lugares.findIndex((l) => l?.usuarioId === usuarioId);
    return i < 0 ? null : i;
  }

  criar(usuario: Usuario, numJogadores: number): Sala {
    if (numJogadores !== 2 && numJogadores !== 4) throw new ErroSala('A sala precisa ser de 2 ou 4 jogadores');
    if (this.salaDe(usuario.id)) this.sair(usuario.id);
    const sala: Sala = {
      codigo: this.novoCodigo(),
      numJogadores,
      donoId: usuario.id,
      lugares: Array(numJogadores).fill(null),
      estado: null,
      partidaRegistrada: false,
      ultimaAtividade: Date.now(),
    };
    sala.lugares[0] = { usuarioId: usuario.id, apelido: usuario.apelido, conectado: true };
    this.salas.set(sala.codigo, sala);
    this.salaDoUsuario.set(usuario.id, sala.codigo);
    return this.mudou(sala);
  }

  entrar(usuario: Usuario, codigo: string): Sala {
    const sala = this.obter(codigo);
    const atual = this.salaDe(usuario.id);
    if (atual && atual.codigo !== sala.codigo) this.sair(usuario.id);

    const meu = this.lugarDe(sala, usuario.id);
    if (meu !== null) {
      sala.lugares[meu]!.conectado = true;
      sala.lugares[meu]!.apelido = usuario.apelido;
    } else {
      if (sala.estado) throw new ErroSala('Essa partida já começou');
      const livre = sala.lugares.findIndex((l) => l === null);
      if (livre < 0) throw new ErroSala('A sala está cheia');
      sala.lugares[livre] = { usuarioId: usuario.id, apelido: usuario.apelido, conectado: true };
    }
    this.salaDoUsuario.set(usuario.id, sala.codigo);
    sala.ultimaAtividade = Date.now();
    return this.mudou(sala);
  }

  /** Sai da sala. Antes de começar, libera o lugar; durante a partida, o lugar fica guardado. */
  sair(usuarioId: number): Sala | null {
    const sala = this.salaDe(usuarioId);
    if (!sala) return null;
    const i = this.lugarDe(sala, usuarioId);
    const emAndamento = sala.estado && sala.estado.fase !== 'fimPartida';
    if (i !== null) {
      if (emAndamento) sala.lugares[i]!.conectado = false;
      else sala.lugares[i] = null;
    }
    // Durante a partida o vínculo fica guardado, para a pessoa poder voltar
    if (!emAndamento || i === null) this.salaDoUsuario.delete(usuarioId);

    // Passa a dona da sala para outro jogador
    if (sala.donoId === usuarioId) {
      const outro = sala.lugares.find((l) => l && l.usuarioId !== usuarioId);
      if (outro) sala.donoId = outro.usuarioId;
    }
    if (sala.lugares.every((l) => l === null || !l.conectado) && !emAndamento) {
      this.apagar(sala);
      return sala;
    }
    return this.mudou(sala);
  }

  /** Marca desconectado (caiu a internet) sem tirar da sala */
  desconectar(usuarioId: number): Sala | null {
    const sala = this.salaDe(usuarioId);
    if (!sala) return null;
    const i = this.lugarDe(sala, usuarioId);
    if (i !== null) sala.lugares[i]!.conectado = false;
    return this.mudou(sala);
  }

  private apagar(sala: Sala): void {
    this.salas.delete(sala.codigo);
    for (const [u, c] of this.salaDoUsuario) if (c === sala.codigo) this.salaDoUsuario.delete(u);
    this.ganchos.aoApagar?.(sala.codigo);
  }

  /** Troca de lugar antes de começar (em duplas: lugares 1 e 3 são parceiros, 2 e 4 também) */
  escolherLugar(usuarioId: number, lugar: number): Sala {
    const sala = this.salaDe(usuarioId);
    if (!sala) throw new ErroSala('Você não está numa sala');
    if (sala.estado) throw new ErroSala('A partida já começou');
    if (!(lugar >= 0 && lugar < sala.numJogadores)) throw new ErroSala('Lugar inválido');
    if (sala.lugares[lugar]) throw new ErroSala('Esse lugar está ocupado');
    const atual = this.lugarDe(sala, usuarioId)!;
    sala.lugares[lugar] = sala.lugares[atual];
    sala.lugares[atual] = null;
    return this.mudou(sala);
  }

  iniciar(usuarioId: number): Sala {
    const sala = this.salaDe(usuarioId);
    if (!sala) throw new ErroSala('Você não está numa sala');
    if (sala.donoId !== usuarioId) throw new ErroSala('Só quem criou a sala pode começar');
    if (sala.estado && sala.estado.fase !== 'fimPartida') throw new ErroSala('A partida já está em andamento');
    if (sala.lugares.some((l) => l === null)) throw new ErroSala('Aguardando todos os jogadores');
    sala.estado = criarPartida({ numJogadores: sala.numJogadores });
    sala.partidaRegistrada = false;
    sala.ultimaAtividade = Date.now();
    return this.mudou(sala);
  }

  /** Volta para a sala de espera depois de uma partida terminada */
  reiniciar(usuarioId: number): Sala {
    const sala = this.salaDe(usuarioId);
    if (!sala) throw new ErroSala('Você não está numa sala');
    if (sala.donoId !== usuarioId) throw new ErroSala('Só quem criou a sala pode fazer isso');
    if (!sala.estado || sala.estado.fase !== 'fimPartida') throw new ErroSala('A partida ainda não terminou');
    sala.estado = null;
    sala.lugares = sala.lugares.map((l) => (l && l.conectado ? l : null));
    for (const [u, c] of this.salaDoUsuario) {
      if (c === sala.codigo && !sala.lugares.some((l) => l?.usuarioId === u)) this.salaDoUsuario.delete(u);
    }
    return this.mudou(sala);
  }

  jogar(usuarioId: number, acao: Acao): Sala {
    const sala = this.salaDe(usuarioId);
    if (!sala || !sala.estado) throw new ErroSala('Nenhuma partida em andamento');
    const j = this.lugarDe(sala, usuarioId);
    if (j === null) throw new ErroSala('Você não está nessa partida');
    const e = sala.estado;

    switch (acao?.tipo) {
      case 'comprar':
        sala.estado = comprarMonte(e, j);
        break;
      case 'lixo':
        sala.estado = pegarLixo(e, j, { par: acao.par, novosJogos: acao.novosJogos, adicoes: acao.adicoes });
        break;
      case 'baixar':
        sala.estado = baixarJogo(e, j, acao.cartas);
        break;
      case 'adicionar':
        sala.estado = adicionarAoJogo(e, j, acao.jogo, acao.cartas);
        break;
      case 'descartar':
        sala.estado = descartar(e, j, acao.carta);
        break;
      case 'novaRodada':
        sala.estado = novaRodada(e);
        break;
      default:
        throw new ErroSala('Jogada desconhecida');
    }
    sala.ultimaAtividade = Date.now();

    if (sala.estado.fase === 'fimPartida' && !sala.partidaRegistrada && sala.estado.vencedor !== null) {
      sala.partidaRegistrada = true;
      this.ganchos.aoTerminarPartida?.({
        numJogadores: sala.numJogadores,
        pontos: [sala.estado.equipes[0].pontos, sala.estado.equipes[1].pontos],
        equipeVencedora: sala.estado.vencedor,
        jogadores: sala.lugares.map((l, i) => ({ usuarioId: l!.usuarioId, apelido: l!.apelido, equipe: equipeDe(i) })),
      });
    }
    return this.mudou(sala);
  }

  visao(sala: Sala, usuarioId: number): VisaoSala {
    const meuLugar = this.lugarDe(sala, usuarioId);
    return {
      codigo: sala.codigo,
      numJogadores: sala.numJogadores,
      donoId: sala.donoId,
      lugares: sala.lugares.map((l) => (l ? { ...l } : null)),
      meuLugar,
      iniciada: sala.estado !== null,
      jogo: sala.estado && meuLugar !== null ? visaoDoJogador(sala.estado, meuLugar) : null,
    };
  }

  /** Salas esperando jogadores */
  abertas(): ResumoSala[] {
    return [...this.salas.values()]
      .filter((s) => !s.estado && s.lugares.some((l) => l === null))
      .map((s) => ({
        codigo: s.codigo,
        numJogadores: s.numJogadores,
        jogadores: s.lugares.filter((l): l is Lugar => l !== null).map((l) => l.apelido),
        vagas: s.lugares.filter((l) => l === null).length,
      }));
  }

  /** Apaga salas paradas há muito tempo */
  limpar(maxParadaMs = 6 * 60 * 60 * 1000): void {
    const agora = Date.now();
    for (const s of [...this.salas.values()]) {
      if (agora - s.ultimaAtividade > maxParadaMs) this.apagar(s);
    }
  }
}
