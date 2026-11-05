// Navegação entre telas usando o endereço (#inicio, #extrato...). Funciona no GitHub Pages sem configuração.
import { montarLayout, marcarMenu, seletorMes } from './components/layout.js';
import { dialogo, esqueleto } from './lib/ui.js';
import { lerPreferencias } from './lib/preferencias.js';
import { abrirTour } from './components/tour.js';
import { esc } from './lib/format.js';

import inicio from './pages/inicio.js';
import extrato from './pages/extrato.js';
import novo from './pages/novo.js';
import cartoes from './pages/cartoes.js';
import relatorio from './pages/relatorio.js';
import ajustes from './pages/ajustes.js';
import ajuda from './pages/ajuda.js';

const TELAS = { inicio, extrato, novo, cartoes, relatorio, ajustes, ajuda };
let telaAtual = null;
let redesenharMes = () => {};
let versao = 0;

export function iniciarApp() {
  montarLayout();
  window.onhashchange = navegar;
  document.getElementById('btn-ajuda').onclick = () =>
    dialogo({ titulo: `Como usar: ${telaAtual.titulo}`, corpo: `<div class="grid gap-3 text-stone-700 dark:text-stone-300">${telaAtual.ajuda}</div>` });
  navegar(true);
  if (!lerPreferencias().tourVisto) setTimeout(abrirTour, 400);
}

// Chegaram dados novos (da outra pessoa ou depois de enviar a fila): redesenha a tela,
// a não ser que a pessoa esteja preenchendo algo (formulário ou janela aberta).
document.addEventListener('caixa:dados-atualizados', () => {
  if (!telaAtual || !document.getElementById('conteudo')) return;
  const preenchendo = ['novo', 'ajustes'].includes(location.hash.slice(1)) || document.querySelector('dialog[open]') ||
    document.activeElement?.matches?.('#conteudo input, #conteudo select, #conteudo textarea');
  if (!preenchendo) desenhar(true);
});

function navegar(primeiraVez) {
  const rota = location.hash.slice(1) || 'inicio';
  telaAtual = TELAS[rota] || TELAS.inicio;
  marcarMenu(rota);
  document.getElementById('titulo-pagina').textContent = telaAtual.titulo;
  document.title = `${telaAtual.titulo} · Caixa da Família`;
  redesenharMes = seletorMes(telaAtual.usaMes, () => desenhar(true)) || (() => {});
  desenhar(false).then(() => {
    // leva o foco para o título (quem usa leitor de tela ouve em qual tela entrou)
    if (primeiraVez !== true) document.getElementById('titulo-pagina').focus({ preventScroll: true });
  });
  window.scrollTo(0, 0);
}

/** Desenha a tela atual. `silencioso` = sem o "carregando" (usado depois de uma ação) */
async function desenhar(silencioso) {
  const el = document.getElementById('conteudo');
  const minhaVersao = ++versao;
  const tela = telaAtual;
  el.setAttribute('aria-busy', 'true');
  // cada tela registra os próprios eventos; limpa os da tela anterior
  el.onclick = el.onchange = el.onsubmit = el.oninput = null;
  if (!silencioso) el.innerHTML = esqueleto();
  const ctx = {
    atualizar: () => desenhar(true),
    irPara: (rota) => { location.hash = rota; },
    aoTrocarMes: () => { redesenharMes(); desenhar(true); },
    aindaAtual: () => minhaVersao === versao,
  };
  try {
    await tela.render(el, ctx);
  } catch (e) {
    console.error(e);
    if (minhaVersao === versao) {
      el.innerHTML = `<div class="card mt-4 border-red-200 dark:border-red-900" role="alert">
        <p class="font-semibold text-red-800 dark:text-red-300">Não foi possível carregar esta tela.</p>
        <p class="mt-1 text-sm text-stone-600 dark:text-stone-400">${esc(e.message)}</p>
        <button type="button" class="btn-sec mt-4" data-tentar>Tentar de novo</button></div>`;
      el.querySelector('[data-tentar]').onclick = () => desenhar(false);
    }
  }
  el.removeAttribute('aria-busy');
}
