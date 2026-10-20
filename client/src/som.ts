// Músicas do jogo
// - Telas de menu (abertura, login, lobby, sala de espera): "menu.mp3" em loop
// - Durante a partida: "jogo-1.mp3" e "jogo-2.mp3" se alternando
// Troca de música com fade (sobe/desce o volume devagar).

const CHAVE = 'buraco-do-ze:som';
const VOLUME = 0.55;

export type Cena = 'menu' | 'jogo';

const FAIXAS: Record<Cena, string[]> = {
  menu: ['/musica/menu.mp3'],
  jogo: ['/musica/jogo-1.mp3', '/musica/jogo-2.mp3'],
};

let ligado = somLigadoSalvo();
let cenaAtual: Cena = 'menu';
let atual: HTMLAudioElement | null = null;
const indiceFaixa: Record<Cena, number> = { menu: 0, jogo: 0 };
let destravado = false;

export function somLigadoSalvo(): boolean {
  try {
    return localStorage.getItem(CHAVE) !== 'desligado';
  } catch {
    return true;
  }
}

function salvar(v: boolean) {
  try {
    localStorage.setItem(CHAVE, v ? 'ligado' : 'desligado');
  } catch {
    /* sem armazenamento */
  }
}

/** Sobe ou desce o volume aos poucos; no fim chama `pronto` */
function fade(audio: HTMLAudioElement, alvo: number, ms: number, pronto?: () => void) {
  const passos = 20;
  const inicio = audio.volume;
  let i = 0;
  const t = setInterval(() => {
    i++;
    audio.volume = Math.max(0, Math.min(1, inicio + ((alvo - inicio) * i) / passos));
    if (i >= passos) {
      clearInterval(t);
      pronto?.();
    }
  }, ms / passos);
}

function criarAudio(cena: Cena): HTMLAudioElement {
  const lista = FAIXAS[cena];
  const a = new Audio(lista[indiceFaixa[cena] % lista.length]);
  a.preload = 'auto';
  a.volume = 0;
  if (lista.length === 1) a.loop = true;
  else {
    // Acabou uma faixa do jogo: passa para a próxima
    a.addEventListener('ended', () => {
      if (atual !== a) return;
      indiceFaixa[cena] = (indiceFaixa[cena] + 1) % lista.length;
      atual = null;
      tocar(cena);
    });
  }
  return a;
}

function tocar(cena: Cena) {
  if (!ligado) return;
  const novo = criarAudio(cena);
  atual = novo;
  novo
    .play()
    .then(() => {
      destravado = true;
      fade(novo, VOLUME, 1200);
    })
    .catch(() => {
      // O navegador bloqueou (ainda não houve toque na tela): tenta de novo no primeiro toque
      if (atual === novo) atual = null;
    });
}

function pararAtual(ms = 800) {
  const velho = atual;
  atual = null;
  if (!velho) return;
  fade(velho, 0, ms, () => {
    velho.pause();
    velho.src = '';
  });
}

/** Diz qual música deve tocar agora (chamado quando a tela muda) */
export function definirCena(cena: Cena): void {
  if (cena === cenaAtual && atual) return;
  const mudou = cena !== cenaAtual;
  cenaAtual = cena;
  if (!ligado) return;
  if (mudou || !atual) {
    pararAtual();
    tocar(cena);
  }
}

export function ligarSom(): void {
  ligado = true;
  salvar(true);
  if (!atual) tocar(cenaAtual);
}

export function desligarSom(): void {
  ligado = false;
  salvar(false);
  pararAtual(400);
}

/** Para a música sem mudar a preferência (ao sair do jogo) */
export function pausarSom(): void {
  pararAtual(300);
}

/** Navegadores só deixam tocar depois de um toque: no primeiro toque, começa a música */
if (typeof document !== 'undefined') {
  const destravar = () => {
    if (!destravado && ligado && !atual) tocar(cenaAtual);
  };
  document.addEventListener('pointerdown', destravar, { capture: true });
  document.addEventListener('keydown', destravar, { capture: true });

  // Pausa quando o app vai para segundo plano e volta depois
  document.addEventListener('visibilitychange', () => {
    if (!atual) return;
    if (document.hidden) atual.pause();
    else if (ligado) void atual.play().catch(() => {});
  });
}
