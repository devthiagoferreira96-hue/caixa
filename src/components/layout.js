// Estrutura fixa da tela: menu lateral (computador), menu de baixo (celular) e cabeçalho
import { esc, nomeMes, inicioMes } from '../lib/format.js';
import { store } from '../lib/store.js';
import { modoDemo, supabase } from '../lib/supabase.js';
import { sincronizar } from '../lib/sync.js';
import { icone } from '../lib/ui.js';
import { faixaConexao } from './conexao.js';

const MENU = [
  ['inicio', 'Início', 'inicio'],
  ['extrato', 'Extrato', 'extrato'],
  ['cartoes', 'Cartões', 'cartao'],
  ['relatorio', 'Relatório', 'relatorio'],
  ['ajustes', 'Ajustes', 'ajustes'],
  ['ajuda', 'Como usar', 'ajuda'],
];

export function montarLayout() {
  document.getElementById('app').innerHTML = `
    <a href="#conteudo" data-pular class="sr-only z-[70] focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:rounded-xl focus:bg-brand-700 focus:px-4 focus:py-3 focus:font-semibold focus:text-white">Pular para o conteúdo</a>

    <aside class="fixed inset-y-0 left-0 z-30 hidden w-64 flex-col border-r border-stone-200 bg-white p-4 lg:flex dark:border-stone-800 dark:bg-stone-900">
      <div class="flex items-center gap-3 px-2 pb-6">
        <span class="flex size-10 items-center justify-center rounded-xl bg-brand-600 text-sm font-bold text-white" aria-hidden="true">R$</span>
        <div class="min-w-0"><p class="font-bold">Caixa da Família</p><p class="truncate text-sm text-stone-600 dark:text-stone-400">${esc(store.familia.nome)}</p></div>
      </div>
      <a href="#novo" data-nav="novo" class="btn-primario mb-4 w-full">${icone('mais')} Novo lançamento</a>
      <nav aria-label="Menu principal"><ul class="grid gap-1">
        ${MENU.map(([rota, nome, ic]) => `<li><a href="#${rota}" data-nav="${rota}" class="nav-link">${icone(ic)}${nome}</a></li>`).join('')}
      </ul></nav>
      <p class="mt-auto truncate px-2 text-xs text-stone-600 dark:text-stone-400" title="${esc(store.user.email)}">Conectado como<br>${esc(store.user.email)}</p>
    </aside>

    <div class="lg:pl-64">
      ${modoDemo ? `<div class="bg-amber-100 px-4 py-2 text-center text-sm text-amber-900 dark:bg-amber-900/50 dark:text-amber-100" role="note">
        <strong>Modo demonstração:</strong> dados de exemplo, guardados só neste navegador. Configure o Supabase no arquivo <code>.env</code> para usar de verdade.
        <button type="button" data-simular class="ml-1 inline-flex min-h-6 cursor-pointer items-center px-1 py-0.5 font-semibold underline underline-offset-2">Simular a Thays lançando um lanche</button></div>` : ''}
      ${faixaConexao()}
      <header class="sticky top-0 z-20 border-b border-transparent bg-stone-100/90 backdrop-blur dark:bg-stone-950/90">
        <div class="mx-auto flex max-w-6xl flex-wrap items-center gap-x-2 gap-y-1 px-4 py-3 lg:px-8 lg:py-5">
          <h1 id="titulo-pagina" tabindex="-1" class="min-w-0 flex-1 truncate text-xl font-bold outline-none lg:text-2xl"></h1>
          <div id="seletor-mes" class="order-last w-full sm:order-none sm:w-auto"></div>
          <button type="button" id="btn-ajuda" class="btn-icone" aria-label="Ajuda desta tela" title="Ajuda desta tela">${icone('ajuda')}</button>
          <a href="#ajustes" class="btn-icone lg:hidden" aria-label="Ajustes" title="Ajustes">${icone('ajustes')}</a>
        </div>
      </header>
      <main id="conteudo" tabindex="-1" class="mx-auto max-w-6xl px-4 pt-1 pb-32 outline-none lg:px-8 lg:pb-12"></main>
    </div>

    <nav aria-label="Menu principal" class="fixed inset-x-0 bottom-0 z-30 border-t border-stone-200 bg-white pb-[env(safe-area-inset-bottom)] lg:hidden dark:border-stone-800 dark:bg-stone-900">
      <ul class="mx-auto grid max-w-lg grid-cols-5 items-end">
        ${navBaixo('inicio', 'Início', 'inicio')}
        ${navBaixo('extrato', 'Extrato', 'extrato')}
        <li class="flex justify-center"><a href="#novo" data-nav="novo" class="-mt-6 flex size-16 items-center justify-center rounded-full bg-brand-600 text-white shadow-lg ring-4 ring-white transition active:scale-95 dark:ring-stone-900" aria-label="Novo lançamento">${icone('mais', 'size-8')}</a></li>
        ${navBaixo('cartoes', 'Cartões', 'cartao')}
        ${navBaixo('relatorio', 'Relatório', 'relatorio')}
      </ul>
    </nav>
    <div id="toasts" class="pointer-events-none fixed inset-x-0 bottom-24 z-[60] flex flex-col items-center gap-2 px-4 lg:bottom-6 lg:pl-64"></div>`;

  document.dispatchEvent(new Event('caixa:layout'));

  // Modo demonstração: simula a outra pessoa lançando algo no celular dela
  document.querySelector('[data-simular]')?.addEventListener('click', async () => {
    await supabase.demo.outraPessoaLanca();
    sincronizar();
  });

  // "Pular para o conteúdo" sem trocar a rota (o # é usado pelas telas)
  document.querySelector('[data-pular]').onclick = (e) => {
    e.preventDefault();
    document.getElementById('conteudo').focus();
  };
}

const navBaixo = (rota, nome, ic) =>
  `<li><a href="#${rota}" data-nav="${rota}" class="nav-baixo">${icone(ic, 'size-6')}${nome}</a></li>`;

export function marcarMenu(rota) {
  document.querySelectorAll('[data-nav]').forEach((a) => {
    const ativo = a.dataset.nav === rota;
    a.classList.toggle('ativo', ativo);
    ativo ? a.setAttribute('aria-current', 'page') : a.removeAttribute('aria-current');
  });
}

/** Seletor de mês do cabeçalho. `aoMudar` é chamado quando a pessoa troca o mês. */
export function seletorMes(visivel, aoMudar) {
  const el = document.getElementById('seletor-mes');
  if (!visivel) {
    el.innerHTML = '';
    return;
  }
  const desenhar = () => {
    const atual = inicioMes(new Date());
    const ehAtual = store.mes.getTime() === atual.getTime();
    el.innerHTML = `
      <div class="flex items-center justify-between gap-1 sm:justify-start" role="group" aria-label="Escolher mês">
        <button type="button" class="btn-icone" data-mes="-1" aria-label="Mês anterior">${icone('esquerda')}</button>
        <div class="min-w-40 text-center">
          <p class="font-semibold" aria-live="polite">${nomeMes(store.mes)}</p>
          ${ehAtual ? '' : '<button type="button" data-mes="0" class="cursor-pointer text-xs font-semibold text-brand-700 underline underline-offset-2 dark:text-brand-400">Voltar para o mês atual</button>'}
        </div>
        <button type="button" class="btn-icone" data-mes="1" aria-label="Próximo mês">${icone('direita')}</button>
      </div>`;
  };
  desenhar();
  el.onclick = (e) => {
    const b = e.target.closest('[data-mes]');
    if (!b) return;
    const n = Number(b.dataset.mes);
    store.mes = n === 0 ? inicioMes(new Date()) : inicioMes(store.mes, n);
    desenhar();
    if (n !== 0) el.querySelector(`[data-mes="${n}"]`)?.focus();
    aoMudar();
  };
  return desenhar;
}
