// Insumos: os produtos que cada produtor usou para coletar a resina (quantidade, valor unitário e total)
import { brl, esc, dataCompleta, nomeMes, mesISO, hojeISO, lerValor, valorParaCampo, VALOR_MAXIMO, valorMaximoTexto } from '../../lib/format.js';
import { store } from '../../lib/store.js';
import { icone, estadoVazio, toast, confirmar, dialogo, mascaraDinheiro, erroNoCampo, limparErros, semRepetir } from '../../lib/ui.js';
import { desfazendo } from '../../components/lancamento.js';
import { insumosEntre, salvarInsumos, excluirInsumos } from './dados.js';
import { totalDoInsumo, pctDoProdutor, parteDoProdutor, divisaoDaEntrega, divisaoPorConta } from './calculos.js';
import { camposPagamentoInsumos, ligarPagamentoInsumos, lerPagamentoInsumos, gravarPagamentoInsumos, desligar, lerLigacao, camposAReceber, ligarAReceber, lerAReceber, gravarAReceber } from './ligacao-caixa.js';
import { numero, quadro, bolinha, nomeProdutor, corProdutor, nomeTitular, seDesligado } from './comum.js';

export const produto = (id) => store.resina_produtos.find((p) => p.id === id);
export const nomeProduto = (id) => produto(id)?.nome ?? 'Produto excluído';
export const unidade = (id) => produto(id)?.unidade ?? 'un';
/** "12 L", "3,5 kg", "40 un" */
export const quantidade = (q, id) => `${numero(q, 3)} ${unidade(id)}`;

/** Agrupa os lançamentos por entrega (uma nota: uma data, vários produtos, um ou mais produtores) */
export function agruparEntregas(insumos) {
  const entregas = new Map();
  for (const i of insumos) {
    const k = i.entrega_id || i.id;
    const e = entregas.get(k) || entregas.set(k, { id: k, data: i.data, titular_id: i.titular_id || null, nota: i.nota || '', obs: i.obs || '', produtores: [], itens: [] }).get(k);
    e.itens.push(i);
    if (!e.produtores.includes(i.produtor_id)) e.produtores.push(i.produtor_id);
  }
  return entregas;
}

/** "Ana", "Ana e Bruno", "Ana, Bruno e Carlos" */
export const nomesProdutores = (ids) => {
  const n = ids.map(nomeProdutor);
  return n.length > 1 ? `${n.slice(0, -1).join(', ')} e ${n.at(-1)}` : n[0] || '';
};

/** Abre a entrega para mudar (usado também pela conta corrente) */
export function abrirEntrega(insumos, entregaId, ctx) {
  const e = agruparEntregas(insumos).get(entregaId);
  if (e) editarEntrega(e, ctx);
}

let ultimaConta = null; // conta da última entrega lançada (para produtor sem conta conhecida)
const contaDoProdutor = new Map(); // produtor → última conta usada para ele nos insumos
let ultimoPct = 50; // e a parte do produtor que veio na primeira linha (você muda em cada produto)

export default {
  titulo: 'Insumos',
  usaMes: true,
  ajuda: `
    <p>Os <strong>produtos</strong> que cada produtor usou para coletar a resina no mês escolhido no topo.</p>
    <p>Em <strong>Lançar insumos</strong>, escolha a data e adicione um produto por linha: a <strong>quantidade</strong> e o <strong>valor unitário</strong> (vem do cadastro) dão o <strong>valor total</strong>. Se você souber só o total, digite o total e o valor unitário é calculado.</p>
    <p><strong>Nota com vários produtores</strong>: cada produto tem o seu <strong>produtor</strong>, a sua <strong>conta</strong> (CNPJ ou CPF em que a parte dele é cobrada) e a sua <strong>parte do produtor (%)</strong>, que você decide. A conta vem sozinha com a última usada para aquele produtor; mude se precisar. Ex.: o arame é do João e ele paga 50% do arame; a pasta é do Carlos e ele paga 50% da pasta. A % vale só para aquele produto, não para o total da nota. O mesmo produto pode aparecer para dois produtores (um em cada linha).</p>
    <p><strong>Parte do produtor</strong>: só essa parte entra como débito na <strong>Conta corrente</strong> de cada produtor, na conta escolhida (CNPJ ou CPF), e aparece no Início como "falta receber". O resto fica com a proprietária.</p>
    <p>Toque numa entrega para mudar ou excluir.</p>
    <p><strong>Parte do produtor no Caixa</strong>: deixe marcado "Lançar a parte de cada produtor como a receber" e o Caixa ganha uma entrada em aberto para cada produtor da nota, com a parte dele, no dia de <strong>Quando vai receber?</strong> (vem com o vencimento da nota; mude se ele for pagar em outro dia). Quando ele pagar, marque como recebido no <strong>Extrato</strong>: o dinheiro entra no saldo e a conta corrente baixa sozinha (não precisa lançar o recebimento de novo).</p>
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
        ${quadro('Gasto com insumos', brl(gasto), `<p class="text-xs text-stone-600 dark:text-stone-400">${brl(descontado)} a cobrar dos produtores</p>`)}${quadro('Entregas', numero(lista.length))}${quadro('Produtores', numero(new Set(insumos.map((i) => i.produtor_id)).size))}
      </div>
      <div class="grid gap-4 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <section class="card" aria-labelledby="t-entregas"><h2 id="t-entregas" class="card-titulo">Entregas de ${esc(mes)}</h2>
          <ul class="grid gap-2">${lista.map((e) => {
            const total = e.itens.reduce((s, i) => s + totalDoInsumo(i), 0);
            const divisao = divisaoDaEntrega(e.itens);
            const doProdutores = divisao.reduce((s, d) => s + d.parte, 0);
            const varios = e.produtores.length > 1;
            return `<li><button type="button" class="w-full cursor-pointer rounded-xl border border-stone-200 p-3 text-left transition hover:border-brand-300 dark:border-stone-800 dark:hover:border-brand-800" data-entrega="${esc(e.id)}"
              aria-label="Entrega de ${esc(nomesProdutores(e.produtores))} em ${dataCompleta(e.data)}, ${brl(total)}. Mudar ou excluir">
              <span class="flex flex-wrap items-start justify-between gap-x-3">
                <span class="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1 font-semibold">${e.produtores.map((id) => `<span class="flex min-w-0 items-center gap-2">${bolinha(corProdutor(id))}<span class="truncate">${esc(nomeProdutor(id))}</span></span>`).join('')}</span>
                <span class="font-bold tabular-nums">${brl(total)}</span>
              </span>
              <span class="mt-0.5 block text-sm text-stone-600 dark:text-stone-400">${[dataCompleta(e.data), e.nota, e.obs].filter(Boolean).map(esc).join(' · ')}</span>
              <span class="mt-0.5 block text-sm tabular-nums text-stone-600 dark:text-stone-400">${divisao.map((d) => `${varios ? `${esc(nomeProdutor(d.produtor_id))} paga` : 'Produtor paga'} <strong class="text-stone-800 dark:text-stone-200">${brl(d.parte)}</strong>`).join(' · ')} · proprietária ${brl(total - doProdutores)}</span>
              <span class="mt-1 block text-sm tabular-nums">${e.itens.map((i) => `${esc(nomeProduto(i.produto_id))}: ${esc(quantidade(i.quantidade, i.produto_id))} × ${brl(i.valor_unitario)} <span class="text-stone-600 dark:text-stone-400">(${varios ? `${esc(nomeProdutor(i.produtor_id))}, ` : ''}${numero(pctDoProdutor(i), 2)}% do produtor)</span>`).join(' · ')}</span>
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

// ---------- lançar ou mudar uma entrega (uma nota; cada produto com o seu produtor e a sua %)
let seq = 0;
const lerPct = (v) => { const t = String(v ?? '').trim().replace(',', '.'); const n = Number(t); return t !== '' && Number.isFinite(n) && n >= 0 && n <= 100 ? n : null; };

async function editarEntrega(entrega, ctx) {
  const ligacao = entrega ? await lerLigacao('resina_entrega_id', entrega.id) : { lancamentos: [], compras: [], receber: [] };
  const temNoCaixa = ligacao.lancamentos.length + ligacao.compras.length + ligacao.receber.length > 0;
  const nova = !entrega;
  const produtores = store.resina_produtores.filter((p) => p.ativo !== false || entrega?.produtores.includes(p.id));
  const usadas = new Set(entrega?.itens.map((i) => i.titular_id).filter(Boolean));
  const titulares = store.resina_titulares.filter((t) => t.ativo !== false || usadas.has(t.id));
  const ativa = (id) => titulares.some((t) => t.id === id);
  // a conta de cada produtor: a última usada para ele nos insumos
  if (titulares.length) {
    const todos = (await insumosEntre('0000-01-01', '9999-12-31')).filter((i) => i.titular_id).sort((a, b) => (a.data < b.data ? -1 : a.data > b.data ? 1 : 0));
    for (const i of todos) contaDoProdutor.set(i.produtor_id, i.titular_id);
  }
  // conta de um produtor: a última usada para ele; sem nenhuma conhecida, só vem sozinha se houver uma conta só
  // (com várias, fica em "Escolha…": nunca herda a conta de outro produtor)
  const contaSugerida = (produtorId) => {
    const c = contaDoProdutor.get(produtorId);
    if (ativa(c)) return c;
    return titulares.length === 1 ? titulares[0].id : '';
  };
  // o novo produto vem com o produtor e a conta da linha anterior (é o mesmo produtor); trocar o produtor troca a conta
  const novaLinha = (antes) => ({
    chave: ++seq, produto_id: '', produtor_id: antes?.produtor_id || '', titular_id: antes ? antes.titular_id : (titulares.length === 1 ? titulares[0].id : ''),
    contaMexida: false, pct: antes ? antes.pct : String(ultimoPct), quantidade: '', valor_unitario: 0, valor_total: 0,
  });
  const linhas = nova
    ? [novaLinha()]
    : entrega.itens.map((i) => ({ chave: ++seq, produto_id: i.produto_id, produtor_id: i.produtor_id, titular_id: i.titular_id || '', contaMexida: false, pct: String(pctDoProdutor(i)), quantidade: i.quantidade, valor_unitario: i.valor_unitario, valor_total: totalDoInsumo(i) }));
  const hoje = hojeISO();
  const dataPadrao = hoje.slice(0, 7) === mesISO(store.mes).slice(0, 7) ? hoje : mesISO(store.mes);

  const d = dialogo({
    titulo: nova ? 'Lançar insumos' : 'Mudar entrega de insumos',
    largura: 'max-w-3xl',
    corpo: `<form class="grid gap-4" novalidate>
      <div class="grid gap-3 sm:grid-cols-2">
        <div data-campo><label class="rotulo" for="in-data">Data</label><input id="in-data" name="data" type="date" class="campo" value="${entrega?.data || dataPadrao}"></div>
        <div data-campo><label class="rotulo" for="in-nota">Nota <span class="font-normal text-stone-600 dark:text-stone-400">(opcional)</span></label><input id="in-nota" name="nota" class="campo" maxlength="80" value="${esc(entrega?.nota || '')}" placeholder="Ex.: NF 150 - venc. 26/02"></div>
      </div>
      <fieldset><legend class="rotulo">Produtos</legend>
        <p class="dica mb-2">Cada produto tem o seu produtor${titulares.length ? ', a conta (CNPJ ou CPF) em que a parte dele é cobrada' : ''} e a parte que ele paga daquele produto (a % vale só para o produto, não para a nota toda).</p>
        <ul class="grid gap-2" data-linhas></ul>
        <button type="button" class="btn-sec mt-2" data-mais-linha>${icone('mais')} Adicionar produto</button></fieldset>
      <div data-campo><label class="rotulo" for="in-obs">Observação <span class="font-normal text-stone-600 dark:text-stone-400">(opcional)</span></label><input id="in-obs" name="obs" class="campo" maxlength="120" value="${esc(entrega?.obs || '')}"></div>
      <div class="rounded-xl bg-stone-50 px-3 py-2 text-right dark:bg-stone-800/60">Total da nota: <strong class="tabular-nums" data-total-geral></strong><ul class="text-sm tabular-nums text-stone-600 dark:text-stone-400" data-divisao></ul></div>
      ${camposPagamentoInsumos(ligacao)}
      ${camposAReceber(ligacao.receber.find((l) => l.pago) || ligacao.receber[0])}
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
  ligarAReceber(f);

  const opcoesProduto = (l) => `<option value="">Escolha…</option>${store.resina_produtos.filter((p) => p.ativo !== false || p.id === l.produto_id).map((p) =>
    `<option value="${p.id}" ${p.id === l.produto_id ? 'selected' : ''}>${esc(p.nome)} (${esc(p.unidade)})</option>`).join('')}`;
  const opcoesConta = (l) => `${l.titular_id && ativa(l.titular_id) ? '' : `<option value="" selected>${nova || !l.titular_id ? 'Escolha…' : 'Sem conta'}</option>`}${titulares.map((t) =>
    `<option value="${t.id}" ${t.id === l.titular_id ? 'selected' : ''}>${esc(nomeTitular(t.id))}</option>`).join('')}`;
  const opcoesProdutor = (l) => `<option value="">Escolha…</option>${produtores.map((p) =>
    `<option value="${p.id}" ${p.id === l.produtor_id ? 'selected' : ''}>${esc(p.nome)}</option>`).join('')}`;
  const desenhar = () => {
    ul.innerHTML = linhas.map((l, n) => `<li data-linha="${l.chave}" class="grid gap-2 rounded-xl border border-stone-200 p-3 dark:border-stone-800">
      <div class="grid gap-2 ${titulares.length ? 'sm:grid-cols-3' : 'sm:grid-cols-2'}">
        <div><label class="rotulo text-xs" for="li-p-${l.chave}">Produto ${n + 1}</label><select id="li-p-${l.chave}" class="campo" data-c="produto_id">${opcoesProduto(l)}</select></div>
        <div><label class="rotulo text-xs" for="li-r-${l.chave}">Produtor</label><select id="li-r-${l.chave}" class="campo" data-c="produtor_id">${opcoesProdutor(l)}</select></div>
        ${titulares.length ? `<div><label class="rotulo text-xs" for="li-c-${l.chave}">Conta (CNPJ ou CPF)</label><select id="li-c-${l.chave}" class="campo" data-c="titular_id">${opcoesConta(l)}</select></div>` : ''}
      </div>
      <div class="grid grid-cols-2 items-end gap-2 sm:grid-cols-[repeat(4,minmax(0,1fr))_auto]">
        <div><label class="rotulo text-xs" for="li-q-${l.chave}">Quantidade${l.produto_id ? ` (${esc(unidade(l.produto_id))})` : ''}</label><input id="li-q-${l.chave}" type="number" min="0" step="any" inputmode="decimal" class="campo tabular-nums" data-c="quantidade" value="${l.quantidade}"></div>
        <div><label class="rotulo text-xs" for="li-u-${l.chave}">Valor unitário</label><input id="li-u-${l.chave}" class="campo tabular-nums" inputmode="numeric" data-dinheiro data-c="valor_unitario" value="${l.valor_unitario ? valorParaCampo(l.valor_unitario) : ''}" placeholder="0,00"></div>
        <div><label class="rotulo text-xs" for="li-t-${l.chave}">Valor total</label><input id="li-t-${l.chave}" class="campo tabular-nums" inputmode="numeric" data-dinheiro data-c="valor_total" value="${l.valor_total ? valorParaCampo(l.valor_total) : ''}" placeholder="0,00"></div>
        <div><label class="rotulo text-xs" for="li-pct-${l.chave}">Parte do produtor (%)</label><input id="li-pct-${l.chave}" type="number" min="0" max="100" step="any" inputmode="decimal" class="campo tabular-nums" data-c="pct" value="${esc(l.pct)}" aria-describedby="li-parte-${l.chave}"></div>
        <div class="col-span-2 flex justify-end sm:col-span-1"><button type="button" class="btn-icone hover:text-red-700" data-tirar aria-label="Tirar o produto ${n + 1}" title="Tirar" ${linhas.length === 1 ? 'disabled' : ''}>${icone('x')}</button></div>
      </div>
      <p id="li-parte-${l.chave}" class="dica tabular-nums" data-parte></p>
    </li>`).join('');
    ul.querySelectorAll('[data-dinheiro]').forEach(mascaraDinheiro);
    somar();
  };
  const arred = (v) => Math.round(v * 100) / 100;
  const parteDe = (l) => { const p = lerPct(l.pct); return p === null ? null : arred((l.valor_total || 0) * p / 100); };
  const somar = () => {
    const total = linhas.reduce((s, l) => s + (l.valor_total || 0), 0);
    f.querySelector('[data-total-geral]').textContent = brl(total);
    for (const l of linhas) {
      const parte = parteDe(l);
      const el = ul.querySelector(`[data-linha="${l.chave}"] [data-parte]`);
      if (el) el.textContent = parte === null ? 'Digite a parte do produtor, de 0 a 100 (por exemplo, 50 para metade deste produto).'
        : `${l.produtor_id ? nomeProdutor(l.produtor_id) : 'Produtor'} paga ${brl(parte)} deste produto${titulares.length && l.titular_id ? ` (${nomeTitular(l.titular_id)})` : ''} · proprietária ${brl((l.valor_total || 0) - parte)}`;
    }
    const validas = linhas.filter((l) => l.produtor_id && parteDe(l) !== null);
    const divisao = divisaoPorConta(validas.map((l) => ({ produtor_id: l.produtor_id, titular_id: l.titular_id || null, valor_total: l.valor_total || 0, pct_produtor: lerPct(l.pct) })));
    const doProdutores = divisao.reduce((s, x) => s + x.parte, 0);
    f.querySelector('[data-divisao]').innerHTML = divisao.length && validas.length === linhas.length
      ? `${divisao.map((x) => `<li>Cobrado de ${esc(nomeProdutor(x.produtor_id))}${titulares.length && x.titular_id ? ` (${esc(nomeTitular(x.titular_id))})` : ''}: ${brl(x.parte)}</li>`).join('')}<li>Fica com a proprietária: ${brl(total - doProdutores)}</li>` : '';
  };
  const campoDe = (l, c) => ul.querySelector(`[data-linha="${l.chave}"] [data-c="${c}"]`);
  desenhar();
  (campoDe(linhas[0], linhas[0].produto_id ? 'produtor_id' : 'produto_id'))?.focus();

  f.addEventListener('input', (e) => {
    const li = e.target.closest('[data-linha]');
    if (!li) return;
    const l = linhas.find((x) => x.chave === +li.dataset.linha);
    const c = e.target.dataset.c;
    e.target.removeAttribute('aria-invalid');
    if (c === 'pct') {
      l.pct = e.target.value;
    } else if (c === 'quantidade') {
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
    const c = e.target.dataset.c;
    if (c !== 'produto_id' && c !== 'produtor_id' && c !== 'titular_id') return;
    const l = linhas.find((x) => x.chave === +e.target.closest('[data-linha]').dataset.linha);
    e.target.removeAttribute('aria-invalid');
    if (c === 'titular_id') { l.titular_id = e.target.value; l.contaMexida = !!e.target.value; return somar(); }
    if (c === 'produtor_id') {
      l.produtor_id = e.target.value;
      // a conta acompanha o produtor (a última usada para ele), até a pessoa escolher outra nesta linha
      if (titulares.length && l.produtor_id && !l.contaMexida) {
        l.titular_id = contaSugerida(l.produtor_id);
        campoDe(l, 'titular_id').innerHTML = opcoesConta(l);
      }
      return somar();
    }
    l.produto_id = e.target.value;
    const p = produto(l.produto_id);
    if (p?.valor_unitario) { l.valor_unitario = p.valor_unitario; l.valor_total = arred((+l.quantidade || 0) * l.valor_unitario); }
    desenhar();
    campoDe(l, l.produtor_id ? 'quantidade' : 'produtor_id')?.focus();
  });
  f.addEventListener('click', async (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    if (b.dataset.maisLinha !== undefined) {
      const l = novaLinha(linhas.at(-1)); // o novo produto vem com o produtor, a conta e a % do anterior
      linhas.push(l); desenhar(); campoDe(l, 'produto_id').focus();
    } else if (b.dataset.tirar !== undefined) {
      const k = +b.closest('[data-linha]').dataset.linha;
      linhas.splice(linhas.findIndex((x) => x.chave === k), 1); desenhar();
      f.querySelector('[data-mais-linha]').focus();
    } else if (b.dataset.excluirEntrega !== undefined) {
      d.close();
      if (!(await confirmar(`A entrega de ${nomesProdutores(entrega.produtores)} em ${dataCompleta(entrega.data)} será excluída.${temNoCaixa ? ' O que está ligado a ela no Caixa também.' : ''}`, { botao: 'Excluir', perigo: true }))) return;
      try {
        const voltarCaixa = await desligar('resina_entrega_id', entrega.id);
        const voltarReceber = await gravarAReceber(entrega.id, { sem: true });
        const voltarInsumos = await excluirInsumos(entrega.itens.map((i) => i.id));
        const desfazer = async () => { await voltarInsumos(); await voltarReceber(); await voltarCaixa(); };
        toast(temNoCaixa ? 'Entrega excluída (e o que estava no Caixa)' : 'Entrega excluída', { acao: desfazendo(desfazer, ctx.atualizar) });
        ctx.atualizar();
      } catch (err) { toast(err.message, { tipo: 'erro' }); }
    }
  });

  f.onsubmit = semRepetir(async (e) => {
    e.preventDefault();
    limparErros(f);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(f.data.value)) { erroNoCampo(f, 'data', 'Escolha a data.'); return f.data.focus(); }
    const problema = (l, c, msg) => { const x = campoDe(l, c); x.setAttribute('aria-invalid', 'true'); x.focus(); toast(msg, { tipo: 'erro' }); };
    const usados = new Set();
    for (const [n, l] of linhas.entries()) {
      if (!l.produto_id) return problema(l, 'produto_id', `Escolha o produto da linha ${n + 1} (ou tire a linha).`);
      if (!l.produtor_id) return problema(l, 'produtor_id', `Escolha o produtor de ${nomeProduto(l.produto_id)} (linha ${n + 1}).`);
      if (titulares.length && !l.titular_id && lerPct(l.pct) !== 0) return problema(l, 'titular_id', `Escolha a conta (CNPJ ou CPF) de ${nomeProdutor(l.produtor_id)} em ${nomeProduto(l.produto_id)} (linha ${n + 1}).`);
      const k = `${l.produto_id}|${l.produtor_id}`;
      if (usados.has(k)) return problema(l, 'produto_id', `${nomeProduto(l.produto_id)} de ${nomeProdutor(l.produtor_id)} aparece duas vezes. Some as quantidades numa linha só.`);
      usados.add(k);
      if (!(+l.quantidade > 0)) return problema(l, 'quantidade', `Informe a quantidade de ${nomeProduto(l.produto_id)}.`);
      if (!(l.valor_total > 0)) return problema(l, 'valor_unitario', `Informe o valor de ${nomeProduto(l.produto_id)} (unitário ou total).`);
      if (l.valor_total > VALOR_MAXIMO) return problema(l, 'valor_total', `O valor máximo é ${valorMaximoTexto()}.`);
      if (lerPct(l.pct) === null) return problema(l, 'pct', `Digite a parte do produtor em ${nomeProduto(l.produto_id)}: de 0 a 100 (por exemplo, 50 para metade).`);
    }
    const entrega_id = entrega?.id || crypto.randomUUID();
    const caixa = lerPagamentoInsumos(f, erroNoCampo, f.data.value);
    if (!caixa) return;
    const receber = lerAReceber(f, erroNoCampo);
    if (!receber) return;
    const base = { data: f.data.value, obs: f.obs.value.trim(), nota: f.nota.value.trim(), entrega_id };
    const novas = linhas.map((l) => ({ ...base, titular_id: l.titular_id || null, produtor_id: l.produtor_id, produto_id: l.produto_id, pct_produtor: lerPct(l.pct), quantidade: +l.quantidade, valor_unitario: l.valor_unitario, valor_total: arred(l.valor_total) }));
    const divisao = divisaoDaEntrega(novas);
    const ids = divisao.map((x) => x.produtor_id);
    const notaTxt = base.nota ? ` · ${base.nota}` : '';
    try {
      const voltarInsumos = await salvarInsumos(novas, nova ? [] : entrega.itens.map((i) => i.id));
      const total = arred(novas.reduce((s, l) => s + l.valor_total, 0));
      const produtos = [...new Set(novas.map((l) => nomeProduto(l.produto_id)))].join(', ');
      const voltarCaixa = await gravarPagamentoInsumos(entrega_id, caixa, {
        total, data: base.data, texto: `Insumos resina · ${produtos} · ${nomesProdutores(ids)}${notaTxt}`,
      });
      // um "a receber" para cada produtor em cada conta: quando ele pagar, o crédito cai na conta certa
      const voltarReceber = await gravarAReceber(entrega_id, receber, divisaoPorConta(novas).map((x) => ({
        produtor_id: x.produtor_id, titular_id: x.titular_id, valor: x.parte,
        texto: `A receber · insumos (${x.itens.map((i) => `${nomeProduto(i.produto_id)} ${i.pct_produtor.toLocaleString('pt-BR')}%`).join(', ')}) · ${nomeProdutor(x.produtor_id)}${notaTxt}`,
      })), { data: receber.vencimento || base.data, nota: base.nota });
      const desfazer = async () => { await voltarReceber(); await voltarCaixa(); await voltarInsumos(); };
      d.close();
      for (const l of novas) if (l.titular_id) { ultimaConta = l.titular_id; contaDoProdutor.set(l.produtor_id, l.titular_id); }
      ultimoPct = novas[0].pct_produtor;
      const doProdutores = arred(divisao.reduce((s, x) => s + x.parte, 0));
      const onde = [caixa.modo === 'saida' ? 'no Caixa' : caixa.modo === 'cartao' ? 'no cartão' : '', !receber.sem && doProdutores > 0 ? `${brl(doProdutores)} a receber` : ''].filter(Boolean).join(', ');
      toast(`${nova ? 'Lançado' : 'Atualizado'}: ${brl(total)} para ${nomesProdutores(ids)}${onde ? ` (${onde})` : ''}`, { acao: desfazendo(desfazer, ctx.atualizar) });
      ctx.atualizar();
    } catch (err) { toast(err.message, { tipo: 'erro' }); }
  });
}
