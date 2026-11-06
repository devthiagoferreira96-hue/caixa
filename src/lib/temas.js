// Temas de cores. A pessoa escolhe 5 cores (ou um tema pronto) e o sistema calcula o resto:
// os tons da cor principal (claros para fundos, escuros para textos e botões) e os cinzas
// levemente puxados para a cor do texto. Tudo com contraste conferido (WCAG AA).

/** Temas prontos */
export const PALETAS = {
  verde: {
    nome: 'Verde Cofre',
    cores: { principal: '#1F6F54', destaque: '#5FB88A', fundo: '#F6FBF7', cartao: '#FFFFFF', texto: '#0E3B2E' },
    amostra: ['#0E3B2E', '#1F6F54', '#5FB88A', '#D7E7DD', '#F6FBF7'],
  },
  navy: {
    nome: 'Azul Navy Contábil',
    cores: { principal: '#123A63', destaque: '#2F5D8C', fundo: '#F2F5F8', cartao: '#C9D6E5', texto: '#0B1F3B' },
    amostra: ['#0B1F3B', '#123A63', '#2F5D8C', '#C9D6E5', '#F2F5F8'],
  },
  cobre: {
    nome: 'Neutros com toque de cobre',
    cores: { principal: '#B87333', destaque: '#B87333', fundo: '#F5F6F8', cartao: '#FFFFFF', texto: '#0F172A' },
    amostra: ['#0F172A', '#4B5563', '#B87333', '#E5E7EB', '#FFFFFF'],
  },
};
export const PALETA_PADRAO = 'verde';

/** O que cada cor muda (para o painel personalizado) */
export const PAPEIS = [
  ['principal', 'Cor principal', 'Botões, menu, links e destaques'],
  ['destaque', 'Cor dos gráficos', 'Barras dos gráficos de gastos'],
  ['fundo', 'Fundo da tela', 'Atrás de tudo'],
  ['cartao', 'Fundo dos quadros', 'Quadros e janelas'],
  ['texto', 'Cor do texto', 'Títulos e textos'],
];

// ------------------------------------------------------------------ contas de cor
const hexParaRgb = (hex) => {
  const h = hex.replace('#', '');
  const n = parseInt(h.length === 3 ? h.split('').map((c) => c + c).join('') : h, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => v / 255);
};
const rgbParaHex = (rgb) =>
  `#${rgb.map((v) => Math.round(Math.min(1, Math.max(0, v)) * 255).toString(16).padStart(2, '0')).join('')}`;
const paraLinear = (v) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
const deLinear = (v) => (v <= 0.0031308 ? 12.92 * v : 1.055 * v ** (1 / 2.4) - 0.055);

/** hex → OKLCH [L, C, H] */
export function oklch(hex) {
  const [r, g, b] = hexParaRgb(hex).map(paraLinear);
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  const L = 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s;
  const A = 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s;
  const B = 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s;
  return [L, Math.hypot(A, B), ((Math.atan2(B, A) * 180) / Math.PI + 360) % 360];
}

function oklchParaRgbLinear(L, C, H) {
  const a = C * Math.cos((H * Math.PI) / 180), b = C * Math.sin((H * Math.PI) / 180);
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3;
  return [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ];
}

/** OKLCH → hex, diminuindo a saturação até caber nas cores da tela */
export function hexDe(L, C, H) {
  L = Math.min(1, Math.max(0, L));
  for (let c = C; c >= 0; c -= 0.002) {
    const rgb = oklchParaRgbLinear(L, c, H);
    if (rgb.every((v) => v >= -0.0001 && v <= 1.0001)) return rgbParaHex(rgb.map(deLinear));
  }
  return rgbParaHex(oklchParaRgbLinear(L, 0, H).map(deLinear));
}

const luminancia = (hex) => {
  const [r, g, b] = hexParaRgb(hex).map(paraLinear);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
/** Contraste entre duas cores (1 a 21). Texto normal precisa de 4,5. */
export function contraste(a, b) {
  const [x, y] = [luminancia(a), luminancia(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
}

/** Escurece (ou clareia) a cor até ter o contraste pedido contra o fundo */
function garantirContraste(hex, fundo, minimo = 4.5) {
  if (contraste(hex, fundo) >= minimo) return { cor: hex, ajustada: false };
  let [L, C, H] = oklch(hex);
  const escurecer = luminancia(fundo) > 0.18;
  for (let i = 0; i < 100 && contraste(hexDe(L, C, H), fundo) < minimo; i++) L += escurecer ? -0.01 : 0.01;
  return { cor: hexDe(L, C, H), ajustada: true };
}

const DEGRAUS = [50, 100, 200, 300, 400, 500, 600, 700, 800, 900, 950];

/**
 * Calcula todas as variáveis de cor do tema.
 * Retorna { variaveis: {nome: valor}, avisos: [], corDoTopo }
 */
export function calcularTema(cores) {
  const avisos = [];
  const { fundo, cartao, texto, destaque } = cores;

  // --- cor principal: o tom 600 é usado em botões com texto branco (precisa de 4,5 de contraste)
  const botao = garantirContraste(cores.principal, '#FFFFFF');
  if (botao.ajustada) avisos.push('A cor principal ficou um pouco mais escura para o texto branco dos botões continuar legível.');
  const [Lp, Cp, Hp] = oklch(botao.cor);
  const claros = { 50: 0.975, 100: 0.94, 200: 0.885, 300: 0.81, 400: 0.72, 500: (0.72 + Lp) / 2 };
  const escuros = { 700: -0.06, 800: -0.12, 900: -0.17, 950: -0.24 };
  const marca = {};
  for (const d of DEGRAUS) {
    if (d === 600) marca[d] = botao.cor;
    else if (claros[d] !== undefined) {
      const L = Math.max(claros[d], d === 500 ? 0 : Lp + 0.05);
      const c = Cp * (d <= 100 ? 0.25 : d <= 200 ? 0.5 : d <= 300 ? 0.75 : 0.95);
      marca[d] = hexDe(L, c, Hp);
    } else marca[d] = hexDe(Math.max(0.12, Lp + escuros[d]), Cp * 0.9, Hp);
  }

  // --- cinzas: mesma claridade dos cinzas padrão, puxados de leve para a cor do texto
  const [, Ct, Ht] = oklch(texto);
  const Lcinza = { 50: 0.985, 100: 0.966, 200: 0.922, 300: 0.868, 400: 0.71, 500: 0.553, 600: 0.444, 700: 0.374, 800: 0.268, 900: 0.216, 950: 0.147 };
  const cinza = {};
  for (const d of DEGRAUS) cinza[d] = hexDe(Lcinza[d], Math.min(Ct, 0.04) * (d >= 800 ? 0.9 : 0.6), Ht);
  // superfícies onde aparece texto: fundo, quadros e os quadradinhos claros de dentro deles
  const superficies = [fundo, cartao, cinza[50], cinza[100], marca[50], marca[100]];
  for (const sobre of superficies) {
    marca[700] = garantirContraste(marca[700], sobre).cor; // links e textos na cor principal
    cinza[600] = garantirContraste(cinza[600], sobre).cor; // texto de apoio
    cinza[700] = garantirContraste(cinza[700], sobre, 7).cor;
  }

  // --- texto principal
  let corTexto = texto;
  for (const [sobre, onde] of [[fundo, 'o fundo da tela'], [cartao, 'o fundo dos quadros']]) {
    if (contraste(corTexto, sobre) < 4.5) avisos.push(`A cor do texto tinha pouco contraste com ${onde}; ela foi ajustada para continuar legível.`);
  }
  for (const sobre of superficies) corTexto = garantirContraste(corTexto, sobre).cor;

  // dinheiro que entra é verde e que sai é vermelho em qualquer tema; só o tom muda para ser legível
  let entrada = '#047857', saida = '#B91C1C';
  for (const sobre of superficies) {
    entrada = garantirContraste(entrada, sobre).cor;
    saida = garantirContraste(saida, sobre).cor;
  }

  const variaveis = {
    '--color-entrada': entrada,
    '--color-saida': saida,
    '--color-fundo': fundo,
    '--color-cartao': cartao,
    '--color-texto': corTexto,
    '--color-destaque': destaque,
  };
  DEGRAUS.forEach((d) => {
    variaveis[`--color-brand-${d}`] = marca[d];
    variaveis[`--color-stone-${d}`] = cinza[d];
  });
  return { variaveis, avisos, corDoTopo: marca[600] };
}

/** Aplica o tema na página */
export function aplicarTema(cores) {
  const { variaveis, corDoTopo } = calcularTema(cores);
  const raiz = document.documentElement.style;
  for (const [k, v] of Object.entries(variaveis)) raiz.setProperty(k, v);
  return corDoTopo;
}

const HEX = /^#[0-9a-f]{6}$/i;
/** As 5 cores das preferências (tema pronto ou personalizado), sempre válidas */
export function coresDasPreferencias(p) {
  if (p.paleta === 'personalizada' && p.cores && Object.keys(PALETAS.verde.cores).every((k) => HEX.test(p.cores[k] || ''))) return p.cores;
  return (PALETAS[p.paleta] || PALETAS[PALETA_PADRAO]).cores;
}
