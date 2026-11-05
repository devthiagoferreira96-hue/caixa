// Campos do formulário de lançamento do caixa (usados em "Novo lançamento" e na edição)
import { esc, hojeISO, valorParaCampo, lerValor, VALOR_MAXIMO, valorMaximoTexto } from '../lib/format.js';
import { store, contasAtivas, categoriasPorGrupo, buscar, categoriaServe } from '../lib/store.js';
import { erroNoCampo } from '../lib/ui.js';

/** Opções do campo Categoria. Com `tipo`, só as categorias que servem para ele (e sempre a já escolhida). */
export const opcoesCategoria = (selecionada, tipo) =>
  `<option value="">Escolha uma categoria…</option>` +
  Object.entries(categoriasPorGrupo(tipo, selecionada))
    .map(([grupo, cats]) => `<optgroup label="${esc(grupo)}">${cats
      .map((c) => `<option value="${c.id}" ${c.id === selecionada ? 'selected' : ''}>${esc(c.nome)}</option>`)
      .join('')}</optgroup>`)
    .join('');

export const opcoesConta = (selecionada) =>
  contasAtivas().map((c) => `<option value="${c.id}" ${c.id === selecionada ? 'selected' : ''}>${esc(c.nome)}</option>`).join('');

export const campoValor = (valor, rotulo = 'Valor') => `
  <div data-campo>
    <label class="rotulo" for="f-valor">${rotulo}</label>
    <div class="relative">
      <span class="pointer-events-none absolute inset-y-0 left-3 flex items-center font-semibold text-stone-600 dark:text-stone-400" aria-hidden="true">R$</span>
      <input id="f-valor" name="valor" class="campo pl-10 text-lg font-semibold tabular-nums" inputmode="numeric" autocomplete="off"
        placeholder="0,00" value="${valorParaCampo(valor)}" aria-describedby="dica-valor">
    </div>
    <p id="dica-valor" class="dica">Digite só os números. Ex.: 12990 vira 129,90</p>
  </div>`;

export const campoDescricao = (valor, exemplo) => `
  <div data-campo>
    <label class="rotulo" for="f-descricao">Descrição</label>
    <input id="f-descricao" name="descricao" class="campo" maxlength="120" autocomplete="off" placeholder="${esc(exemplo)}" value="${esc(valor || '')}">
  </div>`;

const DICA_CATEGORIA = {
  saida: 'Mostrando as categorias de saída.',
  cartao: 'Mostrando as categorias de saída.',
  entrada: 'Mostrando as categorias de entrada, como Venda e Rendimentos.',
};

export const campoCategoria = (selecionada, tipo = 'saida') => `
  <div data-campo>
    <label class="rotulo" for="f-categoria">Categoria</label>
    <select id="f-categoria" name="categoria_id" class="campo" aria-describedby="dica-categoria">${opcoesCategoria(selecionada, tipo)}</select>
    <p id="dica-categoria" class="dica" data-dica-categoria>${DICA_CATEGORIA[tipo]}</p>
  </div>`;

/**
 * Troca as opções de categoria quando muda o tipo (saída/entrada/cartão).
 * Mantém a escolha se ela servir para o novo tipo; senão, limpa e avisa.
 */
export function atualizarCategorias(form, tipo) {
  const campo = form.categoria_id;
  const antes = campo.value;
  const serve = !antes || categoriaServe(buscar('categorias', antes), tipo);
  campo.innerHTML = opcoesCategoria(serve ? antes : null, tipo);
  campo.value = serve ? antes : '';
  const dica = form.querySelector('[data-dica-categoria]');
  if (dica) {
    dica.textContent = serve
      ? DICA_CATEGORIA[tipo]
      : `"${buscar('categorias', antes)?.nome}" não é de ${tipo === 'entrada' ? 'entrada' : 'saída'}. Escolha outra categoria.`;
  }
}

/** Mensagem de erro se a categoria não servir para o tipo (ou null) */
export function erroDeTipo(categoriaId, tipo) {
  const c = buscar('categorias', categoriaId);
  if (!c || categoriaServe(c, tipo)) return null;
  return tipo === 'entrada'
    ? `"${c.nome}" é uma categoria de saída. Escolha uma de entrada ou mude o tipo para Saída.`
    : `"${c.nome}" é uma categoria de entrada. Escolha uma de saída ou mude o tipo para Entrada.`;
}

/** Campos de conta/vencimento/pessoa/pago. `l` = lançamento existente (edição) ou {} */
export function camposCaixa(l = {}) {
  const pessoa = buscar('pessoas', l.pessoa_id)?.nome || '';
  const pago = l.id ? l.pago : true;
  return `
    <div class="grid gap-4 sm:grid-cols-2">
      <div data-campo>
        <label class="rotulo" for="f-conta">Conta usada</label>
        <select id="f-conta" name="conta_id" class="campo">${opcoesConta(l.conta_id)}</select>
        <p class="dica">De onde saiu (ou para onde foi) o dinheiro.</p>
      </div>
      <div data-campo>
        <label class="rotulo" for="f-vencimento">Data</label>
        <input id="f-vencimento" name="vencimento" type="date" class="campo" value="${l.vencimento || hojeISO()}">
        <p class="dica">Dia do pagamento ou do vencimento.</p>
      </div>
    </div>
    <div data-campo>
      <label class="rotulo" for="f-pessoa">Pessoa <span class="font-normal text-stone-600 dark:text-stone-400">(opcional)</span></label>
      <input id="f-pessoa" name="pessoa" class="campo" list="lista-pessoas" autocomplete="off" placeholder="Funcionário, prestador, alguém da família…" value="${esc(pessoa)}">
      <datalist id="lista-pessoas">${store.pessoas.map((p) => `<option value="${esc(p.nome)}"></option>`).join('')}</datalist>
      <p class="dica">Escreva um nome novo e ele é cadastrado automaticamente.</p>
    </div>
    <label class="flex cursor-pointer items-start gap-3 rounded-xl border border-stone-200 p-3 has-checked:border-brand-500 has-checked:bg-brand-50 dark:border-stone-700 dark:has-checked:bg-brand-950">
      <input type="checkbox" name="pago" class="mt-0.5 size-5 accent-brand-600" ${pago ? 'checked' : ''}>
      <span><span class="block font-semibold" data-texto-pago>Já foi pago</span>
      <span class="block text-sm text-stone-600 dark:text-stone-400">Desmarque se for uma conta que ainda vai vencer. Ela aparece em "Contas a pagar".</span></span>
    </label>`;
}

/** Lê e valida os campos comuns. Retorna o objeto ou null (e mostra os erros na tela). */
export function lerCamposCaixa(form, tipo) {
  const valor = lerValor(form.valor.value);
  const dados = {
    tipo,
    valor,
    descricao: form.descricao.value.trim(),
    categoria_id: form.categoria_id.value || null,
    conta_id: form.conta_id.value || null,
    vencimento: form.vencimento.value,
    pago: form.pago.checked,
    pessoaNome: form.pessoa.value,
  };
  let ok = true;
  const erro = (campo, msg) => { erroNoCampo(form, campo, msg); ok = false; };
  if (!(valor > 0)) erro('valor', 'Digite um valor maior que zero.');
  else if (valor > VALOR_MAXIMO) erro('valor', `O valor máximo é ${valorMaximoTexto()}.`);
  if (!dados.descricao) erro('descricao', 'Escreva uma descrição curta, como "Conta de luz".');
  if (!dados.categoria_id) erro('categoria_id', 'Escolha uma categoria.');
  else if (erroDeTipo(dados.categoria_id, tipo)) erro('categoria_id', erroDeTipo(dados.categoria_id, tipo));
  if (!dados.conta_id) erro('conta_id', 'Escolha a conta.');
  if (!dados.vencimento) erro('vencimento', 'Escolha a data.');
  if (!ok) form.querySelector('[aria-invalid]')?.focus();
  return ok ? dados : null;
}
