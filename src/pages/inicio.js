// Tela inicial: saldos, resumo do mês, contas a pagar, faturas e gráfico por categoria
import { brl, esc, mesISO, somarDias, nomeMes } from '../lib/format.js';
import { store, contasAtivas, cartoesAtivos } from '../lib/store.js';
import { saldosContas, lancamentosDoMes, parcelasDoMes, pendentesAte, pagamentosDeFatura } from '../lib/api.js';
import { gastosPorCategoria, saidasReais, entradas, somar, totalDoCartao } from '../lib/calculos.js';
import { itemLancamento, cliqueEmLancamento } from '../components/lancamento.js';
import { barrasCategorias, abrirDetalheCategoria } from '../components/grafico.js';
import { icone, estadoVazio } from '../lib/ui.js';
import { vencimentoFatura } from '../lib/faturas.js';

export default {
  titulo: 'Início',
  usaMes: true,
  ajuda: `
    <p><strong>Saldo total</strong>: quanto vocês têm somando todas as contas. Só conta o que já foi pago ou recebido.</p>
    <p><strong>Resumo do mês</strong>: o que entrou e o que saiu no mês escolhido no topo (gastos do caixa + parcelas dos cartões).</p>
    <p><strong>Contas a pagar</strong>: o que está atrasado ou vence nos próximos 7 dias. Quando pagar, toque no círculo.</p>
    <p><strong>Faturas do mês</strong>: quanto cada cartão vai cobrar. Toque para ver as compras.</p>
    <p><strong>Gastos por categoria</strong>: toque numa barra para ver tudo o que foi gasto naquela categoria.</p>`,

  async render(el, ctx) {
    const [saldos, lancamentos, parcelas, pendentes, pagamentos] = await Promise.all([
      saldosContas(),
      lancamentosDoMes(),
      parcelasDoMes(),
      pendentesAte(somarDias(7)),
      pagamentosDeFatura(),
    ]);
    if (!ctx.aindaAtual()) return;

    const contas = contasAtivas();
    const total = contas.reduce((s, c) => s + (saldos.get(c.id) || 0), 0);
    const totalEntradas = somar(entradas(lancamentos));
    const totalSaidas = somar(saidasReais(lancamentos)) + somar(parcelas);
    const resultado = totalEntradas - totalSaidas;
    const categoriasGrafico = store.categorias.filter((c) => c.no_grafico);
    const gastos = gastosPorCategoria(lancamentos, parcelas);
    const somaGrafico = categoriasGrafico.reduce((s, c) => s + (gastos.get(c.id) || 0), 0);
    const pagos = new Set(pagamentos.map((p) => p.fatura_cartao_id));
    const semNada = !lancamentos.length && !parcelas.length;

    el.innerHTML = `
    <div class="grid items-start gap-4 lg:grid-cols-[1.3fr_1fr] animate-entrar">
      <div class="grid gap-4">
        <section class="card" aria-labelledby="t-saldo">
          <h2 id="t-saldo" class="card-titulo">Saldo total hoje</h2>
          <p class="text-3xl font-bold tabular-nums ${total < 0 ? 'valor-saida' : ''}">${brl(total)}</p>
          <ul class="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3">
            ${contas.map((c) => {
              const v = saldos.get(c.id) || 0;
              return `<li class="rounded-xl border border-stone-200 p-3 dark:border-stone-800">
                <p class="truncate text-sm text-stone-600 dark:text-stone-400">${esc(c.nome)}</p>
                <p class="font-semibold whitespace-nowrap tabular-nums ${v < 0 ? 'valor-saida' : ''}">${brl(v)}</p></li>`;
            }).join('')}
          </ul>
        </section>

        <section class="card" aria-labelledby="t-resumo">
          <h2 id="t-resumo" class="card-titulo">Resumo de ${esc(nomeMes(store.mes).toLowerCase())}</h2>
          <dl class="grid grid-cols-3 gap-2">
            <div class="rounded-xl bg-brand-50 p-3 dark:bg-brand-950"><dt class="text-sm text-stone-600 dark:text-stone-400">Entrou</dt><dd class="font-semibold tabular-nums valor-entrada">${brl(totalEntradas)}</dd></div>
            <div class="rounded-xl bg-red-50 p-3 dark:bg-red-950/40"><dt class="text-sm text-stone-600 dark:text-stone-400">Saiu</dt><dd class="font-semibold tabular-nums valor-saida">${brl(totalSaidas)}</dd></div>
            <div class="rounded-xl bg-stone-100 p-3 dark:bg-stone-800"><dt class="text-sm text-stone-600 dark:text-stone-400">Resultado</dt><dd class="font-semibold tabular-nums ${resultado < 0 ? 'valor-saida' : ''}">${brl(resultado)}</dd></div>
          </dl>
        </section>

        <section class="card" aria-labelledby="t-pagar">
          <div class="mb-1 flex items-center justify-between gap-2">
            <h2 id="t-pagar" class="card-titulo mb-0">Contas a pagar e receber</h2>
            <span class="text-sm text-stone-600 dark:text-stone-400">atrasadas e próximos 7 dias</span>
          </div>
          ${pendentes.length
            ? `<ul data-lista>${pendentes.map((l) => itemLancamento(l, { mostrarPrazo: true })).join('')}</ul>`
            : estadoVazio('Tudo em dia', 'Nenhuma conta atrasada ou vencendo nos próximos 7 dias.')}
        </section>
      </div>

      <div class="grid gap-4">
        ${semNada ? `
        <section class="card border-brand-200 bg-brand-50 dark:border-brand-900 dark:bg-brand-950" aria-labelledby="t-comecar">
          <h2 id="t-comecar" class="font-bold">Vamos começar?</h2>
          <ol class="mt-2 grid list-decimal gap-1 pl-5 text-sm text-stone-700 dark:text-stone-300">
            <li>Em <a href="#ajustes" class="font-semibold underline">Ajustes</a>, informe quanto cada conta tem hoje (saldo inicial).</li>
            <li>Ainda em Ajustes, confira os dias de fechamento e vencimento dos cartões.</li>
            <li>Toque em <a href="#novo" class="font-semibold underline">Novo lançamento</a> para registrar o primeiro gasto.</li>
          </ol>
        </section>` : ''}

        <section class="card" aria-labelledby="t-faturas">
          <h2 id="t-faturas" class="card-titulo">Faturas de ${esc(nomeMes(store.mes).toLowerCase())}</h2>
          ${cartoesAtivos().length ? `<ul>${cartoesAtivos().map((c) => {
            const valor = totalDoCartao(parcelas, c.id);
            const [cls, txt] = !valor ? ['selo-neutro', 'Sem compras'] : pagos.has(c.id) ? ['selo-ok', 'Paga'] : ['selo-aberto', 'Em aberto'];
            return `<li class="border-t border-stone-100 first:border-t-0 dark:border-stone-800">
              <a href="#cartoes" class="-mx-2 flex items-center gap-3 rounded-lg px-2 py-3 transition hover:bg-stone-50 dark:hover:bg-stone-800/60">
                <span class="flex size-9 items-center justify-center rounded-lg bg-stone-100 text-stone-600 dark:bg-stone-800 dark:text-stone-300">${icone('cartao', 'size-5')}</span>
                <span class="min-w-0 flex-1"><span class="block truncate font-medium">${esc(c.nome)}</span>
                <span class="block text-sm text-stone-600 dark:text-stone-400">vence ${vencimentoFatura(c, mesISO(store.mes)).split('-').reverse().slice(0, 2).join('/')}</span></span>
                <span class="text-right"><span class="block font-semibold tabular-nums">${brl(valor)}</span><span class="selo ${cls}">${txt}</span></span>
              </a></li>`;
          }).join('')}</ul>` : estadoVazio('Nenhum cartão cadastrado', 'Cadastre seus cartões em Ajustes.', '<a href="#ajustes" class="btn-sec">Ir para Ajustes</a>')}
        </section>

        <section class="card" aria-labelledby="t-grafico">
          <h2 id="t-grafico" class="card-titulo mb-1">Gastos por categoria</h2>
          <p class="text-2xl font-bold tabular-nums">${brl(somaGrafico)}</p>
          <p class="mb-3 text-sm text-stone-600 dark:text-stone-400">Caixa + cartões no mês. Toque numa barra para ver os detalhes.</p>
          ${categoriasGrafico.length ? barrasCategorias(gastos, categoriasGrafico) : estadoVazio('Nenhuma categoria no gráfico', 'Escolha quais categorias aparecem aqui em Ajustes > Categorias.')}
        </section>
      </div>
    </div>`;

    el.onclick = async (e) => {
      if (await cliqueEmLancamento(e, pendentes, ctx.atualizar)) return;
      const barra = e.target.closest('[data-categoria]');
      if (barra) abrirDetalheCategoria(Number(barra.dataset.categoria), lancamentos, parcelas);
    };
  },
};
