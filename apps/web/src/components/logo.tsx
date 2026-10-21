/**
 * Símbolo da marca (rede de conexões), vetorizado a partir do logo original.
 * Sem fundo: pega a cor de fundo da sidebar (#0A3D8C), então não aparece caixa nem recorte.
 */
export function LogoSimbolo({ tamanho = 36 }: { tamanho?: number }) {
  return (
    <svg aria-hidden="true" focusable="false" width={tamanho} height={tamanho} viewBox="150 180 740 640" fill="#fff" stroke="#fff" strokeWidth="13">
      <circle cx="513" cy="493" r="58" stroke="none" />
      <circle cx="242" cy="317" r="42" stroke="none" />
      <circle cx="208" cy="492" r="44" stroke="none" />
      <circle cx="240" cy="665" r="44" stroke="none" />
      <circle cx="762" cy="250" r="35" stroke="none" />
      <circle cx="810" cy="345" r="35" stroke="none" />
      <circle cx="836" cy="447" r="35" stroke="none" />
      <circle cx="836" cy="552" r="35" stroke="none" />
      <circle cx="797" cy="655" r="35" stroke="none" />
      <circle cx="743" cy="744" r="35" stroke="none" />
      <path
        fill="none"
        d="M292 338 462 452M266 492h180M290 638l168-105M557 440l171-160M575 462l195-100M582 486l208-34M582 512l206 36M570 535l184 105M552 552l156 163"
      />
    </svg>
  );
}
