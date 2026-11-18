// Campos do formulário de lançamento do caixa (usados em "Novo lançamento" e na edição)
import { esc, brl, hojeISO, valorParaCampo, lerValor, VALOR_MAXIMO, valorMaximoTexto } from '../lib/format.js';
import { store, contasAtivas, categoriasPorGrupo, buscar, categoriaServe } from '../lib/store.js';
import { erroNoCampo, mascaraDinheiro, icone } from '../lib/ui.js';

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
    <p id="dica-valor" class="dica">Digite só os números (12990 vira 129,90) ou uma conta, ex.: 3*4,50</p>
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

const OPCIONAL = '<span class="font-normal text-stone-600 dark:text-stone-400">(opcional)</span>';
const centavos = (v) => Math.round(Number(v || 0) * 100);
const arredondar = (v) => Math.round(v * 100) / 100;

/** Campo de dinheiro menor (desconto, juros, partes do pagamento). A máscara é ligada por `ligarCamposCaixa`. */
const campoDinheiro = (nome, rotulo, valor, dica = '') => `
  <div data-campo>
    <label class="rotulo" for="f-${nome}">${rotulo}</label>
    <div class="relative">
      <span class="pointer-events-none absolute inset-y-0 left-3 flex items-center font-semibold text-stone-600 dark:text-stone-400" aria-hidden="true">R$</span>
      <input id="f-${nome}" name="${nome}" class="campo pl-10 tabular-nums" inputmode="numeric" autocomplete="off" placeholder="0,00"
        value="${valorParaCampo(valor)}" data-dinheiro>
    </div>
    ${dica ? `<p class="dica">${dica}</p>` : ''}
  </div>`;

/**
 * Campos de conta, datas (vencimento, pagamento, competência), pessoa, pago,
 * desconto/juros e observação. `l` = lançamento existente (edição) ou {}.
 * Depois de colocar na tela, chame `ligarCamposCaixa(form)`.
 */
export function camposCaixa(l = {}) {
  const pessoa = buscar('pessoas', l.pessoa_id)?.nome || '';
  const pago = l.id ? l.pago : true;
  const temDetalhes = Boolean(l.observacao || l.competencia || Number(l.desconto) || Number(l.juros));
  return `
    <div class="grid gap-4 sm:grid-cols-2">
      <div data-campo data-campo-conta>
        <label class="rotulo" for="f-conta">Conta usada</label>
        <select id="f-conta" name="conta_id" class="campo">${opcoesConta(l.conta_id)}</select>
        <p class="dica">De onde saiu (ou para onde foi) o dinheiro.</p>
      </div>
      <div data-campo>
        <label class="rotulo" for="f-vencimento">Vencimento</label>
        <input id="f-vencimento" name="vencimento" type="date" class="campo" value="${l.vencimento || hojeISO()}">
        <p class="dica">Dia em que vence. Se não tem vencimento, use o dia do pagamento.</p>
      </div>
    </div>
    <div data-campo>
      <label class="rotulo" for="f-pessoa">Pessoa ${OPCIONAL}</label>
      <input id="f-pessoa" name="pessoa" class="campo" list="lista-pessoas" autocomplete="off" placeholder="Funcionário, prestador, alguém da família…" value="${esc(pessoa)}">
      <datalist id="lista-pessoas">${store.pessoas.map((p) => `<option value="${esc(p.nome)}"></option>`).join('')}</datalist>
      <p class="dica">Escreva um nome novo e ele é cadastrado automaticamente.</p>
    </div>
    <div class="grid gap-3 sm:grid-cols-2 sm:items-start">
      <label class="flex cursor-pointer items-start gap-3 rounded-xl border border-stone-200 p-3 has-checked:border-brand-500 has-checked:bg-brand-50 dark:border-stone-700 dark:has-checked:bg-brand-950">
        <input type="checkbox" name="pago" class="mt-0.5 size-5 accent-brand-600" ${pago ? 'checked' : ''}>
        <span><span class="block font-semibold" data-texto-pago>Já foi pago</span>
        <span class="block text-sm text-stone-600 dark:text-stone-400">Desmarque se for uma conta que ainda vai vencer. Ela aparece em "Contas a pagar".</span></span>
      </label>
      <div data-campo data-so-pago ${pago ? '' : 'hidden'}>
        <label class="rotulo" for="f-data_pagamento" data-rotulo-pagamento>Data do pagamento</label>
        <input id="f-data_pagamento" name="data_pagamento" type="date" class="campo" value="${l.data_pagamento || l.vencimento || hojeISO()}">
        <p class="dica">Dia em que o dinheiro saiu (ou entrou) na conta.</p>
      </div>
    </div>
    <details class="group rounded-xl border border-stone-200 dark:border-stone-700" data-mais-detalhes ${temDetalhes ? 'open' : ''}>
      <summary class="flex cursor-pointer list-none items-center justify-between gap-2 rounded-xl p-3 font-semibold hover:bg-stone-50 dark:hover:bg-stone-800/60">
        <span>Mais detalhes <span class="block text-sm font-normal text-stone-600 dark:text-stone-400">Competência, desconto, juros e observação</span></span>
        <span aria-hidden="true" class="text-stone-500 transition group-open:rotate-180">▾</span>
      </summary>
      <div class="grid gap-4 border-t border-stone-200 p-3 dark:border-stone-700">
        <div data-campo>
          <label class="rotulo" for="f-competencia">Competência ${OPCIONAL}</label>
          <input id="f-competencia" name="competencia" type="date" class="campo" value="${l.competencia || ''}">
          <p class="dica">A data a que a conta se refere. Ex.: a luz de outubro que vence em novembro. Em branco, vale o vencimento.</p>
        </div>
        <div class="grid gap-4 sm:grid-cols-2">
          ${campoDinheiro('desconto', `Desconto ${OPCIONAL}`, l.desconto)}
          ${campoDinheiro('juros', `Juros ou multa ${OPCIONAL}`, l.juros)}
        </div>
        <p class="rounded-xl bg-stone-100 p-3 text-sm dark:bg-stone-800" data-valor-final aria-live="polite" hidden></p>
        <div data-campo>
          <label class="rotulo" for="f-observacao">Observação ${OPCIONAL}</label>
          <textarea id="f-observacao" name="observacao" class="campo" rows="3" maxlength="500" placeholder="Qualquer anotação: nº do boleto, combinado, motivo…">${esc(l.observacao || '')}</textarea>
        </div>
      </div>
    </details>`;
}

/** Valor original, desconto, juros e o valor final (o que mexe no saldo) */
function lerValores(form) {
  const original = lerValor(form.valor.value);
  const desconto = form.desconto ? lerValor(form.desconto.value) || 0 : 0;
  const juros = form.juros ? lerValor(form.juros.value) || 0 : 0;
  return { original, desconto, juros, final: arredondar((original || 0) - desconto + juros) };
}

/**
 * Liga os comportamentos dos campos do caixa: máscara de dinheiro no desconto/juros,
 * data do pagamento só quando "Já foi pago" está marcado e o valor final com desconto/juros.
 * Retorna `atualizar()` (para chamar depois de limpar o formulário).
 */
export function ligarCamposCaixa(form) {
  form.querySelectorAll('[name=desconto], [name=juros]').forEach(mascaraDinheiro);
  const rotuloValor = form.querySelector('label[for="f-valor"]');
  const atualizar = () => {
    const pago = form.pago.checked;
    const soPago = form.querySelector('[data-so-pago]');
    if (soPago) soPago.hidden = !pago;
    if (pago && !form.data_pagamento.value) form.data_pagamento.value = hojeISO();
    const { original, desconto, juros, final } = lerValores(form);
    const temAjuste = desconto > 0 || juros > 0;
    if (rotuloValor) rotuloValor.textContent = temAjuste ? 'Valor original' : 'Valor';
    const caixa = form.querySelector('[data-valor-final]');
    caixa.hidden = !temAjuste;
    if (temAjuste) {
      const conta = [brl(original || 0), desconto ? `− ${brl(desconto)} de desconto` : '', juros ? `+ ${brl(juros)} de juros` : ''].filter(Boolean).join(' ');
      caixa.innerHTML = `Valor final: <strong class="tabular-nums">${brl(final)}</strong><span class="block text-stone-600 dark:text-stone-400">${esc(conta)}</span>`;
    }
    form.dispatchEvent(new CustomEvent('caixa:valor-final', { detail: { final } }));
  };
  form.addEventListener('input', (e) => ['valor', 'desconto', 'juros'].includes(e.target.name) && atualizar());
  form.addEventListener('change', (e) => e.target.name === 'pago' && atualizar());
  atualizar();
  return atualizar;
}

/** Lê e valida os campos comuns. Retorna o objeto ou null (e mostra os erros na tela). */
export function lerCamposCaixa(form, tipo) {
  const { original, desconto, juros, final } = lerValores(form);
  const ajuste = desconto > 0 || juros > 0;
  const pago = form.pago.checked;
  const dados = {
    tipo,
    valor: final,
    valor_original: ajuste ? original : null,
    desconto: desconto > 0 ? desconto : null,
    juros: juros > 0 ? juros : null,
    descricao: form.descricao.value.trim(),
    categoria_id: form.categoria_id.value || null,
    conta_id: form.conta_id.value || null,
    vencimento: form.vencimento.value,
    pago,
    data_pagamento: pago ? form.data_pagamento?.value || form.vencimento.value || hojeISO() : null,
    competencia: form.competencia?.value || null,
    observacao: form.observacao?.value.trim() || null,
    pessoaNome: form.pessoa.value,
  };
  let ok = true;
  const erro = (campo, msg) => { erroNoCampo(form, campo, msg); ok = false; };
  if (!(original > 0)) erro('valor', 'Digite um valor maior que zero.');
  else if (original > VALOR_MAXIMO) erro('valor', `O valor máximo é ${valorMaximoTexto()}.`);
  else if (!(final > 0)) erro('desconto', 'O desconto não pode ser igual ou maior que o valor.');
  else if (final > VALOR_MAXIMO) erro('juros', `Com os juros, o valor passa do máximo (${valorMaximoTexto()}).`);
  if (!dados.descricao) erro('descricao', 'Escreva uma descrição curta, como "Conta de luz".');
  if (!dados.categoria_id) erro('categoria_id', 'Escolha uma categoria.');
  else if (erroDeTipo(dados.categoria_id, tipo)) erro('categoria_id', erroDeTipo(dados.categoria_id, tipo));
  if (!dados.conta_id) erro('conta_id', 'Escolha a conta.');
  if (!dados.vencimento) erro('vencimento', 'Escolha a data do vencimento.');
  if (form.competencia?.validity.badInput) erro('competencia', 'Data incompleta. Complete a data ou apague o campo.');
  if (!ok) {
    const invalido = form.querySelector('[aria-invalid]');
    invalido?.closest('details')?.setAttribute('open', '');
    invalido?.focus();
  }
  return ok ? dados : null;
}

// ---------- Pagamento dividido em mais de uma conta (ex.: parte em dinheiro, parte no Pix)
const linhaParte = (i, contaId) => `
  <div class="grid grid-cols-[1fr_auto] items-end gap-2 sm:grid-cols-[1fr_11rem_auto]" data-parte>
    <div data-campo class="col-span-2 sm:col-span-1">
      <label class="rotulo" for="f-parte_conta_${i}">${i + 1}ª conta</label>
      <select id="f-parte_conta_${i}" name="parte_conta_${i}" class="campo">${opcoesConta(contaId)}</select>
    </div>
    <div data-campo>
      <label class="rotulo" for="f-parte_valor_${i}">Quanto</label>
      <div class="relative">
        <span class="pointer-events-none absolute inset-y-0 left-3 flex items-center font-semibold text-stone-600 dark:text-stone-400" aria-hidden="true">R$</span>
        <input id="f-parte_valor_${i}" name="parte_valor_${i}" class="campo pl-10 tabular-nums" inputmode="numeric" autocomplete="off" placeholder="0,00">
      </div>
    </div>
    ${i > 1 ? `<button type="button" class="btn-neutro mb-px px-3" data-tirar-parte aria-label="Tirar a ${i + 1}ª conta">${icone('lixo')}</button>` : '<span></span>'}
  </div>`;

export const campoDividir = () => `
  <div class="grid gap-3" data-dividir-area>
    <label class="flex cursor-pointer items-start gap-3 rounded-xl border border-stone-200 p-3 has-checked:border-brand-500 has-checked:bg-brand-50 dark:border-stone-700 dark:has-checked:bg-brand-950">
      <input type="checkbox" name="dividir" class="mt-0.5 size-5 accent-brand-600">
      <span><span class="block font-semibold" data-texto-dividir>Paguei com mais de uma conta</span>
      <span class="block text-sm text-stone-600 dark:text-stone-400">Ex.: parte em dinheiro e parte no Pix. Cada parte entra no saldo da conta certa.</span></span>
    </label>
    <div class="grid gap-3 rounded-xl bg-stone-100 p-3 dark:bg-stone-800" data-partes hidden>
      <div class="grid gap-3" data-lista-partes></div>
      <div class="flex flex-wrap items-center justify-between gap-2">
        <button type="button" class="btn-sec" data-mais-parte>${icone('mais')} Mais uma conta</button>
        <p class="text-sm font-semibold tabular-nums" data-falta aria-live="polite"></p>
      </div>
    </div>
  </div>`;

const MAX_PARTES = 5;

/**
 * Liga o "Paguei com mais de uma conta". Retorna { ligado(), limpar() }.
 * `aoMudar(ligado)` é chamado quando a pessoa marca/desmarca (para a tela esconder o que não combina).
 */
export function ligarDividir(form, aoMudar = () => {}) {
  const area = form.querySelector('[data-partes]');
  const lista = form.querySelector('[data-lista-partes]');
  const falta = form.querySelector('[data-falta]');
  const campoConta = form.querySelector('[data-campo-conta]');
  const partes = () => [...lista.querySelectorAll('[data-parte]')];
  let indice = 0;

  const adicionar = (contaId) => {
    lista.insertAdjacentHTML('beforeend', linhaParte(indice, contaId));
    mascaraDinheiro(form[`parte_valor_${indice}`]);
    indice++;
    renumerar();
  };
  const renumerar = () => {
    partes().forEach((p, i) => (p.querySelector('label').textContent = `${i + 1}ª conta`));
    form.querySelector('[data-mais-parte]').hidden = partes().length >= MAX_PARTES;
  };
  const somaPartes = () => partes().reduce((s, p) => s + (lerValor(p.querySelector('input').value) || 0), 0);
  const atualizarFalta = () => {
    if (!form.dividir.checked) return;
    const total = lerValores(form).final;
    const diferenca = centavos(total) - centavos(somaPartes());
    falta.className = `text-sm font-semibold tabular-nums ${diferenca === 0 ? 'text-brand-700 dark:text-brand-400' : 'text-amber-800 dark:text-amber-300'}`;
    falta.textContent = !(total > 0) ? 'Digite o valor total lá em cima.'
      : diferenca === 0 ? `✓ Soma certa: ${brl(total)}`
      : diferenca > 0 ? `Falta dividir ${brl(diferenca / 100)}` : `Passou ${brl(-diferenca / 100)} do total`;
  };
  const trocar = () => {
    const ligado = form.dividir.checked;
    area.hidden = !ligado;
    if (campoConta) campoConta.hidden = ligado;
    if (ligado && !partes().length) {
      const contas = contasAtivas();
      adicionar(form.conta_id.value);
      adicionar(contas.find((c) => c.id !== form.conta_id.value)?.id ?? form.conta_id.value);
    }
    atualizarFalta();
    aoMudar(ligado);
  };

  form.addEventListener('change', (e) => e.target.name === 'dividir' && trocar());
  form.addEventListener('input', (e) => /^(valor|desconto|juros|parte_valor_\d+)$/.test(e.target.name) && atualizarFalta());
  // ao entrar no valor vazio da última conta, já preenche com o que falta
  form.addEventListener('focusin', (e) => {
    const p = e.target.closest?.('[data-parte]');
    if (!p || e.target.tagName !== 'INPUT' || e.target.value || p !== partes().at(-1)) return;
    const resta = centavos(lerValores(form).final) - centavos(somaPartes());
    if (resta > 0) {
      e.target.value = valorParaCampo(resta / 100);
      atualizarFalta();
    }
  });
  form.querySelector('[data-mais-parte]').onclick = () => { adicionar(contasAtivas()[0]?.id); form[`parte_valor_${indice - 1}`].focus(); };
  lista.addEventListener('click', (e) => {
    if (!e.target.closest('[data-tirar-parte]')) return;
    e.target.closest('[data-parte]').remove();
    renumerar();
    atualizarFalta();
  });

  return {
    ligado: () => form.dividir.checked,
    limpar() {
      form.dividir.checked = false;
      lista.innerHTML = '';
      trocar();
    },
    atualizarTexto(tipo) {
      form.querySelector('[data-texto-dividir]').textContent = tipo === 'entrada' ? 'Recebi em mais de uma conta' : 'Paguei com mais de uma conta';
    },
  };
}

/**
 * Lê as partes do pagamento dividido. Retorna [{ conta_id, valor }], ou null se houver erro (mostrado na tela).
 * A soma das partes precisa ser igual ao valor final.
 */
export function lerDivisao(form, total) {
  const linhas = [...form.querySelectorAll('[data-parte]')];
  let ok = true;
  const partes = linhas.map((p) => {
    const sel = p.querySelector('select');
    const inp = p.querySelector('input');
    const valor = lerValor(inp.value);
    if (!sel.value) { erroNoCampo(form, sel.name, 'Escolha a conta.'); ok = false; }
    if (!(valor > 0)) { erroNoCampo(form, inp.name, 'Digite quanto foi nesta conta.'); ok = false; }
    return { conta_id: sel.value, valor };
  });
  if (ok && new Set(partes.map((p) => p.conta_id)).size < partes.length) {
    erroNoCampo(form, linhas.at(-1).querySelector('select').name, 'Escolha contas diferentes (ou junte os valores na mesma conta).');
    ok = false;
  }
  if (ok && centavos(partes.reduce((s, p) => s + p.valor, 0)) !== centavos(total)) {
    const soma = partes.reduce((s, p) => s + p.valor, 0);
    erroNoCampo(form, linhas.at(-1).querySelector('input').name, `A soma das contas (${brl(soma)}) precisa ser igual ao valor${total ? ` final (${brl(total)})` : ''}.`);
    ok = false;
  }
  if (!ok) form.querySelector('[data-partes] [aria-invalid]')?.focus();
  return ok ? partes : null;
}
