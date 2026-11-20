// =====================================================================
// Ligação Resina → Caixa da Família.
//   - Recebimento (crédito) da conta corrente → entrada numa conta do Caixa.
//   - Compra de insumos → saída de uma conta ou compra no cartão do Caixa.
// O que foi lançado no Caixa guarda de onde veio (resina_movimento_id / resina_entrega_id):
// mudar ou excluir na Resina muda ou exclui no Caixa também.
// =====================================================================
import { esc } from '../../lib/format.js';
import { store, contasAtivas, cartoesAtivos } from '../../lib/store.js';
import { local } from '../../lib/local-db.js';
import { criarLancamentos, excluirLancamentos, criarCompra, excluirCompra, atualizarLancamento } from '../../lib/api.js';
import { opcoesConta, opcoesCategoria } from '../../components/form-lancamento.js';
import { faturaDe, dividirParcelas } from '../../lib/faturas.js';
import { chave } from './importar-conta.js';

const ok = ({ data, error }) => { if (error) throw new Error(error.message); return data; };

// as últimas escolhas ficam lembradas para o próximo lançamento
const lembrado = { aReceber: true, contaAReceber: null, catAReceber: null, recebNoCaixa: true, contaRecebimento: null, catRecebimento: null, modoInsumo: null, contaInsumo: null, catInsumo: null, cartao: null, parcelas: 1 };

/** Categoria sugerida: a já usada, ou a primeira cujo nome tem uma das palavras */
function categoriaSugerida(tipo, palavras) {
  const lista = store.categorias.filter((c) => tipo === 'entrada' ? c.tipo === 'entrada' || c.tipo === 'ambos' : c.tipo !== 'entrada');
  for (const p of palavras) { const c = lista.find((x) => chave(x.nome).includes(p)); if (c) return c.id; }
  return null;
}

/** O que já foi lançado no Caixa a partir de um item da Resina */
export async function lerLigacao(campo, id) {
  if (!id) return { lancamentos: [], compras: [], receber: [] };
  const lancamentos = ok(await local.from('lancamentos').select('*').eq(campo, id));
  const compras = campo === 'resina_entrega_id' ? ok(await local.from('compras_cartao').select('*').eq(campo, id)) : [];
  const receber = campo === 'resina_entrega_id' ? ok(await local.from('lancamentos').select('*').eq('resina_receber_id', id)) : [];
  return { lancamentos, compras, receber };
}

/** Ids da Resina que já têm lançamento no Caixa (para mostrar "no Caixa" nas listas) */
export function idsLigados() {
  const t = local.tabelas();
  return {
    movimentos: new Set(t.lancamentos.map((l) => l.resina_movimento_id).filter(Boolean)),
    entregas: new Set([...t.lancamentos, ...t.compras_cartao].map((l) => l.resina_entrega_id).filter(Boolean)),
  };
}

/** Apaga o que estava ligado no Caixa e cria o novo. Retorna `desfazer()`. */
async function substituir(campo, id, criar) {
  const antes = await lerLigacao(campo, id);
  const voltar = [];
  if (antes.lancamentos.length) voltar.push(await excluirLancamentos(antes.lancamentos.map((l) => l.id)));
  for (const c of antes.compras) voltar.push(await excluirCompra(c.id));
  const criados = criar ? await criar() : null;
  return async () => {
    if (criados?.lancamentos?.length) await excluirLancamentos(criados.lancamentos);
    if (criados?.compra) await excluirCompra(criados.compra);
    for (const v of voltar.reverse()) await v();
  };
}

/** Exclui no Caixa o que veio deste item da Resina. Retorna `desfazer()`. */
export const desligar = (campo, id) => substituir(campo, id, null);

// ---------- Recebimento da conta corrente → entrada no Caixa
/**
 * Campos do diálogo do recebimento. `ligado` = lançamento do Caixa que já existe (ou null).
 * `novo` = recebimento novo (vem marcado); ao mudar um antigo sem ligação, vem desmarcado.
 */
export function camposRecebimento(ligado, novo = true) {
  if (!contasAtivas().length) return '<p class="dica" data-caixa-recebimento>Para lançar também no Caixa, cadastre uma conta em Ajustes.</p>';
  const conta = ligado?.conta_id || lembrado.contaRecebimento || contasAtivas()[0]?.id;
  const cat = ligado?.categoria_id || lembrado.catRecebimento || categoriaSugerida('entrada', ['RESINA', 'ARRENDAMENTO', 'VENDA']);
  const marcado = ligado || (novo && lembrado.recebNoCaixa);
  return `<fieldset class="grid gap-3 rounded-xl border border-stone-200 p-3 dark:border-stone-700" data-caixa-recebimento>
    <legend class="px-1 text-sm font-semibold">Caixa da Família</legend>
    <label class="flex cursor-pointer items-start gap-3"><input type="checkbox" name="no_caixa" class="mt-0.5 size-5 accent-brand-600" ${marcado ? 'checked' : ''}>
      <span><span class="block font-semibold">Lançar também como entrada no Caixa</span>
      <span class="block text-sm text-stone-600 dark:text-stone-400">O dinheiro entra no saldo da conta escolhida.${ligado ? ' Já está lançado: mudar aqui muda lá.' : ''}</span></span></label>
    <div class="grid gap-3 sm:grid-cols-2" data-caixa-campos>
      <div data-campo><label class="rotulo" for="cx-conta">Entrou em qual conta?</label><select id="cx-conta" name="cx_conta" class="campo">${opcoesConta(conta)}</select></div>
      <div data-campo><label class="rotulo" for="cx-cat">Categoria no Caixa</label><select id="cx-cat" name="cx_categoria" class="campo">${opcoesCategoria(cat, 'entrada')}</select></div>
    </div>
  </fieldset>`;
}

/** Liga o checkbox (mostra/esconde conta e categoria) e o tipo (só crédito vai para o Caixa) */
export function ligarRecebimento(form) {
  const caixa = form.querySelector('[data-caixa-recebimento]');
  if (!caixa || !form.no_caixa) return;
  const atualizar = () => {
    const credito = !form.tipo || form.tipo.value === 'credito';
    caixa.hidden = !credito;
    form.querySelector('[data-caixa-campos]').hidden = !form.no_caixa.checked;
  };
  form.addEventListener('change', atualizar);
  atualizar();
}

/** Lê as escolhas; null se faltar algo (e marca o erro). `semCaixa` = não lançar */
export function lerRecebimento(form, erroNoCampo) {
  if (!form.no_caixa || !form.no_caixa.checked || (form.tipo && form.tipo.value !== 'credito')) return { semCaixa: true };
  if (!form.cx_conta.value) { erroNoCampo(form, 'cx_conta', 'Escolha a conta do Caixa.'); return null; }
  if (!form.cx_categoria.value) { erroNoCampo(form, 'cx_categoria', 'Escolha a categoria de entrada.'); return null; }
  return { conta_id: form.cx_conta.value, categoria_id: form.cx_categoria.value };
}

/**
 * Grava (ou atualiza) a entrada do Caixa ligada ao recebimento. Retorna `desfazer()`.
 * `mov` = recebimento salvo; `escolha` = lerRecebimento(...); `texto` = descrição para o Caixa.
 */
export async function gravarRecebimento(mov, escolha, texto) {
  if (mov.tipo === 'credito') lembrado.recebNoCaixa = !escolha.semCaixa;
  if (escolha.semCaixa) return desligar('resina_movimento_id', mov.id);
  lembrado.contaRecebimento = escolha.conta_id;
  lembrado.catRecebimento = escolha.categoria_id;
  return substituir('resina_movimento_id', mov.id, async () => {
    const [l] = await criarLancamentos([{
      tipo: 'entrada', valor: mov.valor, descricao: texto.slice(0, 120), vencimento: mov.data, pago: true, data_pagamento: mov.data,
      conta_id: escolha.conta_id, categoria_id: escolha.categoria_id, pessoa_id: null, resina_movimento_id: mov.id,
    }]);
    return { lancamentos: [l.id] };
  });
}

// ---------- Parte do produtor nos insumos → entrada "a receber" no Caixa
/** Campos do "a receber". `ligado` = a entrada que já existe (ou undefined) */
export function camposAReceber(ligado) {
  if (!contasAtivas().length) return '';
  const marcado = ligado ? true : lembrado.aReceber;
  const conta = ligado?.conta_id || lembrado.contaAReceber || lembrado.contaRecebimento || contasAtivas()[0]?.id;
  const cat = ligado?.categoria_id || lembrado.catAReceber || categoriaSugerida('entrada', ['INSUMO', 'RESINA', 'ARRENDAMENTO', 'REEMBOLSO']);
  return `<fieldset class="grid gap-3 rounded-xl border border-stone-200 p-3 dark:border-stone-700" data-caixa-receber ${ligado?.pago ? 'data-recebido' : ''}>
    <legend class="px-1 text-sm font-semibold">Caixa da Família: parte do produtor</legend>
    <label class="flex cursor-pointer items-start gap-3"><input type="checkbox" name="cx_receber" class="mt-0.5 size-5 accent-brand-600" ${marcado ? 'checked' : ''}>
      <span><span class="block font-semibold">Lançar a parte de cada produtor como "a receber" no Caixa</span>
      <span class="block text-sm text-stone-600 dark:text-stone-400">Uma entrada para cada produtor da nota. Quando ele pagar, marque como recebido no Extrato: o dinheiro entra no saldo e a conta corrente baixa sozinha.${ligado?.pago ? ' <strong>Já foi recebido (pelo menos um).</strong>' : ''}</span></span></label>
    <div class="grid gap-3 sm:grid-cols-3" data-receber-campos>
      <div data-campo><label class="rotulo" for="cx-data-r">Quando vai receber?</label><input id="cx-data-r" name="cx_data_receber" type="date" class="campo" value="${ligado?.vencimento || ''}" ${ligado ? 'data-mexido' : ''} aria-describedby="dica-cx-data-r">
        <p id="dica-cx-data-r" class="dica mt-1">${ligado?.pago ? 'Quem já pagou fica com a data em que pagou; a data nova vale para quem ainda não pagou.' : 'Vem com o vencimento da nota. Mude se ele for pagar em outro dia.'}</p></div>
      <div data-campo><label class="rotulo" for="cx-conta-r">Vai entrar em qual conta?</label><select id="cx-conta-r" name="cx_conta_receber" class="campo">${opcoesConta(conta)}</select></div>
      <div data-campo><label class="rotulo" for="cx-cat-r">Categoria de entrada <span class="font-normal text-stone-600 dark:text-stone-400">(opcional)</span></label><select id="cx-cat-r" name="cx_cat_receber" class="campo">${opcoesCategoria(cat, 'entrada')}</select></div>
    </div>
  </fieldset>`;
}

/**
 * Mostra/esconde os campos. A data de receber acompanha o vencimento da nota (campo do pagamento)
 * e a data da compra, até a pessoa mudar ela mesma.
 */
export function ligarAReceber(form) {
  const area = form.querySelector('[data-caixa-receber]');
  if (!area) return;
  const campo = form.cx_data_receber;
  const sugerida = () => (form.querySelector('[name=cx_modo]:checked')?.value === 'saida' && form.cx_vencimento?.value) || form.data?.value || '';
  // lançados antes deste campo ficaram com a data da compra: esses passam a acompanhar o vencimento da nota
  if (campo.value && campo.value === form.data?.value && !area.hasAttribute('data-recebido')) campo.removeAttribute('data-mexido');
  const acompanhar = () => { if (!campo.hasAttribute('data-mexido')) campo.value = sugerida(); };
  const atualizar = () => { area.querySelector('[data-receber-campos]').hidden = !form.cx_receber.checked; acompanhar(); };
  campo.addEventListener('input', () => campo.toggleAttribute('data-mexido', !!campo.value));
  form.addEventListener('input', (e) => { if (e.target !== campo) acompanhar(); });
  form.addEventListener('change', (e) => { if (e.target !== campo) atualizar(); });
  atualizar();
}

/** null se faltar algo (e marca o erro); { sem: true } = não lançar */
export function lerAReceber(form, erroNoCampo) {
  if (!form.cx_receber || !form.cx_receber.checked) return { sem: true };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(form.cx_data_receber.value)) { erroNoCampo(form, 'cx_data_receber', 'Escolha quando vai receber.'); return null; }
  if (!form.cx_conta_receber.value) { erroNoCampo(form, 'cx_conta_receber', 'Escolha a conta.'); return null; }
  return { conta_id: form.cx_conta_receber.value, categoria_id: form.cx_cat_receber.value || null, vencimento: form.cx_data_receber.value };
}

/**
 * Cria, muda ou apaga as entradas "a receber" da entrega: uma por produtor, com a parte dele.
 * O que já foi recebido continua recebido (só o valor e a descrição acompanham).
 * `partes` = [{ produtor_id, titular_id, valor, texto }]; `comum` = { data (quando vai receber), titular_id (se a parte não tiver), nota }. Retorna `desfazer()`.
 */
export async function gravarAReceber(entregaId, escolha, partes = [], comum = {}) {
  if (!escolha) escolha = { sem: true };
  if (!escolha.sem) { lembrado.contaAReceber = escolha.conta_id; lembrado.catAReceber = escolha.categoria_id; lembrado.aReceber = true; }
  else if (partes.length) lembrado.aReceber = false; // excluir a entrega não muda a escolha lembrada
  const antes = ok(await local.from('lancamentos').select('*').eq('resina_receber_id', entregaId));
  const validas = escolha.sem ? [] : partes.filter((p) => p.valor > 0);
  // cada parte reaproveita a entrada do mesmo produtor (e da mesma conta, se houver); se não houver, uma que sobrou (ex.: trocou o produtor)
  const sobra = [...antes];
  const conta = (p) => (p.titular_id !== undefined ? p.titular_id : comum.titular_id) || null;
  const mesmo = (l, p) => (l.resina_produtor_id || null) === (p.produtor_id || null);
  const pares = validas.map((p) => ({ p, l: null }));
  for (const par of pares) {
    const n = sobra.findIndex((l) => mesmo(l, par.p) && (l.resina_titular_id || null) === conta(par.p));
    if (n >= 0) par.l = sobra.splice(n, 1)[0];
  }
  for (const par of pares) {
    if (par.l) continue;
    const n = sobra.findIndex((l) => mesmo(l, par.p));
    if (n >= 0) par.l = sobra.splice(n, 1)[0];
  }
  for (const par of pares) if (!par.l && sobra.length) par.l = sobra.shift();

  const voltar = [];
  const criar = [];
  for (const { p, l } of pares) {
    const valores = {
      tipo: 'entrada', valor: p.valor, descricao: p.texto.slice(0, 120), conta_id: escolha.conta_id, categoria_id: escolha.categoria_id,
      resina_titular_id: conta(p), resina_produtor_id: p.produtor_id || null, resina_nota: comum.nota || '',
    };
    if (l) voltar.push((await atualizarLancamento(l.id, l.pago ? valores : { ...valores, vencimento: comum.data })).desfazer);
    else criar.push({ ...valores, vencimento: comum.data, pago: false, data_pagamento: null, pessoa_id: null, resina_receber_id: entregaId });
  }
  if (sobra.length) voltar.push(await excluirLancamentos(sobra.map((x) => x.id)));
  if (criar.length) {
    const novos = await criarLancamentos(criar);
    voltar.push(() => excluirLancamentos(novos.map((x) => x.id)));
  }
  return async () => { for (const v of voltar.reverse()) await v(); };
}

// ---------- Compra de insumos → saída ou cartão no Caixa
const MODOS = [['', 'Não lançar no Caixa'], ['saida', 'Saída de uma conta'], ['cartao', 'Compra no cartão']];

/** Campos do diálogo da entrega de insumos. `ligado` = {lancamentos, compras} já existentes */
export function camposPagamentoInsumos(ligado = { lancamentos: [], compras: [] }) {
  const l = ligado.lancamentos[0];
  const c = ligado.compras[0];
  const modo = l ? 'saida' : c ? 'cartao' : (lembrado.modoInsumo ?? '');
  const cat = l?.categoria_id || c?.categoria_id || lembrado.catInsumo || categoriaSugerida('saida', ['INSUMO', 'RESINA', 'FAZENDA']);
  const cartoes = cartoesAtivos();
  const cartao = c?.cartao_id || lembrado.cartao || cartoes[0]?.id;
  return `<fieldset class="grid gap-3 rounded-xl border border-stone-200 p-3 dark:border-stone-700" data-caixa-insumos>
    <legend class="px-1 text-sm font-semibold">Caixa da Família: como foi paga esta compra?</legend>
    <div class="grid gap-2 sm:grid-cols-3" role="radiogroup" aria-label="Como foi paga">${MODOS.filter(([v]) => v !== 'cartao' || cartoes.length).filter(([v]) => v !== 'saida' || contasAtivas().length).map(([v, t]) => `
      <label class="flex min-h-11 cursor-pointer items-center gap-2 rounded-xl border border-stone-200 px-3 text-sm has-checked:border-brand-500 has-checked:bg-brand-50 dark:border-stone-700 dark:has-checked:bg-brand-950">
        <input type="radio" name="cx_modo" value="${v}" class="size-5 accent-brand-600" ${modo === v ? 'checked' : ''}> ${t}</label>`).join('')}</div>
    <p class="text-sm text-stone-600 dark:text-stone-400" data-cx-dica>${ligado.lancamentos.length || ligado.compras.length ? 'Já está lançado no Caixa: mudar aqui muda lá.' : 'O valor total da entrega vai para o Caixa como gasto, na categoria escolhida.'}</p>
    <div class="grid gap-3 sm:grid-cols-2" data-cx-comum>
      <div data-campo class="sm:col-span-2"><label class="rotulo" for="cx-cat-i">Categoria no Caixa</label><select id="cx-cat-i" name="cx_categoria" class="campo">${opcoesCategoria(cat, 'saida')}</select></div>
    </div>
    <div class="grid gap-3 sm:grid-cols-2" data-cx-saida>
      <div data-campo><label class="rotulo" for="cx-conta-i">Saiu de qual conta?</label><select id="cx-conta-i" name="cx_conta" class="campo">${opcoesConta(l?.conta_id || lembrado.contaInsumo || contasAtivas()[0]?.id)}</select></div>
      <div data-campo><label class="rotulo" for="cx-venc">Data do pagamento ou vencimento</label><input id="cx-venc" name="cx_vencimento" type="date" class="campo" value="${l?.vencimento || ''}"></div>
      <label class="flex cursor-pointer items-center gap-2 text-sm sm:col-span-2"><input type="checkbox" name="cx_pago" class="size-5 accent-brand-600" ${l ? (l.pago ? 'checked' : '') : 'checked'}> Já foi pago (desmarque se for pagar depois, por exemplo no vencimento da nota)</label>
    </div>
    <div class="grid gap-3 sm:grid-cols-2" data-cx-cartao>
      <div data-campo><label class="rotulo" for="cx-cartao">Cartão</label><select id="cx-cartao" name="cx_cartao" class="campo">${cartoes.map((x) => `<option value="${x.id}" ${x.id === cartao ? 'selected' : ''}>${esc(x.nome)}</option>`).join('')}</select></div>
      <div data-campo><label class="rotulo" for="cx-parcelas">Parcelas</label><input id="cx-parcelas" name="cx_parcelas" type="number" inputmode="numeric" min="1" max="420" step="1" class="campo tabular-nums" value="${c?.qtd_parcelas || lembrado.parcelas}" aria-describedby="dica-cx-parcelas">
        <p id="dica-cx-parcelas" class="dica">1 = à vista. Digite quantas parcelas quiser.</p></div>
    </div>
  </fieldset>`;
}

export function ligarPagamentoInsumos(form) {
  const area = form.querySelector('[data-caixa-insumos]');
  if (!area) return;
  const atualizar = () => {
    const modo = form.querySelector('[name=cx_modo]:checked')?.value || '';
    area.querySelector('[data-cx-comum]').hidden = !modo;
    area.querySelector('[data-cx-saida]').hidden = modo !== 'saida';
    area.querySelector('[data-cx-cartao]').hidden = modo !== 'cartao';
  };
  area.addEventListener('change', atualizar);
  atualizar();
}

export function lerPagamentoInsumos(form, erroNoCampo, dataEntrega) {
  const modo = form.querySelector('[name=cx_modo]:checked')?.value || '';
  if (!modo) return { modo: '' };
  if (!form.cx_categoria.value) { erroNoCampo(form, 'cx_categoria', 'Escolha a categoria de gasto no Caixa.'); return null; }
  if (modo === 'saida') {
    if (!form.cx_conta.value) { erroNoCampo(form, 'cx_conta', 'Escolha a conta.'); return null; }
    return { modo, categoria_id: form.cx_categoria.value, conta_id: form.cx_conta.value, vencimento: form.cx_vencimento.value || dataEntrega, pago: form.cx_pago.checked };
  }
  return { modo, categoria_id: form.cx_categoria.value, cartao_id: form.cx_cartao.value, parcelas: Math.min(420, Math.max(1, Math.round(Number(form.cx_parcelas.value)) || 1)) };
}

/** Grava (ou atualiza) no Caixa o pagamento da entrega de insumos. Retorna `desfazer()`. */
export async function gravarPagamentoInsumos(entregaId, escolha, { total, data, texto }) {
  lembrado.modoInsumo = escolha.modo;
  if (!escolha.modo) return desligar('resina_entrega_id', entregaId);
  lembrado.catInsumo = escolha.categoria_id;
  const descricao = texto.slice(0, 120);
  if (escolha.modo === 'saida') {
    lembrado.contaInsumo = escolha.conta_id;
    return substituir('resina_entrega_id', entregaId, async () => {
      const [l] = await criarLancamentos([{
        tipo: 'saida', valor: total, descricao, vencimento: escolha.vencimento, pago: escolha.pago, data_pagamento: escolha.pago ? escolha.vencimento : null,
        conta_id: escolha.conta_id, categoria_id: escolha.categoria_id, pessoa_id: null, resina_entrega_id: entregaId,
      }]);
      return { lancamentos: [l.id] };
    });
  }
  lembrado.cartao = escolha.cartao_id;
  lembrado.parcelas = escolha.parcelas;
  const cartao = store.cartoes.find((c) => c.id === escolha.cartao_id);
  return substituir('resina_entrega_id', entregaId, async () => {
    const compra = await criarCompra(
      { cartao_id: cartao.id, data_compra: data, valor_total: total, qtd_parcelas: escolha.parcelas, descricao, categoria_id: escolha.categoria_id,
        subcategoria: 'Insumos da resina', pessoa_id: null, resina_entrega_id: entregaId },
      dividirParcelas(total, escolha.parcelas).map((valor, i) => ({ numero: i + 1, valor, fatura_mes: faturaDe(cartao, data, i) })),
    );
    return { compra: compra.id };
  });
}

