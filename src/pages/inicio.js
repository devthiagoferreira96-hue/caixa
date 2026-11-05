// Tela inicial: saldos, resumo do mês, contas a pagar, faturas e gráfico por categoria
import { brl, brlCurto, esc, mesISO, somarDias, nomeMes } from '../lib/format.js';
import { store, contasAtivas, cartoesAtivos } from '../lib/store.js';
import { saldosContas, lancamentosDoMes, parcelasDoMes, pendentesAte, pagamentosDeFatura } from '../lib/api.js';
import { gastosPorCategoria, saidasReais, entradas, somar, totalDoCartao } from '../lib/calculos.js';
import { itemLancamento, cliqueEmLancamento } from '../components/lancamento.js';
import { barrasCategorias, abrirDetalheCategoria } from '../components/grafico.js';
import { icone, estadoVazio } from '../lib/ui.js';
import { local } from '../lib/local-db.js';
import { fazerBackup } from '../components/backup.js';
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
          <p class="text-2xl font-bold tabular-nums sm:text-3xl ${total < 0 ? 'valor-saida' : ''}">${brl(total)}</p>
          <ul class="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3">
            ${contas.map((c) => {
              const v = saldos.get(c.id) || 0;
              return `<li class="rounded-xl border border-stone-200 p-3 dark:border-stone-800">
                <p class="truncate text-sm text-stone-600 dark:text-stone-400">${esc(c.nome)}</p>
                <p class="text-sm font-semibold tabular-nums sm:text-base ${v < 0 ? 'valor-saida' : ''}" title="${brl(v)}">${brlCurto(v)}</p></li>`;
            }).join('')}
          </ul>
        </section>

        <section class="card" aria-labelledby="t-resumo">
          <h2 id="t-resumo" class="card-titulo">Resumo de ${esc(nomeMes(store.mes).toLowerCase())}</h2>
          <dl class="grid gap-2 sm:grid-cols-3">
            ${[['Entrou', brl(totalEntradas), 'bg-brand-50 dark:bg-brand-950', 'valor-entrada'],
               ['Saiu', brl(totalSaidas), 'bg-red-50 dark:bg-red-950/40', 'valor-saida'],
               ['Resultado', brl(resultado), 'bg-stone-100 dark:bg-stone-800', resultado < 0 ? 'valor-saida' : '']]
              .map(([rotulo, valor, fundo, cor]) => `<div class="flex flex-wrap items-baseline justify-between gap-x-3 rounded-xl p-3 sm:block ${fundo}">
                <dt class="text-sm text-stone-600 dark:text-stone-400">${rotulo}</dt><dd class="font-semibold tabular-nums ${cor}">${valor}</dd></div>`).join('')}
          </dl>
        </section>

        <section class="card" aria-labelledby="t-pagar">
          <div class="mb-1 flex flex-wrap items-baseline justify-between gap-x-2">
            <h2 id="t-pagar" class="card-titulo mb-0">Contas a pagar e receber</h2>
            <span class="text-sm text-stone-600 dark:text-stone-400">atrasadas e próximos 7 dias</span>
          </div>
          ${pendentes.length
            ? `<ul data-lista>${pendentes.map((l) => itemLancamento(l, { mostrarPrazo: true })).join('')}</ul>`
            : estadoVazio('Tudo em dia', 'Nenhuma conta atrasada ou vencendo nos próximos 7 dias.')}
        </section>
      </div>

      <div class="grid gap-4">
        ${lembreteBackup()}
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
              <a href="#cartoes" class="flex items-center gap-3 rounded-lg px-1 py-3 transition hover:bg-stone-50 dark:hover:bg-stone-800/60">
                <span class="flex size-9 items-center justify-center rounded-lg bg-stone-100 text-stone-600 dark:bg-stone-800 dark:text-stone-300">${icone('cartao', 'size-5')}</span>
                <span class="min-w-0 flex-1"><span class="line-clamp-2 font-medium">${esc(c.nome)}</span>
                <span class="block text-sm text-stone-600 dark:text-stone-400">vence ${vencimentoFatura(c, mesISO(store.mes)).split('-').reverse().slice(0, 2).join('/')}</span></span>
                <span class="shrink-0 text-right"><span class="block font-semibold tabular-nums">${brl(valor)}</span><span class="selo ${cls}">${txt}</span></span>
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
      if (e.target.closest('[data-backup]')) { if (await fazerBackup()) ctx.atualizar(); return; }
      if (await cliqueEmLancamento(e, pendentes, ctx.atualizar)) return;
      const barra = e.target.closest('[data-categoria]');
      if (barra) abrirDetalheCategoria(barra.dataset.categoria, lancamentos, parcelas);
    };
  },
};

/** Aviso para fazer backup: se nunca fez (e já tem lançamentos) ou se o último tem mais de 30 dias */
function lembreteBackup() {
  const temDados = local.tabelas().lancamentos.length + local.tabelas().compras_cartao.length > 0;
  const dias = local.ultimoBackup ? Math.floor((Date.now() - new Date(local.ultimoBackup)) / 86400000) : null;
  if (!temDados || (dias !== null && dias < 30)) return '';
  return `<section class="card border-amber-300 bg-amber-50 dark:border-amber-800 dark:bg-amber-900/30" aria-labelledby="t-backup">
    <h2 id="t-backup" class="flex items-center gap-2 font-bold text-amber-900 dark:text-amber-100">${icone('alerta')} ${dias === null ? 'Faça seu primeiro backup' : `Último backup há ${dias} dias`}</h2>
    <p class="mt-1 text-sm text-amber-900 dark:text-amber-100">Os dados ficam só neste aparelho. Se ele for perdido ou formatado, só o backup traz tudo de volta.</p>
    <button type="button" class="btn-primario mt-3" data-backup>${icone('baixar')} Fazer backup agora</button>
  </section>`;
}
