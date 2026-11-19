// Insumos: os produtos que cada produtor usou para coletar a resina (quantidade, valor unitário e total)
import { brl, esc, dataCompleta, nomeMes, mesISO, hojeISO, lerValor, valorParaCampo, VALOR_MAXIMO, valorMaximoTexto } from '../../lib/format.js';
import { store } from '../../lib/store.js';
import { icone, estadoVazio, toast, confirmar, dialogo, mascaraDinheiro, erroNoCampo, limparErros, semRepetir } from '../../lib/ui.js';
import { desfazendo } from '../../components/lancamento.js';
import { insumosEntre, salvarInsumos, excluirInsumos } from './dados.js';
import { totalDoInsumo, pctDoProdutor, parteDoProdutor } from './calculos.js';
import { camposPagamentoInsumos, ligarPagamentoInsumos, lerPagamentoInsumos, gravarPagamentoInsumos, desligar, lerLigacao } from './ligacao-caixa.js';
import { numero, quadro, bolinha, nomeProdutor, corProdutor, nomeTitular, seDesligado } from './comum.js';

export const produto = (id) => store.resina_produtos.find((p) => p.id === id);
export const nomeProduto = (id) => produto(id)?.nome ?? 'Produto excluído';
export const unidade = (id) => produto(id)?.unidade ?? 'un';
/** "12 L", "3,5 kg", "40 un" */
export const quantidade = (q, id) => `${numero(q, 3)} ${unidade(id)}`;

/** Agrupa os lançamentos por entrega (um produtor, uma data, vários produtos) */
export function agruparEntregas(insumos) {
  const entregas = new Map();
  for (const i of insumos) {
    const k = i.entrega_id || i.id;
    (entregas.get(k) || entregas.set(k, { id: k, data: i.data, produtor_id: i.produtor_id, titular_id: i.titular_id || null, nota: i.nota || '', obs: i.obs || '', pct_produtor: pctDoProdutor(i), itens: [] }).get(k)).itens.push(i);
  }
  return entregas;
}

/** Abre a entrega para mudar (usado também pela conta corrente) */
export function abrirEntrega(insumos, entregaId, ctx) {
  const e = agruparEntregas(insumos).get(entregaId);
  if (e) editarEntrega(e, ctx);
}

let ultimaConta = null; // repete a conta da última entrega lançada
let ultimoPct = 50; // e a parte do produtor (padrão: metade dele, metade da proprietária)

export default {
  titulo: 'Insumos',
  usaMes: true,
  ajuda: `
    <p>Os <strong>produtos</strong> que cada produtor usou para coletar a resina no mês escolhido no topo.</p>
    <p><strong>Parte do produtor</strong>: quanto da nota é cobrado do produtor (vem 50%: metade dele, metade da proprietária). Só essa parte entra como débito na <strong>Conta corrente</strong> da conta escolhida (CNPJ ou CPF) e aparece no Início como "falta receber". Quando ele pagar, lance em <strong>Conta corrente &gt; Lançar recebimento</strong>, marcando "Lançar também como entrada no Caixa".</p>
    <p>Em <strong>Lançar insumos</strong>, escolha o produtor, a conta e a data e adicione um produto por linha: a <strong>quantidade</strong> e o <strong>valor unitário</strong> (vem do cadastro) dão o <strong>valor total</strong>. Se você souber só o total, digite o total e o valor unitário é calculado.</p>
    <p>Toque numa entrega para mudar ou excluir.</p>
    <p><strong>Caixa da Família</strong>: no fim do lançamento, escolha como a compra foi paga: <strong>saída de uma conta</strong> (pode ficar para pagar no vencimento da nota) ou <strong>compra no cartão</strong>. O valor <strong>cheio</strong> da nota entra no Caixa como gasto, porque é o que foi pago ao fornecedor. Dar baixa no Extrato só marca a nota como paga: não baixa o que o produtor deve. Mudar ou excluir a entrega aqui muda ou exclui lá.</p>
    <p>A comparação entre produtores (quem gasta mais insumo para cada kg de resina) fica em <strong>Produção</strong>.</p>`,

  async render(el, ctx) {
    if (seDesligado(el)) return;
    const insumos = await insumosEntre(mesISO(store.mes), mesISO(store.mes, 1));
    if (!ctx.aindaAtual()) return;

    const entregas = agruparEntregas(insumos);
    const lista = [...entregas.values()].sort((a, b) => (a.data === b.data ? 0 : a.data < b.data ? 1 : -1));
    const gasto = insumos.reduce((s, i) => s + totalDoInsumo(i), 0);
    const descontado = insumos.reduce((s, i) => s + parteDoProdutor(i), 0);
    const porProduto = new Map();
    for (const i of insumos) {
      const p = porProduto.get(i.produto_id) || porProduto.set(i.produto_id, { id: i.produto_id, quantidade: 0, gasto: 0 }).get(i.produto_id);
      p.quantidade += i.quantidade; p.gasto += totalDoInsumo(i);
    }
    const produtos = [...porProduto.values()].sort((a, b) => b.gasto - a.gasto);
    const semCadastro = !store.resina_produtos.length;
    const mes = nomeMes(store.mes).toLowerCase();

    el.innerHTML = `<div class="grid gap-4 animate-entrar">
      <div class="flex flex-wrap items-center justify-between gap-2">
        <p class="text-stone-600 dark:text-stone-400">${lista.length ? `${lista.length} ${lista.length === 1 ? 'entrega' : 'entregas'} em ${esc(mes)}` : ''}</p>
        <div class="flex flex-wrap gap-2">
          <a href="#resina" class="btn-neutro">${icone('relatorio')} Comparar produtores</a>
          <button type="button" class="btn-primario" data-lancar ${semCadastro ? 'disabled' : ''}>${icone('mais')} Lançar insumos</button>
        </div>
      </div>
      ${semCadastro ? `<section class="card border-brand-200 dark:border-brand-900"><h2 class="font-semibold">Primeiro, cadastre os produtos</h2>
        <p class="mt-1 text-sm text-stone-600 dark:text-stone-400">Em <strong>Cadastros &gt; Produtos (insumos)</strong>, inclua o que é usado na coleta (estimulante, sacos, estrias...) com a unidade e o valor unitário.</p>
        <a href="#resina-cadastros" class="btn-primario mt-4">${icone('cadastros')} Abrir os cadastros</a></section>` : ''}
      ${lista.length ? `
      <div class="grid grid-cols-2 gap-2 sm:grid-cols-3">
        ${quadro('Gasto com insumos', brl(gasto), `<p class="text-xs text-stone-600 dark:text-stone-400">${brl(descontado)} a cobrar dos produtores</p>`)}${quadro('Entregas', numero(lista.length))}${quadro('Produtores', numero(new Set(lista.map((e) => e.produtor_id)).size))}
      </div>
      <div class="grid gap-4 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <section class="card" aria-labelledby="t-entregas"><h2 id="t-entregas" class="card-titulo">Entregas de ${esc(mes)}</h2>
          <ul class="grid gap-2">${lista.map((e) => {
            const total = e.itens.reduce((s, i) => s + totalDoInsumo(i), 0);
            const doProdutor = e.itens.reduce((s, i) => s + parteDoProdutor(i), 0);
            return `<li><button type="button" class="w-full cursor-pointer rounded-xl border border-stone-200 p-3 text-left transition hover:border-brand-300 dark:border-stone-800 dark:hover:border-brand-800" data-entrega="${esc(e.id)}"
              aria-label="Entrega de ${esc(nomeProdutor(e.produtor_id))} em ${dataCompleta(e.data)}, ${brl(total)}. Mudar ou excluir">
              <span class="flex flex-wrap items-start justify-between gap-x-3">
                <span class="flex min-w-0 items-center gap-2 font-semibold">${bolinha(corProdutor(e.produtor_id))}<span class="truncate">${esc(nomeProdutor(e.produtor_id))}</span></span>
                <span class="font-bold tabular-nums">${brl(total)}</span>
              </span>
              <span class="mt-0.5 block text-sm text-stone-600 dark:text-stone-400">${[dataCompleta(e.data), e.nota, e.obs].filter(Boolean).map(esc).join(' · ')}</span>
              <span class="mt-0.5 block text-sm tabular-nums text-stone-600 dark:text-stone-400">Produtor paga ${numero(e.pct_produtor, 2)}%: <strong class="text-stone-800 dark:text-stone-200">${brl(doProdutor)}</strong> · proprietária ${brl(total - doProdutor)}</span>
              <span class="mt-1 block text-sm tabular-nums">${e.itens.map((i) => `${esc(nomeProduto(i.produto_id))}: ${esc(quantidade(i.quantidade, i.produto_id))} × ${brl(i.valor_unitario)}`).join(' · ')}</span>
            </button></li>`;
          }).join('')}</ul>
        </section>
        <section class="card self-start" aria-labelledby="t-produtos"><h2 id="t-produtos" class="card-titulo">Por produto</h2>
          <table class="w-full text-sm tabular-nums">
            <thead class="text-left text-xs uppercase text-stone-600 dark:text-stone-400"><tr><th scope="col" class="py-1.5 font-semibold">Produto</th><th scope="col" class="py-1.5 text-right font-semibold">Quantidade</th><th scope="col" class="py-1.5 text-right font-semibold">Total</th></tr></thead>
            <tbody class="divide-y divide-stone-100 dark:divide-stone-800">${produtos.map((p) => `<tr><td class="py-2 pr-2">${esc(nomeProduto(p.id))}</td><td class="whitespace-nowrap py-2 text-right">${esc(quantidade(p.quantidade, p.id))}</td><td class="whitespace-nowrap py-2 pl-2 text-right font-semibold">${brl(p.gasto)}</td></tr>`).join('')}</tbody>
            <tfoot class="border-t-2 border-stone-200 font-semibold dark:border-stone-700"><tr><td class="py-2" colspan="2">Total</td><td class="py-2 text-right">${brl(gasto)}</td></tr></tfoot>
          </table>
        </section>
      </div>`
      : semCadastro ? '' : `<div class="card">${estadoVazio(`Nenhum insumo em ${mes}`, 'Lance os produtos que cada produtor usou para coletar a resina. Com isso, a tela Produção compara quem gasta mais insumo para cada kg de resina.', '<button type="button" class="btn-primario" data-lancar>Lançar insumos</button>')}</div>`}
    </div>`;

    el.onclick = (e) => {
      const b = e.target.closest('button');
      if (!b) return;
      if (b.dataset.lancar !== undefined) editarEntrega(null, ctx);
      else if (b.dataset.entrega) editarEntrega(entregas.get(b.dataset.entrega), ctx);
    };
  },
};

// ---------- lançar ou mudar uma entrega
let seq = 0;
async function editarEntrega(entrega, ctx) {
  const ligacao = entrega ? await lerLigacao('resina_entrega_id', entrega.id) : { lancamentos: [], compras: [] };
  const temNoCaixa = ligacao.lancamentos.length + ligacao.compras.length > 0;
  const nova = !entrega;
  const produtores = store.resina_produtores.filter((p) => p.ativo !== false || p.id === entrega?.produtor_id);
  const titulares = store.resina_titulares.filter((t) => t.ativo !== false || t.id === entrega?.titular_id);
  const contaPadrao = nova ? (titulares.some((t) => t.id === ultimaConta) ? ultimaConta : titulares[0]?.id) : entrega.titular_id;
  const linhas = nova
    ? [{ chave: ++seq, produto_id: '', quantidade: '', valor_unitario: 0, valor_total: 0 }]
    : entrega.itens.map((i) => ({ chave: ++seq, produto_id: i.produto_id, quantidade: i.quantidade, valor_unitario: i.valor_unitario, valor_total: totalDoInsumo(i) }));
  const hoje = hojeISO();
  const dataPadrao = hoje.slice(0, 7) === mesISO(store.mes).slice(0, 7) ? hoje : mesISO(store.mes);

  const d = dialogo({
    titulo: nova ? 'Lançar insumos' : 'Mudar entrega de insumos',
    largura: 'max-w-3xl',
    corpo: `<form class="grid gap-4" novalidate>
      <div class="grid gap-3 sm:grid-cols-2">
        <div data-campo><label class="rotulo" for="in-prod">Produtor</label><select id="in-prod" name="produtor_id" class="campo"><option value="">Escolha…</option>${produtores.map((p) =>
          `<option value="${p.id}" ${p.id === entrega?.produtor_id ? 'selected' : ''}>${esc(p.nome)}</option>`).join('')}</select></div>
        <div data-campo><label class="rotulo" for="in-data">Data</label><input id="in-data" name="data" type="date" class="campo" value="${entrega?.data || dataPadrao}"></div>
        ${titulares.length ? `<div data-campo><label class="rotulo" for="in-conta">Conta (desconto do produtor)</label><select id="in-conta" name="titular_id" class="campo">${nova ? '' : `<option value="" ${entrega.titular_id ? '' : 'selected'}>Sem conta</option>`}${titulares.map((t) =>
          `<option value="${t.id}" ${t.id === contaPadrao ? 'selected' : ''}>${esc(nomeTitular(t.id))}</option>`).join('')}</select></div>` : ''}
        <div data-campo><label class="rotulo" for="in-pct">Parte do produtor (%)</label><input id="in-pct" name="pct_produtor" type="number" inputmode="decimal" min="0" max="100" step="any" class="campo tabular-nums" value="${nova ? ultimoPct : entrega.pct_produtor}" aria-describedby="dica-in-pct">
          <p id="dica-in-pct" class="dica mt-1">Quanto da nota é cobrado do produtor. O resto fica com a proprietária.</p></div>
        <div data-campo><label class="rotulo" for="in-nota">Nota <span class="font-normal text-stone-600 dark:text-stone-400">(opcional)</span></label><input id="in-nota" name="nota" class="campo" maxlength="80" value="${esc(entrega?.nota || '')}" placeholder="Ex.: NF 150 - venc. 26/02"></div>
      </div>
      <fieldset><legend class="rotulo">Produtos</legend><ul class="grid gap-2" data-linhas></ul>
        <button type="button" class="btn-sec mt-2" data-mais-linha>${icone('mais')} Adicionar produto</button></fieldset>
      <div data-campo><label class="rotulo" for="in-obs">Observação <span class="font-normal text-stone-600 dark:text-stone-400">(opcional)</span></label><input id="in-obs" name="obs" class="campo" maxlength="120" value="${esc(entrega?.obs || '')}"></div>
      <p class="rounded-xl bg-stone-50 px-3 py-2 text-right dark:bg-stone-800/60">Total da entrega: <strong class="tabular-nums" data-total-geral></strong><span class="block text-sm tabular-nums text-stone-600 dark:text-stone-400" data-divisao></span></p>
      ${camposPagamentoInsumos(ligacao)}
      <div class="flex flex-col-reverse gap-2 sm:flex-row sm:items-center">
        ${nova ? '' : `<button type="button" class="btn-neutro text-red-700 dark:text-red-400" data-excluir-entrega>${icone('lixo')} Excluir entrega</button>`}
        <span class="flex-1"></span>
        <button type="submit" class="btn-primario">${icone('check')} ${nova ? 'Lançar' : 'Salvar'}</button>
      </div>
    </form>`,
  });
  const f = d.querySelector('form');
  const ul = f.querySelector('[data-linhas]');
  ligarPagamentoInsumos(f);

  const opcoes = (l) => `<option value="">Escolha…</option>${store.resina_produtos.filter((p) => p.ativo !== false || p.id === l.produto_id).map((p) =>
    `<option value="${p.id}" ${p.id === l.produto_id ? 'selected' : ''}>${esc(p.nome)} (${esc(p.unidade)})</option>`).join('')}`;
  const desenhar = () => {
    ul.innerHTML = linhas.map((l, n) => `<li data-linha="${l.chave}" class="grid grid-cols-2 items-end gap-2 rounded-xl border border-stone-200 p-3 sm:grid-cols-[minmax(0,2fr)_repeat(3,minmax(0,1fr))_auto] dark:border-stone-800">
      <div class="col-span-2 sm:col-span-1"><label class="rotulo text-xs" for="li-p-${l.chave}">Produto ${n + 1}</label><select id="li-p-${l.chave}" class="campo" data-c="produto_id">${opcoes(l)}</select></div>
      <div><label class="rotulo text-xs" for="li-q-${l.chave}">Quantidade${l.produto_id ? ` (${esc(unidade(l.produto_id))})` : ''}</label><input id="li-q-${l.chave}" type="number" min="0" step="any" inputmode="decimal" class="campo tabular-nums" data-c="quantidade" value="${l.quantidade}"></div>
      <div><label class="rotulo text-xs" for="li-u-${l.chave}">Valor unitário</label><input id="li-u-${l.chave}" class="campo tabular-nums" inputmode="numeric" data-dinheiro data-c="valor_unitario" value="${l.valor_unitario ? valorParaCampo(l.valor_unitario) : ''}" placeholder="0,00"></div>
      <div><label class="rotulo text-xs" for="li-t-${l.chave}">Valor total</label><input id="li-t-${l.chave}" class="campo tabular-nums" inputmode="numeric" data-dinheiro data-c="valor_total" value="${l.valor_total ? valorParaCampo(l.valor_total) : ''}" placeholder="0,00"></div>
      <div class="flex justify-end"><button type="button" class="btn-icone hover:text-red-700" data-tirar aria-label="Tirar o produto ${n + 1}" title="Tirar" ${linhas.length === 1 ? 'disabled' : ''}>${icone('x')}</button></div>
    </li>`).join('');
    ul.querySelectorAll('[data-dinheiro]').forEach(mascaraDinheiro);
    somar();
  };
  const lerPct = () => { const n = Number(String(f.pct_produtor.value).replace(',', '.')); return f.pct_produtor.value !== '' && n >= 0 && n <= 100 ? n : null; };
  const somar = () => {
    const total = linhas.reduce((s, l) => s + (l.valor_total || 0), 0);
    f.querySelector('[data-total-geral]').textContent = brl(total);
    const p = lerPct();
    const doProdutor = p === null ? null : Math.round(total * p) / 100;
    f.querySelector('[data-divisao]').textContent = doProdutor === null ? '' : `Cobrado do produtor: ${brl(doProdutor)} · proprietária: ${brl(total - doProdutor)}`;
  };
  const campoDe = (l, c) => ul.querySelector(`[data-linha="${l.chave}"] [data-c="${c}"]`);
  const arred = (v) => Math.round(v * 100) / 100;
  desenhar();
  f.produtor_id.focus();

  f.addEventListener('input', (e) => {
    if (e.target === f.pct_produtor) { e.target.removeAttribute('aria-invalid'); return somar(); }
    const li = e.target.closest('[data-linha]');
    if (!li) return;
    const l = linhas.find((x) => x.chave === +li.dataset.linha);
    const c = e.target.dataset.c;
    e.target.removeAttribute('aria-invalid');
    if (c === 'quantidade') {
      l.quantidade = e.target.value === '' ? '' : Math.max(0, Number(e.target.value) || 0);
      l.valor_total = arred((+l.quantidade || 0) * l.valor_unitario);
      campoDe(l, 'valor_total').value = l.valor_total ? valorParaCampo(l.valor_total) : '';
    } else if (c === 'valor_unitario') {
      l.valor_unitario = lerValor(e.target.value) || 0;
      l.valor_total = arred((+l.quantidade || 0) * l.valor_unitario);
      campoDe(l, 'valor_total').value = l.valor_total ? valorParaCampo(l.valor_total) : '';
    } else if (c === 'valor_total') {
      // quem sabe só o total: o valor unitário é calculado
      l.valor_total = lerValor(e.target.value) || 0;
      if (+l.quantidade > 0) {
        l.valor_unitario = l.valor_total / +l.quantidade;
        campoDe(l, 'valor_unitario').value = l.valor_unitario ? valorParaCampo(arred(l.valor_unitario)) : '';
      }
    }
    somar();
  });
  f.addEventListener('change', (e) => {
    if (e.target.dataset.c !== 'produto_id') return;
    const l = linhas.find((x) => x.chave === +e.target.closest('[data-linha]').dataset.linha);
    l.produto_id = e.target.value;
    const p = produto(l.produto_id);
    if (p?.valor_unitario) { l.valor_unitario = p.valor_unitario; l.valor_total = arred((+l.quantidade || 0) * l.valor_unitario); }
    desenhar();
    campoDe(l, 'quantidade')?.focus();
  });
  f.addEventListener('click', async (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    if (b.dataset.maisLinha !== undefined) {
      const l = { chave: ++seq, produto_id: '', quantidade: '', valor_unitario: 0, valor_total: 0 };
      linhas.push(l); desenhar(); campoDe(l, 'produto_id').focus();
    } else if (b.dataset.tirar !== undefined) {
      const k = +b.closest('[data-linha]').dataset.linha;
      linhas.splice(linhas.findIndex((x) => x.chave === k), 1); desenhar();
      f.querySelector('[data-mais-linha]').focus();
    } else if (b.dataset.excluirEntrega !== undefined) {
      d.close();
      if (!(await confirmar(`A entrega de ${nomeProdutor(entrega.produtor_id)} em ${dataCompleta(entrega.data)} será excluída.${temNoCaixa ? ' O gasto ligado a ela no Caixa também.' : ''}`, { botao: 'Excluir', perigo: true }))) return;
      try {
        const voltarCaixa = await desligar('resina_entrega_id', entrega.id);
        const voltarInsumos = await excluirInsumos(entrega.itens.map((i) => i.id));
        const desfazer = async () => { await voltarInsumos(); await voltarCaixa(); };
        toast(temNoCaixa ? 'Entrega excluída (e o gasto no Caixa)' : 'Entrega excluída', { acao: desfazendo(desfazer, ctx.atualizar) });
        ctx.atualizar();
      } catch (err) { toast(err.message, { tipo: 'erro' }); }
    }
  });

  f.onsubmit = semRepetir(async (e) => {
    e.preventDefault();
    limparErros(f);
    if (!f.produtor_id.value) { erroNoCampo(f, 'produtor_id', 'Escolha o produtor.'); return f.produtor_id.focus(); }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(f.data.value)) { erroNoCampo(f, 'data', 'Escolha a data.'); return f.data.focus(); }
    const pctProdutor = lerPct();
    if (pctProdutor === null) { erroNoCampo(f, 'pct_produtor', 'Digite de 0 a 100 (por exemplo, 50 para metade).'); return f.pct_produtor.focus(); }
    const problema = (l, c, msg) => { const x = campoDe(l, c); x.setAttribute('aria-invalid', 'true'); x.focus(); toast(msg, { tipo: 'erro' }); };
    const usados = new Set();
    for (const [n, l] of linhas.entries()) {
      if (!l.produto_id) return problema(l, 'produto_id', `Escolha o produto da linha ${n + 1} (ou tire a linha).`);
      if (usados.has(l.produto_id)) return problema(l, 'produto_id', `${nomeProduto(l.produto_id)} aparece duas vezes. Some as quantidades numa linha só.`);
      usados.add(l.produto_id);
      if (!(+l.quantidade > 0)) return problema(l, 'quantidade', `Informe a quantidade de ${nomeProduto(l.produto_id)}.`);
      if (!(l.valor_total > 0)) return problema(l, 'valor_unitario', `Informe o valor de ${nomeProduto(l.produto_id)} (unitário ou total).`);
      if (l.valor_total > VALOR_MAXIMO) return problema(l, 'valor_total', `O valor máximo é ${valorMaximoTexto()}.`);
    }
    const entrega_id = entrega?.id || crypto.randomUUID();
    if (f.titular_id && !f.titular_id.value && nova) { erroNoCampo(f, 'titular_id', 'Escolha a conta.'); return f.titular_id.focus(); }
    const caixa = lerPagamentoInsumos(f, erroNoCampo, f.data.value);
    if (!caixa) return;
    const base = { produtor_id: f.produtor_id.value, data: f.data.value, obs: f.obs.value.trim(), nota: f.nota.value.trim(), titular_id: f.titular_id?.value || null, entrega_id, pct_produtor: pctProdutor };
    try {
      const voltarInsumos = await salvarInsumos(
        linhas.map((l) => ({ ...base, produto_id: l.produto_id, quantidade: +l.quantidade, valor_unitario: l.valor_unitario, valor_total: arred(l.valor_total) })),
        nova ? [] : entrega.itens.map((i) => i.id),
      );
      const total = arred(linhas.reduce((s, l) => s + l.valor_total, 0));
      const produtos = linhas.map((l) => nomeProduto(l.produto_id)).join(', ');
      const voltarCaixa = await gravarPagamentoInsumos(entrega_id, caixa, {
        total, data: base.data, texto: `Insumos resina · ${produtos} · ${nomeProdutor(base.produtor_id)}${base.nota ? ` · ${base.nota}` : ''}`,
      });
      const desfazer = async () => { await voltarCaixa(); await voltarInsumos(); };
      d.close();
      if (base.titular_id) ultimaConta = base.titular_id;
      ultimoPct = pctProdutor;
      const onde = caixa.modo === 'saida' ? ' (e no Caixa)' : caixa.modo === 'cartao' ? ' (e no cartão)' : '';
      toast(`${nova ? 'Lançado' : 'Atualizado'}: ${brl(total)} para ${nomeProdutor(base.produtor_id)}${onde}`, { acao: desfazendo(desfazer, ctx.atualizar) });
      ctx.atualizar();
    } catch (err) { toast(err.message, { tipo: 'erro' }); }
  });
}
