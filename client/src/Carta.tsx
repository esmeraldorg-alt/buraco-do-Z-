// Desenho de uma carta
import type { Carta as TCarta } from '@buraco-do-ze/engine';
import { SIMBOLO_NAIPE, nomeValor } from '@buraco-do-ze/engine';

const ORDEM_NAIPE = { P: 0, C: 1, E: 2, O: 3 } as const;

/** Ordena a mão por naipe (♣ ♥ ♠ ♦, alternando cores) e depois por valor */
export function ordenarMao(cartas: TCarta[]): TCarta[] {
  return [...cartas].sort((a, b) => ORDEM_NAIPE[a.naipe] - ORDEM_NAIPE[b.naipe] || a.valor - b.valor);
}

export function ehVermelha(c: TCarta): boolean {
  return c.naipe === 'C' || c.naipe === 'O';
}

interface Props {
  carta: TCarta;
  tamanho?: 'mao' | 'mesa' | 'mini';
  selecionada?: boolean;
  curinga?: boolean;
  onClick?: () => void;
}

export function Carta({ carta, tamanho = 'mao', selecionada, curinga, onClick }: Props) {
  const v = nomeValor(carta.valor);
  const n = SIMBOLO_NAIPE[carta.naipe];
  const classe = `carta carta-${tamanho} ${ehVermelha(carta) ? 'vermelha' : 'preta'} ${selecionada ? 'selecionada' : ''} ${
    curinga ? 'curinga' : ''
  }`;
  const conteudo = (
    <>
      <span className="canto">
        <span className="valor">{v}</span>
        <span className="naipe">{n}</span>
      </span>
      {tamanho !== 'mini' && <span className="centro">{n}</span>}
    </>
  );
  // Só é botão quando dá para tocar; senão é um span (pode ficar dentro de outro botão, como um jogo da mesa)
  if (!onClick) {
    return (
      <span className={classe} role="img" aria-label={`${v} de ${n}`}>
        {conteudo}
      </span>
    );
  }
  return (
    <button type="button" className={classe} onClick={onClick} aria-label={`${v} de ${n}`} aria-pressed={selecionada}>
      {conteudo}
    </button>
  );
}

export function VersoCarta({ tamanho = 'mesa' }: { tamanho?: 'mesa' | 'mini' }) {
  return <span className={`carta carta-${tamanho} verso`} aria-hidden />;
}
