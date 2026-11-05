// Relatório: últimos 6 meses + detalhamento do mês por grupo, categoria e pessoa
import { brl, esc, mesISO, inicioMes, nomeMes, nomeMesCurto, porcentagem } from '../lib/format.js';
import { store, categoriasPorGrupo, buscar } from '../lib/store.js';
import { lancamentosEntre, parcelasEntre } from '../lib/api.js';
import { gastosPorCategoria, saidasReais, entradas, somar } from '../lib/calculos.js';
import { barrasCategorias, colunasMeses, abrirDetalheCategoria } from '../components/grafico.js';
import { estadoVazio } from '../lib/ui.js';

export default {
  titulo: 'Relatório',
  usaMes: true,
  ajuda: `
    <p>O gráfico de colunas mostra quanto foi gasto em cada um dos <strong>últimos 6 meses</strong>. Toque numa coluna para ver aquele mês.</p>
    <p>Abaixo, os gastos do mês escolhido separados por <strong>grupo</strong> (Casa, Fazenda, Empresa…) e por categoria. Aqui entram <strong>todas</strong> as categorias, inclusive as que não aparecem no gráfico do Início.</p>
    <p><strong>Pagamentos por pessoa</strong> soma o que foi pago a cada funcionário ou prestador no mês.</p>`,

  async render(el, ctx) {
    const inicio = mesISO(store.mes, -5);
    const fim = mesISO(store.mes, 1);
    const [lancamentos, parcelas] = await Promise.all([lancamentosEntre(inicio, fim), parcelasEntre(inicio, fim)]);
    if (!ctx.aindaAtual()) return;

    const meses = [-5, -4, -3, -2, -1, 0].map((n) => {
      const data = inicioMes(store.mes, n);
      const chave = mesISO(data);
      const ls = lancamentos.filter((l) => l.vencimento.slice(0, 7) === chave.slice(0, 7));
      const ps = parcelas.filter((p) => p.fatura_mes === chave);
      return { data, rotulo: nomeMesCurto(data), rotuloLongo: nomeMes(data), valor: somar(saidasReais(ls)) + somar(ps), entrada: somar(entradas(ls)), ls, ps };
    });
    const atual = meses[5];
    const anteriores = meses.slice(0, 5).filter((m) => m.valor > 0);
    const media = anteriores.length ? somar(anteriores) / anteriores.length : 0;
    const variacao = media ? ((atual.valor - media) / media) * 100 : 0;

    const gastos = gastosPorCategoria(atual.ls, atual.ps);
    const grupos = Object.entries(categoriasPorGrupo())
      .map(([grupo, cats]) => ({ grupo, cats, total: cats.reduce((s, c) => s + (gastos.get(c.id) || 0), 0) }))
      .filter((g) => g.total > 0)
      .sort((a, b) => b.total - a.total);

    const porPessoa = new Map();
    saidasReais(atual.ls).filter((l) => l.pessoa_id).forEach((l) => porPessoa.set(l.pessoa_id, (porPessoa.get(l.pessoa_id) || 0) + Number(l.valor)));

    el.innerHTML = `
    <div class="grid gap-4 animate-entrar">
      <section class="card" aria-labelledby="t-meses">
        <div class="mb-4 flex flex-wrap items-end justify-between gap-3">
          <div><h2 id="t-meses" class="card-titulo mb-1">Gastos dos últimos 6 meses</h2>
          <p class="text-2xl font-bold tabular-nums">${brl(atual.valor)} <span class="text-base font-medium text-stone-600 dark:text-stone-400">em ${esc(nomeMes(store.mes).toLowerCase())}</span></p></div>
          ${media ? `<p class="rounded-xl px-3 py-2 text-sm ${variacao > 0 ? 'bg-red-50 text-red-800 dark:bg-red-950/40 dark:text-red-300' : 'bg-brand-50 text-brand-800 dark:bg-brand-950 dark:text-brand-200'}">
            ${variacao > 0 ? '▲' : '▼'} ${porcentagem(Math.abs(variacao))} ${variacao > 0 ? 'acima' : 'abaixo'} da média dos meses anteriores (${brl(media)})</p>` : ''}
        </div>
        ${colunasMeses(meses, store.mes)}
      </section>

      <div class="grid items-start gap-4 lg:grid-cols-[1.4fr_1fr]">
        <div class="grid gap-4">
          ${grupos.length ? grupos.map((g) => `
          <section class="card" aria-labelledby="g-${esc(g.grupo)}">
            <div class="mb-2 flex flex-wrap items-baseline justify-between gap-x-2">
              <h2 id="g-${esc(g.grupo)}" class="font-bold">${esc(g.grupo)}</h2>
              <p class="text-sm text-stone-600 dark:text-stone-400"><span class="font-semibold text-stone-900 tabular-nums dark:text-stone-100">${brl(g.total)}</span> · ${porcentagem((g.total / atual.valor) * 100)} do mês</p>
            </div>
            ${barrasCategorias(gastos, g.cats, { mostrarZeradas: false })}
          </section>`).join('')
          : `<div class="card">${estadoVazio('Nenhum gasto neste mês', 'Quando houver lançamentos, eles aparecem aqui separados por grupo e categoria.')}</div>`}
          ${gastos.get(null) ? `<p class="px-1 text-sm text-stone-600 dark:text-stone-400">Sem categoria: ${brl(gastos.get(null))}</p>` : ''}
        </div>

        <div class="grid gap-4">
          <section class="card" aria-labelledby="t-balanco">
            <h2 id="t-balanco" class="card-titulo">Balanço de ${esc(nomeMes(store.mes).toLowerCase())}</h2>
            <dl class="grid gap-2">
              <div class="flex justify-between"><dt>Entradas</dt><dd class="font-semibold tabular-nums valor-entrada">${brl(atual.entrada)}</dd></div>
              <div class="flex justify-between"><dt>Gastos</dt><dd class="font-semibold tabular-nums valor-saida">${brl(atual.valor)}</dd></div>
              <div class="flex justify-between border-t border-stone-200 pt-2 dark:border-stone-800"><dt class="font-semibold">Resultado</dt>
              <dd class="font-bold tabular-nums ${atual.entrada - atual.valor < 0 ? 'valor-saida' : 'valor-entrada'}">${brl(atual.entrada - atual.valor)}</dd></div>
            </dl>
          </section>
          <section class="card" aria-labelledby="t-pessoas">
            <h2 id="t-pessoas" class="card-titulo">Pagamentos por pessoa</h2>
            ${porPessoa.size ? `<ul>${[...porPessoa].sort((a, b) => b[1] - a[1]).map(([id, v]) => {
              const p = buscar('pessoas', id);
              return `<li class="flex items-center justify-between gap-2 border-t border-stone-100 py-2.5 first:border-t-0 dark:border-stone-800">
                <span><span class="block font-medium">${esc(p?.nome || 'Pessoa removida')}</span><span class="text-sm text-stone-600 dark:text-stone-400">${esc(p?.tipo || '')}</span></span>
                <span class="shrink-0 font-semibold tabular-nums">${brl(v)}</span></li>`;
            }).join('')}</ul>` : estadoVazio('Ninguém neste mês', 'Preencha o campo "Pessoa" ao lançar pagamentos de funcionários e prestadores.')}
          </section>
        </div>
      </div>
    </div>`;

    el.onclick = (e) => {
      const coluna = e.target.closest('[data-mes]');
      if (coluna) {
        store.mes = inicioMes(new Date(coluna.dataset.mes));
        return ctx.aoTrocarMes();
      }
      const barra = e.target.closest('[data-categoria]');
      if (barra) abrirDetalheCategoria(barra.dataset.categoria, atual.ls, atual.ps);
    };
  },
};
