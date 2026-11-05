// Gráficos feitos com HTML puro (sem biblioteca): barras horizontais e colunas por mês
import { esc, brl, porcentagem, diaMes } from '../lib/format.js';
import { store, buscar } from '../lib/store.js';
import { dialogo, icone } from '../lib/ui.js';
import { itensDaCategoria, somar } from '../lib/calculos.js';

/**
 * Barras horizontais por categoria. Cada barra é um botão que abre o detalhe.
 * `totais` = Map(categoria_id → valor); `categorias` = quais mostrar (mesmo as zeradas)
 */
export function barrasCategorias(totais, categorias, { mostrarZeradas = true } = {}) {
  const dados = categorias
    .map((c) => ({ id: c.id, nome: c.nome, valor: totais.get(c.id) || 0 }))
    .filter((d) => mostrarZeradas || d.valor > 0)
    .sort((a, b) => b.valor - a.valor || a.nome.localeCompare(b.nome, 'pt-BR'));
  const soma = dados.reduce((s, d) => s + d.valor, 0);
  const maior = Math.max(1, ...dados.map((d) => d.valor));
  return `<ul class="grid gap-0.5">${dados
    .map((d) => {
      const pct = soma ? (d.valor / soma) * 100 : 0;
      return `<li><button type="button" data-categoria="${d.id}" ${d.valor ? '' : 'disabled'}
        class="group grid w-full grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1 rounded-lg px-2 py-1.5 text-left transition enabled:cursor-pointer enabled:hover:bg-stone-100 sm:grid-cols-[minmax(0,10rem)_1fr_auto] dark:enabled:hover:bg-stone-800"
        aria-label="${esc(d.nome)}: ${brl(d.valor)}${d.valor ? `, ${porcentagem(pct)} do total. Ver detalhes` : ', sem gastos'}">
        <span class="truncate text-sm ${d.valor ? '' : 'text-stone-400 dark:text-stone-600 dark:text-stone-400'}">${esc(d.nome)}</span>
        <span class="col-span-2 row-start-2 h-2.5 sm:col-span-1 sm:row-start-auto" aria-hidden="true">
          ${d.valor ? `<span class="block h-full rounded-r bg-brand-600 transition group-hover:bg-brand-500 dark:bg-brand-500" style="width:${Math.max((d.valor / maior) * 100, 1.5)}%"></span>` : ''}
        </span>
        <span class="text-right text-sm font-semibold tabular-nums ${d.valor ? '' : 'font-normal text-stone-400 dark:text-stone-600 dark:text-stone-400'}">${d.valor ? brl(d.valor) : '—'}</span>
      </button></li>`;
    })
    .join('')}</ul>`;
}

/** Abre uma janela listando o que foi gasto naquela categoria no mês */
export function abrirDetalheCategoria(categoriaId, lancamentos, parcelas) {
  const itens = itensDaCategoria(categoriaId, lancamentos, parcelas);
  const nome = buscar('categorias', categoriaId)?.nome || 'Sem categoria';
  dialogo({
    titulo: nome,
    corpo: `
      <p class="text-sm text-stone-600 dark:text-stone-400">${esc(store.mes.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' }))} · ${itens.length} ${itens.length === 1 ? 'item' : 'itens'}</p>
      <p class="mt-1 text-2xl font-bold tabular-nums">${brl(somar(itens))}</p>
      <ul class="mt-3">${itens
        .map((i) => `<li class="flex items-center gap-3 border-t border-stone-100 py-2.5 dark:border-stone-800">
          <span class="flex size-8 items-center justify-center rounded-full bg-stone-100 text-stone-600 dark:bg-stone-800 dark:text-stone-300" title="${i.origem === 'cartao' ? 'Cartão' : 'Caixa'}">${icone(i.origem === 'cartao' ? 'cartao' : 'carteira', 'size-4')}</span>
          <span class="min-w-0 flex-1"><span class="block truncate font-medium">${esc(i.descricao)}</span>
          <span class="block text-sm text-stone-600 dark:text-stone-400">${diaMes(i.data)} · ${i.origem === 'cartao' ? esc(buscar('cartoes', i.cartao_id)?.nome || 'Cartão') : 'Caixa'}</span></span>
          <span class="font-semibold tabular-nums">${brl(i.valor)}</span></li>`)
        .join('')}</ul>`,
  });
}

/** Colunas por mês. `meses` = [{ data: Date, valor, rotulo }]. A coluna do mês escolhido fica destacada. */
export function colunasMeses(meses, mesAtivo) {
  const maior = Math.max(1, ...meses.map((m) => m.valor));
  return `<ul class="flex h-52 items-end gap-2 sm:gap-4" aria-label="Gastos por mês">${meses
    .map((m) => {
      const ativo = m.data.getTime() === mesAtivo.getTime();
      return `<li class="flex h-full flex-1 flex-col items-center justify-end">
        <button type="button" data-mes="${m.data.toISOString()}" class="group flex h-full w-full cursor-pointer flex-col items-center justify-end gap-1 rounded-lg pt-1 transition hover:bg-stone-100 dark:hover:bg-stone-800"
          aria-label="${esc(m.rotuloLongo)}: ${brl(m.valor)}${ativo ? ' (mês escolhido)' : '. Ver este mês'}" aria-current="${ativo ? 'true' : 'false'}">
          <span class="text-xs font-semibold tabular-nums ${ativo ? '' : 'text-stone-600 dark:text-stone-400'}">${m.valor ? brl(m.valor).replace(',00', '') : ''}</span>
          <span class="block w-full max-w-12 rounded-t-md transition ${ativo ? 'bg-brand-600 dark:bg-brand-500' : 'bg-brand-200 group-hover:bg-brand-300 dark:bg-brand-900 dark:group-hover:bg-brand-800'}" style="height:${Math.max((m.valor / maior) * 75, m.valor ? 2 : 0)}%"></span>
          <span class="pb-1 text-xs ${ativo ? 'font-bold' : 'text-stone-600 dark:text-stone-400'}">${esc(m.rotulo)}</span>
        </button></li>`;
    })
    .join('')}</ul>`;
}
