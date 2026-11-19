// Extrato do mês: todos os lançamentos do caixa, com busca, filtros, saldo de cada dia e seleção para somar
import { brl, esc, dataPorExtenso, hojeISO, mesISO } from '../lib/format.js';
import { store, contasAtivas, categoriasPorGrupo, buscar } from '../lib/store.js';
import { lancamentosDoExtrato, lancamentosPagos, parcelasDoMes, pagamentosDeFatura } from '../lib/api.js';
import { saidasReais, entradas, somar, dataNoExtrato, saldoAoFimDoDia, faturasAPagar } from '../lib/calculos.js';
import { vencimentoFatura } from '../lib/faturas.js';
import { pagarFatura } from './cartoes.js';
import { itemLancamento, cliqueEmLancamento } from '../components/lancamento.js';
import { icone, estadoVazio } from '../lib/ui.js';

// Os filtros e a seleção ficam guardados enquanto o sistema estiver aberto
const filtros = { busca: '', conta: '', categoria: '', situacao: '' };
const selecao = { ligada: false, ids: new Set() };

export default {
  titulo: 'Extrato',
  usaMes: true,
  ajuda: `
    <p>Aqui aparecem todas as entradas e saídas do <strong>caixa</strong> (dinheiro, Pix, conta bancária) do mês escolhido no topo.</p>
    <p>O que já foi <strong>pago ou recebido</strong> aparece no dia e no mês do pagamento (uma parcela de dezembro paga em novembro fica em novembro). O que está <strong>em aberto</strong> aparece no dia do vencimento.</p>
    <p>Ao lado de cada dia aparece o <strong>saldo</strong>: quanto havia nas contas no fim daquele dia (saldo inicial + tudo que foi pago ou recebido até ele), como no extrato do banco. Se escolher uma conta no filtro, é o saldo só dela. O que está em aberto não entra no saldo.</p>
    <p>Para somar alguns lançamentos, toque em <strong>Selecionar para somar</strong> e marque as caixinhas. A soma aparece na barra de baixo. A caixinha ao lado do dia marca o dia inteiro.</p>
    <p>As compras no cartão de crédito ficam na tela <strong>Cartões</strong>. A <strong>fatura</strong> de cada cartão aparece aqui como uma saída a pagar no dia do vencimento, com o que falta pagar (já sem os adiantamentos). Os <strong>adiantamentos</strong> aparecem no dia em que foram pagos. Toque no círculo da fatura para pagá-la; depois de paga, aparece o pagamento no dia em que foi feito.</p>
    <p>Use a <strong>busca</strong> e os filtros para achar algo rápido. Toque num lançamento para editar ou excluir. Toque no círculo para marcar como pago.</p>`,

  async render(el, ctx) {
    const mes = mesISO(store.mes);
    const [doMes, pagos, parcelas, pagamentosFatura] = await Promise.all([lancamentosDoExtrato(), lancamentosPagos(), parcelasDoMes(), pagamentosDeFatura()]);
    if (!ctx.aindaAtual()) return;
    // a fatura do cartão que falta pagar entra como saída "a pagar" no dia do vencimento (o pagamento e os adiantamentos já são lançamentos)
    const lancamentos = [...doMes, ...faturasAPagar(store.cartoes, parcelas, pagamentosFatura, mes, vencimentoFatura)]
      .sort((a, b) => dataNoExtrato(a).localeCompare(dataNoExtrato(b)));

    el.innerHTML = `
      <div class="animate-entrar">
        <div class="mb-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-4" role="search">
          <div class="relative sm:col-span-2 lg:col-span-1">
            <label for="f-busca" class="sr-only">Buscar pela descrição ou observação</label>
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
        </div>
        <div id="resultado"></div>
      </div>
      <div id="barra-soma" class="fixed inset-x-0 bottom-[calc(4.75rem+env(safe-area-inset-bottom))] z-20 px-3 lg:bottom-4 lg:pl-64" aria-live="polite"></div>`;

    const resultado = el.querySelector('#resultado');
    const barra = el.querySelector('#barra-soma');
    const hoje = hojeISO();
    let visiveis = [];

    // Soma dos selecionados (só os do mês que está na tela)
    const desenharBarra = () => {
      if (!selecao.ligada) { barra.innerHTML = ''; return; }
      const escolhidos = lancamentos.filter((l) => selecao.ids.has(l.id));
      const escondidos = escolhidos.filter((l) => !visiveis.includes(l)).length;
      const ent = somar(entradas(escolhidos));
      const sai = somar(escolhidos.filter((l) => l.tipo === 'saida'));
      const qtd = escolhidos.length;
      const valores = !qtd ? '<span class="text-stone-600 dark:text-stone-400">Marque os lançamentos que quer somar</span>'
        : ent && sai ? `<span class="whitespace-nowrap valor-entrada">+ ${brl(ent)}</span> <span class="whitespace-nowrap valor-saida">− ${brl(sai)}</span> <span class="whitespace-nowrap">= <strong class="${ent - sai < 0 ? 'valor-saida' : 'valor-entrada'}">${brl(ent - sai)}</strong></span>`
        : `<span class="whitespace-nowrap">Soma: <strong class="${ent ? 'valor-entrada' : 'valor-saida'}">${brl(ent || sai)}</strong></span>`;
      barra.innerHTML = `
        <div class="mx-auto flex max-w-3xl flex-wrap items-center gap-x-3 gap-y-2 rounded-2xl border border-stone-200 bg-cartao px-4 py-3 shadow-lg dark:border-stone-700 dark:bg-stone-900">
          <p class="w-full min-w-0 text-sm tabular-nums sm:w-auto sm:flex-1 sm:text-base">
            <span class="font-semibold">${qtd} ${qtd === 1 ? 'selecionado' : 'selecionados'}</span>
            ${escondidos ? `<span class="text-xs text-stone-600 dark:text-stone-400">(${escondidos} fora do filtro)</span>` : ''}
            <span class="block">${valores}</span>
          </p>
          <div class="ml-auto flex gap-2">
            ${qtd ? '<button type="button" class="btn-sec" data-sel-limpar>Limpar</button>' : ''}
            <button type="button" class="btn-primario" data-sel-sair>${icone('check')} Concluir</button>
          </div>
        </div>`;
    };

    const desenharLista = () => {
      const termo = filtros.busca.trim().toLowerCase();
      visiveis = lancamentos.filter((l) =>
        (!termo || `${l.descricao} ${l.observacao || ''}`.toLowerCase().includes(termo)) &&
        (!filtros.conta || String(l.conta_id) === filtros.conta) &&
        (!filtros.categoria || String(l.categoria_id) === filtros.categoria) &&
        (!filtros.situacao ||
          (filtros.situacao === 'pago' && l.pago) || (filtros.situacao === 'aberto' && !l.pago) ||
          (filtros.situacao === l.tipo)));
      const filtrando = Object.values(filtros).some(Boolean);
      const porDia = Map.groupBy ? Map.groupBy(visiveis, dataNoExtrato) : agrupar(visiveis);
      // Saldo no fim de cada dia (da conta do filtro, ou de todas). Dias futuros não têm saldo ainda.
      const contas = filtros.conta ? store.contas.filter((c) => String(c.id) === filtros.conta) : store.contas;
      const saldos = saldoAoFimDoDia([...porDia.keys()].filter((d) => d <= hoje), pagos, contas);
      const ent = somar(entradas(visiveis));
      const sai = somar(saidasReais(visiveis)) + somar(visiveis.filter((l) => l.fatura_cartao_id));
      resultado.innerHTML = `
        <dl class="card mb-3 grid gap-x-4 gap-y-1 p-3 text-sm sm:grid-cols-3 sm:p-3" aria-live="polite">
          ${[['Entradas', brl(ent), 'valor-entrada'], ['Saídas', brl(sai), 'valor-saida'],
             [`Saldo (${visiveis.length} ${visiveis.length === 1 ? 'lançamento' : 'lançamentos'})`, brl(ent - sai), ent - sai < 0 ? 'valor-saida' : '']]
            .map(([r, v, c]) => `<div class="flex flex-wrap items-baseline justify-between gap-x-3 sm:block"><dt class="text-stone-600 dark:text-stone-400">${r}</dt><dd class="font-semibold tabular-nums ${c}">${v}</dd></div>`).join('')}
        </dl>
        ${visiveis.length && !selecao.ligada ? `<div class="mb-3 flex justify-end"><button type="button" class="btn-neutro" data-sel-entrar>${icone('check')} Selecionar para somar</button></div>` : ''}
        ${visiveis.length
          ? [...porDia].map(([dia, itens]) => {
            const saldo = saldos.get(dia);
            const todosDoDia = itens.every((l) => selecao.ids.has(l.id));
            return `
            <section class="mb-3" aria-label="${esc(dataPorExtenso(dia))}">
              <h2 class="mb-1.5 flex flex-wrap items-center justify-between gap-x-3 px-1 text-sm font-semibold text-stone-600 dark:text-stone-400">
                <span class="flex items-center gap-2">${selecao.ligada ? `<input type="checkbox" data-sel-dia="${dia}" class="size-4 cursor-pointer accent-brand-600" ${todosDoDia ? 'checked' : ''} aria-label="Selecionar todos os lançamentos de ${esc(dataPorExtenso(dia))}" title="Selecionar o dia inteiro">` : ''}${esc(dataPorExtenso(dia))}</span>
                ${saldo === undefined ? '' : `<span class="tabular-nums" title="Saldo ${filtros.conta ? 'da conta' : 'das contas'} no fim do dia (só o que já foi pago ou recebido)">Saldo do dia: <span class="${saldo < 0 ? 'valor-saida' : 'text-stone-800 dark:text-stone-200'}">${brl(saldo)}</span></span>`}
              </h2>
              <ul class="card py-1 sm:py-1" data-lista>${itens.map((l) => itemLancamento(l, { selecao: selecao.ligada ? selecao.ids.has(l.id) : undefined })).join('')}</ul>
            </section>`;
          }).join('')
          : `<div class="card">${filtrando
              ? estadoVazio('Nada encontrado', 'Nenhum lançamento combina com a busca ou os filtros.', '<button type="button" class="btn-sec" data-limpar>Limpar filtros</button>')
              : estadoVazio('Nenhum lançamento neste mês', 'Use o botão Novo lançamento para registrar entradas e saídas.', '<a href="#novo" class="btn-primario">Novo lançamento</a>')}</div>`}
        ${selecao.ligada ? '<div class="h-24" aria-hidden="true"></div>' : ''}`;
      desenharBarra();
    };
    desenharLista();

    el.querySelector('#f-busca').oninput = (e) => { filtros.busca = e.target.value; desenharLista(); };
    el.onchange = (e) => {
      const f = e.target.dataset.filtro;
      if (f) { filtros[f] = e.target.value; desenharLista(); return; }
      const { sel, selDia } = e.target.dataset;
      if (sel || selDia) {
        const ids = sel ? [sel] : visiveis.filter((l) => dataNoExtrato(l) === selDia).map((l) => l.id);
        ids.forEach((id) => (e.target.checked ? selecao.ids.add(id) : selecao.ids.delete(id)));
        const rolagem = window.scrollY;
        desenharLista();
        window.scrollTo(0, rolagem);
        el.querySelector(sel ? `[data-sel="${sel}"]` : `[data-sel-dia="${selDia}"]`)?.focus();
      }
    };
    el.onclick = async (e) => {
      if (e.target.closest('[data-limpar]')) {
        Object.keys(filtros).forEach((k) => (filtros[k] = ''));
        return ctx.atualizar();
      }
      if (e.target.closest('[data-sel-entrar]')) {
        selecao.ligada = true;
        desenharLista();
        return el.querySelector('[data-sel]')?.focus();
      }
      if (e.target.closest('[data-sel-limpar]')) {
        selecao.ids.clear();
        return desenharLista();
      }
      if (e.target.closest('[data-sel-sair]')) {
        selecao.ligada = false;
        selecao.ids.clear();
        return desenharLista();
      }
      // fatura do cartão ainda não paga: o círculo abre o pagamento; tocar na linha leva para a tela Cartões
      const naFatura = e.target.closest('[data-pagar^="fatura:"], [data-editar^="fatura:"]');
      if (naFatura) {
        const f = lancamentos.find((l) => l.id === (naFatura.dataset.pagar || naFatura.dataset.editar));
        if (naFatura.dataset.editar) { location.hash = '#cartoes'; return; }
        return pagarFatura(buscar('cartoes', f.fatura_cartao_id), f.valor, f.fatura_mes, ctx, null, f.adiantado > 0);
      }
      await cliqueEmLancamento(e, visiveis, ctx.atualizar);
    };
  },
};

function agrupar(lista) {
  const m = new Map();
  lista.forEach((l) => { const d = dataNoExtrato(l); (m.get(d) || m.set(d, []).get(d)).push(l); });
  return m;
}
