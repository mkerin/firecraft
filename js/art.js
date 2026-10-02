// Hand-built SVG illustrations for every card. Each scene is drawn in a 200x140 box.
// Shared gradients and filters live in ART_DEFS, which is injected into the page once.

const BG = {
  brimstone: ['#8a6614', '#2e1f05', '#0d0802'],
  phlegethon: ['#8a1020', '#3a0610', '#0e0205'],
  pyre: ['#b04a0c', '#401505', '#120502'],
  fallen: ['#4b2378', '#1e0c33', '#07030d'],
  ash: ['#5b5856', '#222124', '#09090b'],
  wild: ['#a0200a', '#3a0602', '#050000'],
  ice: ['#3c7fa8', '#0f2e45', '#040b12'],
};

const FLAMES = {
  flame: ['#fff3b0', '#ffb12e', '#e2401c'],
  'flame-yellow': ['#fffbe0', '#ffe04a', '#c98a0a'],
  'flame-red': ['#ffd0c0', '#ff3b3b', '#7a0010'],
  'flame-violet': ['#f5e8ff', '#b88cff', '#4b1f8a'],
  'flame-grey': ['#ffffff', '#c9c4bc', '#55524e'],
  'flame-ice': ['#ffffff', '#9fe3ff', '#2a6f9a'],
};

const radial = (id, [a, b, c]) => `
  <radialGradient id="bg-${id}" cx="50%" cy="62%" r="78%">
    <stop offset="0" stop-color="${a}"/><stop offset=".55" stop-color="${b}"/><stop offset="1" stop-color="${c}"/>
  </radialGradient>`;

const flameGrad = (id, [a, b, c]) => `
  <linearGradient id="${id}" x1="0" y1="1" x2="0" y2="0">
    <stop offset="0" stop-color="${a}"/><stop offset=".3" stop-color="${b}"/>
    <stop offset=".75" stop-color="${c}"/><stop offset="1" stop-color="${c}" stop-opacity="0"/>
  </linearGradient>`;

export const ART_DEFS = `
<svg width="0" height="0" style="position:absolute" aria-hidden="true" focusable="false">
  <defs>
    ${Object.entries(BG).map(([k, v]) => radial(k, v)).join('')}
    ${Object.entries(FLAMES).map(([k, v]) => flameGrad(k, v)).join('')}
    <radialGradient id="vignette" cx="50%" cy="50%" r="70%">
      <stop offset=".6" stop-color="#000" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity=".8"/>
    </radialGradient>
    <radialGradient id="hot-core" cx="50%" cy="50%" r="50%">
      <stop offset="0" stop-color="#fff6c8" stop-opacity=".95"/><stop offset=".4" stop-color="#ff9a1f" stop-opacity=".6"/>
      <stop offset="1" stop-color="#ff3a00" stop-opacity="0"/>
    </radialGradient>
    <linearGradient id="stone" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#5a5248"/><stop offset="1" stop-color="#1c1814"/>
    </linearGradient>
    <linearGradient id="salt" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0" stop-color="#9c9586"/><stop offset=".45" stop-color="#f4efe2"/><stop offset="1" stop-color="#8a8374"/>
    </linearGradient>
    <linearGradient id="bronze" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#9a5a22"/><stop offset="1" stop-color="#2a1406"/>
    </linearGradient>
    <linearGradient id="blood" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#ff3b3b"/><stop offset="1" stop-color="#4a0008"/>
    </linearGradient>
    <linearGradient id="ice-sheet" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#d8f6ff"/><stop offset="1" stop-color="#2f6d92"/>
    </linearGradient>
    <linearGradient id="gold" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#fff0a0"/><stop offset="1" stop-color="#b8860b"/>
    </linearGradient>
    <filter id="glow" x="-50%" y="-50%" width="200%" height="200%">
      <feGaussianBlur stdDeviation="2.2" result="b"/>
      <feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge>
    </filter>
    <filter id="blur3" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="3"/></filter>
    <filter id="blur6" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="6"/></filter>
    <filter id="smoke" x="-20%" y="-20%" width="140%" height="140%">
      <feTurbulence type="fractalNoise" baseFrequency="0.035" numOctaves="3" seed="7"/>
      <feDisplacementMap in="SourceGraphic" scale="16"/>
      <feGaussianBlur stdDeviation="1.5"/>
    </filter>
  </defs>
</svg>`;

// ---------- drawing helpers ----------

// Deterministic pseudo-random numbers so art is identical on every render.
function prng(seed) {
  let s = seed;
  return () => ((s = (s * 9301 + 49297) % 233280) / 233280);
}

const FLAME_PATH = 'M0,0 C-7,-6 -9,-16 -3,-27 C-2,-19 3,-17 2,-27 C9,-17 10,-6 0,0 Z';

function flame(x, y, s = 1, grad = 'flame', rot = 0, opacity = 1) {
  return `<path d="${FLAME_PATH}" transform="translate(${x},${y}) rotate(${rot}) scale(${s})" fill="url(#${grad})" opacity="${opacity}"/>`;
}

function flameRow(x0, x1, y, n, s, grad = 'flame', seed = 1) {
  const r = prng(seed);
  let out = '';
  for (let i = 0; i < n; i++) {
    const x = x0 + ((x1 - x0) * (i + 0.5)) / n + (r() - 0.5) * 6;
    out += flame(x, y + r() * 4, s * (0.7 + r() * 0.6), grad, (r() - 0.5) * 16);
  }
  return out;
}

function sparks(seed, n, color, area = [0, 0, 200, 140]) {
  const r = prng(seed);
  const [x, y, w, h] = area;
  let out = `<g fill="${color}" filter="url(#glow)">`;
  for (let i = 0; i < n; i++) out += `<circle cx="${(x + r() * w).toFixed(1)}" cy="${(y + r() * h).toFixed(1)}" r="${(0.4 + r() * 1.2).toFixed(2)}" opacity="${(0.4 + r() * 0.6).toFixed(2)}"/>`;
  return out + '</g>';
}

const mirror = (content) => `<g transform="translate(200,0) scale(-1,1)">${content}</g>`;

function frame(type, body) {
  return `<svg viewBox="0 0 200 140" xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="xMidYMid slice">
    <rect width="200" height="140" fill="url(#bg-${type})"/>
    ${body}
    <rect width="200" height="140" fill="url(#vignette)"/>
  </svg>`;
}

function crenellatedWall(y, color, seed) {
  const r = prng(seed);
  let d = `M0,140 L0,${y}`;
  for (let x = 0; x < 200; x += 12) {
    const h = 4 + r() * 6;
    d += ` L${x},${y - h} L${x + 7},${y - h} L${x + 7},${y} L${x + 12},${y}`;
  }
  return `<path d="${d} L200,140 Z" fill="${color}"/>`;
}

// Generic bat wing anchored at its root (0,0), spreading right.
const BAT_WING = 'M0,0 C18,-22 48,-34 72,-30 L63,-17 L74,-8 L59,0 L65,12 L46,9 C30,14 12,10 0,0 Z';

function batWings(cx, cy, s, fill, stroke = 'none') {
  const w = `<path d="${BAT_WING}" fill="${fill}" stroke="${stroke}" stroke-width="0.8"/>`;
  return `<g transform="translate(${cx},${cy}) scale(${s},${s})">${w}</g>
          <g transform="translate(${cx},${cy}) scale(${-s},${s})">${w}</g>`;
}

function hornedHead(cx, cy, r, fill, eye = '#ffd84a') {
  return `
    <path d="M${cx - r * 0.7},${cy - r * 0.6} L${cx - r * 1.5},${cy - r * 2} L${cx - r * 0.2},${cy - r * 0.9} Z" fill="${fill}"/>
    <path d="M${cx + r * 0.7},${cy - r * 0.6} L${cx + r * 1.5},${cy - r * 2} L${cx + r * 0.2},${cy - r * 0.9} Z" fill="${fill}"/>
    <circle cx="${cx}" cy="${cy}" r="${r}" fill="${fill}"/>
    <g fill="${eye}" filter="url(#glow)">
      <circle cx="${cx - r * 0.38}" cy="${cy - r * 0.05}" r="${r * 0.18}"/>
      <circle cx="${cx + r * 0.38}" cy="${cy - r * 0.05}" r="${r * 0.18}"/>
    </g>`;
}

// ---------- scenes ----------

const ART = {
  gargoyle: () => frame('brimstone', `
    <circle cx="100" cy="70" r="55" fill="url(#hot-core)" opacity=".35"/>
    ${crenellatedWall(112, '#1d1406', 3)}
    <g fill="#ffb12e" opacity=".8" filter="url(#glow)">
      <rect x="22" y="118" width="3" height="5"/><rect x="58" y="120" width="3" height="5"/>
      <rect x="150" y="118" width="3" height="5"/><rect x="178" y="121" width="3" height="5"/>
    </g>
    ${batWings(100, 74, 1.05, '#2b2418', '#7a6a3a')}
    <path d="M86,104 C84,90 89,76 100,72 C111,76 116,90 114,104 Z" fill="#3a3226"/>
    <path d="M86,104 l-6,5 h10 Z M114,104 l6,5 h-10 Z" fill="#3a3226"/>
    ${hornedHead(100, 64, 8, '#3a3226')}
    <rect x="82" y="104" width="36" height="8" fill="url(#stone)"/>
    <rect x="87" y="112" width="26" height="28" fill="url(#stone)"/>
    ${sparks(11, 30, '#ffe04a')}`),

  pillar: () => frame('brimstone', `
    <g stroke="url(#flame-yellow)" stroke-width="2" stroke-linecap="round" opacity=".85">
      ${[20, 45, 70, 130, 155, 180, 35, 165].map((x, i) => `<line x1="${x}" y1="${i * 9}" x2="${x - 14}" y2="${i * 9 + 30}"/>`).join('')}
    </g>
    <path d="M0,140 L0,118 L10,118 L10,104 L22,104 L22,112 L34,112 L34,98 L44,98 L44,116 L60,116 L60,140 Z" fill="#140c03"/>
    <path d="M140,140 L140,114 L152,114 L152,100 L166,100 L166,110 L178,110 L178,96 L190,96 L190,112 L200,112 L200,140 Z" fill="#140c03"/>
    ${flameRow(0, 60, 104, 5, 0.7, 'flame', 4)}
    ${flameRow(140, 200, 102, 5, 0.7, 'flame', 5)}
    <ellipse cx="100" cy="132" rx="30" ry="5" fill="#000" opacity=".5"/>
    <path d="M88,132 L91,74 C91,62 95,56 100,56 C105,56 109,62 109,74 L112,132 Z" fill="url(#salt)"/>
    <path d="M92,50 C92,40 108,40 108,50 C108,56 104,60 100,60 C96,60 92,56 92,50 Z" fill="url(#salt)"/>
    <path d="M93,46 C96,36 108,38 110,50 C106,46 100,44 93,46 Z" fill="#cfc8b8"/>
    <g stroke="#8a8374" stroke-width=".6" fill="none" opacity=".8">
      <path d="M96,70 L99,84 L95,96"/><path d="M104,90 L106,104 L102,118"/><path d="M98,104 L97,122"/>
    </g>
    ${sparks(12, 20, '#ffe04a')}`),

  cerberus: () => {
    const head = 'M-12,8 C-14,-4 -8,-14 2,-14 L6,-24 L10,-12 C15,-10 19,-6 23,-3 C25,1 21,5 15,5 L10,11 C4,15 -8,15 -12,8 Z';
    const h = (tx, ty, sx, sy) => `<g transform="translate(${tx},${ty}) scale(${sx},${sy})">
        <path d="${head}" fill="#1a1208" stroke="#6a5524" stroke-width=".8"/>
        <circle cx="7" cy="-6" r="1.8" fill="#ff3b1f" filter="url(#glow)"/>
        ${flame(16, 6, 0.35, 'flame', 160)}
      </g>`;
    return frame('brimstone', `
      <g stroke="#3a2a0c" stroke-width="5">${[30, 50, 70, 130, 150, 170].map((x) => `<line x1="${x}" y1="0" x2="${x}" y2="140"/>`).join('')}</g>
      <path d="M20,0 Q100,40 180,0" stroke="#3a2a0c" stroke-width="7" fill="none"/>
      <circle cx="100" cy="80" r="50" fill="url(#hot-core)" opacity=".3"/>
      <path d="M52,140 C52,104 74,80 100,78 C126,80 148,104 148,140 Z" fill="#1a1208" stroke="#6a5524" stroke-width=".8"/>
      ${h(70, 70, -1.25, 1.25)}
      ${h(130, 70, 1.25, 1.25)}
      ${h(100, 54, 1.45, 1.45)}
      ${sparks(13, 18, '#ff8a1f')}`);
  },

  harpy: () => frame('phlegethon', `
    <g stroke="#1a0508" stroke-linecap="round" fill="none">
      <path d="M22,140 C26,112 16,92 28,68 C34,56 30,44 36,30" stroke-width="7"/>
      <path d="M27,84 L8,64 M29,70 L44,52 M33,46 L20,32" stroke-width="3"/>
      <path d="M178,140 C172,116 184,94 170,72 C164,60 170,48 162,34" stroke-width="7"/>
      <path d="M172,92 L192,74 M169,70 L152,56 M165,46 L180,30" stroke-width="3"/>
      <path d="M50,104 C80,98 130,96 172,100" stroke-width="5"/>
    </g>
    <g fill="#ff3b3b" opacity=".8"><circle cx="9" cy="65" r="1.5"/><circle cx="191" cy="75" r="1.5"/><circle cx="45" cy="53" r="1.3"/></g>
    <path d="M110,72 C92,42 62,36 48,48 C64,50 70,58 72,66 C82,60 92,64 96,74 Z" fill="#2a0a10" stroke="#8a1020" stroke-width=".8"/>
    <path d="M110,72 C128,42 158,36 172,48 C156,50 150,58 148,66 C138,60 128,64 124,74 Z" fill="#2a0a10" stroke="#8a1020" stroke-width=".8"/>
    <path d="M104,66 C101,78 103,90 110,98 C117,90 119,78 116,66 Z" fill="#3a1218"/>
    <path d="M104,60 C100,70 98,78 96,84 M116,60 C118,70 122,76 124,82" stroke="#1a0508" stroke-width="3" fill="none"/>
    <circle cx="110" cy="59" r="6.5" fill="#3a1218"/>
    <g fill="#ff3b1f" filter="url(#glow)"><circle cx="107.5" cy="58.5" r="1.2"/><circle cx="112.5" cy="58.5" r="1.2"/></g>
    <path d="M106,98 L104,104 M110,98 L110,104 M114,98 L116,104" stroke="#3a1218" stroke-width="2"/>
    ${sparks(21, 22, '#ff5a3a')}`),

  nessus: () => frame('phlegethon', `
    <path d="M0,112 C30,106 60,118 100,112 C140,106 170,118 200,112 L200,140 L0,140 Z" fill="url(#blood)"/>
    <path d="M0,124 C40,118 80,130 120,124 C150,120 180,128 200,124" stroke="#ff7070" stroke-width="1" fill="none" opacity=".6"/>
    <g fill="none" stroke="#ff9a9a" stroke-width=".8" opacity=".7"><circle cx="40" cy="128" r="2"/><circle cx="150" cy="132" r="1.6"/><circle cx="90" cy="134" r="1.2"/></g>
    <g fill="#240608">
      <path d="M58,90 C58,78 72,74 88,76 L112,76 C122,76 126,84 124,92 C122,98 114,100 108,98 L70,98 C62,98 58,96 58,90 Z"/>
      <path d="M58,86 C50,90 46,98 44,108 C50,100 56,96 60,94 Z"/>
      <path d="M110,78 C108,68 110,58 116,54 C122,56 124,68 122,78 Z"/>
      <circle cx="117" cy="48" r="5.5"/>
    </g>
    <g stroke="#240608" stroke-width="4.5" stroke-linecap="round">
      <line x1="68" y1="96" x2="64" y2="116"/><line x1="76" y1="97" x2="80" y2="116"/>
      <line x1="108" y1="97" x2="104" y2="116"/><line x1="116" y1="96" x2="122" y2="114"/>
    </g>
    <g stroke="#240608" stroke-width="3" stroke-linecap="round"><line x1="118" y1="60" x2="140" y2="56"/><line x1="118" y1="62" x2="132" y2="60"/></g>
    <path d="M140,28 Q158,56 140,84" stroke="#5a1a10" stroke-width="3" fill="none"/>
    <line x1="140" y1="28" x2="130" y2="58" stroke="#ddd" stroke-width=".6"/><line x1="130" y1="58" x2="140" y2="84" stroke="#ddd" stroke-width=".6"/>
    <line x1="130" y1="58" x2="176" y2="54" stroke="#caa" stroke-width="1.4"/>
    <g filter="url(#glow)">${flame(178, 54, 0.45, 'flame', -95)}</g>
    ${sparks(22, 18, '#ff5a3a')}`),

  minotaur: () => frame('phlegethon', `
    <g stroke="#4a0a14" stroke-width="2" fill="none" opacity=".7">
      <path d="M10,10 H60 V40 H30 V70 H70 M190,10 H140 V40 H170 V70 H130 M10,90 H40 V120 M190,90 H160 V120"/>
    </g>
    <circle cx="100" cy="72" r="56" fill="url(#hot-core)" opacity=".35"/>
    <path d="M44,140 C50,110 74,98 100,98 C126,98 150,110 156,140 Z" fill="#1c0508"/>
    <path d="M84,52 C70,50 50,44 42,24 C56,36 70,40 88,44 Z" fill="#d8c8a8"/>
    <path d="M116,52 C130,50 150,44 158,24 C144,36 130,40 112,44 Z" fill="#d8c8a8"/>
    <path d="M80,58 C80,46 90,40 100,40 C110,40 120,46 120,58 L116,84 C114,96 108,102 100,102 C92,102 86,96 84,84 Z" fill="#2a0a0e"/>
    <path d="M80,56 L70,60 L80,64 Z M120,56 L130,60 L120,64 Z" fill="#2a0a0e"/>
    <ellipse cx="100" cy="90" rx="12" ry="9" fill="#4a1a1c"/>
    <g fill="#120203"><ellipse cx="95" cy="91" rx="2.2" ry="3"/><ellipse cx="105" cy="91" rx="2.2" ry="3"/></g>
    <circle cx="100" cy="100" r="5" fill="none" stroke="url(#gold)" stroke-width="1.8"/>
    <g fill="#ff2a1a" filter="url(#glow)"><path d="M87,62 L96,65 L88,67 Z"/><path d="M113,62 L104,65 L112,67 Z"/></g>
    <g fill="#ffffff" opacity=".25" filter="url(#blur3)"><circle cx="86" cy="104" r="5"/><circle cx="114" cy="104" r="5"/></g>
    ${sparks(23, 16, '#ff5a3a')}`),

  heretic: () => frame('pyre', `
    ${[[30, 92, 0.5], [70, 86, 0.4], [140, 88, 0.45], [178, 94, 0.5]].map(([x, y, s]) => `
      <rect x="${x - 16 * s * 2}" y="${y}" width="${32 * s * 2}" height="${10 * s * 2}" fill="#2a1408"/>
      ${flameRow(x - 12 * s * 2, x + 12 * s * 2, y, 3, s, 'flame', x)}`).join('')}
    <path d="M44,104 L156,104 L166,130 L34,130 Z" fill="url(#stone)"/>
    <path d="M54,106 L146,106 L154,124 L46,124 Z" fill="#1a0602"/>
    <ellipse cx="100" cy="116" rx="44" ry="8" fill="url(#hot-core)" opacity=".9"/>
    <path d="M140,100 L188,76 L194,86 L148,110 Z" fill="url(#stone)"/>
    ${flameRow(56, 144, 120, 9, 1.2, 'flame', 9)}
    <path d="M96,96 L95,74 L98,73 L99,86 L100,70 L103,70 L103,86 L105,72 L108,73 L106,88 L109,80 L112,82 L106,98 Z" fill="#1a0602"/>
    ${sparks(31, 30, '#ffd27a')}`),

  martyr: () => frame('pyre', `
    <circle cx="100" cy="70" r="60" fill="url(#hot-core)" opacity=".4"/>
    <rect x="97" y="22" width="6" height="96" fill="#2a1408"/>
    <path d="M93,40 C93,34 107,34 107,40 C107,46 103,48 100,48 C97,48 93,46 93,40 Z" fill="#1a0a04"/>
    <path d="M90,52 C90,48 110,48 110,52 L108,92 L92,92 Z" fill="#1a0a04"/>
    <path d="M90,54 L84,70 L96,64 M110,54 L116,70 L104,64" stroke="#1a0a04" stroke-width="3" fill="none"/>
    <path d="M89,70 L111,70" stroke="#6a4a2a" stroke-width="1.6"/>
    <g stroke="#3a1c0a" stroke-width="6" stroke-linecap="round">
      <line x1="56" y1="124" x2="144" y2="104"/><line x1="56" y1="104" x2="144" y2="124"/>
      <line x1="66" y1="130" x2="134" y2="112"/><line x1="66" y1="112" x2="134" y2="130"/>
    </g>
    ${flameRow(54, 146, 118, 9, 1.4, 'flame', 17)}
    ${flameRow(70, 130, 104, 5, 1.0, 'flame', 18)}
    <ellipse cx="100" cy="18" rx="50" ry="12" fill="#2a2420" opacity=".55" filter="url(#blur6)"/>
    ${sparks(32, 34, '#ffd27a')}`),

  phoenix: () => frame('pyre', `
    <circle cx="100" cy="60" r="48" fill="url(#hot-core)" opacity=".6"/>
    <path d="M100,70 C80,62 50,34 26,20 C40,40 36,46 48,52 C36,52 32,58 26,64 C44,64 50,70 58,72 C48,78 46,84 44,90 C64,86 84,80 100,82 Z" fill="url(#flame)" filter="url(#glow)"/>
    <path d="M100,70 C120,62 150,34 174,20 C160,40 164,46 152,52 C164,52 168,58 174,64 C156,64 150,70 142,72 C152,78 154,84 156,90 C136,86 116,80 100,82 Z" fill="url(#flame)" filter="url(#glow)"/>
    <path d="M100,58 C109,62 110,80 100,98 C90,80 91,62 100,58 Z" fill="#ffd27a"/>
    <circle cx="100" cy="54" r="6" fill="#ffe8a0"/>
    <path d="M100,56 L105,60 L100,61 Z" fill="#7a2a00"/>
    <circle cx="101.5" cy="53" r="1" fill="#7a0000"/>
    ${flame(96, 50, 0.4, 'flame', -20)}${flame(100, 49, 0.5)}${flame(104, 50, 0.4, 'flame', 20)}
    ${flame(100, 96, 1.4, 'flame', 180)}${flame(92, 96, 1.1, 'flame', 165)}${flame(108, 96, 1.1, 'flame', 195)}
    ${sparks(33, 40, '#fff0b0')}`),

  farinata: () => frame('pyre', `
    ${flameRow(30, 170, 120, 12, 2.2, 'flame', 41)}
    <circle cx="100" cy="76" r="40" fill="#120502" opacity=".5" filter="url(#blur6)"/>
    <path d="M68,124 C70,98 82,88 100,86 C118,88 130,98 132,124 Z" fill="#1c0a04"/>
    <path d="M76,108 C88,100 112,100 124,108 L124,115 C112,108 88,108 76,115 Z" fill="#3a1c0c"/>
    <path d="M94,86 L100,96 L106,86 Z" fill="#3a1c0c"/>
    <ellipse cx="100" cy="72" rx="10" ry="12" fill="#1c0a04"/>
    <path d="M89,68 C88,56 112,56 111,68 C106,62 94,62 89,68 Z" fill="#5a1a0a"/>
    <path d="M100,72 L104,77 L100,78" stroke="#ff9a3a" stroke-width=".8" fill="none" opacity=".6"/>
    <rect x="40" y="122" width="120" height="18" fill="url(#stone)"/>
    <path d="M36,118 L164,118 L160,124 L40,124 Z" fill="#6a5f52"/>
    ${sparks(34, 26, '#ffd27a')}`),

  malacoda: () => frame('fallen', `
    <path d="M0,112 C40,108 80,116 120,110 C150,106 180,114 200,110 L200,140 L0,140 Z" fill="#050208"/>
    <g fill="none" stroke="#6a4a8a" stroke-width=".8"><circle cx="30" cy="122" r="3"/><circle cx="160" cy="126" r="2.4"/><circle cx="110" cy="132" r="2"/></g>
    <path d="M60,118 L70,112 L66,124 Z M150,120 L142,112 L144,124 Z" fill="#1a0a24"/>
    ${batWings(96, 62, 0.9, '#1a0a24', '#7a4ab8')}
    <path d="M86,96 C82,82 86,66 96,62 C106,66 110,82 106,96 Z" fill="#26103a"/>
    <path d="M104,92 C120,96 128,104 120,114 L124,116" stroke="#26103a" stroke-width="2.5" fill="none"/>
    <path d="M86,96 L80,108 M106,96 L112,108" stroke="#26103a" stroke-width="4" stroke-linecap="round"/>
    ${hornedHead(96, 54, 8, '#26103a', '#ff3b1f')}
    <path d="M90,57 L93,60 L96,57 L99,60 L102,57" stroke="#fff" stroke-width="1" fill="none"/>
    <line x1="60" y1="30" x2="140" y2="104" stroke="#4a3a2a" stroke-width="2.5"/>
    <path d="M60,30 C50,22 52,10 62,10 C68,10 70,16 66,20" stroke="#9a9aa8" stroke-width="2.5" fill="none"/>
    <path d="M100,70 L86,64" stroke="#26103a" stroke-width="4" stroke-linecap="round"/>
    ${sparks(41, 20, '#c9a0ff')}`),

  moloch: () => frame('fallen', `
    <rect x="12" y="10" width="16" height="130" fill="#14081e"/><rect x="172" y="10" width="16" height="130" fill="#14081e"/>
    <rect x="6" y="6" width="28" height="8" fill="#1e0e2c"/><rect x="166" y="6" width="28" height="8" fill="#1e0e2c"/>
    <ellipse cx="100" cy="30" rx="70" ry="22" fill="#3a2a40" opacity=".5" filter="url(#blur6)"/>
    <path d="M58,140 L64,92 C68,76 82,70 100,70 C118,70 132,76 136,92 L142,140 Z" fill="url(#bronze)"/>
    <path d="M64,94 L30,104 L30,112 L68,106 Z M136,94 L170,104 L170,112 L132,106 Z" fill="url(#bronze)"/>
    <rect x="22" y="100" width="14" height="4" fill="#9a5a22"/><rect x="164" y="100" width="14" height="4" fill="#9a5a22"/>
    <path d="M86,48 C76,46 64,40 60,26 C70,34 78,36 90,40 Z M114,48 C124,46 136,40 140,26 C130,34 122,36 110,40 Z" fill="#c8b890"/>
    <path d="M84,52 C84,42 92,38 100,38 C108,38 116,42 116,52 L112,68 C110,76 106,80 100,80 C94,80 90,76 88,68 Z" fill="url(#bronze)"/>
    <g fill="#ff6a1a" filter="url(#glow)"><circle cx="93" cy="56" r="2"/><circle cx="107" cy="56" r="2"/></g>
    <path d="M86,138 L86,116 C86,104 114,104 114,116 L114,138 Z" fill="#1a0602"/>
    <path d="M88,138 L88,118 C88,108 112,108 112,118 L112,138 Z" fill="url(#hot-core)"/>
    ${flameRow(88, 112, 138, 4, 1.0, 'flame', 51)}
    ${sparks(42, 26, '#ffb06a')}`),

  lucifer: () => frame('ice', `
    <g stroke="#cfefff" stroke-width=".7" opacity=".45" fill="none">
      <path d="M0,30 C40,24 60,40 100,34 C140,28 160,44 200,38"/><path d="M0,54 C50,48 80,62 120,56 C160,50 180,60 200,56"/>
    </g>
    ${batWings(100, 60, 1.25, '#0a1520', '#9fe3ff')}
    ${batWings(100, 76, 1.0, '#0d1a26', '#7fc8ee')}
    ${batWings(100, 90, 0.8, '#0f1e2c', '#6ab4dc')}
    <path d="M62,118 C64,94 80,80 100,80 C120,80 136,94 138,118 Z" fill="#0a1218"/>
    <circle cx="80" cy="74" r="8" fill="#c8b860"/><circle cx="120" cy="74" r="8" fill="#141414"/>
    <circle cx="100" cy="66" r="11" fill="#7a1010"/>
    <path d="M92,58 L84,40 L96,55 Z M108,58 L116,40 L104,55 Z" fill="#7a1010"/>
    <g fill="#d8f6ff" filter="url(#glow)">
      <circle cx="96" cy="66" r="1.6"/><circle cx="104" cy="66" r="1.6"/>
      <circle cx="77" cy="74" r="1.1"/><circle cx="83" cy="74" r="1.1"/><circle cx="117" cy="74" r="1.1"/><circle cx="123" cy="74" r="1.1"/>
    </g>
    <path d="M0,112 L26,102 L48,110 L76,100 L100,110 L124,98 L150,108 L176,100 L200,108 L200,140 L0,140 Z" fill="url(#ice-sheet)" opacity=".92"/>
    <g fill="#e8fbff" opacity=".8">
      <path d="M30,112 L36,92 L40,112 Z"/><path d="M150,110 L157,86 L162,110 Z"/><path d="M66,116 L70,102 L74,116 Z"/><path d="M128,114 L131,100 L135,114 Z"/>
    </g>
    ${sparks(43, 40, '#e8fbff')}`),

  locust: () => frame('ash', `
    <path d="M60,140 C70,110 50,80 80,50 C100,30 90,10 110,0 L150,0 C130,20 140,40 120,60 C100,80 120,110 110,140 Z" fill="#2a2826" opacity=".8" filter="url(#smoke)"/>
    <ellipse cx="100" cy="134" rx="46" ry="6" fill="#000"/>
    <ellipse cx="100" cy="133" rx="40" ry="3" fill="url(#hot-core)" opacity=".7"/>
    <g opacity=".35" fill="#e8e4dc"><ellipse cx="96" cy="56" rx="34" ry="9" transform="rotate(-18 96 56)"/><ellipse cx="102" cy="62" rx="30" ry="7" transform="rotate(-6 102 62)"/></g>
    <ellipse cx="96" cy="76" rx="22" ry="10" fill="#3a352c"/>
    <path d="M78,72 h36 M78,78 h36" stroke="#6a6458" stroke-width="1.2"/>
    <path d="M74,76 C60,78 50,72 46,60 C44,50 52,44 58,50" stroke="#3a352c" stroke-width="5" fill="none" stroke-linecap="round"/>
    <path d="M58,50 L62,42 L54,46 Z" fill="#9a9488"/>
    <ellipse cx="124" cy="72" rx="9" ry="10" fill="#4a4438"/>
    <path d="M118,66 L120,60 L123,64 L126,58 L129,64 L132,60 L132,66 Z" fill="url(#gold)"/>
    <path d="M126,70 C132,72 134,76 132,78" stroke="#c9c4bc" stroke-width=".6" fill="none"/>
    <circle cx="127" cy="70" r="1.2" fill="#ffcf5a" filter="url(#glow)"/>
    <path d="M118,76 C112,80 112,86 116,90" stroke="#6a5a3a" stroke-width="2" fill="none"/>
    <g stroke="#3a352c" stroke-width="2" fill="none" stroke-linecap="round">
      <path d="M86,84 L80,98 L74,100"/><path d="M98,86 L98,100 L92,104"/><path d="M110,84 L116,98 L122,100"/>
    </g>
    ${sparks(51, 24, '#d8d2c8')}`),

  shade: () => {
    const r = prng(61);
    let rings = '';
    for (let i = 0; i < 10; i++) {
      rings += `<ellipse cx="${100 + Math.sin(i * 0.9) * 8}" cy="${16 + i * 12}" rx="${74 - i * 6.5}" ry="${7 - i * 0.3}"
        fill="none" stroke="#d8d2c8" stroke-width="${1.4 - i * 0.08}" opacity="${0.25 + r() * 0.35}"/>`;
    }
    const wisp = (x, y, s, rot) => `<path d="M0,0 C-5,-7 -4,-16 0,-18 C4,-16 5,-7 0,0 C3,6 -3,12 1,20" transform="translate(${x},${y}) rotate(${rot}) scale(${s})"
        fill="#ece8e0" stroke="#ece8e0" stroke-width=".6" opacity=".55" filter="url(#glow)"/>`;
    return frame('ash', `
      <g filter="url(#smoke)">${rings}</g>
      ${wisp(48, 30, 1, -60)}${wisp(150, 44, 0.9, 60)}${wisp(70, 70, 0.8, -40)}${wisp(132, 86, 0.75, 50)}${wisp(90, 108, 0.6, -20)}
      <g transform="translate(100,64)" opacity=".85" filter="url(#glow)">
        <path d="M-6,-12 C-10,-4 -8,10 -4,20 C-2,10 -2,0 -1,-8 Z" fill="#f4f0e8"/>
        <path d="M6,-12 C10,-4 8,10 4,20 C2,10 2,0 1,-8 Z" fill="#f4f0e8"/>
        <circle cx="-5" cy="-16" r="4" fill="#f4f0e8"/><circle cx="5" cy="-16" r="4" fill="#f4f0e8"/>
      </g>
      ${sparks(62, 16, '#ffffff')}`);
  },

  abaddon: () => frame('ash', `
    <g filter="url(#blur6)" fill="#3a3632" opacity=".9">
      <ellipse cx="100" cy="110" rx="34" ry="20"/><ellipse cx="90" cy="80" rx="40" ry="22"/><ellipse cx="112" cy="50" rx="46" ry="22"/><ellipse cx="96" cy="20" rx="56" ry="20"/>
    </g>
    <path d="M100,62 C80,40 46,26 14,30 C30,36 30,42 22,48 C36,48 38,54 30,60 C44,60 46,66 40,72 C56,70 70,72 96,78 Z" fill="#14120f" stroke="#5a554c" stroke-width=".8"/>
    <path d="M100,62 C120,40 154,26 186,30 C170,36 170,42 178,48 C164,48 162,54 170,60 C156,60 154,66 160,72 C144,70 130,72 104,78 Z" fill="#14120f" stroke="#5a554c" stroke-width=".8"/>
    <path d="M88,112 L94,62 C96,58 104,58 106,62 L112,112 Z" fill="#1c1a16"/>
    <circle cx="100" cy="54" r="7" fill="#1c1a16"/>
    <circle cx="100" cy="52" r="12" fill="none" stroke="#8a7a5a" stroke-width="1.4" stroke-dasharray="10 4 18 6"/>
    <g fill="#ff6a1a" filter="url(#glow)"><circle cx="97.5" cy="54" r="1.1"/><circle cx="102.5" cy="54" r="1.1"/></g>
    <path d="M106,72 L118,86" stroke="#1c1a16" stroke-width="4" stroke-linecap="round"/>
    <line x1="118" y1="86" x2="130" y2="100" stroke="url(#gold)" stroke-width="2"/>
    <circle cx="116" cy="84" r="3" fill="none" stroke="url(#gold)" stroke-width="1.6"/>
    <path d="M126,96 l3,-3 M129,100 l3,-3" stroke="#d8b84a" stroke-width="1.5"/>
    <ellipse cx="100" cy="128" rx="44" ry="9" fill="#000"/>
    <ellipse cx="100" cy="127" rx="40" ry="5" fill="none" stroke="#ff6a1a" stroke-width="1.5" opacity=".8" filter="url(#glow)"/>
    <g fill="#0a0908">${[[40, 40], [160, 36], [56, 90], [150, 96], [28, 70], [172, 66]].map(([x, y]) => `<path d="M${x},${y} l4,-2 l2,2 l-2,2 Z"/>`).join('')}</g>
    ${sparks(52, 14, '#ff9a5a')}`),

  plutus: () => frame('brimstone', `
    <circle cx="100" cy="74" r="56" fill="url(#hot-core)" opacity=".3"/>
    <path d="M30,140 C44,112 70,104 100,102 C130,104 156,112 170,140 Z" fill="#3a2a08"/>
    <g fill="url(#gold)" stroke="#5a4206" stroke-width=".6">
      ${[[44, 128], [60, 120], [78, 114], [122, 114], [140, 120], [156, 128], [70, 130], [130, 130], [100, 124], [88, 134], [112, 134]]
        .map(([x, y]) => `<ellipse cx="${x}" cy="${y}" rx="7" ry="2.6"/>`).join('')}
    </g>
    <path d="M76,108 C72,90 76,70 90,58 L84,40 L96,52 L104,52 L116,40 L110,58 C124,70 128,90 124,108 Z" fill="#1e1608"/>
    <path d="M100,62 C108,62 116,74 112,86 L106,94 L100,98 L94,94 L88,86 C84,74 92,62 100,62 Z" fill="#2c210c"/>
    <path d="M94,92 L100,104 L106,92" fill="#2c210c"/>
    <path d="M95,96 l2,4 l2,-4 M101,96 l2,4 l2,-4" fill="#e8e0c8"/>
    <g fill="#ffd84a" filter="url(#glow)"><path d="M90,74 l7,2 l-6,2 Z"/><path d="M110,74 l-7,2 l6,2 Z"/></g>
    <path d="M124,104 C140,100 150,88 146,74" stroke="#1e1608" stroke-width="6" fill="none" stroke-linecap="round"/>
    ${sparks(71, 26, '#ffe04a')}`),

  usurer: () => frame('phlegethon', `
    ${[[20, 10], [48, 30], [80, 6], [128, 22], [160, 8], [182, 40], [36, 58], [150, 60], [110, 44]]
      .map(([x, y], i) => flame(x, y, 0.45, 'flame', 180 + (i % 3 - 1) * 12, 0.85)).join('')}
    <path d="M0,112 C40,106 80,114 120,108 C150,104 180,110 200,108 L200,140 L0,140 Z" fill="#c26a2a"/>
    <path d="M0,118 C50,114 90,122 130,116 C160,112 186,118 200,116 L200,140 L0,140 Z" fill="#7a3410"/>
    <ellipse cx="100" cy="116" rx="40" ry="5" fill="url(#hot-core)" opacity=".7"/>
    <path d="M70,116 C70,92 82,76 98,74 C114,76 128,90 130,116 Z" fill="#2a0810"/>
    <circle cx="96" cy="68" r="9" fill="#2a0810"/>
    <path d="M90,72 C84,84 80,94 84,104" stroke="#2a0810" stroke-width="4" fill="none" stroke-linecap="round"/>
    <path d="M90,78 C94,86 100,88 104,86" stroke="#c9a040" stroke-width="1" fill="none"/>
    <path d="M100,86 C92,88 92,104 102,104 C112,104 112,88 104,86 Z" fill="url(#gold)" stroke="#6a4a0a" stroke-width=".8"/>
    <path d="M100,94 l4,0" stroke="#6a4a0a" stroke-width="1.2"/>
    <g fill="#ffd84a" filter="url(#glow)"><circle cx="94" cy="70" r="1.1"/><circle cx="99" cy="70" r="1.1"/></g>
    ${sparks(72, 24, '#ffb06a')}`),

  simon: () => frame('pyre', `
    <path d="M0,104 L200,104 L200,140 L0,140 Z" fill="url(#stone)"/>
    ${[30, 170].map((x) => `<ellipse cx="${x}" cy="108" rx="14" ry="4" fill="#120502"/>${flame(x - 4, 106, 0.6)}${flame(x + 4, 106, 0.55)}`).join('')}
    <ellipse cx="100" cy="108" rx="18" ry="5" fill="#120502"/>
    <path d="M90,108 C90,92 92,80 94,66 L100,66 L101,90 L102,66 L108,66 C110,80 110,92 110,108 Z" fill="#1c0a04"/>
    <path d="M88,108 C92,104 108,104 112,108" stroke="#3a1c0a" stroke-width="3" fill="none"/>
    <path d="M94,66 L88,62 L96,60 Z M108,66 L114,62 L106,60 Z" fill="#1c0a04"/>
    <g filter="url(#glow)">${flame(91, 62, 0.9, 'flame', -10)}${flame(111, 62, 0.9, 'flame', 10)}${flame(91, 60, 0.55, 'flame-yellow', -10)}${flame(111, 60, 0.55, 'flame-yellow', 10)}</g>
    <g fill="url(#gold)" stroke="#6a4a0a" stroke-width=".5">
      <ellipse cx="62" cy="114" rx="5" ry="2"/><ellipse cx="140" cy="116" rx="5" ry="2"/><ellipse cx="124" cy="126" rx="5" ry="2"/>
    </g>
    ${sparks(73, 30, '#ffd27a')}`),

  mammon: () => frame('fallen', `
    <circle cx="100" cy="66" r="50" fill="url(#hot-core)" opacity=".25"/>
    ${batWings(100, 66, 1.0, '#1a0a24', '#9a7a3a')}
    <path d="M78,124 C76,96 84,78 100,74 C116,78 124,96 122,124 Z" fill="#26103a"/>
    <path d="M86,84 L100,96 L114,84" stroke="url(#gold)" stroke-width="2" fill="none"/>
    ${hornedHead(100, 62, 9, '#26103a', '#ffd84a')}
    <path d="M89,52 L91,44 L95,50 L100,42 L105,50 L109,44 L111,52 Z" fill="url(#gold)"/>
    <path d="M82,96 C72,100 68,108 72,116 M118,96 C128,100 132,108 128,116" stroke="#26103a" stroke-width="5" fill="none" stroke-linecap="round"/>
    <g fill="url(#gold)" stroke="#6a4a0a" stroke-width=".6">
      ${[[60, 132], [74, 128], [88, 134], [100, 128], [112, 134], [126, 128], [140, 132], [70, 120], [130, 120], [100, 136]]
        .map(([x, y]) => `<ellipse cx="${x}" cy="${y}" rx="8" ry="3"/>`).join('')}
    </g>
    <g fill="url(#gold)" filter="url(#glow)"><circle cx="72" cy="116" r="3"/><circle cx="128" cy="116" r="3"/></g>
    ${sparks(74, 28, '#ffe08a')}`),

  soothsayer: () => frame('ash', `
    <g filter="url(#blur6)" fill="#3a3632" opacity=".8"><ellipse cx="60" cy="30" rx="60" ry="16"/><ellipse cx="150" cy="50" rx="50" ry="14"/></g>
    <path d="M0,118 C60,112 140,122 200,116 L200,140 L0,140 Z" fill="#0e0d0c"/>
    <line x1="132" y1="38" x2="124" y2="124" stroke="#4a3a2a" stroke-width="2.5"/>
    <circle cx="133" cy="34" r="5" fill="#d8f0ff" opacity=".6" filter="url(#glow)"/>
    <path d="M78,124 C80,100 86,78 100,70 C114,78 120,100 122,124 Z" fill="#1c1a16"/>
    <path d="M114,84 C122,86 126,90 128,96" stroke="#1c1a16" stroke-width="5" fill="none" stroke-linecap="round"/>
    <circle cx="100" cy="60" r="9" fill="#1c1a16"/>
    <path d="M92,56 C96,52 104,52 108,56 L108,62 C104,60 96,60 92,62 Z" fill="#2c2924"/>
    <path d="M100,68 C104,72 106,80 104,88" stroke="#bfe6ff" stroke-width=".8" fill="none" opacity=".6"/>
    <g fill="#bfe6ff" opacity=".7"><circle cx="104" cy="90" r="1"/><circle cx="103" cy="96" r=".8"/></g>
    <path d="M72,40 l-10,-4 M66,48 l-12,0 M70,56 l-10,4" stroke="#e8e4dc" stroke-width="1" opacity=".5"/>
    ${sparks(75, 18, '#d8d2c8')}`),

  // ---------- embers ----------

  'ember-brimstone': () => frame('brimstone', `
    <circle cx="100" cy="70" r="40" fill="url(#hot-core)" opacity=".5"/>
    <g filter="url(#glow)">${flame(100, 98, 2.4, 'flame-yellow')}</g>
    <g fill="#e8c547" stroke="#7a5a12" stroke-width=".8">
      <path d="M72,112 L80,92 L88,112 Z"/><path d="M84,114 L94,88 L104,114 Z"/><path d="M98,114 L110,94 L118,114 Z"/><path d="M112,112 L122,98 L128,112 Z"/>
    </g>
    ${sparks(71, 30, '#ffe04a')}`),

  'ember-phlegethon': () => frame('phlegethon', `
    <circle cx="100" cy="70" r="40" fill="url(#hot-core)" opacity=".35"/>
    <path d="M100,30 C112,52 124,66 124,84 C124,98 113,108 100,108 C87,108 76,98 76,84 C76,66 88,52 100,30 Z" fill="url(#blood)" filter="url(#glow)"/>
    <path d="M90,80 C90,72 94,66 98,60" stroke="#ffb0b0" stroke-width="2" fill="none" opacity=".6"/>
    <g fill="#c01020"><circle cx="70" cy="118" r="3"/><circle cx="132" cy="114" r="2.4"/><circle cx="116" cy="124" r="1.8"/></g>
    ${sparks(72, 24, '#ff5a3a')}`),

  'ember-pyre': () => frame('pyre', `
    <circle cx="100" cy="76" r="44" fill="url(#hot-core)" opacity=".55"/>
    <g stroke="#3a1c0a" stroke-width="7" stroke-linecap="round"><line x1="66" y1="120" x2="134" y2="104"/><line x1="66" y1="104" x2="134" y2="120"/></g>
    <g filter="url(#glow)">${flame(100, 110, 2.6)}${flame(86, 110, 1.4, 'flame', -15)}${flame(114, 110, 1.4, 'flame', 15)}</g>
    ${sparks(73, 34, '#ffd27a')}`),

  'ember-fallen': () => frame('fallen', `
    <circle cx="100" cy="64" r="40" fill="url(#hot-core)" opacity=".25"/>
    <g transform="rotate(-28 100 76)">
      <path d="M100,26 C114,44 116,80 102,118 L98,118 C84,80 86,44 100,26 Z" fill="#e8deff"/>
      <line x1="100" y1="30" x2="100" y2="126" stroke="#6a4a9a" stroke-width="1.2"/>
      <g stroke="#b8a8d8" stroke-width=".6">${[44, 54, 64, 74, 84, 94].map((y) => `<line x1="100" y1="${y}" x2="${88 + (y - 40) * 0.05}" y2="${y + 8}"/><line x1="100" y1="${y}" x2="${112 - (y - 40) * 0.05}" y2="${y + 8}"/>`).join('')}</g>
      <g filter="url(#glow)">${flame(100, 40, 1.3, 'flame-violet')}${flame(94, 46, 0.8, 'flame-violet', -20)}${flame(106, 46, 0.8, 'flame-violet', 20)}</g>
    </g>
    ${sparks(74, 28, '#c9a0ff')}`),

  'ember-ash': () => frame('ash', `
    <g filter="url(#smoke)" fill="none" stroke="#c9c4bc" stroke-width="5" stroke-linecap="round" opacity=".55">
      <path d="M100,104 C80,90 120,74 100,58 C84,46 108,32 98,16"/>
      <path d="M86,106 C70,94 92,80 78,66"/><path d="M114,106 C130,92 110,80 126,64"/>
    </g>
    <ellipse cx="100" cy="112" rx="26" ry="8" fill="#1c1a18"/>
    <g filter="url(#glow)"><circle cx="94" cy="110" r="3" fill="#ff6a1a"/><circle cx="104" cy="112" r="2.4" fill="#ff8a2a"/><circle cx="110" cy="108" r="1.6" fill="#ffb05a"/></g>
    ${sparks(75, 22, '#e0dcd4')}`),

  'ember-wild': () => {
    const ring = ['flame-yellow', 'flame-red', 'flame', 'flame-violet', 'flame-grey'];
    const flames = ring.map((g, i) => {
      const a = (i / 5) * Math.PI * 2 - Math.PI / 2;
      return flame(100 + Math.cos(a) * 42, 76 + Math.sin(a) * 42, 0.9, g);
    }).join('');
    return frame('wild', `
      <circle cx="100" cy="70" r="46" fill="none" stroke="#ff4b1f" stroke-width="1.2" opacity=".7"/>
      <circle cx="100" cy="70" r="52" fill="none" stroke="#ff4b1f" stroke-width=".5" opacity=".5" stroke-dasharray="3 5"/>
      <circle cx="100" cy="70" r="30" fill="url(#hot-core)" opacity=".7"/>
      <g filter="url(#glow)">${flames}${flame(100, 94, 2.2, 'flame-red')}</g>
      ${sparks(76, 36, '#ff7a4a')}`);
  },
};

const cache = new Map();

export function cardArt(cardId) {
  if (!cache.has(cardId)) cache.set(cardId, (ART[cardId] || (() => frame('wild', '')))());
  return cache.get(cardId);
}
