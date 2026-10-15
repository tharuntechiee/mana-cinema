// Original hero artwork for each film: a backlit silhouette with the hero's signature prop.
// Drawn as SVG so it scales to any poster size and needs no image files.
// A real photo in images/posters/ (see images/README.txt) replaces it automatically.

let artId = 0;

// Head + neck + torso of one figure, centred on cx
function bust(cx = 100, headY = 112, r = 24, w = 62) {
  const t = headY + r + 14;          // top of shoulders
  return `
    <rect x="${cx - r * 0.42}" y="${headY + r - 6}" width="${r * 0.84}" height="${t - headY - r + 12}" />
    <path d="M${cx - w} 300 C${cx - w} ${t + 60} ${cx - w * 0.62} ${t + 6} ${cx} ${t} C${cx + w * 0.62} ${t + 6} ${cx + w} ${t + 60} ${cx + w} 300 Z" />
    <ellipse cx="${cx}" cy="${headY}" rx="${r * 0.88}" ry="${r}" />`;
}

// Each film's hero: shapes inside the silhouette group, plus optional accents drawn on top
const HEROES = {
  og: {
    figure: `
      <g transform="rotate(30 100 165)"><rect x="97" y="10" width="6" height="250" rx="2" /><rect x="88" y="190" width="24" height="6" rx="2" /></g>
      ${bust(100, 110, 24, 66)}
      <path d="M70 160 L100 214 L130 160" fill="none" />`,
    accent: `<rect x="83" y="103" width="34" height="8" rx="3" fill="#ff2433" />
             <rect x="99" y="105" width="2" height="4" fill="#120000" />`,
  },
  kalki: {
    figure: `
      <rect x="150" y="34" width="5" height="266" rx="2" /><path d="M152.5 6 L162 38 L143 38 Z" />
      <path d="M72 134 C70 80 130 80 128 134 L122 156 L78 156 Z" />
      ${bust(100, 116, 22, 62)}`,
    accent: `<path d="M152.5 6 L162 38 L143 38 Z" fill="#ffd27a" fill-opacity=".55" stroke="none" />`,
  },
  pushpa: {
    figure: `
      <g transform="rotate(-38 100 170)"><rect x="97" y="30" width="6" height="220" rx="3" /><path d="M86 30 L118 30 L124 66 L80 66 Z" /></g>
      ${bust(100, 108, 24, 66)}
      <path d="M82 116 C84 150 116 150 118 116 C112 132 88 132 82 116 Z" />`,
    accent: `<path d="M86 30 L118 30 L124 66 L80 66 Z" transform="rotate(-38 100 170)" fill="#ffffff" fill-opacity=".18" stroke="none" />`,
  },
  mirage: {
    figure: `
      ${bust(100, 116, 23, 64)}
      <ellipse cx="100" cy="96" rx="44" ry="7" />
      <path d="M77 96 C79 64 121 64 123 96 Z" />
      <path d="M58 300 L66 166 L92 150 Z M142 300 L134 166 L108 150 Z" />`,
    accent: `<rect x="77" y="88" width="46" height="4" fill="#ffffff" fill-opacity=".3" />`,
  },
  signal: {
    figure: `${bust(100, 114, 23, 62)}`,
    accent: `<path d="M75 116 C75 76 125 76 125 116" fill="none" stroke="#9fffe0" stroke-opacity=".7" stroke-width="5" />
             <rect x="68" y="106" width="10" height="22" rx="4" fill="#9fffe0" fill-opacity=".7" />
             <rect x="122" y="106" width="10" height="22" rx="4" fill="#9fffe0" fill-opacity=".7" />
             <path d="M150 40 a18 18 0 0 1 0 36 M158 30 a30 30 0 0 1 0 56" fill="none" stroke="#9fffe0" stroke-opacity=".45" stroke-width="2.5" />`,
  },
  couple: {
    figure: `${bust(70, 126, 20, 50)}${bust(132, 118, 22, 54)}`,
    accent: `<circle cx="100" cy="60" r="16" fill="#fff6d8" fill-opacity=".55" />`,
  },
  kids: {
    figure: `${bust(100, 176, 17, 44)}`,
    accent: [[40, 70, 4], [62, 120, 3], [150, 60, 5], [160, 130, 3], [120, 40, 3], [80, 30, 2.5], [138, 96, 2.5], [52, 172, 3]]
      .map(([x, y, r]) => `<circle cx="${x}" cy="${y}" r="${r * 2.6}" fill="#ffe680" fill-opacity=".18" /><circle cx="${x}" cy="${y}" r="${r}" fill="#fff3a8" />`).join(""),
  },
  king: {
    figure: `
      <rect x="148" y="12" width="6" height="150" rx="2" /><rect x="138" y="150" width="26" height="6" rx="2" /><rect x="147" y="156" width="8" height="40" rx="3" />
      ${bust(100, 114, 23, 68)}
      <path d="M78 96 L82 74 L91 88 L100 68 L109 88 L118 74 L122 96 Z" />`,
    accent: `<path d="M78 96 L82 74 L91 88 L100 68 L109 88 L118 74 L122 96 Z" fill="#ffd27a" fill-opacity=".6" stroke="none" />`,
  },
  devara: {
    figure: `
      <g transform="rotate(14 100 170)"><rect x="146" y="20" width="5" height="280" rx="2" /><path d="M148.5 -6 L158 26 L139 26 Z" /></g>
      ${bust(98, 112, 24, 66)}
      <path d="M82 120 C84 136 112 136 116 120 C108 128 90 128 82 120 Z" />`,
    accent: `<circle cx="52" cy="58" r="20" fill="#e8f1ff" fill-opacity=".5" />
             <path d="M0 262 Q25 252 50 262 T100 262 T150 262 T200 262" fill="none" stroke="#7fb4ff" stroke-opacity=".55" stroke-width="2" />
             <path d="M0 278 Q25 268 50 278 T100 278 T150 278 T200 278" fill="none" stroke="#7fb4ff" stroke-opacity=".35" stroke-width="2" />`,
  },
  astronaut: {
    figure: `
      <path d="M28 300 C28 220 52 170 100 162 C148 170 172 220 172 300 Z" />
      <circle cx="100" cy="112" r="38" />
      <rect x="128" y="64" width="3" height="22" />`,
    accent: `<ellipse cx="100" cy="114" rx="26" ry="18" fill="#9cc4ff" fill-opacity=".35" />
              <path d="M84 104 Q92 98 100 100" fill="none" stroke="#fff" stroke-opacity=".6" stroke-width="2.5" stroke-linecap="round" />`,
  },
  family: {
    figure: `${bust(58, 124, 20, 46)}${bust(142, 120, 21, 48)}${bust(100, 166, 16, 38)}`,
    accent: `<path d="M150 22 L168 44 L150 66 L132 44 Z" fill="#ffd27a" fill-opacity=".75" />
             <path d="M150 66 C146 86 158 96 150 116" fill="none" stroke="#ffd27a" stroke-opacity=".6" stroke-width="1.5" />`,
  },
  // Warrior with a tall staff and a glowing orb
  staff: {
    figure: `
      <rect x="44" y="34" width="6" height="266" rx="3" />
      ${bust(104, 114, 23, 64)}`,
    accent: `<circle cx="47" cy="30" r="18" fill="#9fd8ff" fill-opacity=".3" />
             <circle cx="47" cy="30" r="7" fill="#e6f6ff" fill-opacity=".9" />`,
  },
  // Athlete raising a flaming torch
  athlete: {
    figure: `
      <rect x="146" y="36" width="7" height="96" rx="3" transform="rotate(8 150 84)" />
      ${bust(98, 118, 23, 64)}`,
    accent: `<path d="M151 2 C164 18 162 31 151 38 C140 31 138 18 151 2 Z" fill="#ffb347" fill-opacity=".85" stroke="none" />
             <path d="M151 14 C156 22 155 29 151 33 C147 29 146 22 151 14 Z" fill="#fff3c4" fill-opacity=".9" stroke="none" />`,
  },
  // Mythological hero holding a trident
  trident: {
    figure: `
      <rect x="149" y="44" width="5" height="256" rx="2" />
      <path d="M151.5 4 L157 34 L146 34 Z" />
      <path d="M134 10 L139 12 C139 34 145 42 151.5 42 C158 42 164 34 164 12 L169 10 C169 40 161 50 151.5 50 C142 50 134 40 134 10 Z" />
      ${bust(96, 114, 23, 64)}`,
    accent: `<path d="M151.5 4 L157 34 L146 34 Z" fill="#ffd27a" fill-opacity=".6" stroke="none" />`,
  },
};

function heroArt(m, cls = "poster-art") {
  const hero = HEROES[m.art];
  if (!hero) return "";
  const id = ++artId;
  return `
    <svg class="${cls}" viewBox="0 0 200 300" preserveAspectRatio="xMidYMax slice" aria-hidden="true" focusable="false">
      <defs>
        <radialGradient id="glow${id}" cx="50%" cy="36%" r="50%">
          <stop offset="0" stop-color="#fff" stop-opacity=".42" />
          <stop offset=".55" stop-color="#fff" stop-opacity=".08" />
          <stop offset="1" stop-color="#fff" stop-opacity="0" />
        </radialGradient>
        <linearGradient id="body${id}" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stop-color="#050307" stop-opacity=".72" />
          <stop offset="1" stop-color="#050307" stop-opacity=".97" />
        </linearGradient>
      </defs>
      <rect width="200" height="300" fill="url(#glow${id})" />
      <g fill="url(#body${id})" stroke="rgba(255,255,255,.32)" stroke-width="1.2" stroke-linejoin="round">${hero.figure}</g>
      ${hero.accent || ""}
    </svg>`;
}
