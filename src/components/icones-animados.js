// Ícones do menu com um movimento curto (no estilo do lucide-animated, licença MIT, feitos em CSS).
// Só o desenho se mexe: o texto do item fica parado. O movimento acontece ao passar o mouse,
// ao focar com o teclado ou ao tocar, uma vez só. Não anima se a pessoa desligou em
// Ajustes > Aparência ou se o aparelho pede "reduzir movimento".

const D = 'class="ani-desenha" pathLength="1"';
const DESENHOS = {
  inicio: `<path d="M3 10a2 2 0 0 1 .709-1.528l7-5.999a2 2 0 0 1 2.582 0l7 5.999A2 2 0 0 1 21 10v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><path ${D} d="M15 21v-8a1 1 0 0 0-1-1h-4a1 1 0 0 0-1 1v8"/>`,
  extrato: `<path d="M3 6h.01M3 12h.01M3 18h.01"/><path ${D} d="M8 6h13"/><path class="ani-desenha ani-d2" pathLength="1" d="M8 12h13"/><path class="ani-desenha ani-d3" pathLength="1" d="M8 18h13"/>`,
  cartao: '<g class="ani-desliza"><rect width="20" height="14" x="2" y="5" rx="2"/><path d="M2 10h20"/></g>',
  relatorio: `<path d="M3 3v16a2 2 0 0 0 2 2h16"/><path ${D} d="M8 17v-3"/><path class="ani-desenha ani-d2" pathLength="1" d="M13 17V9"/><path class="ani-desenha ani-d3" pathLength="1" d="M18 17V5"/>`,
  ajustes: '<line x1="21" x2="14" y1="4" y2="4"/><line x1="10" x2="3" y1="4" y2="4"/><line x1="14" x2="14" y1="2" y2="6"/><line x1="21" x2="12" y1="12" y2="12"/><line x1="8" x2="3" y1="12" y2="12"/><line x1="8" x2="8" y1="10" y2="14"/><line x1="21" x2="16" y1="20" y2="20"/><line x1="12" x2="3" y1="20" y2="20"/><line x1="16" x2="16" y1="18" y2="22"/>',
  ajuda: '<g class="ani-balanca"><circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><path d="M12 17h.01"/></g>',
  cadeado: '<g class="ani-tranca"><rect width="18" height="11" x="3" y="11" rx="2"/><path class="ani-alca" pathLength="1" d="M7 11V7a5 5 0 0 1 10 0v4"/></g>',
  mais: '<g class="ani-gira"><path d="M5 12h14"/><path d="M12 5v14"/></g>',
};

// Ajustes: para onde cada linha dos controles deslizantes vai (e volta)
const SLIDERS = [{ x2: 10 }, { x1: 5 }, { x1: 10, x2: 10 }, { x2: 18 }, { x1: 14 }, { x1: 14, x2: 14 }, { x2: 12 }, { x1: 8 }, { x1: 12, x2: 12 }];

/** Ícone animado. O item que o contém precisa de `data-anima`. */
export const iconeAnimado = (nome, classe = 'size-5') =>
  `<span class="ani-icone ${classe}" data-ic="${nome}" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${DESENHOS[nome] || ''}</svg></span>`;

const podeAnimar = () =>
  !document.documentElement.classList.contains('sem-animacao') && !matchMedia('(prefers-reduced-motion: reduce)').matches;

function moverSliders(svg) {
  const linhas = [...svg.querySelectorAll('line')];
  const inicio = linhas.map((l) => ({ x1: +l.getAttribute('x1'), x2: +l.getAttribute('x2') }));
  const t0 = performance.now();
  const passo = (t) => {
    const p = Math.min(1, (t - t0) / 600);
    const ida = p < 0.5 ? p * 2 : 2 - p * 2;
    const e = ida < 0.5 ? 2 * ida * ida : 1 - (-2 * ida + 2) ** 2 / 2;
    linhas.forEach((l, i) => {
      for (const k in SLIDERS[i]) l.setAttribute(k, inicio[i][k] + (SLIDERS[i][k] - inicio[i][k]) * e);
    });
    if (p < 1) requestAnimationFrame(passo);
    else linhas.forEach((l, i) => { l.setAttribute('x1', inicio[i].x1); l.setAttribute('x2', inicio[i].x2); });
  };
  requestAnimationFrame(passo);
}

/** Faz o ícone do item se mexer uma vez */
export function animar(item) {
  const ic = item?.querySelector('.ani-icone');
  if (!ic || !podeAnimar() || ic.dataset.rodando) return;
  ic.dataset.rodando = '1';
  if (ic.dataset.ic === 'ajustes') moverSliders(ic.querySelector('svg'));
  ic.classList.remove('ani-ativo');
  void ic.offsetWidth; // reinicia a animação do CSS
  ic.classList.add('ani-ativo');
  setTimeout(() => { ic.classList.remove('ani-ativo'); delete ic.dataset.rodando; }, 1050);
}

let ligado = false;
/** Liga os eventos uma vez para a página toda (mouse, teclado e toque) */
export function ligarIconesAnimados() {
  if (ligado) return;
  ligado = true;
  const disparar = (e) => {
    const item = e.target.closest?.('[data-anima]');
    // ao passar o mouse, só dispara ao ENTRAR no item (não a cada movimento dentro dele)
    if (!item || (e.type === 'mouseover' && item.contains(e.relatedTarget))) return;
    animar(item);
  };
  document.addEventListener('mouseover', disparar);
  document.addEventListener('focusin', disparar);
  document.addEventListener('click', disparar);
}
