const PATHS = {
  tararira: (
    // Corpo robusto, boca larga, cauda bifurcada leve — traíra
    <g>
      <ellipse cx="22" cy="16" rx="16" ry="8" />
      <polygon points="38,16 46,10 46,22" />
      <ellipse cx="10" cy="14" rx="5" ry="3.5" opacity="0.6" />
      <circle cx="7" cy="13" r="1.8" fill="white" />
      <circle cx="7" cy="13" r="0.9" fill="black" />
      <line x1="22" y1="8" x2="22" y2="5" strokeWidth="1.5" strokeLinecap="round" />
      <line x1="27" y1="7" x2="29" y2="5" strokeWidth="1.2" strokeLinecap="round" />
    </g>
  ),
  dourado: (
    // Corpo fusiforme e altas barbatanas — dorado
    <g>
      <ellipse cx="22" cy="16" rx="17" ry="7" />
      <polygon points="39,16 48,9 48,23" />
      <ellipse cx="9" cy="14" rx="4.5" ry="3" opacity="0.55" />
      <circle cx="6.5" cy="13.5" r="1.8" fill="white" />
      <circle cx="6.5" cy="13.5" r="0.9" fill="black" />
      <path d="M18 9 Q22 3 26 9" fill="currentColor" opacity="0.7" />
      <path d="M20 23 Q22 28 24 23" fill="currentColor" opacity="0.5" />
    </g>
  ),
  boga: (
    // Corpo oval mediano, boca pequena terminal — boga
    <g>
      <ellipse cx="23" cy="16" rx="15" ry="9" />
      <polygon points="38,16 46,11 46,21" />
      <ellipse cx="11" cy="15" rx="4" ry="3" opacity="0.55" />
      <circle cx="8.5" cy="14.5" r="1.6" fill="white" />
      <circle cx="8.5" cy="14.5" r="0.8" fill="black" />
      <path d="M19 8 Q23 4 27 8" fill="currentColor" opacity="0.6" />
    </g>
  ),
  bagre: (
    // Cabeça plana ampla, barbilhões, corpo cônico — bagre
    <g>
      <path d="M8 16 Q10 8 24 10 Q38 10 40 16 Q38 22 24 22 Q10 22 8 16 Z" />
      <polygon points="40,16 48,11 48,21" />
      <ellipse cx="10" cy="14" rx="6" ry="5" opacity="0.5" />
      <circle cx="7" cy="13" r="1.8" fill="white" />
      <circle cx="7" cy="13" r="0.9" fill="black" />
      <line x1="6" y1="15" x2="2" y2="18" strokeWidth="1.5" strokeLinecap="round" />
      <line x1="6" y1="16" x2="1" y2="16" strokeWidth="1.5" strokeLinecap="round" />
      <line x1="6" y1="17" x2="2" y2="14" strokeWidth="1.5" strokeLinecap="round" />
      <line x1="20" y1="10" x2="20" y2="5" strokeWidth="2" strokeLinecap="round" />
    </g>
  ),
  pejerrey: (
    // Corpo alongado e fino, boca pequena, linha lateral — pejerrey
    <g>
      <ellipse cx="24" cy="16" rx="19" ry="5.5" />
      <polygon points="43,16 50,12 50,20" />
      <ellipse cx="8" cy="15" rx="3.5" ry="2.5" opacity="0.5" />
      <circle cx="6" cy="14.5" r="1.5" fill="white" />
      <circle cx="6" cy="14.5" r="0.7" fill="black" />
      <line x1="12" y1="16" x2="40" y2="16" strokeWidth="0.8" stroke="white" opacity="0.5" strokeDasharray="2,2" />
      <path d="M20 10.5 Q24 7 28 10.5" fill="currentColor" opacity="0.55" />
    </g>
  ),
  mojarra: (
    // Corpo alto e curto, aleta dorsal alta — mojarra/lambari
    <g>
      <ellipse cx="24" cy="16" rx="13" ry="10" />
      <polygon points="37,16 44,11 44,21" />
      <ellipse cx="13" cy="14" rx="4" ry="3.5" opacity="0.5" />
      <circle cx="10" cy="13.5" r="1.6" fill="white" />
      <circle cx="10" cy="13.5" r="0.8" fill="black" />
      <path d="M18 6 L22 3 L26 6" fill="currentColor" opacity="0.7" />
    </g>
  ),
  sabalito: (
    // Corpo moderado, boca ínfera (raspadora), cauda bifurcada marcada — sabalo
    <g>
      <ellipse cx="22" cy="16" rx="15" ry="8.5" />
      <path d="M37,16 L45,9 L43,16 L45,23 Z" />
      <ellipse cx="11" cy="16" rx="5" ry="4" opacity="0.5" />
      <circle cx="8" cy="15" r="1.7" fill="white" />
      <circle cx="8" cy="15" r="0.85" fill="black" />
      <path d="M10 19 Q9 21 10 23" fill="none" strokeWidth="1.5" strokeLinecap="round" opacity="0.7" />
      <path d="M20 7.5 Q22 4 24 7.5" fill="currentColor" opacity="0.6" />
    </g>
  ),
  'patí': (
    // Bagre grande, cabeça mais estreita que o bagre amarelo, corpo comprido
    <g>
      <path d="M8 16 Q11 9 26 11 Q40 11 42 16 Q40 21 26 21 Q11 21 8 16 Z" />
      <polygon points="42,16 50,10 50,22" />
      <ellipse cx="11" cy="14.5" rx="6" ry="4.5" opacity="0.5" />
      <circle cx="8" cy="13.5" r="1.8" fill="white" />
      <circle cx="8" cy="13.5" r="0.9" fill="black" />
      <line x1="6" y1="15" x2="2" y2="19" strokeWidth="1.5" strokeLinecap="round" />
      <line x1="6" y1="16" x2="1" y2="16" strokeWidth="1.5" strokeLinecap="round" />
      <line x1="22" y1="11" x2="22" y2="6" strokeWidth="2" strokeLinecap="round" />
    </g>
  ),
  'surubí': (
    // Surubí: corpo grande, pontilhado, cabeça larga, cauda bifurcada profunda
    <g>
      <path d="M6 16 Q10 8 26 10 Q42 10 44 16 Q42 22 26 22 Q10 22 6 16 Z" />
      <path d="M44,16 L52,8 L50,16 L52,24 Z" />
      <ellipse cx="11" cy="13.5" rx="7" ry="5.5" opacity="0.45" />
      <circle cx="7" cy="12.5" r="2" fill="white" />
      <circle cx="7" cy="12.5" r="1" fill="black" />
      <line x1="5" y1="15" x2="1" y2="19" strokeWidth="1.8" strokeLinecap="round" />
      <line x1="5" y1="16" x2="0" y2="16" strokeWidth="1.8" strokeLinecap="round" />
      <line x1="5" y1="17" x2="1" y2="13" strokeWidth="1.8" strokeLinecap="round" />
      <circle cx="28" cy="13" r="1" opacity="0.5" />
      <circle cx="33" cy="14" r="0.8" opacity="0.5" />
      <circle cx="23" cy="15" r="0.9" opacity="0.5" />
      <line x1="24" y1="10" x2="24" y2="5" strokeWidth="2.2" strokeLinecap="round" />
    </g>
  ),
  vieja_agua: (
    // Hipostômideo: corpo achatado, dorsal com espinho, boca ínfera raspadora
    <g>
      <ellipse cx="23" cy="17" rx="14" ry="7.5" />
      <polygon points="37,17 44,13 44,21" />
      <ellipse cx="12" cy="17" rx="5" ry="4.5" opacity="0.5" />
      <circle cx="9" cy="16" r="1.7" fill="white" />
      <circle cx="9" cy="16" r="0.85" fill="black" />
      <line x1="12" y1="20" x2="10" y2="23" strokeWidth="1.5" strokeLinecap="round" opacity="0.7" />
      <line x1="22" y1="9.5" x2="22" y2="5" strokeWidth="2.5" strokeLinecap="round" />
      <path d="M16 9.5 Q23 6 30 9.5" fill="currentColor" opacity="0.5" />
    </g>
  ),
  palometa: (
    // Corpo alto, dentes visíveis, barbatana adiposa — piranha
    <g>
      <ellipse cx="24" cy="16" rx="14" ry="10.5" />
      <polygon points="38,16 45,12 45,20" />
      <ellipse cx="13" cy="14" rx="5" ry="4.5" opacity="0.5" />
      <circle cx="10" cy="13" r="1.8" fill="white" />
      <circle cx="10" cy="13" r="0.9" fill="black" />
      <path d="M10 17 L12 20 L14 17" fill="none" strokeWidth="1.2" strokeLinecap="round" opacity="0.8" />
      <path d="M18 5.5 L22 3 L26 5.5" fill="currentColor" opacity="0.7" />
    </g>
  ),
  armado: (
    // Corpo com carapaça/escamas duras, cabeça larga, espinhos nas barbatanas
    <g>
      <path d="M9 16 Q12 9 24 10 Q38 10 40 16 Q38 22 24 22 Q12 22 9 16 Z" />
      <polygon points="40,16 47,12 47,20" />
      <ellipse cx="12" cy="14.5" rx="6" ry="5" opacity="0.45" />
      <circle cx="9" cy="13.5" r="1.8" fill="white" />
      <circle cx="9" cy="13.5" r="0.9" fill="black" />
      <line x1="7" y1="15" x2="3" y2="18" strokeWidth="1.5" strokeLinecap="round" />
      <line x1="7" y1="16" x2="2" y2="16" strokeWidth="1.5" strokeLinecap="round" />
      <line x1="22" y1="10" x2="22" y2="5" strokeWidth="2.5" strokeLinecap="round" />
      <line x1="14" y1="11" x2="13" y2="7" strokeWidth="1.5" strokeLinecap="round" opacity="0.7" />
      <path d="M16 10 Q22 7 28 10" fill="none" strokeWidth="1" opacity="0.5" strokeDasharray="2,1.5" />
    </g>
  ),
  corvina: (
    // Corpo moderado, cauda levemente bifurcada, boca sub-terminal — corvina
    <g>
      <ellipse cx="23" cy="16" rx="16" ry="8" />
      <path d="M39,16 L46,10 L44,16 L46,22 Z" />
      <ellipse cx="11" cy="14.5" rx="5" ry="3.5" opacity="0.5" />
      <circle cx="8" cy="13.5" r="1.7" fill="white" />
      <circle cx="8" cy="13.5" r="0.85" fill="black" />
      <path d="M18 8 Q23 5 28 8" fill="currentColor" opacity="0.6" />
      <path d="M20 24 Q23 27 26 24" fill="currentColor" opacity="0.4" />
    </g>
  ),
  anguilas: (
    // Corpo serpentiforme longo, sem cauda bifurcada, nadadeiras fundidas
    <g>
      <path d="M4 16 Q8 10 16 14 Q24 18 32 13 Q40 9 46 14" fill="none" strokeWidth="8" strokeLinecap="round" />
      <path d="M4 16 Q8 10 16 14 Q24 18 32 13 Q40 9 46 14" fill="none" strokeWidth="4" stroke="white" opacity="0.15" strokeLinecap="round" />
      <ellipse cx="6" cy="16" rx="4.5" ry="4" opacity="0.6" />
      <circle cx="4.5" cy="15" r="1.6" fill="white" />
      <circle cx="4.5" cy="15" r="0.8" fill="black" />
      <path d="M44 14 Q48 13 50 16" fill="none" strokeWidth="4" strokeLinecap="round" opacity="0.7" />
    </g>
  ),
  carpa: (
    // Corpo alto e robusto, escamas grandes, barbilhões curtos, cauda ampla
    <g>
      <ellipse cx="23" cy="16" rx="15" ry="10" />
      <path d="M38,16 L46,10 L44,16 L46,22 Z" />
      <ellipse cx="11" cy="15" rx="5.5" ry="4.5" opacity="0.45" />
      <circle cx="8" cy="14" r="1.8" fill="white" />
      <circle cx="8" cy="14" r="0.9" fill="black" />
      <line x1="9" y1="17" x2="6" y2="20" strokeWidth="1.3" strokeLinecap="round" />
      <line x1="9" y1="18" x2="6" y2="18" strokeWidth="1.3" strokeLinecap="round" />
      <path d="M17 6.5 Q23 3 29 6.5" fill="currentColor" opacity="0.65" />
      <path d="M19 8 Q22 6 25 8 Q28 10 25 12 Q22 14 19 12 Q16 10 19 8 Z" fill="none" strokeWidth="0.8" opacity="0.35" />
    </g>
  ),
  dientudo: (
    // Corpo fusiforme médio, boca grande com dentes — oligossarco
    <g>
      <ellipse cx="23" cy="16" rx="16" ry="7" />
      <polygon points="39,16 47,11 47,21" />
      <ellipse cx="10" cy="14" rx="5" ry="3.5" opacity="0.5" />
      <circle cx="7" cy="13" r="1.7" fill="white" />
      <circle cx="7" cy="13" r="0.85" fill="black" />
      <line x1="8" y1="16" x2="10" y2="18" strokeWidth="1" strokeLinecap="round" opacity="0.8" />
      <line x1="9" y1="16" x2="11" y2="18" strokeWidth="1" strokeLinecap="round" opacity="0.8" />
      <path d="M19 9 Q23 6 27 9" fill="currentColor" opacity="0.6" />
    </g>
  ),
  tachuela: (
    // Corpo achatado redondo, escamas ósseas, barbilhões curtos — callichthys
    <g>
      <ellipse cx="24" cy="16" rx="13" ry="9" />
      <polygon points="37,16 44,13 44,19" />
      <ellipse cx="13" cy="15.5" rx="5.5" ry="4.5" opacity="0.45" />
      <circle cx="10" cy="14.5" r="1.7" fill="white" />
      <circle cx="10" cy="14.5" r="0.85" fill="black" />
      <line x1="9" y1="17" x2="6" y2="20" strokeWidth="1.3" strokeLinecap="round" />
      <line x1="9" y1="18" x2="5" y2="18" strokeWidth="1.3" strokeLinecap="round" />
      <line x1="22" y1="7" x2="22" y2="3" strokeWidth="2" strokeLinecap="round" />
      <path d="M16 7 Q24 4 32 7" fill="none" strokeWidth="1" opacity="0.45" strokeDasharray="2,1.5" />
    </g>
  ),
};

const DEFAULT_PATH = (
  <g>
    <ellipse cx="22" cy="16" rx="15" ry="8" />
    <polygon points="37,16 44,11 44,21" />
    <circle cx="10" cy="14" r="1.8" fill="white" />
    <circle cx="10" cy="14" r="0.9" fill="black" />
  </g>
);

export default function FishIcon({ speciesId, color, size = 32 }) {
  const path = PATHS[speciesId] || DEFAULT_PATH;
  return (
    <svg
      width={size}
      height={size * 0.625}
      viewBox="0 0 52 32"
      fill={color}
      stroke={color}
      strokeWidth="0"
      style={{ display: 'block', flexShrink: 0 }}
      aria-hidden="true"
    >
      {path}
    </svg>
  );
}
