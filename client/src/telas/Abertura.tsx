// Tela de abertura com a homenagem
import { Carta } from '../Carta';

export const MENSAGEM_ABERTURA =
  'Este jogo é para lembrar os velhos tempos em que Dil e Anderson jogavam o buraco aberto.';

export function Abertura({ aoEntrar }: { aoEntrar: () => void }) {
  return (
    <main className="abertura">
      <div className="leque" aria-hidden>
        <Carta carta={{ id: 'a', naipe: 'E', valor: 1 }} tamanho="mesa" />
        <Carta carta={{ id: 'b', naipe: 'C', valor: 2 }} tamanho="mesa" />
        <Carta carta={{ id: 'c', naipe: 'P', valor: 13 }} tamanho="mesa" />
        <Carta carta={{ id: 'd', naipe: 'O', valor: 7 }} tamanho="mesa" />
      </div>
      <h1 className="titulo">
        Buraco <span>do Zé</span>
      </h1>
      <blockquote className="homenagem">{MENSAGEM_ABERTURA}</blockquote>
      <button className="botao botao-grande" onClick={aoEntrar} autoFocus>
        Entrar no jogo
      </button>
    </main>
  );
}
