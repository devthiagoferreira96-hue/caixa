// Tela inicial: saldos, resumo do mês, contas a pagar, faturas e gráfico por categoria
import { brl, brlCurto, esc, mesISO, somarDias, nomeMes } from '../lib/format.js';
import { store, contasAtivas, cartoesAtivos, areaDaCategoria, GRUPOS_SEPARADOS } from '../lib/store.js';
import { saldosContas, lancamentosDoMes, parcelasDoMes, pendentesAte, pagamentosDeFatura } from '../lib/api.js';
import { gastosPorCategoria, totalDoCartao, resumoPorArea, entradasPorCategoria, situacaoFatura } from '../lib/calculos.js';
import { itemLancamento, cliqueEmLancamento } from '../components/lancamento.js';
import { barrasCategorias, abrirDetalheCategoria } from '../components/grafico.js';
import { icone, estadoVazio } from '../lib/ui.js';
import { local } from '../lib/local-db.js';
import { fazerBackup } from '../components/backup.js';
import { vencimentoFatura } from '../lib/faturas.js';
import { resinaAtiva, todasAsCargas, lerMovimentos, insumosEntre } from '../modulos/resina/dados.js';
import { aReceberPorConta } from '../modulos/resina/calculos.js';

/** Arrendamento a receber da Resina (só quando o módulo está ligado e há contas CNPJ/CPF) */
async function resumoResina() {
  const titulares = store.resina_titulares.filter((t) => t.ativo !== false);
  if (!resinaAtiva() || !titulares.length) return null;
  const [{ cargas, itensPorCarga }, movimentos, insumos] = await Promise.all([todasAsCargas(), lerMovimentos(), insumosEntre('0000-01-01', '9999-12-31')]);
  if (!cargas.length && !movimentos.length && !insumos.length) return null;
  return aReceberPorConta(cargas, itensPorCarga, movimentos, insumos, titulares.map((t) => t.id), somarDias(1))
    .map((r) => ({ ...r, nome: titulares.find((t) => t.id === r.titular_id).nome }));
}

export default {
  titulo: 'Início',
  usaMes: true,
  ajuda: `
    <p><strong>Saldo total</strong>: quanto vocês têm somando todas as contas. Só conta o que já foi pago ou recebido.</p>
    <p><strong>Resumo da casa</strong>: o que entrou e o que saiu no mês escolhido no topo (gastos do caixa + parcelas dos cartões), <strong>sem</strong> as categorias dos grupos Fazenda e Empresa. Embaixo aparece o resultado geral, somando tudo.</p>
    <p><strong>Fazenda</strong>: vendas menos despesas da fazenda no mês, mostrando se deu lucro ou prejuízo. A Empresa ganha um quadro igual quando tiver lançamentos no mês.</p>
    <p><strong>Contas a pagar</strong>: o que está atrasado ou vence nos próximos 7 dias. Quando pagar, toque no círculo.</p>
    <p><strong>Faturas do mês</strong>: quanto cada cartão vai cobrar. Toque para ver as compras.</p>
    <p><strong>Gastos por categoria</strong>: toque numa barra para ver tudo o que foi gasto naquela categoria.</p>`,

  async render(el, ctx) {
    const [saldos, lancamentos, parcelas, pendentes, pagamentos, resina] = await Promise.all([
      saldosContas(),
      lancamentosDoMes(),
      parcelasDoMes(),
      pendentesAte(somarDias(7)),
      pagamentosDeFatura(),
      resumoResina().catch(() => null),
    ]);
    if (!ctx.aindaAtual()) return;

    const contas = contasAtivas();
    const total = contas.reduce((s, c) => s + (saldos.get(c.id) || 0), 0);
    const areas = resumoPorArea(lancamentos, parcelas, areaDaCategoria, ['Casa', ...GRUPOS_SEPARADOS]);
    const casa = areas.Casa;
    const temSeparadas = GRUPOS_SEPARADOS.some((g) => areas[g].movimentos > 0);
    const geral = Object.values(areas).reduce((s, a) => s + a.resultado, 0);
    const entradasCat = entradasPorCategoria(lancamentos);
    const categoriasGrafico = store.categorias.filter((c) => c.no_grafico);
    const gastos = gastosPorCategoria(lancamentos, parcelas);
    const somaGrafico = categoriasGrafico.reduce((s, c) => s + (gastos.get(c.id) || 0), 0);
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

        ${temSeparadas ? `<section class="card" aria-labelledby="t-total">
          <h2 id="t-total" class="card-titulo mb-1">Total do mês: casa + ${GRUPOS_SEPARADOS.filter((g) => areas[g].movimentos > 0).join(' + ').toLowerCase()}</h2>
          <p class="mb-3 text-sm text-stone-600 dark:text-stone-400">Soma dos resumos abaixo em ${esc(nomeMes(store.mes).toLowerCase())}.</p>
          ${quadrosResultado(Object.values(areas).reduce((t, a) => ({ entradas: t.entradas + a.entradas, gastos: t.gastos + a.gastos, resultado: t.resultado + a.resultado }), { entradas: 0, gastos: 0, resultado: 0 }), { entrou: 'Entrou (tudo)', saiu: 'Saiu (tudo)' })}
        </section>` : ''}

        <section class="card" aria-labelledby="t-resumo">
          <h2 id="t-resumo" class="card-titulo mb-1">Resumo da casa em ${esc(nomeMes(store.mes).toLowerCase())}</h2>
          <p class="mb-3 text-sm text-stone-600 dark:text-stone-400">Sem ${GRUPOS_SEPARADOS.join(' e ').toLowerCase()}.</p>
          ${quadrosResultado(casa, { entrou: 'Entrou', saiu: 'Saiu' })}
          ${temSeparadas ? `<p class="mt-3 flex flex-wrap items-baseline justify-between gap-x-3 border-t border-stone-100 pt-3 text-sm dark:border-stone-800" data-resultado-geral>
            <span class="text-stone-600 dark:text-stone-400">Resultado geral (casa + ${GRUPOS_SEPARADOS.filter((g) => areas[g].movimentos > 0).join(' + ').toLowerCase()})</span>
            <strong class="tabular-nums ${geral < 0 ? 'valor-saida' : ''}">${brl(geral)}</strong></p>` : ''}
        </section>

        ${GRUPOS_SEPARADOS.filter((g) => store.categorias.some((c) => c.grupo === g) && (g === 'Fazenda' || areas[g].movimentos > 0))
          .map((g) => quadroArea(g, areas[g], gastos, entradasCat)).join('')}

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
            <li>Já usa a planilha do Excel? Em <a href="#ajustes" class="font-semibold underline">Ajustes</a>, toque em <strong>Importar planilha ou backup</strong>. Se não, informe lá quanto cada conta tem hoje (saldo inicial).</li>
            <li>Ainda em Ajustes, confira os dias de fechamento e vencimento dos cartões.</li>
            <li>Toque em <a href="#novo" class="font-semibold underline">Novo lançamento</a> para registrar o primeiro gasto.</li>
          </ol>
        </section>` : ''}

        ${resina ? cartaoResina(resina) : ''}

        <section class="card" aria-labelledby="t-faturas">
          <h2 id="t-faturas" class="card-titulo">Faturas de ${esc(nomeMes(store.mes).toLowerCase())}</h2>
          ${cartoesAtivos().length ? `<ul>${cartoesAtivos().map((c) => {
            const valor = totalDoCartao(parcelas, c.id);
            const sit = situacaoFatura(valor, pagamentos.filter((p) => p.fatura_cartao_id === c.id));
            const [cls, txt] = { sem: ['selo-neutro', 'Sem compras'], credito: ['selo-ok', 'Crédito'], paga: ['selo-ok', 'Paga'], agendada: ['selo-aberto', 'Agendada'], parcial: ['selo-aberto', `Falta ${brl(sit.falta)}`], aberta: ['selo-aberto', 'Em aberto'] }[sit.estado];
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

/** Três quadrinhos: entrou, saiu e resultado (lucro/prejuízo) */
function quadrosResultado(a, { entrou, saiu, lucro = false }) {
  const rotuloResultado = lucro ? (a.resultado < 0 ? 'Prejuízo' : 'Lucro') : 'Resultado';
  return `<dl class="grid gap-2 sm:grid-cols-3">
    ${[[entrou, brl(a.entradas), 'bg-emerald-50 dark:bg-emerald-950/40', 'valor-entrada'],
       [saiu, brl(a.gastos), 'bg-red-50 dark:bg-red-950/40', 'valor-saida'],
       [rotuloResultado, brl(lucro ? Math.abs(a.resultado) : a.resultado), 'bg-stone-100 dark:bg-stone-800', a.resultado < 0 ? 'valor-saida' : a.resultado > 0 && lucro ? 'valor-entrada' : '']]
      .map(([rotulo, valor, fundo, cor]) => `<div class="flex flex-wrap items-baseline justify-between gap-x-3 rounded-xl p-3 sm:block ${fundo}">
        <dt class="text-sm text-stone-600 dark:text-stone-400">${rotulo}</dt><dd class="font-semibold tabular-nums ${cor}">${valor}</dd></div>`).join('')}
  </dl>`;
}

/** Quadro de uma área separada (Fazenda, Empresa): entradas, despesas, lucro e despesas por categoria */
function quadroArea(nome, a, gastos, entradasCat) {
  const cats = store.categorias.filter((c) => c.grupo === nome);
  const id = `t-area-${nome.toLowerCase()}`;
  const origens = cats.filter((c) => entradasCat.get(c.id)).sort((x, y) => entradasCat.get(y.id) - entradasCat.get(x.id));
  return `<section class="card" aria-labelledby="${id}" data-area="${esc(nome)}">
    <h2 id="${id}" class="card-titulo mb-1">${esc(nome)} em ${esc(nomeMes(store.mes).toLowerCase())}</h2>
    <p class="mb-3 text-sm text-stone-600 dark:text-stone-400">Fora do resumo da casa. Gastos do caixa + cartões.</p>
    ${a.movimentos ? `
      ${quadrosResultado(a, { entrou: nome === 'Fazenda' ? 'Vendas e entradas' : 'Entradas', saiu: 'Despesas', lucro: true })}
      ${origens.length ? `<p class="mt-3 text-sm text-stone-600 dark:text-stone-400">Entradas: ${origens.map((c) => `${esc(c.nome)} <span class="font-semibold text-stone-900 tabular-nums dark:text-stone-100">${brl(entradasCat.get(c.id))}</span>`).join(' · ')}</p>` : ''}
      ${a.gastos ? `<h3 class="mt-4 mb-1 text-sm font-semibold">Despesas por categoria</h3>${barrasCategorias(gastos, cats, { mostrarZeradas: false })}` : ''}`
    : estadoVazio(`Nada lançado na ${nome.toLowerCase()} neste mês`, `Use as categorias do grupo ${nome}, como ${cats.slice(0, 2).map((c) => c.nome).join(' ou ')}.`)}
  </section>`;
}

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

/** Quadro "Resina: arrendamento a receber", com o saldo de cada conta (CNPJ/CPF) até hoje */
function cartaoResina(contas) {
  const total = contas.reduce((s, c) => s + c.aReceber, 0);
  return `<section class="card" aria-labelledby="t-resina">
    <div class="flex items-start justify-between gap-2">
      <h2 id="t-resina" class="card-titulo mb-0">Resina: arrendamento a receber</h2>
      <a href="#conta-corrente" class="shrink-0 text-sm font-semibold text-brand-700 underline underline-offset-2 dark:text-brand-400">Conta corrente</a>
    </div>
    <p class="mt-2 text-2xl font-bold tabular-nums">${brl(total)}</p>
    <p class="text-sm text-stone-600 dark:text-stone-400">Arrendamento e insumos descontados, menos o que já foi recebido, até hoje.</p>
    <ul class="mt-3">${contas.map((c) => `<li class="flex items-center justify-between gap-3 border-t border-stone-100 py-2.5 dark:border-stone-800">
      <span class="min-w-0 truncate font-medium">${esc(c.nome)}</span>
      <span class="shrink-0 text-right tabular-nums">${c.aReceber ? `<span class="font-semibold">${brl(c.aReceber)}</span> <span class="selo selo-aberto">Falta receber</span>`
        : c.saldo > 0.004 ? `<span class="font-semibold">${brl(c.saldo)}</span> <span class="selo selo-ok">Recebido a mais</span>` : '<span class="selo selo-ok">Em dia</span>'}</span>
    </li>`).join('')}</ul>
    <p class="mt-2 text-sm text-stone-600 dark:text-stone-400">Recebimentos lançados na conta corrente com "lançar também no Caixa" entram como entrada nas contas acima.</p>
  </section>`;
}
