// Cartões: fatura do mês de cada cartão, compras, pagamento da fatura e próximos meses
import { brl, brlCurto, esc, mesISO, nomeMes, nomeMesCurto, inicioMes, diaMes, dataCompleta, hojeISO } from '../lib/format.js';
import { store, cartoesAtivos, contasAtivas, nomeCategoria, buscar } from '../lib/store.js';
import { parcelasEntre, pagamentosDeFatura, excluirCompra, excluirParcelas, criarLancamentos, excluirLancamentos, atualizarLancamento } from '../lib/api.js';
import { vencimentoFatura } from '../lib/faturas.js';
import { totalDoCartao, situacaoFatura } from '../lib/calculos.js';
import { prepararNovo } from './novo.js';
import { icone, toast, dialogo, confirmar, estadoVazio, semRepetir } from '../lib/ui.js';
import { opcoesConta } from '../components/form-lancamento.js';
import { desfazendo } from '../components/lancamento.js';
import { abrirEdicaoCompra } from '../components/compra-cartao.js';

// A busca fica guardada enquanto o sistema estiver aberto (trocar de mês não apaga)
let busca = '';
// Seleção para somar compras (como no Extrato): fica ligada enquanto o sistema estiver aberto
const selecao = { ligada: false, ids: new Set() };
const MARCADO = ['bg-brand-50/70', 'dark:bg-brand-950/40'];
const centavos = (v) => Math.round(v * 100) / 100;
const semAcento = (t) => String(t || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/ /g, ' ');

/** Tudo o que a busca encontra numa parcela: descrição, categoria, subcategoria, pessoa, cartão e os valores (da parcela e da compra) */
function textoDaBusca(p) {
  const c = p.compra;
  const valores = [Math.abs(p.valor), Math.abs(Number(c.valor_total))].map((v) => `${brl(v)} ${v.toFixed(2).replace('.', ',')}`);
  return semAcento([c.descricao, nomeCategoria(c.categoria_id), c.subcategoria, buscar('pessoas', c.pessoa_id)?.nome, buscar('cartoes', c.cartao_id)?.nome, ...valores].join(' '));
}

/** A parcela combina com a busca? Cada palavra digitada precisa aparecer ("89,90", "mercado maria"...) */
const combina = (texto, termo) => semAcento(termo).split(/\s+/).map((x) => x.replace(/^r\$/, '')).filter(Boolean).every((palavra) => texto.includes(palavra));

export default {
  titulo: 'Cartões',
  usaMes: true,
  ajuda: `
    <p>Cada cartão mostra a <strong>fatura do mês escolhido no topo</strong>: todas as compras e parcelas que vão ser cobradas.</p>
    <p>Quando pagar a fatura, toque em <strong>Pagar fatura</strong> e escolha de qual conta saiu o dinheiro. O valor é descontado do saldo dessa conta.</p>
    <p>Em <strong>Próximas faturas</strong> você vê quanto já está comprometido nos próximos meses por causa das parcelas.</p>
    <p>Pagou parte da fatura antes, ou recebeu um estorno? Toque em <strong>Reembolso ou adiantamento</strong>. O adiantamento sai da conta e abate o que falta pagar; o reembolso abate o total da fatura.</p>
    <p>Toque numa compra (ou no lápis) para <strong>editar</strong>: valor, descrição, categoria, data, cartão, parcelas, subcategoria e pessoa. Se mudar o valor, as parcelas ou a data, as parcelas são refeitas. Numa assinatura, o valor novo vale a partir da cobrança que você abriu.</p>
    <p>Use a <strong>busca</strong> (lupa) para achar uma compra pela descrição, categoria, pessoa ou pelo <strong>valor</strong> (por exemplo, 89,90). Ela filtra a fatura do mês e mostra também o que foi encontrado nas outras faturas.</p>
    <p>Toque na lixeira de uma compra parcelada ou de uma assinatura para escolher: <strong>só esta parcela</strong>, <strong>esta e as próximas</strong> (cancela a assinatura) ou <strong>a compra inteira</strong>.</p>
    <p>Para somar algumas compras, toque em <strong>Selecionar para somar</strong> e marque as caixinhas. A soma aparece na barra de baixo (os reembolsos são descontados). A caixinha ao lado do nome do cartão marca todas as compras dele (com a busca, só as encontradas). Dá para marcar compras de cartões diferentes.</p>`,

  async render(el, ctx) {
    const cartoes = cartoesAtivos();
    if (!cartoes.length) {
      el.innerHTML = `<div class="card">${estadoVazio('Nenhum cartão cadastrado', 'Cadastre os cartões de crédito da família em Ajustes, com o dia de fechamento e de vencimento.', '<a href="#ajustes" class="btn-primario">Ir para Ajustes</a>')}</div>`;
      return;
    }
    const [parcelas, pagamentos] = await Promise.all([
      parcelasEntre(mesISO(store.mes), mesISO(store.mes, 4)),
      pagamentosDeFatura(),
    ]);
    if (!ctx.aindaAtual()) return;

    const mesAtual = mesISO(store.mes);
    const doMes = parcelas.filter((p) => p.fatura_mes === mesAtual);
    const proximos = [1, 2, 3].map((n) => inicioMes(store.mes, n));
    // pagamentos da fatura (inteiro ou adiantamentos) e os só agendados (lançados, mas ainda não pagos — ex.: importados da planilha)
    const pagamentosDo = (id) => pagamentos.filter((p) => p.fatura_cartao_id === id);
    const linhaPagamento = (p) => `<li class="flex items-center justify-between gap-2"><span>${icone('check', 'size-4 inline -mt-0.5')} ${p.adiantamento ? `Adiantado ${brl(p.valor)} em` : `Paga em`} ${dataCompleta(p.data_pagamento || p.vencimento)}${p.adiantamento ? '' : ` (${brl(p.valor)})`}</span>
      <button type="button" class="cursor-pointer font-semibold underline" data-desfazer="${p.id}" aria-label="Desfazer o pagamento de ${brl(p.valor)}">Desfazer</button></li>`;

    el.innerHTML = `
    <div class="mb-4 grid gap-2 animate-entrar">
      <div class="flex flex-wrap items-center gap-2">
        <div class="relative w-full max-w-xl sm:w-auto sm:flex-1">
          <label for="c-busca" class="sr-only">Buscar compra no cartão pela descrição, categoria, pessoa ou valor</label>
          <span class="pointer-events-none absolute inset-y-0 left-3 flex items-center text-stone-400">${icone('busca')}</span>
          <input id="c-busca" type="search" class="campo pl-10" placeholder="Buscar compra ou valor (ex.: 89,90)…" value="${esc(busca)}" autocomplete="off">
        </div>
        ${doMes.length ? `<button type="button" class="btn-neutro ml-auto" data-sel-entrar ${selecao.ligada ? 'hidden' : ''}>${icone('check')} Selecionar para somar</button>` : ''}
      </div>
      <div data-outras aria-live="polite"></div>
    </div>
    <div class="grid items-start gap-4 md:grid-cols-2 xl:grid-cols-3 animate-entrar">
      ${cartoes.map((c) => {
        const itens = doMes.filter((p) => p.compra.cartao_id === c.id);
        const total = totalDoCartao(doMes, c.id);
        const sit = situacaoFatura(total, pagamentosDo(c.id));
        const pagos = pagamentosDo(c.id).filter((p) => p.pago);
        const agendado = sit.estado === 'agendada' && sit.agendado;
        const venc = vencimentoFatura(c, mesAtual);
        const futuros = proximos.map((m) => ({ m, v: totalDoCartao(parcelas.filter((p) => p.fatura_mes === mesISO(m)), c.id) }));
        const maior = Math.max(1, total, ...futuros.map((f) => f.v));
        return `
        <section class="card" aria-labelledby="cartao-${c.id}">
          <div class="flex items-start justify-between gap-2">
            <div class="min-w-0"><h2 id="cartao-${c.id}" class="flex items-center gap-2 font-bold">${itens.length ? `<input type="checkbox" data-sel-cartao="${c.id}" data-sel-caixa class="size-4 cursor-pointer accent-brand-600" ${selecao.ligada ? '' : 'hidden'}
              aria-label="Selecionar todas as compras do ${esc(c.nome)}" title="Selecionar todas as compras deste cartão">` : ''}${esc(c.nome)}</h2>
            <p class="text-sm text-stone-600 dark:text-stone-400">Fecha dia ${c.dia_fechamento} · vence ${dataCompleta(venc)}</p></div>
            <span class="selo shrink-0 ${{ sem: 'selo-neutro', credito: 'selo-ok', paga: 'selo-ok' }[sit.estado] || 'selo-aberto'}">${{ sem: 'Sem compras', credito: 'Crédito', paga: 'Paga', agendada: 'Agendada', parcial: 'Adiantada em parte', aberta: 'Em aberto' }[sit.estado]}</span>
          </div>
          <p class="mt-3 text-2xl font-bold tabular-nums sm:text-3xl">${brl(total)}</p>
          <p class="text-sm text-stone-600 dark:text-stone-400" data-contagem="${itens.length}">${itens.length} ${itens.length === 1 ? 'item' : 'itens'} na fatura de ${esc(nomeMes(store.mes).toLowerCase())}</p>
          <button type="button" class="btn-neutro mt-2 min-h-9 px-3 py-1.5 text-sm" data-recebimento="${c.id}">${icone('entrada', 'size-4')} Reembolso ou adiantamento</button>

          <p class="mt-3 hidden rounded-xl bg-stone-100 px-3 py-2 text-sm text-stone-600 dark:bg-stone-800 dark:text-stone-400" data-nada>Nada neste cartão combina com a busca.</p>
          ${itens.length ? `<ul class="mt-3">${itens.map((p) => `
            <li class="flex items-center gap-2 border-t border-stone-100 py-2.5 dark:border-stone-800 ${selecao.ligada && selecao.ids.has(p.id) ? MARCADO.join(' ') : ''}" data-parcela="${p.id}" data-busca="${esc(textoDaBusca(p))}">
              <label class="flex size-9 shrink-0 cursor-pointer items-center justify-center" data-sel-caixa ${selecao.ligada ? '' : 'hidden'} title="Selecionar para somar">
                <input type="checkbox" data-sel="${p.id}" class="size-5 cursor-pointer accent-brand-600" ${selecao.ids.has(p.id) ? 'checked' : ''}>
                <span class="sr-only">Selecionar “${esc(p.compra.descricao)}” (${brl(Math.abs(p.valor))}) para somar</span></label>
              <button type="button" data-editar-compra="${p.id}" class="min-w-0 flex-1 cursor-pointer rounded-lg px-1 py-0.5 text-left transition hover:bg-stone-50 dark:hover:bg-stone-800/60"
                aria-label="Abrir ${p.compra.tipo === 'estorno' ? 'o reembolso' : 'a compra'} “${esc(p.compra.descricao)}” para ver ou editar">
                <p class="line-clamp-2 font-medium">${esc(p.compra.descricao)}${seloDaParcela(p)}</p>
                <p class="line-clamp-2 text-sm text-stone-600 dark:text-stone-400">${diaMes(p.compra.data_compra)} · ${esc(nomeCategoria(p.compra.categoria_id))}${p.compra.subcategoria ? ` / ${esc(p.compra.subcategoria)}` : ''}${p.compra.pessoa_id && buscar('pessoas', p.compra.pessoa_id) ? ` · ${esc(buscar('pessoas', p.compra.pessoa_id).nome)}` : ''}</p>
              </button>
              <div class="flex shrink-0 flex-col items-end">
                <span class="text-sm font-semibold tabular-nums sm:text-base ${p.valor < 0 ? 'valor-entrada' : ''}">${p.valor < 0 ? `+ ${brl(-p.valor)}` : brl(p.valor)}</span>
                <span class="flex items-center gap-0.5">
                  <button type="button" class="btn-icone size-9 text-stone-500 hover:text-brand-700 dark:text-stone-400" data-editar-compra="${p.id}"
                    aria-label="Editar ${p.compra.tipo === 'estorno' ? 'o reembolso' : 'a compra'} ${esc(p.compra.descricao)}" title="Editar">${icone('editar', 'size-4')}</button>
                  <button type="button" class="btn-icone size-9 text-stone-500 hover:text-red-700 dark:text-stone-400" data-excluir-parcela="${p.id}"
                    aria-label="Excluir ${p.compra.tipo === 'estorno' ? 'o reembolso' : 'a compra'} ${esc(p.compra.descricao)}" title="Excluir">${icone('lixo', 'size-4')}</button></span>
              </div>
            </li>`).join('')}</ul>` : ''}

          ${sit.estado === 'credito' ? `<p class="mt-4 rounded-xl bg-brand-50 p-3 text-sm dark:bg-brand-950">Os reembolsos passaram das compras: sobra um crédito de <strong>${brl(-total)}</strong> nesta fatura.</p>`
          : sit.estado === 'sem' ? ''
          : sit.estado === 'paga' ? `<ul class="mt-4 grid gap-1 rounded-xl bg-brand-50 p-3 text-sm dark:bg-brand-950">${pagos.map(linhaPagamento).join('')}</ul>`
          : sit.estado === 'parcial' ? `<div class="mt-4 grid gap-2 rounded-xl bg-stone-100 p-3 text-sm dark:bg-stone-800">
              <ul class="grid gap-1">${pagos.map(linhaPagamento).join('')}</ul>
              <p>Falta pagar <strong class="tabular-nums">${brl(sit.falta)}</strong> de ${brl(total)}.</p>
              <button type="button" class="btn-primario w-full" data-pagar-fatura="${c.id}">Pagar o restante de ${brl(sit.falta)}</button></div>`
          : (agendado
              ? `<div class="mt-4 grid gap-2 rounded-xl bg-amber-50 p-3 text-sm text-amber-900 dark:bg-amber-900/30 dark:text-amber-100" data-agendado>
                  <span>${icone('calendario', 'size-4 inline -mt-0.5')} Pagamento agendado para ${dataCompleta(agendado.vencimento)}${Math.abs(Number(agendado.valor) - sit.falta) > 0.005 ? ` (${brl(agendado.valor)})` : ''}, ainda não pago.</span>
                  <button type="button" class="btn-primario w-full" data-pagar-fatura="${c.id}" data-lancamento="${agendado.id}">Marcar como paga</button></div>`
              : `<button type="button" class="btn-primario mt-4 w-full" data-pagar-fatura="${c.id}">Pagar fatura de ${brl(total)}</button>`)}

          <div class="mt-5">
            <h3 class="mb-2 text-sm font-semibold text-stone-600 dark:text-stone-400">Próximas faturas</h3>
            <ul class="grid grid-cols-3 gap-2 text-center">${futuros.map(({ m, v }) => `
              <li class="rounded-xl bg-stone-100 p-2 dark:bg-stone-800">
                <span class="block text-xs text-stone-600 dark:text-stone-400">${nomeMesCurto(m)}</span>
                <span class="mx-auto my-1 block h-1.5 rounded-full bg-stone-200 dark:bg-stone-700" aria-hidden="true"><span class="block h-full rounded-full bg-destaque" style="width:${(v / maior) * 100}%"></span></span>
                <span class="block text-xs font-semibold tabular-nums sm:text-sm" title="${brl(v)}">${brlCurto(v)}</span>
              </li>`).join('')}</ul>
          </div>
        </section>`;
      }).join('')}
    </div>
    <div class="h-28" data-sel-espaco aria-hidden="true" ${selecao.ligada ? '' : 'hidden'}></div>
    <div id="barra-soma" class="fixed inset-x-0 bottom-[calc(4.75rem+env(safe-area-inset-bottom))] z-20 px-3 lg:bottom-4 lg:pl-64" aria-live="polite"></div>`;

    // ---------- seleção para somar (só as compras da fatura do mês na tela)
    const barra = el.querySelector('#barra-soma');
    const linhaDe = (id) => el.querySelector(`li[data-parcela="${id}"]`);
    const desenharSelecao = () => {
      el.querySelectorAll('[data-sel-caixa]').forEach((x) => { x.hidden = !selecao.ligada; });
      el.querySelector('[data-sel-entrar]')?.toggleAttribute('hidden', selecao.ligada);
      el.querySelector('[data-sel-espaco]').hidden = !selecao.ligada;
      for (const p of doMes) {
        const li = linhaDe(p.id);
        const on = selecao.ligada && selecao.ids.has(p.id);
        li?.classList.toggle(MARCADO[0], on); li?.classList.toggle(MARCADO[1], on);
        const cx = li?.querySelector('[data-sel]'); if (cx) cx.checked = selecao.ids.has(p.id);
      }
      el.querySelectorAll('[data-sel-cartao]').forEach((cx) => {
        const vistos = doMes.filter((p) => p.compra.cartao_id === cx.dataset.selCartao && !linhaDe(p.id)?.hidden);
        const marcados = vistos.filter((p) => selecao.ids.has(p.id)).length;
        cx.checked = vistos.length > 0 && marcados === vistos.length;
        cx.indeterminate = marcados > 0 && marcados < vistos.length;
      });
      if (!selecao.ligada) { barra.innerHTML = ''; return; }
      const escolhidos = doMes.filter((p) => selecao.ids.has(p.id));
      const escondidos = escolhidos.filter((p) => linhaDe(p.id)?.hidden).length;
      const compras = centavos(escolhidos.filter((p) => p.valor > 0).reduce((s, p) => s + p.valor, 0));
      const reembolsos = centavos(escolhidos.filter((p) => p.valor < 0).reduce((s, p) => s - p.valor, 0));
      const qtd = escolhidos.length;
      const porCartao = cartoes.map((c) => ({ c, v: centavos(escolhidos.filter((p) => p.compra.cartao_id === c.id).reduce((s, p) => s + p.valor, 0)), n: escolhidos.filter((p) => p.compra.cartao_id === c.id).length })).filter((x) => x.n);
      const valores = !qtd ? '<span class="text-stone-600 dark:text-stone-400">Marque as compras que quer somar</span>'
        : compras && reembolsos ? `<span class="whitespace-nowrap">${brl(compras)}</span> <span class="whitespace-nowrap valor-entrada">− ${brl(reembolsos)} reembolso</span> <span class="whitespace-nowrap">= <strong class="${compras - reembolsos < 0 ? 'valor-entrada' : ''}">${brl(centavos(compras - reembolsos))}</strong></span>`
        : reembolsos ? `<span class="whitespace-nowrap">Reembolsos: <strong class="valor-entrada">+ ${brl(reembolsos)}</strong></span>`
        : `<span class="whitespace-nowrap">Soma: <strong>${brl(compras)}</strong></span>`;
      barra.innerHTML = `
        <div class="mx-auto flex max-w-3xl flex-wrap items-center gap-x-3 gap-y-2 rounded-2xl border border-stone-200 bg-cartao px-4 py-3 shadow-lg dark:border-stone-700 dark:bg-stone-900">
          <p class="w-full min-w-0 text-sm tabular-nums sm:w-auto sm:flex-1 sm:text-base">
            <span class="font-semibold">${qtd} ${qtd === 1 ? 'selecionada' : 'selecionadas'}</span>
            ${escondidos ? `<span class="text-xs text-stone-600 dark:text-stone-400">(${escondidos} fora da busca)</span>` : ''}
            <span class="block">${valores}</span>
            ${porCartao.length > 1 ? `<span class="block text-xs text-stone-600 dark:text-stone-400">${porCartao.map((x) => `${esc(x.c.nome)}: ${brl(x.v)}`).join(' · ')}</span>` : ''}
          </p>
          <div class="ml-auto flex gap-2">
            ${qtd ? '<button type="button" class="btn-sec" data-sel-limpar>Limpar</button>' : ''}
            <button type="button" class="btn-primario" data-sel-sair>${icone('check')} Concluir</button>
          </div>
        </div>`;
    };
    // só vale o que está nesta fatura: ao trocar de mês, o que estava marcado em outro mês sai da soma
    for (const id of [...selecao.ids]) if (!doMes.some((p) => p.id === id)) selecao.ids.delete(id);
    desenharSelecao();

    el.onchange = (e) => {
      const { sel, selCartao } = e.target.dataset;
      if (!sel && !selCartao) return;
      const ids = sel ? [sel] : doMes.filter((p) => p.compra.cartao_id === selCartao && !linhaDe(p.id)?.hidden).map((p) => p.id);
      ids.forEach((id) => (e.target.checked ? selecao.ids.add(id) : selecao.ids.delete(id)));
      desenharSelecao();
    };

    // ---------- busca: filtra as listas do mês e procura nas outras faturas
    const mesDe = (p) => nomeMes(new Date(`${p.fatura_mes}T12:00:00`));
    let todas = null; // parcelas de todos os meses, lidas na primeira busca
    let vez = 0;
    const filtrar = async () => {
      const termo = busca.trim();
      const fatura = nomeMes(store.mes).toLowerCase();
      el.querySelectorAll('section.card').forEach((sec) => {
        let vistos = 0;
        sec.querySelectorAll('li[data-busca]').forEach((li) => { const v = !termo || combina(li.dataset.busca, termo); li.hidden = !v; vistos += v; });
        const cont = sec.querySelector('[data-contagem]');
        const n = Number(cont.dataset.contagem);
        cont.textContent = termo ? `${vistos} de ${n} ${n === 1 ? 'item' : 'itens'} combinam com a busca (fatura de ${fatura})` : `${n} ${n === 1 ? 'item' : 'itens'} na fatura de ${fatura}`;
        sec.querySelector('[data-nada]').classList.toggle('hidden', !termo || vistos > 0 || !n);
      });
      desenharSelecao(); // a caixinha do cartão e o "fora da busca" acompanham
      const area = el.querySelector('[data-outras]');
      if (!termo) { area.innerHTML = ''; return; }
      const minha = ++vez;
      todas ??= await parcelasEntre('0000-01-01', '9999-12-31');
      if (minha !== vez || !ctx.aindaAtual()) return;
      const achadas = todas.filter((p) => p.fatura_mes !== mesAtual && combina(textoDaBusca(p), termo))
        .sort((a, b) => (a.fatura_mes === b.fatura_mes ? 0 : a.fatura_mes < b.fatura_mes ? 1 : -1));
      const MAX = 30;
      area.innerHTML = !achadas.length ? '<p class="text-sm text-stone-600 dark:text-stone-400">Nas outras faturas: nada encontrado.</p>'
        : `<details class="card p-0" open><summary class="cursor-pointer px-4 py-3 font-semibold">Nas outras faturas: ${achadas.length} ${achadas.length === 1 ? 'resultado' : 'resultados'}</summary>
          <ul class="px-4 pb-3">${achadas.slice(0, MAX).map((p) => `<li class="border-t border-stone-100 dark:border-stone-800">
            <button type="button" class="flex w-full cursor-pointer items-center justify-between gap-3 rounded-lg px-1 py-2.5 text-left hover:bg-stone-50 dark:hover:bg-stone-800/60" data-editar-outra="${p.id}" aria-label="Abrir “${esc(p.compra.descricao)}”, fatura de ${esc(mesDe(p))}">
              <span class="min-w-0"><span class="block font-medium">${esc(p.compra.descricao)}${seloDaParcela(p)}</span>
                <span class="block text-sm text-stone-600 dark:text-stone-400">Fatura de ${esc(mesDe(p).toLowerCase())} · ${esc(buscar('cartoes', p.compra.cartao_id)?.nome || 'Cartão')} · compra em ${dataCompleta(p.compra.data_compra)} · ${esc(nomeCategoria(p.compra.categoria_id))}</span></span>
              <span class="shrink-0 font-semibold tabular-nums ${p.valor < 0 ? 'valor-entrada' : ''}">${p.valor < 0 ? `+ ${brl(-p.valor)}` : brl(p.valor)}</span>
            </button></li>`).join('')}</ul>
          ${achadas.length > MAX ? `<p class="px-4 pb-3 text-sm text-stone-600 dark:text-stone-400">Mostrando os ${MAX} mais recentes. Digite mais para afinar a busca.</p>` : ''}</details>`;
      area.onclick = (e) => {
        const b = e.target.closest('[data-editar-outra]');
        if (!b) return;
        const p = todas.find((x) => x.id === b.dataset.editarOutra);
        abrirEdicaoCompra(p, ctx.atualizar, { aoExcluir: () => excluirComEscolha(p, ctx) });
      };
    };
    el.querySelector('#c-busca').oninput = (e) => { busca = e.target.value; filtrar(); };
    if (busca) filtrar();

    el.onclick = async (e) => {
      if (e.target.closest('[data-sel-entrar]')) {
        selecao.ligada = true;
        desenharSelecao();
        return el.querySelector('li[data-parcela]:not([hidden]) [data-sel]')?.focus();
      }
      if (e.target.closest('[data-sel-limpar]')) { selecao.ids.clear(); return desenharSelecao(); }
      if (e.target.closest('[data-sel-sair]')) {
        selecao.ligada = false; selecao.ids.clear();
        desenharSelecao();
        return el.querySelector('[data-sel-entrar]')?.focus();
      }
      const receber = e.target.closest('[data-recebimento]');
      if (receber) {
        prepararNovo({ noCartao: 'adiantamento', cartaoId: receber.dataset.recebimento });
        location.hash = '#novo';
        return;
      }
      const editar = e.target.closest('[data-editar-compra]');
      if (editar) {
        const p = parcelas.find((x) => x.id === editar.dataset.editarCompra);
        abrirEdicaoCompra(p, ctx.atualizar, { aoExcluir: () => excluirComEscolha(p, ctx) });
        return;
      }
      const excluir = e.target.closest('[data-excluir-parcela]');
      if (excluir) {
        const p = parcelas.find((x) => x.id === excluir.dataset.excluirParcela);
        await excluirComEscolha(p, ctx);
        return;
      }
      const desfazer = e.target.closest('[data-desfazer]');
      if (desfazer) {
        if (!(await confirmar('A fatura volta a ficar em aberto e o valor volta para o saldo da conta.', { titulo: 'Desfazer pagamento?', botao: 'Desfazer pagamento' }))) return;
        const voltar = await excluirLancamentos([desfazer.dataset.desfazer]);
        toast('Pagamento desfeito', { acao: desfazendo(voltar, ctx.atualizar) });
        ctx.atualizar();
        return;
      }
      const pagar = e.target.closest('[data-pagar-fatura]');
      if (pagar) {
        const cartao = cartoes.find((c) => c.id === pagar.dataset.pagarFatura);
        const agendado = pagamentos.find((p) => p.id === pagar.dataset.lancamento);
        const sit = situacaoFatura(totalDoCartao(doMes, cartao.id), pagamentosDo(cartao.id));
        pagarFatura(cartao, sit.falta, mesAtual, ctx, agendado, sit.pago > 0);
      }
    };
  },
};

/** Paga a fatura. Se já existe um pagamento agendado (não pago), ele é marcado como pago em vez de criar outro. */
export function pagarFatura(cartao, total, mes, ctx, agendado, restante = false) {
  const venc = vencimentoFatura(cartao, mes);
  const sugestao = venc < hojeISO() ? venc : hojeISO();
  const d = dialogo({
    titulo: `Pagar fatura ${cartao.nome}`,
    largura: 'max-w-md',
    corpo: `
      <form class="grid gap-4" novalidate>
        <p class="text-3xl font-bold tabular-nums">${brl(total)}</p>
        <div data-campo><label class="rotulo" for="p-conta">Pagou com qual conta?</label>
          <select id="p-conta" name="conta" class="campo">${opcoesConta(agendado?.conta_id || contasAtivas()[0]?.id)}</select>
          <p class="dica">O valor será descontado do saldo desta conta.</p></div>
        <div data-campo><label class="rotulo" for="p-data">Data do pagamento</label>
          <input id="p-data" name="data" type="date" class="campo" value="${sugestao}"></div>
        <button type="submit" class="btn-primario">${icone('check')} Confirmar pagamento</button>
      </form>`,
  });
  const form = d.querySelector('form');
  form.onsubmit = semRepetir(async (e) => {
    e.preventDefault();
    form.querySelector('[type=submit]').disabled = true;
    try {
      const data = form.data.value || hojeISO();
      let desfazer;
      if (agendado) {
        const r = await atualizarLancamento(agendado.id, {
          valor: Math.round(total * 100) / 100, pago: true, data_pagamento: data, vencimento: data, conta_id: form.conta.value,
        });
        desfazer = r.desfazer;
      } else {
        const [pagamento] = await criarLancamentos([{
          tipo: 'saida', valor: Math.round(total * 100) / 100,
          descricao: `${restante ? 'Restante da fatura' : 'Fatura'} ${cartao.nome} (${nomeMes(store.mes).toLowerCase()})`,
          vencimento: data, pago: true, data_pagamento: data,
          conta_id: form.conta.value, categoria_id: null, fatura_cartao_id: cartao.id, fatura_mes: mes,
        }]);
        desfazer = () => excluirLancamentos([pagamento.id]);
      }
      d.close();
      toast(`Fatura do ${cartao.nome} paga`, { acao: desfazendo(desfazer, ctx.atualizar) });
      ctx.atualizar();
    } catch (err) {
      toast(err.message, { tipo: 'erro' });
      form.querySelector('[type=submit]').disabled = false;
    }
  });
}

/** "3/10", "mensal", "anual" ou "reembolso" ao lado da descrição */
function seloDaParcela(p) {
  const c = p.compra;
  if (c.tipo === 'estorno') return ' <span class="selo selo-ok">Reembolso</span>';
  if (c.resina_entrega_id) return ` <span class="selo selo-neutro">Resina</span>${c.qtd_parcelas > 1 ? ` <span class="selo selo-neutro">${p.numero}/${c.qtd_parcelas}</span>` : ''}`;
  if (c.recorrente || c.recorrente_base) return ` <span class="selo selo-neutro">${Number(c.recorrente_intervalo) === 12 ? 'Anual' : 'Mensal'}${c.recorrente ? '' : ' · cancelada'}</span>`;
  return c.qtd_parcelas > 1 ? ` <span class="selo selo-neutro">${p.numero}/${c.qtd_parcelas}</span>` : '';
}

/**
 * Excluir no cartão: compra à vista ou reembolso sai inteiro; parcelada ou assinatura pergunta
 * se é só esta parcela, esta e as próximas (na assinatura, cancela) ou a compra inteira.
 */
async function excluirComEscolha(p, ctx) {
  const c = p.compra;
  const varias = c.qtd_parcelas > 1 || c.recorrente || c.recorrente_base;
  let escolha = 'tudo';
  if (!varias) {
    const oQue = c.tipo === 'estorno' ? `O reembolso “${c.descricao}”` : `A compra “${c.descricao}”`;
    if (!(await confirmar(`${oQue} será excluído${c.tipo === 'estorno' ? '' : 'a'}.`, { botao: 'Excluir', perigo: true }))) return;
  } else {
    const assinatura = c.recorrente || c.recorrente_base;
    escolha = await new Promise((resolver) => {
      const j = dialogo({
        titulo: assinatura ? 'Assinatura no cartão' : 'Compra parcelada',
        largura: 'max-w-sm',
        corpo: `<p class="text-stone-600 dark:text-stone-300">“${esc(c.descricao)}”: o que você quer excluir?</p>
          <div class="mt-5 grid gap-2">
            <button class="btn-neutro" data-r="uma">Só esta ${assinatura ? 'cobrança' : 'parcela'} (${esc(nomeMes(new Date(p.fatura_mes + 'T12:00')).toLowerCase())})</button>
            <button class="btn-perigo" data-r="proximas">${assinatura ? 'Esta e as próximas (cancelar a assinatura)' : 'Esta e as próximas parcelas'}</button>
            <button class="btn-neutro text-red-700 dark:text-red-400" data-r="tudo">${assinatura ? 'A assinatura inteira (inclusive meses passados)' : 'A compra inteira (todas as parcelas)'}</button>
            <button class="btn-sec" data-r="">Cancelar</button>
          </div>`,
      });
      let r = '';
      j.addEventListener('click', (ev) => { const b = ev.target.closest('[data-r]'); if (b) { r = b.dataset.r; j.close(); } });
      j.addEventListener('close', () => resolver(r));
    });
    if (!escolha) return;
  }
  try {
    const desfazer = escolha === 'tudo' ? await excluirCompra(c.id)
      : await excluirParcelas(c.id, escolha === 'uma' ? { parcelaId: p.id } : { aPartirDe: p.fatura_mes });
    const texto = escolha === 'tudo' ? `“${c.descricao}” excluíd${c.tipo === 'estorno' ? 'o' : 'a'}`
      : escolha === 'uma' ? `Parcela de “${c.descricao}” excluída`
      : c.recorrente ? `Assinatura “${c.descricao}” cancelada a partir de ${nomeMes(new Date(p.fatura_mes + 'T12:00')).toLowerCase()}`
      : `Parcelas de “${c.descricao}” excluídas a partir de ${nomeMes(new Date(p.fatura_mes + 'T12:00')).toLowerCase()}`;
    toast(texto, { acao: desfazendo(desfazer, ctx.atualizar) });
    ctx.atualizar();
  } catch (err) { toast(err.message, { tipo: 'erro' }); }
}
