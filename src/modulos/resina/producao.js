// Produção da resina no mês: totais das cargas e quanto cada produtor produziu
import { brl, esc, nomeMes, mesISO } from '../../lib/format.js';
import { store } from '../../lib/store.js';
import { icone, estadoVazio } from '../../lib/ui.js';
import { cargasEntre, insumosEntre } from './dados.js';
import { resumoDasCargas, comparativoInsumos } from './calculos.js';
import { secaoComparativo } from './comparativo.js';
import { kg, numero, pct, quadro, bolinha, nomeProdutor, corProdutor, seDesligado } from './comum.js';

let periodo = 'mes'; // 'mes' ou 'ano' (o ano do mês escolhido no topo)

export default {
  titulo: 'Produção',
  usaMes: true,
  ajuda: `
    <p>Tudo o que saiu nas <strong>cargas do mês</strong> escolhido no topo: quantos Tbs, quantos kg de resina, o valor das cargas e quanto ficou de <strong>arrendamento</strong>.</p>
    <p><strong>Por produtor</strong>: o que cada um produziu no mês. A barra mostra a parte de cada um no total de Tbs.</p>
    <p>Use <strong>Mês</strong> ou <strong>Ano inteiro</strong> para escolher o período (o ano é o do mês escolhido no topo).</p>
    <p><strong>Insumos × produção</strong>: compara o que cada produtor gastou em insumos com a resina que ele entregou. O número principal é o <strong>insumo por kg</strong>: quem fica muito acima da média ganha um alerta, porque pode ser desperdício ou resina que não chegou nas cargas. Os insumos são lançados na tela <strong>Insumos</strong>.</p>
    <p><strong>Importar planilha</strong> traz as cargas da planilha CONTROLE ANUAL (abas SAFRAS: DATA | TBS | PESO - KG de cada produtor). As linhas do mesmo dia viram uma carga só.</p>
    <p><strong>Diferença de peso</strong>: aparece quando as cargas têm as duas pesagens (fazenda e chegada). Negativa quer dizer que chegou menos do que saiu.</p>`,

  async render(el, ctx) {
    if (seDesligado(el)) return;
    const ano = store.mes.getFullYear();
    const [inicio, fim] = periodo === 'ano' ? [`${ano}-01-01`, `${ano + 1}-01-01`] : [mesISO(store.mes), mesISO(store.mes, 1)];
    const [{ cargas, itensPorCarga }, insumos] = await Promise.all([cargasEntre(inicio, fim), insumosEntre(inicio, fim)]);
    if (!ctx.aindaAtual()) return;
    const { total, produtores } = resumoDasCargas(cargas, itensPorCarga);
    const comp = comparativoInsumos(produtores, insumos);
    const textoPeriodo = periodo === 'ano' ? String(ano) : nomeMes(store.mes).toLowerCase();
    const semCadastro = !store.resina_produtores.length;
    const maiorTbs = Math.max(1, ...produtores.map((p) => p.tbs));

    el.innerHTML = `<div class="grid gap-4 animate-entrar">
      <div class="flex flex-wrap items-center gap-2" role="group" aria-label="Período">
        ${[['mes', 'Mês'], ['ano', `Ano inteiro (${ano})`]].map(([v, t]) => `<button type="button" class="${periodo === v ? 'btn-primario' : 'btn-neutro'} min-h-10 px-4 py-2" data-periodo="${v}" aria-pressed="${periodo === v}">${t}</button>`).join('')}
        <span class="flex-1"></span>
        <a href="#insumos" class="btn-neutro">${icone('insumo')} Insumos</a>
        <a href="#conta-corrente" class="btn-neutro">${icone('extrato')} Conta corrente</a>
      </div>
      ${semCadastro ? `<section class="card border-brand-200 dark:border-brand-900">
        <h2 class="font-semibold">Primeiros passos</h2>
        <ol class="mt-2 grid list-decimal gap-1 pl-5 text-sm text-stone-700 dark:text-stone-300">
          <li>Em <strong>Cadastros</strong>, inclua os produtores (com a cor de cada um), os motoristas, os caminhões e o preço do kg.</li>
          <li>Depois, registre cada carga em <strong>Nova carga</strong>.</li></ol>
        <a href="#resina-cadastros" class="btn-primario mt-4">${icone('cadastros')} Abrir os cadastros</a>
      </section>` : ''}

      <section class="card" aria-labelledby="t-mes">
        <div class="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h2 id="t-mes" class="card-titulo mb-0">Cargas de ${esc(textoPeriodo)}</h2>
          <span class="flex flex-wrap gap-2">
            <button type="button" class="btn-neutro" data-importar>${icone('enviar')} Importar planilha</button>
            <a href="#carga" class="btn-sec">${icone('mais')} Nova carga</a>
          </span>
        </div>
        ${cargas.length ? `<div class="grid grid-cols-2 gap-2 sm:grid-cols-3">
          ${quadro('Cargas', numero(total.cargas))}
          ${quadro('Tbs', numero(total.tbs))}
          ${quadro('Resina', kg(total.kg))}
          ${quadro('Valor das cargas', brl(total.valor))}
          ${quadro('Arrendamento', brl(total.arrendamento))}
          ${quadro('Parte dos produtores', brl(total.produtor))}
        </div>
        ${total.comDiferenca ? `<p class="mt-3 rounded-xl px-3 py-2 text-sm ${total.difKg < 0 ? 'bg-amber-50 text-amber-900 dark:bg-amber-950/50 dark:text-amber-200' : 'bg-brand-50 text-brand-900 dark:bg-brand-950 dark:text-brand-200'}">
          ${icone('balanca', 'mr-1 inline size-4 align-[-2px]')}<strong>Diferença de peso ${periodo === 'ano' ? 'no ano' : 'no mês'}:</strong> ${total.difKg < 0 ? '−' : '+'}${kg(Math.abs(total.difKg))} (${brl(Math.abs(total.difValor))}) em ${total.comDiferenca} ${total.comDiferenca === 1 ? 'carga pesada' : 'cargas pesadas'} na fazenda e na chegada.</p>` : ''}`
        : estadoVazio(periodo === 'ano' ? 'Nenhuma carga neste ano' : 'Nenhuma carga neste mês', 'Quando você registrar uma carga, os totais do mês aparecem aqui.', '<a href="#carga" class="btn-primario">Registrar carga</a>')}
      </section>

      ${produtores.length ? `<section class="card" aria-labelledby="t-prod">
        <h2 id="t-prod" class="card-titulo">Por produtor</h2>
        <ul class="grid gap-3">${produtores.map((p) => `
          <li class="rounded-xl border border-stone-200 p-3 dark:border-stone-800">
            <div class="flex flex-wrap items-center gap-x-3 gap-y-1">
              <p class="flex min-w-0 flex-1 items-center gap-2 font-semibold">${bolinha(corProdutor(p.produtor_id))}<span class="truncate">${esc(nomeProdutor(p.produtor_id))}</span></p>
              <p class="text-sm tabular-nums text-stone-600 dark:text-stone-400">${numero(p.tbs)} Tbs · ${kg(p.kg)} · ${pct((p.tbs / total.tbs) * 100)} do total</p>
            </div>
            <div class="mt-2 h-2.5 overflow-hidden rounded-full bg-stone-100 dark:bg-stone-800" aria-hidden="true"><span class="block h-full rounded-full" style="width:${(p.tbs / maiorTbs) * 100}%;background:${esc(corProdutor(p.produtor_id))}"></span></div>
            <dl class="mt-2 grid grid-cols-3 gap-2 text-sm">
              <div><dt class="text-stone-600 dark:text-stone-400">Valor</dt><dd class="font-semibold tabular-nums">${brl(p.valor)}</dd></div>
              <div><dt class="text-stone-600 dark:text-stone-400">Produtor</dt><dd class="font-semibold tabular-nums">${brl(p.produtor)}</dd></div>
              <div><dt class="text-stone-600 dark:text-stone-400">Arrendamento</dt><dd class="font-semibold tabular-nums">${brl(p.arrendamento)}</dd></div>
            </dl>
          </li>`).join('')}</ul>
      </section>` : ''}

      ${produtores.length || insumos.length ? secaoComparativo(comp, textoPeriodo) : ''}
    </div>`;

    el.onclick = async (e) => {
      if (e.target.closest('[data-importar]')) {
        const { importarQualquerPlanilha } = await import('../../components/importar.js');
        return importarQualquerPlanilha(ctx.atualizar);
      }
      const b = e.target.closest('[data-periodo]');
      if (!b || b.dataset.periodo === periodo) return;
      periodo = b.dataset.periodo;
      ctx.atualizar();
    };
  },
};
