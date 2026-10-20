// Som ambiente de cassino, gerado no próprio navegador (Web Audio) — sem baixar arquivos.
// Burburinho de salão + fichas tilintando + um sino de máquina de vez em quando.

const CHAVE = 'buraco-do-ze:som';

let ctx: AudioContext | null = null;
let mestre: GainNode | null = null;
let timers: ReturnType<typeof setTimeout>[] = [];
let tocando = false;

export function somLigadoSalvo(): boolean {
  try {
    return localStorage.getItem(CHAVE) !== 'desligado';
  } catch {
    return true;
  }
}

function salvar(ligado: boolean) {
  try {
    localStorage.setItem(CHAVE, ligado ? 'ligado' : 'desligado');
  } catch {
    /* sem armazenamento */
  }
}

/** Ruído rosado em loop (base do burburinho) */
function criarRuido(c: AudioContext): AudioBufferSourceNode {
  const segundos = 4;
  const buf = c.createBuffer(2, c.sampleRate * segundos, c.sampleRate);
  for (let canal = 0; canal < 2; canal++) {
    const d = buf.getChannelData(canal);
    let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
    for (let i = 0; i < d.length; i++) {
      const w = Math.random() * 2 - 1;
      b0 = 0.99886 * b0 + w * 0.0555179;
      b1 = 0.99332 * b1 + w * 0.0750759;
      b2 = 0.969 * b2 + w * 0.153852;
      b3 = 0.8665 * b3 + w * 0.3104856;
      b4 = 0.55 * b4 + w * 0.5329522;
      b5 = -0.7616 * b5 - w * 0.016898;
      d[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362) * 0.11;
      b6 = w * 0.115926;
    }
  }
  const src = c.createBufferSource();
  src.buffer = buf;
  src.loop = true;
  return src;
}

/** Burburinho de gente conversando: ruído filtrado na faixa da voz, com volume ondulando */
function iniciarBurburinho(c: AudioContext, saida: AudioNode) {
  for (const [freq, q, vol, lfoHz] of [
    [420, 0.8, 0.5, 0.13],
    [900, 1.2, 0.3, 0.21],
    [1600, 1.5, 0.12, 0.31],
  ] as const) {
    const ruido = criarRuido(c);
    const filtro = c.createBiquadFilter();
    filtro.type = 'bandpass';
    filtro.frequency.value = freq;
    filtro.Q.value = q;
    const ganho = c.createGain();
    ganho.gain.value = vol;
    // Oscila o volume devagar, como conversas indo e vindo
    const lfo = c.createOscillator();
    lfo.frequency.value = lfoHz;
    const lfoGanho = c.createGain();
    lfoGanho.gain.value = vol * 0.45;
    lfo.connect(lfoGanho).connect(ganho.gain);
    ruido.connect(filtro).connect(ganho).connect(saida);
    ruido.start(c.currentTime + Math.random());
    lfo.start();
  }
}

/** Tilintar de fichas: 2 a 5 batidinhas metálicas rápidas */
function fichas(c: AudioContext, saida: AudioNode) {
  const batidas = 2 + Math.floor(Math.random() * 4);
  const pan = c.createStereoPanner();
  pan.pan.value = Math.random() * 1.6 - 0.8;
  pan.connect(saida);
  let t = c.currentTime + 0.02;
  for (let i = 0; i < batidas; i++) {
    for (const mult of [1, 2.76, 5.4]) {
      const osc = c.createOscillator();
      osc.type = 'sine';
      osc.frequency.value = (2600 + Math.random() * 900) * (mult === 1 ? 1 : mult / 2.2);
      const g = c.createGain();
      const vol = (mult === 1 ? 0.09 : 0.035) * (0.6 + Math.random() * 0.4);
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(vol, t + 0.003);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.09 + Math.random() * 0.06);
      osc.connect(g).connect(pan);
      osc.start(t);
      osc.stop(t + 0.2);
    }
    t += 0.05 + Math.random() * 0.09;
  }
}

/** Sininho distante de máquina caça-níquel */
function sino(c: AudioContext, saida: AudioNode) {
  const notas = [1318.5, 1568, 2093]; // mi, sol, dó
  const pan = c.createStereoPanner();
  pan.pan.value = Math.random() * 1.4 - 0.7;
  pan.connect(saida);
  notas.forEach((f, i) => {
    const t = c.currentTime + i * 0.12;
    const osc = c.createOscillator();
    osc.type = 'triangle';
    osc.frequency.value = f;
    const g = c.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(0.025, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.7);
    osc.connect(g).connect(pan);
    osc.start(t);
    osc.stop(t + 0.8);
  });
}

function agendar(fn: () => void, minMs: number, maxMs: number) {
  const proximo = () => {
    const t = setTimeout(() => {
      if (!tocando) return;
      fn();
      proximo();
    }, minMs + Math.random() * (maxMs - minMs));
    timers.push(t);
  };
  proximo();
}

/** Liga o som (precisa ser chamado depois de um toque na tela, regra dos navegadores) */
export function ligarSom(): void {
  salvar(true);
  if (tocando) return;
  try {
    const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return;
    if (!ctx) {
      ctx = new Ctx();
      mestre = ctx.createGain();
      mestre.gain.value = 0;
      mestre.connect(ctx.destination);
      iniciarBurburinho(ctx, mestre);
    }
    void ctx.resume();
    tocando = true;
    mestre!.gain.cancelScheduledValues(ctx.currentTime);
    mestre!.gain.setTargetAtTime(0.35, ctx.currentTime, 0.8); // entra suave
    agendar(() => fichas(ctx!, mestre!), 1500, 5000);
    agendar(() => sino(ctx!, mestre!), 12000, 30000);
  } catch {
    /* navegador sem áudio */
  }
}

export function desligarSom(): void {
  salvar(false);
  tocando = false;
  timers.forEach(clearTimeout);
  timers = [];
  if (ctx && mestre) {
    mestre.gain.cancelScheduledValues(ctx.currentTime);
    mestre.gain.setTargetAtTime(0, ctx.currentTime, 0.2);
    const c = ctx;
    setTimeout(() => !tocando && void c.suspend(), 800);
  }
}

// Pausa quando o app vai para segundo plano (economiza bateria) e volta depois
if (typeof document !== 'undefined') {
  document.addEventListener('visibilitychange', () => {
    if (!ctx) return;
    if (document.hidden) void ctx.suspend();
    else if (tocando) void ctx.resume();
  });
}
