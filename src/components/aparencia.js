// Ajustes > Aparência: modo claro/escuro, temas de cores prontos, cores personalizadas e letras maiores
import { lerPreferencias, salvarPreferencias } from '../lib/preferencias.js';
import { PALETAS, PAPEIS, PALETA_PADRAO, calcularTema, coresDasPreferencias } from '../lib/temas.js';
import { esc } from '../lib/format.js';
import { icone, toast } from '../lib/ui.js';
import { desfazendo } from './lancamento.js';

const HEX = /^#[0-9a-f]{6}$/i;
const bolinhas = (cores) => `<span class="flex -space-x-1.5" aria-hidden="true">${cores.map((c) =>
  `<span class="size-6 rounded-full border-2 border-white shadow-sm dark:border-stone-900" style="background:${c}"></span>`).join('')}</span>`;

export function htmlAparencia() {
  const p = lerPreferencias();
  const cores = coresDasPreferencias(p);
  const atual = PALETAS[p.paleta] ? p.paleta : p.paleta === 'personalizada' ? 'personalizada' : PALETA_PADRAO;
  return `<div data-aparencia>
    <fieldset><legend class="rotulo">Modo</legend>
      <div class="grid grid-cols-[repeat(auto-fit,minmax(7.5rem,1fr))] gap-2">
        ${[['auto', 'Automático'], ['claro', 'Claro'], ['escuro', 'Escuro']].map(([v, t]) => `
          <label class="opcao-modo"><input type="radio" name="tema" value="${v}" class="sr-only" ${p.tema === v ? 'checked' : ''}>${t}</label>`).join('')}
      </div>
      <p class="dica mt-2">Automático segue o celular: fica escuro à noite se ele estiver assim.</p>
    </fieldset>

    <fieldset class="mt-6"><legend class="rotulo">Cores</legend>
      <div class="grid gap-2 sm:grid-cols-2" data-paletas>
        ${Object.entries(PALETAS).map(([id, t]) => `
          <label class="opcao-lista items-center">
            <input type="radio" name="paleta" value="${id}" class="sr-only" ${atual === id ? 'checked' : ''}>
            <span class="min-w-0 flex-1"><span class="block font-semibold">${esc(t.nome)}</span>${id === PALETA_PADRAO ? '<span class="text-sm text-stone-600 dark:text-stone-400">Padrão</span>' : ''}</span>
            ${bolinhas(t.amostra)}
          </label>`).join('')}
        <label class="opcao-lista items-center">
          <input type="radio" name="paleta" value="personalizada" class="sr-only" ${atual === 'personalizada' ? 'checked' : ''}>
          <span class="min-w-0 flex-1"><span class="block font-semibold">Minhas cores</span><span class="text-sm text-stone-600 dark:text-stone-400">Escolha cada cor</span></span>
          <span data-bolinhas-minhas>${bolinhas(Object.values(atual === 'personalizada' ? cores : PALETAS[atual].cores))}</span>
        </label>
      </div>
    </fieldset>

    <div class="mt-4 grid gap-3 rounded-xl border border-stone-200 p-3 dark:border-stone-700" data-painel-cores ${atual === 'personalizada' ? '' : 'hidden'}>
      <p class="text-sm text-stone-600 dark:text-stone-400">Toque no quadradinho para escolher a cor, ou digite o código (ex.: #1F6F54). A tela muda na hora.</p>
      ${PAPEIS.map(([k, rotulo, ajuda]) => `
        <div class="grid grid-cols-[auto_minmax(0,1fr)] items-center gap-x-3 gap-y-2 sm:grid-cols-[auto_minmax(0,1fr)_7.5rem]" data-papel="${k}">
          <input type="color" id="cor-${k}" value="${cores[k].toLowerCase()}" class="size-11 cursor-pointer rounded-lg border border-stone-300 bg-transparent p-0.5 dark:border-stone-600" aria-describedby="ajuda-cor-${k}">
          <label for="cor-${k}" class="min-w-0"><span class="block font-semibold">${rotulo}</span><span id="ajuda-cor-${k}" class="block text-sm text-stone-600 dark:text-stone-400">${ajuda}</span></label>
          <label class="sr-only" for="hex-${k}">Código da ${rotulo.toLowerCase()}</label>
          <input id="hex-${k}" class="campo col-span-2 font-mono text-sm uppercase sm:col-span-1" maxlength="7" autocomplete="off" spellcheck="false" value="${cores[k].toUpperCase()}" data-hex="${k}">
        </div>`).join('')}
      <div aria-live="polite" data-avisos-cor></div>
    </div>

    <div class="mt-4 rounded-xl bg-fundo p-3 dark:bg-stone-950" aria-hidden="true" data-previa-cores>
      <p class="mb-2 text-xs font-semibold tracking-wide text-stone-600 uppercase dark:text-stone-400">Prévia</p>
      <div class="card grid gap-2 p-3 sm:p-3">
        <p class="font-semibold">Gastos de novembro <span class="font-normal text-stone-600 dark:text-stone-400">· texto de apoio</span></p>
        <span class="block h-2.5 w-3/4 rounded-r bg-destaque"></span>
        <span class="block h-2.5 w-1/2 rounded-r bg-destaque"></span>
        <div class="mt-1 flex flex-wrap items-center gap-3"><span class="btn-primario pointer-events-none min-h-9 py-1.5 text-sm">Botão</span><span class="font-semibold text-brand-700 underline dark:text-brand-300">Link</span><span class="selo selo-ok">Pago</span></div>
      </div>
    </div>
    <p class="dica mt-2">No modo escuro o fundo continua escuro; a cor principal e a dos gráficos seguem o tema.</p>

    <label class="mt-6 flex cursor-pointer items-center justify-between gap-3 rounded-xl border border-stone-200 p-3 dark:border-stone-700">
      <span><span class="block font-semibold">Letras maiores</span><span class="text-sm text-stone-600 dark:text-stone-400">Aumenta o tamanho de todo o texto.</span></span>
      <input type="checkbox" data-texto-grande class="size-6 accent-brand-600" ${p.textoGrande ? 'checked' : ''}>
    </label></div>`;
}

/** Liga os controles. Chamado depois de desenhar a tela de Ajustes. */
export function ligarAparencia(pagina, atualizar) {
  // os eventos ficam presos à seção (que é recriada a cada desenho da tela), não ao container da página
  const el = pagina.querySelector('[data-aparencia]');
  const painel = el?.querySelector('[data-painel-cores]');
  if (!painel) return;

  const mostrarAvisos = (cores) => {
    const { avisos } = calcularTema(cores);
    painel.querySelector('[data-avisos-cor]').innerHTML = avisos.length
      ? `<ul class="grid gap-1 rounded-lg bg-amber-50 p-3 text-sm text-amber-900 dark:bg-amber-900/30 dark:text-amber-100">${avisos.map((a) => `<li class="flex gap-2">${icone('alerta', 'mt-0.5 size-4 shrink-0')}<span>${esc(a)}</span></li>`).join('')}</ul>`
      : '';
  };
  const preencher = (cores) => {
    for (const [k] of PAPEIS) {
      painel.querySelector(`#cor-${k}`).value = cores[k].toLowerCase();
      painel.querySelector(`#hex-${k}`).value = cores[k].toUpperCase();
      painel.querySelector(`#hex-${k}`).removeAttribute('aria-invalid');
    }
    el.querySelector('[data-bolinhas-minhas]').innerHTML = `<span class="flex -space-x-1.5" aria-hidden="true">${Object.values(cores).map((c) =>
      `<span class="size-6 rounded-full border-2 border-white shadow-sm dark:border-stone-900" style="background:${c}"></span>`).join('')}</span>`;
    mostrarAvisos(cores);
  };

  /** Troca uma cor do painel personalizado (e passa para "Minhas cores") */
  const mudarCor = (k, valor) => {
    const p = lerPreferencias();
    const cores = { ...coresDasPreferencias(p), [k]: valor.toUpperCase() };
    salvarPreferencias({ paleta: 'personalizada', cores });
    el.querySelector('input[name=paleta][value=personalizada]').checked = true;
    preencher(cores);
  };

  painel.addEventListener('input', (e) => {
    const k = e.target.id?.replace(/^(cor|hex)-/, '');
    if (e.target.type === 'color') {
      painel.querySelector(`#hex-${k}`).value = e.target.value.toUpperCase();
      mudarCor(k, e.target.value);
    } else if (e.target.dataset.hex) {
      let v = e.target.value.trim();
      if (v && !v.startsWith('#')) v = `#${v}`;
      const ok = HEX.test(v);
      e.target.toggleAttribute('aria-invalid', !ok && v.length >= 7);
      if (ok) {
        painel.querySelector(`#cor-${k}`).value = v.toLowerCase();
        mudarCor(k, v);
      }
    }
  });
  // código incompleto: ao sair do campo volta para a cor atual
  painel.addEventListener('focusout', (e) => {
    if (!e.target.dataset?.hex) return;
    const cores = coresDasPreferencias(lerPreferencias());
    e.target.value = cores[e.target.dataset.hex].toUpperCase();
    e.target.removeAttribute('aria-invalid');
  });

  el.addEventListener('change', (e) => {
    if (e.target.name === 'paleta') {
      const antesDaTroca = lerPreferencias();
      const id = e.target.value;
      if (id === 'personalizada') {
        // volta para as cores que a pessoa já tinha escolhido; se nunca escolheu, começa do tema atual
        const guardadas = antesDaTroca.cores && PAPEIS.every(([k]) => HEX.test(antesDaTroca.cores[k] || ''));
        const cores = { ...(guardadas ? antesDaTroca.cores : coresDasPreferencias(antesDaTroca)) };
        salvarPreferencias({ paleta: 'personalizada', cores });
        painel.hidden = false;
        preencher(cores);
        painel.querySelector('input[type=color]').focus();
      } else {
        salvarPreferencias({ paleta: id });
        painel.hidden = true;
        preencher(PALETAS[id].cores);
        toast(`Tema ${PALETAS[id].nome} aplicado.`, {
          acao: desfazendo(async () => salvarPreferencias({ paleta: antesDaTroca.paleta, cores: antesDaTroca.cores }), atualizar),
        });
      }
    }
    if (e.target.name === 'tema') salvarPreferencias({ tema: e.target.value });
    if (e.target.matches('[data-texto-grande]')) salvarPreferencias({ textoGrande: e.target.checked });
  });
  mostrarAvisos(coresDasPreferencias(lerPreferencias()));
}
