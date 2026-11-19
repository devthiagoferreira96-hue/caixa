// Editar uma compra do cartão (à vista, parcelada, assinatura ou reembolso), como na edição dos lançamentos do caixa
import { brl, esc, lerValor, nomeMes, parseISO, dataCompleta, valorParaCampo, VALOR_MAXIMO, valorMaximoTexto } from '../lib/format.js';
import { store, cartoesAtivos, buscar } from '../lib/store.js';
import { atualizarCompra, pessoaPorNome, parcelasDaCompraSalvas } from '../lib/api.js';
import { faturaDe, vencimentoFatura, dividirParcelas, parcelasDaCompra } from '../lib/faturas.js';
import { icone, toast, dialogo, mascaraDinheiro, erroNoCampo, limparErros, semRepetir } from '../lib/ui.js';
import { campoValor, campoDescricao, campoCategoria, erroDeTipo } from './form-lancamento.js';
import { desfazendo, rodapeDatas } from './lancamento.js';

const MAX_PARCELAS = 420;

/**
 * Pergunta se o valor novo vale só para esta parcela/cobrança ou também para as próximas.
 * Retorna 'um', 'todos' ou '' (cancelou).
 */
function perguntarAlcance(assinatura, este) {
  return new Promise((resolver) => {
    const j = dialogo({
      titulo: assinatura ? 'Esta assinatura se repete' : 'Esta compra é parcelada',
      largura: 'max-w-sm',
      corpo: `<p class="text-stone-600 dark:text-stone-300">Quer mudar o valor só ${esc(este)} ou também ${assinatura ? 'nas próximas cobranças' : 'nas próximas parcelas'}?</p>
        <p class="mt-2 text-sm text-stone-600 dark:text-stone-400">Descrição, categoria, subcategoria e pessoa mudam na compra inteira.</p>
        <div class="mt-5 grid gap-2">
          <button class="btn-primario" data-r="todos">${assinatura ? 'Esta e as próximas cobranças' : 'Esta e as próximas parcelas'}</button>
          <button class="btn-neutro" data-r="um">Só ${esc(este)}</button>
          <button class="btn-sec" data-r="">Cancelar</button>
        </div>`,
    });
    let r = '';
    j.addEventListener('click', (ev) => { const b = ev.target.closest('[data-r]'); if (b) { r = b.dataset.r; j.close(); } });
    j.addEventListener('close', () => resolver(r));
  });
}

/**
 * Abre a compra da parcela `p` (com `p.compra`) para editar.
 * `aoExcluir()` abre a exclusão (com a escolha de parcelas) da tela Cartões.
 */
export function abrirEdicaoCompra(p, atualizar, { aoExcluir } = {}) {
  const c = p.compra;
  const estorno = c.tipo === 'estorno';
  const assinatura = c.recorrente === true || Boolean(c.recorrente_base);
  const anual = Number(c.recorrente_intervalo) === 12;
  const mesDaCobranca = nomeMes(parseISO(p.fatura_mes)).toLowerCase();
  const cartoes = cartoesAtivos().some((x) => x.id === c.cartao_id) ? cartoesAtivos() : [buscar('cartoes', c.cartao_id), ...cartoesAtivos()].filter(Boolean);
  const titulo = estorno ? 'Editar reembolso' : assinatura ? 'Editar assinatura' : 'Editar compra no cartão';
  const parcelada = !estorno && !assinatura && Number(c.qtd_parcelas) > 1;

  const d = dialogo({
    titulo,
    corpo: `
      <form class="grid gap-4" novalidate>
        ${c.resina_entrega_id ? `<p class="rounded-xl bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:bg-amber-900/30 dark:text-amber-100">${icone('alerta', 'mr-1 inline size-4 align-[-3px]')}Esta compra veio da Resina (compra de <a href="#insumos" class="font-semibold underline">Insumos</a>). Se mudar lá, ela é refeita aqui. Mudanças feitas só aqui não voltam para a Resina.</p>` : ''}
        ${campoValor(assinatura ? Number(p.valor) : Number(c.valor_total), estorno ? 'Valor do reembolso' : assinatura ? `Valor ${anual ? 'por ano' : 'por mês'}` : 'Valor total da compra')}
        ${campoDescricao(c.descricao, estorno ? 'Ex.: Estorno da compra da loja X' : 'Ex.: Supermercado')}
        ${campoCategoria(c.categoria_id, 'cartao')}
        ${assinatura ? `<p class="rounded-xl bg-stone-100 px-3 py-2 text-sm text-stone-700 dark:bg-stone-800 dark:text-stone-300">${icone('calendario', 'mr-1 inline size-4 align-[-3px]')}Assinatura ${anual ? 'anual' : 'mensal'} no ${esc(buscar('cartoes', c.cartao_id)?.nome || 'cartão')}. Ao mudar o valor, você escolhe se vale só para a cobrança de <strong>${esc(mesDaCobranca)}</strong> ou também para as próximas. As anteriores continuam como estão.</p>` : `
        <div class="grid gap-4 sm:grid-cols-2">
          <div data-campo><label class="rotulo" for="e-cartao">Cartão</label>
            <select id="e-cartao" name="cartao_id" class="campo">${cartoes.map((x) => `<option value="${x.id}" ${x.id === c.cartao_id ? 'selected' : ''}>${esc(x.nome)}</option>`).join('')}</select></div>
          <div data-campo><label class="rotulo" for="e-data">${estorno ? 'Data do reembolso' : 'Data da compra'}</label>
            <input id="e-data" name="data_compra" type="date" class="campo" value="${esc(c.data_compra)}"></div>
        </div>`}
        ${estorno ? '' : `<div class="grid gap-4 sm:grid-cols-2">
          ${assinatura ? '' : `<div data-campo><label class="rotulo" for="e-parcelas">Parcelas</label>
            <input id="e-parcelas" name="parcelas" type="number" inputmode="numeric" min="1" max="${MAX_PARCELAS}" step="1" class="campo tabular-nums" value="${Number(c.qtd_parcelas) || 1}">
            <p class="dica">1 = à vista.</p></div>`}
          ${parcelada ? `<div data-campo class="sm:col-span-2"><label class="rotulo" for="e-vparcela">Valor desta parcela (${Number(p.numero)}/${Number(c.qtd_parcelas)})</label>
            <input id="e-vparcela" name="valor_parcela" class="campo tabular-nums" inputmode="numeric" value="${valorParaCampo(Number(p.valor))}" aria-describedby="dica-vparcela">
            <p id="dica-vparcela" class="dica">Para uma parcela com valor diferente. Ao salvar, você escolhe se vale só para esta ou também para as próximas.</p></div>` : ''}
          <div data-campo><label class="rotulo" for="e-sub">Subcategoria <span class="font-normal text-stone-600 dark:text-stone-400">(opcional)</span></label>
            <input id="e-sub" name="subcategoria" class="campo" maxlength="60" value="${esc(c.subcategoria || '')}" placeholder="Ex.: Eletrodoméstico"></div>
        </div>
        <div data-campo>
          <label class="rotulo" for="e-pessoa">Pessoa <span class="font-normal text-stone-600 dark:text-stone-400">(opcional)</span></label>
          <input id="e-pessoa" name="pessoa" class="campo" list="e-lista-pessoas" autocomplete="off" placeholder="Quem comprou ou para quem foi" value="${esc(buscar('pessoas', c.pessoa_id)?.nome || '')}">
          <datalist id="e-lista-pessoas">${store.pessoas.map((x) => `<option value="${esc(x.nome)}"></option>`).join('')}</datalist>
        </div>`}
        ${assinatura ? '' : '<div class="rounded-xl bg-stone-100 p-3 text-sm dark:bg-stone-800" aria-live="polite" data-previa></div>'}
        ${rodapeDatas(c)}
        <div class="mt-2 flex flex-col-reverse gap-2 sm:flex-row sm:justify-between">
          ${aoExcluir ? `<button type="button" class="btn-neutro text-red-700 dark:text-red-400" data-excluir>${icone('lixo')} Excluir</button>` : '<span></span>'}
          <button type="submit" class="btn-primario">${icone('check')} Salvar alterações</button>
        </div>
      </form>`,
  });
  const form = d.querySelector('form');
  mascaraDinheiro(form.valor);
  if (form.valor_parcela) mascaraDinheiro(form.valor_parcela);

  const qtd = () => (estorno ? 1 : Number(form.parcelas.value));
  const previa = () => {
    const area = form.querySelector('[data-previa]');
    if (!area) return;
    const cartao = buscar('cartoes', form.cartao_id.value);
    const data = form.data_compra.value;
    const total = lerValor(form.valor.value) || 0;
    const n = qtd();
    if (!cartao || !data || !(Number.isInteger(n) && n >= 1 && n <= MAX_PARCELAS)) { area.textContent = ''; return; }
    const primeira = faturaDe(cartao, data, 0);
    const ultima = faturaDe(cartao, data, n - 1);
    area.innerHTML = `<p class="flex items-start gap-2"><span class="mt-0.5 shrink-0 text-brand-700 dark:text-brand-400">${icone('calendario')}</span><span>
      ${estorno ? 'O reembolso abate a' : n > 1 ? 'A 1ª parcela entra na' : 'Entra na'} fatura de <strong>${nomeMes(parseISO(primeira))}</strong>, que vence em <strong>${dataCompleta(vencimentoFatura(cartao, primeira))}</strong>.
      ${n > 1 ? `<br>${n} parcelas de <strong>${brl(dividirParcelas(total, n)[0])}</strong>, até <strong>${nomeMes(parseISO(ultima))}</strong>.` : ''}</span></p>`;
  };
  previa();
  form.addEventListener('input', previa);
  form.addEventListener('change', previa);
  d.querySelector('[data-excluir]')?.addEventListener('click', () => { d.close(); aoExcluir(); });

  form.onsubmit = semRepetir(async (e) => {
    e.preventDefault();
    limparErros(form);
    const total = lerValor(form.valor.value);
    const descricao = form.descricao.value.trim();
    const categoria_id = form.categoria_id.value || null;
    let ok = true;
    if (!(total > 0)) { erroNoCampo(form, 'valor', 'Digite o valor.'); ok = false; }
    else if (total > VALOR_MAXIMO) { erroNoCampo(form, 'valor', `O valor máximo é ${valorMaximoTexto()}.`); ok = false; }
    if (!descricao) { erroNoCampo(form, 'descricao', estorno ? 'Escreva o que foi reembolsado.' : 'Escreva o que foi comprado.'); ok = false; }
    if (!categoria_id) { erroNoCampo(form, 'categoria_id', 'Escolha uma categoria.'); ok = false; }
    else if (erroDeTipo(categoria_id, 'cartao')) { erroNoCampo(form, 'categoria_id', erroDeTipo(categoria_id, 'cartao')); ok = false; }
    if (!assinatura && !form.data_compra.value) { erroNoCampo(form, 'data_compra', 'Escolha a data.'); ok = false; }
    if (!assinatura && !estorno && !(Number.isInteger(qtd()) && qtd() >= 1 && qtd() <= MAX_PARCELAS)) { erroNoCampo(form, 'parcelas', `Digite de 1 a ${MAX_PARCELAS} parcelas.`); ok = false; }
    const valorParcela = parcelada ? lerValor(form.valor_parcela.value) : null;
    const mudouValorParcela = parcelada && Math.abs((valorParcela || 0) - Number(p.valor)) > 0.004;
    if (mudouValorParcela && !(valorParcela > 0)) { erroNoCampo(form, 'valor_parcela', 'Digite o valor da parcela.'); ok = false; }
    if (ok && mudouValorParcela && (Math.abs(total - Number(c.valor_total)) > 0.004 || qtd() !== Number(c.qtd_parcelas)
      || form.cartao_id.value !== c.cartao_id || form.data_compra.value !== c.data_compra)) {
      erroNoCampo(form, 'valor_parcela', 'Mudou também o total, as parcelas, o cartão ou a data. Salve uma coisa de cada vez: primeiro deixe esta parcela como estava.');
      ok = false;
    }
    if (!ok) { form.querySelector('[aria-invalid]')?.focus(); return; }
    // valor novo numa assinatura ou numa parcela: só esta ou esta e as próximas?
    const mudouAssinatura = assinatura && Math.abs(total - Number(p.valor)) > 0.004;
    let alcance = '';
    if (mudouAssinatura || mudouValorParcela) {
      alcance = await perguntarAlcance(assinatura, assinatura ? `na cobrança de ${mesDaCobranca}` : `nesta parcela (${p.numero}/${c.qtd_parcelas})`);
      if (!alcance) return;
    }

    const botao = form.querySelector('[type=submit]');
    botao.disabled = true;
    try {
      const valores = { descricao, categoria_id };
      if (!estorno) {
        valores.subcategoria = form.subcategoria.value.trim() || null;
        valores.pessoa_id = await pessoaPorNome(form.pessoa.value || '');
      }
      let opcoes = {};
      if (assinatura) {
        if (mudouAssinatura && alcance === 'um') opcoes = { valoresDasParcelas: [{ id: p.id, valor: total }] }; // as próximas seguem o valor de sempre
        else {
          valores.valor_total = total;
          if (mudouAssinatura) opcoes = { valorDesde: { mes: p.fatura_mes, valor: total } };
        }
      } else if (mudouValorParcela) {
        // só esta parcela, ou esta e as próximas; o total da compra passa a ser a soma das parcelas
        const salvas = await parcelasDaCompraSalvas(c.id);
        const mudar = salvas.filter((x) => (alcance === 'um' ? x.id === p.id : Number(x.numero) >= Number(p.numero)));
        opcoes = { valoresDasParcelas: mudar.map((x) => ({ id: x.id, valor: valorParcela })) };
        const novos = new Set(mudar.map((x) => x.id));
        valores.valor_total = Math.round(salvas.reduce((s, x) => s + (novos.has(x.id) ? valorParcela : Number(x.valor)), 0) * 100) / 100;
      } else {
        Object.assign(valores, { valor_total: total, qtd_parcelas: qtd(), cartao_id: form.cartao_id.value, data_compra: form.data_compra.value });
        const mudouParcelas = Math.abs(total - Number(c.valor_total)) > 0.004 || qtd() !== Number(c.qtd_parcelas)
          || valores.cartao_id !== c.cartao_id || valores.data_compra !== c.data_compra;
        if (mudouParcelas) {
          // mesma quantidade de parcelas: não traz de volta uma parcela que tinha sido excluída
          const existentes = qtd() === Number(c.qtd_parcelas) ? new Set((await parcelasDaCompraSalvas(c.id)).map((x) => x.numero)) : null;
          const novas = parcelasDaCompra(buscar('cartoes', valores.cartao_id), { ...c, ...valores }, existentes);
          if (novas.length) opcoes = { parcelas: novas };
        }
      }
      const desfazer = await atualizarCompra(c.id, valores, opcoes);
      d.close();
      toast(`Alterações em “${descricao}” salvas`, { acao: desfazendo(desfazer, atualizar) });
      atualizar();
    } catch (err) {
      toast(err.message, { tipo: 'erro' });
      botao.disabled = false;
    }
  });
}
