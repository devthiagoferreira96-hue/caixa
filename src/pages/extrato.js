// Extrato do mês: todos os lançamentos do caixa, com busca, filtros, saldo de cada dia e seleção para somar
import { brl, esc, dataPorExtenso, hojeISO, mesISO, inicioMes, nomeMes } from '../lib/format.js';
import { store, contasAtivas, categoriasPorGrupo, buscar, contaNoSaldo } from '../lib/store.js';
import { lancamentosDoExtrato, lancamentosPagos, lancamentosEmAberto, parcelasDoMes, pagamentosDeFatura } from '../lib/api.js';
import { saidasReais, entradas, somar, dataNoExtrato, saldoAoFimDoDia, faturasAPagar, transferenciasDeFora, agruparPorConta, projecaoDoMes } from '../lib/calculos.js';
import { vencimentoFatura } from '../lib/faturas.js';
import { pagarFatura } from './cartoes.js';
import { itemLancamento, cliqueEmLancamento } from '../components/lancamento.js';
import { icone, estadoVazio } from '../lib/ui.js';

// Os filtros e a seleção ficam guardados enquanto o sistema estiver aberto
const filtros = { busca: '', contas: [], categoria: '', situacao: '' };
const filtroVazio = () => ({ busca: '', contas: [], categoria: '', situacao: '' });
const filtrando = () => !!(filtros.busca || filtros.contas.length || filtros.categoria || filtros.situacao);

/** Contas do filtro: as que entram no saldo, depois as outras em uso e, no fim, as fora de uso (dá para ver quando quiser) */
const contasDoFiltro = () => {
  const ativas = contasAtivas();
  return [...ativas.filter(contaNoSaldo), ...ativas.filter((c) => !contaNoSaldo(c)), ...store.contas.filter((c) => !ativas.includes(c))];
};
/** Sem nenhuma conta marcada, o Extrato mostra só as contas que estão "No saldo" (Ajustes > Contas), como o Início */
const algumaForaDoSaldo = () => store.contas.some((c) => !contaNoSaldo(c));
const rotuloTodas = () => (algumaForaDoSaldo() ? 'Contas do saldo' : 'Todas as contas');
/** Ids (texto) das contas na tela: as marcadas no filtro ou, sem nenhuma marcada, as do saldo */
const contasNaTela = () => (filtros.contas.length ? filtros.contas : store.contas.filter(contaNoSaldo).map((c) => String(c.id)));

/** Texto do botão do filtro de contas: "Contas do saldo" (ou "Todas as contas"), o nome da conta ou os nomes separados por vírgula */
function rotuloContas() {
  const nomes = contasDoFiltro().filter((c) => filtros.contas.includes(String(c.id))).map((c) => c.nome);
  return !nomes.length ? rotuloTodas() : nomes.join(', ');
}

// o menu de contas fecha ao tocar fora dele
let fecharMenuLigado = false;
function ligarFecharMenu() {
  if (fecharMenuLigado) return;
  fecharMenuLigado = true;
  document.addEventListener('click', (e) => {
    const menu = document.querySelector('[data-filtro-contas][open]');
    if (menu && !menu.contains(e.target)) menu.open = false;
  });
}
const selecao = { ligada: false, ids: new Set() };

/** Faturas de cartão que faltam pagar, do mês atual até o mês escolhido (para a projeção de um mês que ainda vai chegar) */
async function faturasAte(mesEscolhido) {
  const meses = [];
  for (let m = inicioMes(new Date()); m <= mesEscolhido; m = inicioMes(m, 1)) meses.push(m);
  const porMes = await Promise.all(meses.map(async (m) => {
    const [parcelas, pagamentos] = await Promise.all([parcelasDoMes(m), pagamentosDeFatura(m)]);
    return faturasAPagar(store.cartoes, parcelas, pagamentos, mesISO(m), vencimentoFatura);
  }));
  return porMes.flat();
}

/**
 * Quadro "Projeção do caixa": o saldo herdado do mês anterior (separado do que é do mês), as receitas e despesas
 * do mês, o resultado do mês e o saldo final projetado, que vira o saldo inicial do mês seguinte.
 * Nada aqui é gravado: tudo sai dos lançamentos, então muda sozinho quando um mês anterior muda e nunca soma duas vezes.
 */
function quadroProjecao(p, { inicio, fim, hoje, mesEscolhido, comFaturas }) {
  const passou = fim <= hoje, futuro = inicio > hoje;
  const nome = (n) => nomeMes(inicioMes(mesEscolhido, n)).replace(/ de \d{4}$/, '').toLowerCase();
  const resultado = Math.round((p.entradas - p.saidas) * 100) / 100;
  const cor = (v) => (v < 0 ? 'valor-saida' : '');
  const linha = (rotulo, valor, { classe = '', dado = '', sinal = '', destaque = false, borda = false, nota = '' } = {}) => `
    <div class="flex flex-wrap items-baseline justify-between gap-x-3 py-1.5 ${borda ? 'border-t border-stone-200 dark:border-stone-700' : ''}">
      <dt class="${destaque ? 'font-semibold' : 'text-stone-600 dark:text-stone-400'}">${rotulo}${nota ? ` <span class="text-xs font-normal text-stone-500 dark:text-stone-400">${nota}</span>` : ''}</dt>
      <dd class="tabular-nums ${destaque ? 'text-base font-bold' : 'font-semibold'} ${classe}" ${dado}>${sinal}${brl(valor)}</dd></div>`;
  return `<section class="card mb-3 p-3 sm:p-4" aria-labelledby="t-projecao" data-projecao>
    <h2 id="t-projecao" class="card-titulo mb-1 flex items-center gap-2">${icone('calendario', 'size-4')} Projeção do caixa em ${esc(nome(0))}</h2>
    <p class="mb-1 text-sm text-stone-600 dark:text-stone-400">${passou
      ? 'O que aconteceu neste mês nas contas da tela.'
      : `Conta como se tudo o que está em aberto fosse pago ou recebido no vencimento (o que está atrasado conta como hoje)${comFaturas ? ', com as faturas dos cartões' : ''}.`}</p>
    <dl class="text-sm sm:max-w-xl">
      ${linha(`Saldo inicial <span class="font-normal">(herdado de ${esc(nome(-1))})</span>`, p.inicial, { classe: cor(p.inicial), dado: 'data-proj-inicial', nota: futuro ? 'previsto' : 'real' })}
      <div class="my-1 rounded-xl bg-stone-50 px-3 dark:bg-stone-800/50" data-proj-mes>
        ${linha(passou ? `Receitas de ${esc(nome(0))}` : `Receitas de ${esc(nome(0))} <span class="font-normal">(recebidas e previstas)</span>`, p.entradas, { classe: 'valor-entrada', sinal: '+ ', dado: 'data-proj-entradas' })}
        ${linha(passou ? `Despesas de ${esc(nome(0))}` : `Despesas de ${esc(nome(0))} <span class="font-normal">(pagas e previstas)</span>`, p.saidas, { classe: 'valor-saida', sinal: '− ', dado: 'data-proj-saidas' })}
        ${linha(`Resultado de ${esc(nome(0))}`, resultado, { classe: cor(resultado), borda: true, dado: 'data-proj-resultado' })}
      </div>
      ${linha(passou ? 'Saldo final' : 'Saldo final projetado', p.final, { classe: cor(p.final), destaque: true, borda: true, dado: 'data-proj-final' })}
    </dl>
    ${passou ? '' : `<p class="mt-1 text-sm text-stone-600 dark:text-stone-400" data-proj-proximo>Vira o saldo inicial de <strong>${esc(nome(1))}</strong>. Avance o mês no topo para continuar o planejamento.</p>`}
  </section>`;
}

export default {
  titulo: 'Extrato',
  usaMes: true,
  ajuda: `
    <p>Aqui aparecem todas as entradas e saídas do <strong>caixa</strong> (dinheiro, Pix, conta bancária) do mês escolhido no topo.</p>
    <p>O que já foi <strong>pago ou recebido</strong> aparece no dia e no mês do pagamento (uma parcela de dezembro paga em novembro fica em novembro). O que está <strong>em aberto</strong> aparece no dia do vencimento.</p>
    <p>Dentro de cada dia, os lançamentos ficam <strong>separados por conta</strong> (tudo do Dinheiro, depois tudo do Nubank etc.), com o saldo de cada conta no fim do dia. Numa transferência, a saída fica na conta de onde o dinheiro saiu e a entrada na conta para onde ele foi.</p>
    <p>Ao lado de cada dia aparece o <strong>saldo</strong>: quanto havia nas contas no fim daquele dia (saldo inicial + tudo que foi pago ou recebido até ele), como no extrato do banco. Se escolher uma ou mais contas no filtro, é o saldo só delas (somado). O que está em aberto não entra no saldo.</p>
    <p><strong>Projeção do caixa</strong>: no alto aparece com quanto o mês começa, o que vai entrar e sair e com quanto ele termina, como se tudo o que está em aberto fosse pago ou recebido no vencimento (o que está atrasado conta como pago hoje). O saldo previsto do fim de um mês é o saldo inicial do mês seguinte: avance o mês no topo para planejar. Os dias que ainda vão chegar mostram o <strong>saldo previsto</strong>. As contas repetidas (todo mês) e as faturas dos cartões entram na projeção; as faturas só quando nenhuma conta está marcada no filtro, porque ainda não se sabe de qual conta vão sair.</p>
    <p>Para somar alguns lançamentos, toque em <strong>Selecionar para somar</strong> e marque as caixinhas. A soma aparece na barra de baixo. A caixinha ao lado do dia marca o dia inteiro.</p>
    <p>As compras no cartão de crédito ficam na tela <strong>Cartões</strong>. A <strong>fatura</strong> de cada cartão aparece aqui como uma saída a pagar no dia do vencimento, com o que falta pagar (já sem os adiantamentos). Os <strong>adiantamentos</strong> aparecem no dia em que foram pagos. Toque no círculo da fatura para pagá-la; depois de paga, aparece o pagamento no dia em que foi feito.</p>
    <p><strong>Transferências</strong> entre contas (saque, Pix de uma conta para outra) aparecem duas vezes: a saída na conta de origem e a entrada na de destino, com o ícone de setas. Não entram em Entradas e Saídas, porque o dinheiro só mudou de conta. Se você filtrar só uma conta, a transferência para outra conta entra como saída (ou entrada) dela. Toque numa delas para mudar ou excluir a transferência inteira.</p>
    <p>Use a <strong>busca</strong> e os filtros para achar algo rápido. No filtro de contas dá para marcar <strong>mais de uma conta</strong>. Sem nenhuma marcada, aparecem só as contas que estão <strong>No saldo</strong> (Ajustes &gt; Contas), como no Início; as outras aparecem quando você marcar no filtro. A fatura do cartão que falta pagar aparece sempre, porque ainda não tem conta. Toque num lançamento para editar ou excluir. Toque no círculo para marcar como pago.</p>`,

  async render(el, ctx) {
    const mes = mesISO(store.mes);
    // conta excluída sai do filtro (a fora de uso continua: ela aparece no menu)
    filtros.contas = filtros.contas.filter((id) => store.contas.some((c) => String(c.id) === id));
    ligarFecharMenu();
    const [doMes, pagos, parcelas, pagamentosFatura, abertos, faturasPrevistas] = await Promise.all([
      lancamentosDoExtrato(), lancamentosPagos(), parcelasDoMes(), pagamentosDeFatura(), lancamentosEmAberto(), faturasAte(store.mes)]);
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
          <details class="group relative" data-filtro-contas>
            <summary class="campo flex cursor-pointer list-none items-center gap-2 [&::-webkit-details-marker]:hidden" aria-label="Filtrar por conta: ${esc(rotuloContas())}">
              <span class="min-w-0 flex-1 truncate" data-contas-rotulo>${esc(rotuloContas())}</span>
              <svg class="size-4 shrink-0 text-stone-500 transition-transform group-open:rotate-180" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true"><path fill-rule="evenodd" d="M5.23 7.21a.75.75 0 0 1 1.06.02L10 11.17l3.71-3.94a.75.75 0 1 1 1.08 1.04l-4.25 4.5a.75.75 0 0 1-1.08 0l-4.25-4.5a.75.75 0 0 1 .02-1.06Z" clip-rule="evenodd"/></svg>
            </summary>
            <fieldset class="absolute left-0 z-30 mt-1 grid max-h-80 w-full min-w-60 max-w-[calc(100vw-2rem)] gap-0.5 overflow-auto rounded-xl border border-stone-200 bg-cartao p-1.5 shadow-lg dark:border-stone-700 dark:bg-stone-900">
              <legend class="sr-only">Contas para mostrar (pode marcar mais de uma)</legend>
              <label class="flex min-h-11 cursor-pointer items-center gap-3 rounded-lg px-2 font-semibold hover:bg-stone-100 dark:hover:bg-stone-800"><input type="checkbox" data-conta-todas class="size-5 accent-brand-600" ${filtros.contas.length ? '' : 'checked'}> ${rotuloTodas()}</label>
              ${contasDoFiltro().map((c) => `<label class="flex min-h-11 cursor-pointer items-center gap-3 rounded-lg px-2 hover:bg-stone-100 dark:hover:bg-stone-800"><input type="checkbox" data-conta-f="${c.id}" class="size-5 accent-brand-600" ${filtros.contas.includes(String(c.id)) ? 'checked' : ''}> <span class="min-w-0 break-words">${esc(c.nome)}${!contasAtivas().includes(c) ? ' <span class="text-sm text-stone-600 dark:text-stone-400">(fora de uso)</span>' : contaNoSaldo(c) ? '' : ' <span class="text-sm text-stone-600 dark:text-stone-400">(fora do saldo)</span>'}</span></label>`).join('')}
            </fieldset>
          </details>
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
      const ent = somar(escolhidos.filter((l) => l.tipo === 'entrada'));
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
      const naTela = contasNaTela();
      const idsNaTela = new Set(naTela);
      visiveis = lancamentos.filter((l) =>
        (!termo || `${l.descricao} ${l.observacao || ''}`.toLowerCase().includes(termo)) &&
        // o que ainda não tem conta (a fatura do cartão a pagar) aparece sempre
        (!l.conta_id || idsNaTela.has(String(l.conta_id))) &&
        (!filtros.categoria || String(l.categoria_id) === filtros.categoria) &&
        (!filtros.situacao ||
          (filtros.situacao === 'pago' && l.pago) || (filtros.situacao === 'aberto' && !l.pago) ||
          (filtros.situacao === l.tipo)));
      const porDia = Map.groupBy ? Map.groupBy(visiveis, dataNoExtrato) : agrupar(visiveis);
      // Saldo no fim de cada dia (das contas do filtro, somadas, ou de todas). Dias futuros não têm saldo ainda.
      const contas = store.contas.filter((c) => idsNaTela.has(String(c.id)));
      const diasPassados = [...porDia.keys()].filter((d) => d <= hoje);
      const saldos = saldoAoFimDoDia(diasPassados, pagos, contas);
      // dentro de cada dia, os lançamentos ficam separados por conta (com o saldo de cada uma no fim do dia).
      // Com uma conta só no filtro não precisa: o dia inteiro já é dela.
      const separar = filtros.contas.length !== 1;
      const saldoDaConta = new Map(separar ? [...new Set(visiveis.map((l) => l.conta_id).filter(Boolean))]
        .map((id) => [id, saldoAoFimDoDia(diasPassados, pagos, store.contas.filter((c) => c.id === id))]) : []);
      // projeção do caixa (só pelas contas da tela; a busca e os outros filtros não mudam a projeção).
      // As faturas dos cartões ainda não têm conta: entram quando não há conta marcada no filtro.
      const fimMes = mesISO(store.mes, 1);
      const comFaturas = !filtros.contas.length;
      const proj = projecaoDoMes({ pagos, abertos, faturas: faturasPrevistas, comFaturas, contas, inicio: mes, fim: fimMes, hoje });
      const itensDaLista = (lista) => lista.map((l) => itemLancamento(l, { selecao: selecao.ligada ? selecao.ids.has(l.id) : undefined })).join('');
      // transferência entre contas da tela não é entrada nem saída; de (ou para) uma conta fora do filtro, é
      // (sem filtro, todas as contas na tela = nenhuma transferência conta; com contas fora do saldo, a que vai para uma delas conta)
      const fora = transferenciasDeFora(visiveis, filtros.contas.length || algumaForaDoSaldo() ? naTela : []);
      const ent = somar(entradas(visiveis)) + somar(fora.filter((l) => l.tipo === 'entrada'));
      const sai = somar(saidasReais(visiveis)) + somar(visiveis.filter((l) => l.fatura_cartao_id)) + somar(fora.filter((l) => l.tipo === 'saida'));
      resultado.innerHTML = `
        <dl class="card mb-3 grid gap-x-4 gap-y-1 p-3 text-sm sm:grid-cols-3 sm:p-3" aria-live="polite">
          ${[['Entradas', brl(ent), 'valor-entrada'], ['Saídas', brl(sai), 'valor-saida'],
             [`Saldo (${visiveis.length} ${visiveis.length === 1 ? 'lançamento' : 'lançamentos'})`, brl(ent - sai), ent - sai < 0 ? 'valor-saida' : '']]
            .map(([r, v, c]) => `<div class="flex flex-wrap items-baseline justify-between gap-x-3 sm:block"><dt class="text-stone-600 dark:text-stone-400">${r}</dt><dd class="font-semibold tabular-nums ${c}">${v}</dd></div>`).join('')}
        </dl>
        ${quadroProjecao(proj, { inicio: mes, fim: fimMes, hoje, mesEscolhido: store.mes, comFaturas })}
        ${visiveis.length && !selecao.ligada ? `<div class="mb-3 flex justify-end"><button type="button" class="btn-neutro" data-sel-entrar>${icone('check')} Selecionar para somar</button></div>` : ''}
        ${visiveis.length
          ? [...porDia].map(([dia, itens]) => {
            const saldo = saldos.get(dia);
            const todosDoDia = itens.every((l) => selecao.ids.has(l.id));
            return `
            <section class="mb-3" aria-label="${esc(dataPorExtenso(dia))}">
              <h2 class="mb-1.5 flex flex-wrap items-center justify-between gap-x-3 px-1 text-sm font-semibold text-stone-600 dark:text-stone-400">
                <span class="flex items-center gap-2">${selecao.ligada ? `<input type="checkbox" data-sel-dia="${dia}" class="size-4 cursor-pointer accent-brand-600" ${todosDoDia ? 'checked' : ''} aria-label="Selecionar todos os lançamentos de ${esc(dataPorExtenso(dia))}" title="Selecionar o dia inteiro">` : ''}${esc(dataPorExtenso(dia))}</span>
                ${saldo === undefined && dia > hoje ? `<span class="tabular-nums" title="Saldo previsto no fim do dia, se tudo o que está em aberto até ele for pago ou recebido" data-previsto>Previsto: <span class="${proj.previstoAte(dia) < 0 ? 'valor-saida' : 'text-stone-800 dark:text-stone-200'}">${brl(proj.previstoAte(dia))}</span></span>` : ''}
                ${saldo === undefined ? '' : `<span class="tabular-nums" title="Saldo ${filtros.contas.length === 1 ? 'da conta escolhida' : filtros.contas.length ? 'das contas escolhidas, somadas,' : algumaForaDoSaldo() ? 'das contas do saldo' : 'das contas'} no fim do dia (só o que já foi pago ou recebido)">Saldo do dia: <span class="${saldo < 0 ? 'valor-saida' : 'text-stone-800 dark:text-stone-200'}">${brl(saldo)}</span></span>`}
              </h2>
              ${separar
                ? `<div class="card py-1 sm:py-1">${agruparPorConta(itens, store.contas).map((g) => {
                  const nome = g.conta_id ? buscar('contas', g.conta_id)?.nome || 'Conta excluída' : 'Faturas de cartão';
                  const sc = g.conta_id ? saldoDaConta.get(g.conta_id)?.get(dia) : undefined;
                  return `<div class="border-t border-stone-200 pt-2 first:border-t-0 dark:border-stone-700" data-grupo-conta="${esc(g.conta_id || '')}">
                    <h3 class="flex flex-wrap items-baseline justify-between gap-x-3 pt-1 text-sm font-semibold">
                      <span class="flex min-w-0 items-center gap-1.5 text-brand-800 dark:text-brand-300">${icone(g.conta_id ? 'carteira' : 'cartao', 'size-4 shrink-0')}<span class="min-w-0 break-words">${esc(nome)}</span></span>
                      ${sc === undefined ? '' : `<span class="text-xs font-normal tabular-nums text-stone-600 dark:text-stone-400" title="Saldo de ${esc(nome)} no fim do dia (só o que já foi pago ou recebido)">saldo <span class="font-semibold ${sc < 0 ? 'valor-saida' : 'text-stone-800 dark:text-stone-200'}">${brl(sc)}</span></span>`}
                    </h3>
                    <ul data-lista>${itensDaLista(g.itens)}</ul></div>`;
                }).join('')}</div>`
                : `<ul class="card py-1 sm:py-1" data-lista>${itensDaLista(itens)}</ul>`}
            </section>`;
          }).join('')
          : `<div class="card">${filtrando()
              ? estadoVazio('Nada encontrado', 'Nenhum lançamento combina com a busca ou os filtros.', '<button type="button" class="btn-sec" data-limpar>Limpar filtros</button>')
              : estadoVazio('Nenhum lançamento neste mês', 'Use o botão Novo lançamento para registrar entradas e saídas.', '<a href="#novo" class="btn-primario">Novo lançamento</a>')}</div>`}
        ${selecao.ligada ? '<div class="h-24" aria-hidden="true"></div>' : ''}`;
      desenharBarra();
    };
    desenharLista();

    el.querySelector('#f-busca').oninput = (e) => { filtros.busca = e.target.value; desenharLista(); };
    const menuContas = el.querySelector('[data-filtro-contas]');
    menuContas.onkeydown = (e) => {
      if (e.key === 'Escape' && menuContas.open) { e.preventDefault(); e.stopPropagation(); menuContas.open = false; menuContas.querySelector('summary').focus(); }
    };
    // fecha quando o foco sai do menu (Tab, ou tocar na busca)
    menuContas.addEventListener('focusout', (e) => { if (e.relatedTarget && !menuContas.contains(e.relatedTarget)) menuContas.open = false; });
    el.onchange = (e) => {
      const { contaF } = e.target.dataset;
      if (contaF !== undefined || e.target.dataset.contaTodas !== undefined) {
        if (contaF === undefined) filtros.contas = [];
        else filtros.contas = e.target.checked ? [...filtros.contas, contaF] : filtros.contas.filter((id) => id !== contaF);
        menuContas.querySelector('[data-conta-todas]').checked = !filtros.contas.length;
        menuContas.querySelectorAll('[data-conta-f]').forEach((x) => (x.checked = filtros.contas.includes(x.dataset.contaF)));
        menuContas.querySelector('[data-contas-rotulo]').textContent = rotuloContas();
        menuContas.querySelector('summary').setAttribute('aria-label', `Filtrar por conta: ${rotuloContas()}`);
        return desenharLista();
      }
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
        Object.assign(filtros, filtroVazio());
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
