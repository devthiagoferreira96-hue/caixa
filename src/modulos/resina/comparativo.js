// Comparativo de insumos × produção por produtor (gráficos em HTML puro + tabelas com todos os números).
// Pergunta que ele responde: quem gasta mais insumo para cada kg de resina que entrega?
// Duas medidas de escalas diferentes (R$ e kg) ficam em dois painéis lado a lado, nunca num eixo duplo.
import { brl, esc } from '../../lib/format.js';
import { icone } from '../../lib/ui.js';
import { LIMITE_ALERTA } from './calculos.js';
import { kg, numero, pct, quadro, bolinha, nomeProdutor, corProdutor } from './comum.js';
import { nomeProduto, unidade } from './insumos.js';

const rotuloProdutor = (id) => `<span class="flex min-w-0 items-center gap-2 text-sm font-medium">${bolinha(corProdutor(id))}<span class="truncate">${esc(nomeProdutor(id))}</span></span>`;
const largura = (v, maior) => (v > 0 ? Math.max((v / maior) * 100, 1.5) : 0);
const porKg = (v) => (v == null ? '—' : `${brl(v)}/kg`);
// colunas da "Tabela com todos os números" onde começa um grupo (linha mais forte antes):
// produção (Cargas), valores (Valor da resina), insumos (Insumos) e o resultado (Produtor − insumos)
const INICIO_GRUPO = new Set([1, 4, 7, 10]);

/** Uma barra com o valor na ponta. A barra é o alvo do toque/foco e mostra a dica. */
const barra = (valor, maior, cor, texto, dica) => `
  <span class="barra-alvo flex min-w-0 items-center gap-2 rounded" tabindex="0" title="${esc(dica)}" aria-label="${esc(dica)}">
    <span class="min-w-0 flex-1"><span class="barra-grafico block" style="width:${largura(valor, maior)}%;background:var(${cor})"></span></span>
    <span class="w-24 shrink-0 text-right text-sm tabular-nums text-stone-700 dark:text-stone-300">${texto}</span>
  </span>`;

const legenda = (itens) => `<ul class="flex flex-wrap gap-x-4 gap-y-1 text-sm text-stone-600 dark:text-stone-400">${itens.map(([cor, t]) =>
  `<li class="flex items-center gap-1.5"><span class="inline-block size-3 rounded-sm" style="background:var(${cor})" aria-hidden="true"></span>${t}</li>`).join('')}</ul>`;

/** Frases de alerta para quem olha (texto, não só cor) */
function alertas(comp) {
  const media = comp.total.custoPorKg;
  const lista = [];
  for (const l of comp.linhas) {
    if (l.alerta === 'sem-producao') lista.push(`<strong>${esc(nomeProdutor(l.produtor_id))}</strong> recebeu ${brl(l.gasto)} em insumos e não entregou resina neste período.`);
    if (l.alerta === 'acima') lista.push(`<strong>${esc(nomeProdutor(l.produtor_id))}</strong> gasta ${porKg(l.custoPorKg)} de insumo, <strong>${pct(l.vsMedia * 100)} acima da média</strong> (${porKg(media)}). Vale conferir se toda a resina coletada está chegando nas cargas.`);
  }
  for (const l of comp.linhas) {
    if (l.descontado > 0 && l.kg > 0 && l.liquidoProdutor < 0) lista.push(`A parte dos insumos cobrada de <strong>${esc(nomeProdutor(l.produtor_id))}</strong> (${brl(l.descontado)}) passou da parte dele na resina (${brl(l.produtor)}): o desconto vai deixar a conta dele negativa.`);
  }
  return lista;
}

/**
 * Seção completa. `comp` = comparativoInsumos(...); `periodo` = "novembro de 2026" ou "2026".
 */
export function secaoComparativo(comp, periodo) {
  const linhas = comp.linhas;
  const comInsumo = linhas.some((l) => l.gasto > 0);
  const cabecalho = `<div class="mb-3 flex flex-wrap items-center justify-between gap-2">
      <div><h2 id="t-insumos" class="card-titulo mb-0">Insumos × produção</h2>
        <p class="text-sm text-stone-600 dark:text-stone-400">Quem gasta mais insumo para cada kg de resina que entrega · ${esc(periodo)}</p></div>
      <a href="#insumos" class="btn-sec">${icone('insumo')} Lançar insumos</a>
    </div>`;
  if (!comInsumo) {
    return `<section class="card" aria-labelledby="t-insumos">${cabecalho}
      <p class="rounded-xl bg-stone-50 px-3 py-3 text-sm text-stone-600 dark:bg-stone-800/60 dark:text-stone-400">Nenhum insumo lançado em ${esc(periodo)}. Lance os produtos que cada produtor usou na tela <a href="#insumos" class="font-semibold underline">Insumos</a> para comparar o gasto com a resina entregue.</p>
    </section>`;
  }

  const maiorGasto = Math.max(1, ...linhas.map((l) => l.gasto));
  const maiorKg = Math.max(1, ...linhas.map((l) => l.kg));
  const media = comp.total.custoPorKg;
  const ranking = linhas.filter((l) => l.custoPorKg != null).sort((a, b) => b.custoPorKg - a.custoPorKg);
  const maiorCusto = Math.max(media || 0, ...ranking.map((l) => l.custoPorKg)) * 1.08 || 1;
  const posMedia = media ? (media / maiorCusto) * 100 : null;
  const avisos = alertas(comp);
  const produtos = [...new Set(linhas.flatMap((l) => [...l.porProduto.keys()]))].sort((a, b) => nomeProduto(a).localeCompare(nomeProduto(b), 'pt-BR'));

  return `<section class="card grid gap-5" aria-labelledby="t-insumos">${cabecalho}
    <div class="grid grid-cols-2 gap-2 lg:grid-cols-4">
      ${[['Gasto com insumos', brl(comp.total.gasto)], ['Resina entregue', kg(comp.total.kg)], ['Insumo por kg (média)', porKg(media)], ['Produtores − desconto', brl(comp.total.produtor - comp.total.descontado)]].map(([t, v]) => quadro(t, v)).join('')}
    </div>

    ${avisos.length ? `<ul class="grid gap-2" aria-label="Pontos de atenção">${avisos.map((a) =>
      `<li class="flex items-start gap-2 rounded-xl bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:bg-amber-950/50 dark:text-amber-100">${icone('alerta', 'mt-0.5 size-4 shrink-0')}<span>${a}</span></li>`).join('')}</ul>`
    : `<p class="flex items-center gap-2 rounded-xl bg-brand-50 px-3 py-2 text-sm text-brand-900 dark:bg-brand-950 dark:text-brand-100">${icone('check', 'size-4 shrink-0')} Nenhum produtor está ${pct(LIMITE_ALERTA * 100)} ou mais acima da média de insumo por kg.</p>`}

    <figure class="grid gap-3">
      <figcaption><h3 class="font-semibold">Insumo gasto para cada kg de resina</h3>
        <p class="text-sm text-stone-600 dark:text-stone-400">Menor é melhor. A linha mostra a média de todos. Muito acima da média pode ser desperdício ou resina que não chegou nas cargas.</p></figcaption>
      <div class="grid gap-1.5">
        ${posMedia != null ? `<div class="grid grid-cols-[minmax(0,8rem)_1fr] gap-3 sm:grid-cols-[minmax(0,11rem)_1fr]"><span></span>
          <span class="relative h-5 text-xs text-stone-600 dark:text-stone-400"><span class="absolute bottom-0 -translate-x-1/2 whitespace-nowrap" style="left:calc(${posMedia} * (100% - 6.5rem) / 100)">Média ${porKg(media)}</span></span></div>` : ''}
        ${ranking.map((l) => `<div class="grid grid-cols-[minmax(0,8rem)_1fr] items-center gap-3 sm:grid-cols-[minmax(0,11rem)_1fr]">
          ${rotuloProdutor(l.produtor_id)}
          <span class="relative">
            ${posMedia != null ? `<span class="pointer-events-none absolute inset-y-[-4px] w-px bg-stone-500 dark:bg-stone-400" style="left:calc(${posMedia} * (100% - 6.5rem) / 100)" aria-hidden="true"></span>` : ''}
            ${barra(l.custoPorKg, maiorCusto, '--serie-insumo', porKg(l.custoPorKg), `${nomeProdutor(l.produtor_id)}: ${porKg(l.custoPorKg)} de insumo (${brl(l.gasto)} para ${kg(l.kg)})${l.vsMedia != null ? `, ${l.vsMedia >= 0 ? `${pct(l.vsMedia * 100)} acima` : `${pct(-l.vsMedia * 100)} abaixo`} da média` : ''}`)}
          </span>
        </div>
        ${l.alerta === 'acima' ? `<p class="-mt-1 flex items-center gap-1 pl-0 text-xs font-semibold text-amber-800 sm:pl-[12rem] dark:text-amber-300">${icone('alerta', 'size-3.5')} ${pct(l.vsMedia * 100)} acima da média</p>` : ''}`).join('')}
        ${linhas.filter((l) => l.alerta === 'sem-producao').map((l) => `<div class="grid grid-cols-[minmax(0,8rem)_1fr] items-center gap-3 sm:grid-cols-[minmax(0,11rem)_1fr]">${rotuloProdutor(l.produtor_id)}
          <span class="flex items-center gap-1 text-xs font-semibold text-amber-800 dark:text-amber-300">${icone('alerta', 'size-3.5')} ${brl(l.gasto)} em insumos, sem resina entregue</span></div>`).join('')}
      </div>
    </figure>

    <figure class="grid gap-3">
      <figcaption class="flex flex-wrap items-end justify-between gap-2"><span><h3 class="font-semibold">Quanto cada um gastou e quanto entregou</h3>
        <p class="text-sm text-stone-600 dark:text-stone-400">Dois painéis com a mesma ordem de produtores: o ideal é a barra de resina acompanhar a de insumos.</p></span>
        ${legenda([['--serie-insumo', 'Gasto com insumos (R$)'], ['--serie-producao', 'Resina entregue (kg)']])}</figcaption>
      <div class="hidden grid-cols-[minmax(0,11rem)_1fr_1fr] gap-x-6 text-xs font-semibold uppercase text-stone-600 sm:grid dark:text-stone-400"><span>Produtor</span><span>Gasto com insumos</span><span>Resina entregue</span></div>
      <ul class="grid gap-3 sm:gap-2">${linhas.map((l) => `<li class="grid gap-1 sm:grid-cols-[minmax(0,11rem)_1fr_1fr] sm:items-center sm:gap-x-6">
        ${rotuloProdutor(l.produtor_id)}
        ${barra(l.gasto, maiorGasto, '--serie-insumo', brl(l.gasto), `${nomeProdutor(l.produtor_id)}: ${brl(l.gasto)} em insumos`)}
        ${barra(l.kg, maiorKg, '--serie-producao', kg(l.kg), `${nomeProdutor(l.produtor_id)}: ${kg(l.kg)} de resina em ${numero(l.cargas)} ${l.cargas === 1 ? 'carga' : 'cargas'}`)}
      </li>`).join('')}</ul>
    </figure>

    <details class="group rounded-xl border border-stone-200 dark:border-stone-800" open>
      <summary class="cursor-pointer px-3 py-2 font-semibold">Tabela com todos os números</summary>
      <div class="overflow-x-auto px-3 pb-3">
        <table class="tabela-colunas w-full min-w-[52rem] text-sm tabular-nums">
          <thead class="text-left text-xs uppercase text-stone-600 dark:text-stone-400"><tr>
            ${['Produtor', 'Cargas', 'Tbs', 'Resina', 'Valor da resina', 'Arrendamento', 'Parte do produtor', 'Insumos', 'Insumo por kg', 'Insumo / valor', 'Produtor − desconto'].map((c, i) =>
              `<th scope="col" class="px-2 py-1.5 font-semibold ${i ? 'text-right' : ''} ${INICIO_GRUPO.has(i) ? 'grupo' : ''}">${c}</th>`).join('')}</tr></thead>
          <tbody>${linhas.map((l) => `<tr>
            <td class="px-2 py-2">${rotuloProdutor(l.produtor_id)}</td>
            <td class="grupo px-2 py-2 text-right">${numero(l.cargas)}</td><td class="px-2 py-2 text-right">${numero(l.tbs)}</td>
            <td class="whitespace-nowrap px-2 py-2 text-right">${kg(l.kg)}</td><td class="grupo whitespace-nowrap px-2 py-2 text-right">${brl(l.valor)}</td>
            <td class="whitespace-nowrap px-2 py-2 text-right">${brl(l.arrendamento)}</td><td class="whitespace-nowrap px-2 py-2 text-right">${brl(l.produtor)}</td><td class="grupo whitespace-nowrap px-2 py-2 text-right"><span class="font-semibold">${brl(l.gasto)}</span>${l.gasto && Math.abs(l.descontado - l.gasto) > 0.004 ? `<span class="block text-xs text-stone-600 dark:text-stone-400">${brl(l.descontado)} do produtor</span>` : ''}</td>
            <td class="whitespace-nowrap px-2 py-2 text-right">${l.alerta ? icone('alerta', 'mr-1 inline size-3.5 align-[-2px] text-amber-700 dark:text-amber-300') : ''}${porKg(l.custoPorKg)}</td>
            <td class="whitespace-nowrap px-2 py-2 text-right">${l.pctDoValor == null ? '—' : pct(l.pctDoValor)}</td>
            <td class="grupo whitespace-nowrap px-2 py-2 text-right ${l.liquidoProdutor < 0 ? 'font-semibold text-red-700 dark:text-red-400' : ''}">${brl(l.liquidoProdutor)}</td>
          </tr>`).join('')}</tbody>
        </table>
        <p class="dica mt-2">"Insumos" é o valor cheio das notas. Só a parte do produtor (o % escolhido em cada entrega) é descontada dele e entra como débito na conta corrente. "Produtor − desconto" é o que sobra para ele depois do desconto.</p>
      </div>
    </details>

    ${produtos.length ? `<details class="rounded-xl border border-stone-200 dark:border-stone-800">
      <summary class="cursor-pointer px-3 py-2 font-semibold">Consumo de cada produto por tonelada de resina</summary>
      <div class="overflow-x-auto px-3 pb-3">
        <p class="mb-2 text-sm text-stone-600 dark:text-stone-400">Quanto de cada produto o produtor usou para cada 1.000 kg de resina entregue. Compare a mesma coluna entre produtores.</p>
        <table class="tabela-colunas w-full text-sm tabular-nums">
          <thead class="text-left text-xs uppercase text-stone-600 dark:text-stone-400"><tr><th scope="col" class="px-1.5 py-1.5 font-semibold">Produtor</th>${produtos.map((p) =>
            `<th scope="col" class="px-1.5 py-1.5 text-right font-semibold">${esc(nomeProduto(p))} <span class="font-normal normal-case">(${esc(unidade(p))}/t)</span></th>`).join('')}</tr></thead>
          <tbody>${linhas.map((l) => `<tr><td class="px-1.5 py-2">${rotuloProdutor(l.produtor_id)}</td>${produtos.map((p) => {
            const q = l.porProduto.get(p)?.quantidade;
            return `<td class="whitespace-nowrap px-1.5 py-2 text-right">${!q ? '—' : l.kg > 0 ? numero((q / l.kg) * 1000, 2) : `${numero(q, 2)} <span class="text-xs text-stone-500">sem resina</span>`}</td>`;
          }).join('')}</tr>`).join('')}</tbody>
        </table>
      </div>
    </details>` : ''}
  </section>`;
}
