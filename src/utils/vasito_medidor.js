export function dibujarVasito(fraccion, etiqueta, onzas, gramos) {
  const fillHeight = fraccion * 90;
  const liquidY = 110 - fillHeight;
  const lineY = 110 - fraccion * 100;

  return `
    <div class="vasito-container">
      <svg viewBox="0 0 80 135" width="80" height="135" class="vasito-svg">
        <polygon points="10,10 70,10 65,110 15,110"
                 fill="rgba(230,240,255,0.3)" stroke="#555" stroke-width="1.5" rx="3"/>
        <polygon points="12,${liquidY} 68,${liquidY} 65,110 15,110"
                 fill="rgba(46,125,50,0.35)" stroke="none"/>
        <line x1="12" y1="${lineY}" x2="68" y2="${lineY}"
              stroke="#ff4103" stroke-width="2.5" stroke-dasharray="3,3"/>
        <circle cx="40" cy="${lineY - 5}" r="4" fill="#ff4103"/>
        <text x="40" y="122" text-anchor="middle" font-size="10" font-weight="700" fill="#2d3e2c">
          ${etiqueta}
        </text>
        <text x="40" y="133" text-anchor="middle" font-size="7" fill="#666">
          ${onzas} oz / ${gramos}g
        </text>
      </svg>
    </div>
  `;
}

export function dibujarVasitoCompacto(fraccion) {
  const fillHeight = fraccion * 40;
  const lineY = 44 - fraccion * 40;

  return `
    <svg viewBox="0 0 40 55" width="40" height="55" class="vasito-compacto">
      <polygon points="5,2 35,2 32,44 8,44"
               fill="rgba(230,240,255,0.3)" stroke="#555" stroke-width="1"/>
      <polygon points="6,${44 - fillHeight} 34,${44 - fillHeight} 32,44 8,44"
               fill="rgba(46,125,50,0.35)" stroke="none"/>
      <line x1="6" y1="${lineY}" x2="34" y2="${lineY}"
            stroke="#ff4103" stroke-width="1.5" stroke-dasharray="2,2"/>
    </svg>
  `;
}