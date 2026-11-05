// Extrato do mês: todos os lançamentos do caixa, com busca e filtros
import { brl, esc, dataPorExtenso } from '../lib/format.js';
import { store, contasAtivas, categoriasPorGrupo, autor } from '../lib/store.js';
import { lancamentosDoMes } from '../lib/api.js';
import { saidasReais, entradas, somar } from '../lib/calculos.js';
import { itemLancamento, cliqueEmLancamento } from '../components/lancamento.js';
import { icone, estadoVazio } from '../lib/ui.js';

// Os filtros ficam guardados enquanto o sistema estiver aberto
const filtros = { busca: '', conta: '', categoria: '', situacao: '', autor: '' };

export default {
  titulo: 'Extrato',
  usaMes: true,
  ajuda: `
    <p>Aqui aparecem todas as entradas e saídas do <strong>caixa</strong> (dinheiro, Pix, conta bancária) do mês escolhido no topo.</p>
    <p>As compras no cartão de crédito ficam na tela <strong>Cartões</strong>. Quando você paga a fatura, o pagamento aparece aqui.</p>
    <p>Use a <strong>busca</strong> e os filtros para achar algo rápido. Toque num lançamento para editar ou excluir. Toque no círculo para marcar como pago.</p>`,

  async render(el, ctx) {
    const lancamentos = await lancamentosDoMes();
    if (!ctx.aindaAtual()) return;

    el.innerHTML = `
      <div class="animate-entrar">
        <div class="mb-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-5" role="search">
          <div class="relative sm:col-span-2 lg:col-span-1">
            <label for="f-busca" class="sr-only">Buscar pela descrição</label>
            <span class="pointer-events-none absolute inset-y-0 left-3 flex items-center text-stone-400">${icone('busca')}</span>
            <input id="f-busca" type="search" class="campo pl-10" placeholder="Buscar…" value="${esc(filtros.busca)}" autocomplete="off">
          </div>
          <div><label for="f-f-conta" class="sr-only">Filtrar por conta</label>
            <select id="f-f-conta" data-filtro="conta" class="campo"><option value="">Todas as contas</option>
            ${contasAtivas().map((c) => `<option value="${c.id}" ${String(c.id) === filtros.conta ? 'selected' : ''}>${esc(c.nome)}</option>`).join('')}</select></div>
          <div><label for="f-f-cat" class="sr-only">Filtrar por categoria</label>
            <select id="f-f-cat" data-filtro="categoria" class="campo"><option value="">Todas as categorias</option>
            ${Object.entries(categoriasPorGrupo()).map(([g, cs]) => `<optgroup label="${esc(g)}">${cs.map((c) => `<option value="${c.id}" ${String(c.id) === filtros.categoria ? 'selected' : ''}>${esc(c.nome)}</option>`).join('')}</optgroup>`).join('')}</select></div>
          <div><label for="f-f-sit" class="sr-only">Filtrar por situação</label>
            <select id="f-f-sit" data-filtro="situacao" class="campo">
              ${[['', 'Pagos e em aberto'], ['aberto', 'Só em aberto'], ['pago', 'Só pagos'], ['entrada', 'Só entradas'], ['saida', 'Só saídas']]
                .map(([v, t]) => `<option value="${v}" ${v === filtros.situacao ? 'selected' : ''}>${t}</option>`).join('')}</select></div>
          ${store.membros.length > 1 ? `<div><label for="f-f-autor" class="sr-only">Filtrar por quem lançou</label>
            <select id="f-f-autor" data-filtro="autor" class="campo"><option value="">Lançado por todos</option>
            ${store.membros.map((m) => { const a = autor(m.user_id); return `<option value="${m.user_id}" ${m.user_id === filtros.autor ? 'selected' : ''}>Lançado por ${a.souEu ? `mim (${esc(a.nome)})` : esc(a.nome)}</option>`; }).join('')}</select></div>` : ''}
        </div>
        <div id="resultado"></div>
      </div>`;

    const resultado = el.querySelector('#resultado');
    let visiveis = [];
    const desenharLista = () => {
      const termo = filtros.busca.trim().toLowerCase();
      visiveis = lancamentos.filter((l) =>
        (!termo || l.descricao.toLowerCase().includes(termo)) &&
        (!filtros.conta || String(l.conta_id) === filtros.conta) &&
        (!filtros.categoria || String(l.categoria_id) === filtros.categoria) &&
        (!filtros.situacao ||
          (filtros.situacao === 'pago' && l.pago) || (filtros.situacao === 'aberto' && !l.pago) ||
          (filtros.situacao === l.tipo)) &&
        (!filtros.autor || l.criado_por === filtros.autor));
      const filtrando = Object.values(filtros).some(Boolean);
      const porDia = Map.groupBy ? Map.groupBy(visiveis, (l) => l.vencimento) : agrupar(visiveis);
      const ent = somar(entradas(visiveis));
      const sai = somar(saidasReais(visiveis)) + somar(visiveis.filter((l) => l.fatura_cartao_id));
      resultado.innerHTML = `
        <dl class="mb-4 grid grid-cols-3 gap-2 text-sm" aria-live="polite">
          <div class="card p-3 sm:p-3"><dt class="text-stone-600 dark:text-stone-400">Entradas</dt><dd class="font-semibold tabular-nums valor-entrada">${brl(ent)}</dd></div>
          <div class="card p-3 sm:p-3"><dt class="text-stone-600 dark:text-stone-400">Saídas</dt><dd class="font-semibold tabular-nums valor-saida">${brl(sai)}</dd></div>
          <div class="card p-3 sm:p-3"><dt class="text-stone-600 dark:text-stone-400">${visiveis.length} ${visiveis.length === 1 ? 'lançamento' : 'lançamentos'}</dt><dd class="font-semibold tabular-nums">${brl(ent - sai)}</dd></div>
        </dl>
        ${visiveis.length
          ? [...porDia].map(([dia, itens]) => `
            <section class="mb-3" aria-label="${esc(dataPorExtenso(dia))}">
              <h2 class="mb-1.5 px-1 text-sm font-semibold text-stone-600 dark:text-stone-400">${esc(dataPorExtenso(dia))}</h2>
              <ul class="card py-1 sm:py-1" data-lista>${itens.map((l) => itemLancamento(l)).join('')}</ul>
            </section>`).join('')
          : `<div class="card">${filtrando
              ? estadoVazio('Nada encontrado', 'Nenhum lançamento combina com a busca ou os filtros.', '<button type="button" class="btn-sec" data-limpar>Limpar filtros</button>')
              : estadoVazio('Nenhum lançamento neste mês', 'Use o botão Novo lançamento para registrar entradas e saídas.', '<a href="#novo" class="btn-primario">Novo lançamento</a>')}</div>`}`;
    };
    desenharLista();

    el.querySelector('#f-busca').oninput = (e) => { filtros.busca = e.target.value; desenharLista(); };
    el.onchange = (e) => {
      const f = e.target.dataset.filtro;
      if (f) { filtros[f] = e.target.value; desenharLista(); }
    };
    el.onclick = async (e) => {
      if (e.target.closest('[data-limpar]')) {
        Object.keys(filtros).forEach((k) => (filtros[k] = ''));
        return ctx.atualizar();
      }
      await cliqueEmLancamento(e, visiveis, ctx.atualizar);
    };
  },
};

function agrupar(lista) {
  const m = new Map();
  lista.forEach((l) => (m.get(l.vencimento) || m.set(l.vencimento, []).get(l.vencimento)).push(l));
  return m;
}
