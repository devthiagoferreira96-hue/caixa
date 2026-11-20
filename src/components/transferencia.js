// Transferência entre contas (saque, depósito, Pix de uma conta para outra).
// São dois lançamentos pagos e ligados pelo mesmo `transferencia`: uma saída na conta de origem e uma entrada
// na de destino. Mudam o saldo das contas, mas não contam como gasto nem como entrada (ver calculos.js).
import { esc, brl, hojeISO, lerValor, VALOR_MAXIMO, valorMaximoTexto } from '../lib/format.js';
import { contasAtivas, buscar } from '../lib/store.js';
import { icone, toast, dialogo, confirmar, mascaraDinheiro, erroNoCampo, limparErros, semRepetir } from '../lib/ui.js';
import { criarLancamentos, excluirLancamentos, atualizarSequencia, lancamentosDaTransferencia } from '../lib/api.js';
import { opcoesConta, campoValor, campoDescricao } from './form-lancamento.js';

const OPCIONAL = '<span class="font-normal text-stone-600 dark:text-stone-400">(opcional)</span>';
export const DESCRICAO_PADRAO = 'Transferência entre contas';
const nomeConta = (id) => buscar('contas', id)?.nome || 'outra conta';

// as últimas contas escolhidas voltam na próxima transferência
const lembrado = { de: null, para: null };

/** Campos de origem, destino, data e observação. `t` = { de, para, data, observacao } (edição) ou {}. */
export function camposTransferencia(t = {}) {
  const contas = contasAtivas();
  const de = t.de || (contas.some((c) => c.id === lembrado.de) ? lembrado.de : contas[0]?.id);
  const para = t.para || (contas.some((c) => c.id === lembrado.para) && lembrado.para !== de ? lembrado.para : contas.find((c) => c.id !== de)?.id);
  return `
    <div class="grid items-start gap-4 sm:grid-cols-[1fr_auto_1fr]">
      <div data-campo><label class="rotulo" for="f-transf-de">Sai de qual conta?</label>
        <select id="f-transf-de" name="transf_de" class="campo">${opcoesConta(de)}</select></div>
      <button type="button" class="btn-icone justify-self-center sm:mt-7" data-inverter aria-label="Trocar: a conta de origem vira a de destino" title="Trocar as contas">${icone('transferir')}</button>
      <div data-campo><label class="rotulo" for="f-transf-para">Vai para qual conta?</label>
        <select id="f-transf-para" name="transf_para" class="campo">${opcoesConta(para)}</select></div>
    </div>
    <div data-campo><label class="rotulo" for="f-transf-data">Data</label>
      <input id="f-transf-data" name="transf_data" type="date" class="campo sm:max-w-xs" value="${t.data || hojeISO()}">
      <p class="dica">Dia em que o dinheiro saiu de uma conta e entrou na outra.</p></div>
    <div data-campo><label class="rotulo" for="f-transf-obs">Observação ${OPCIONAL}</label>
      <input id="f-transf-obs" name="transf_obs" class="campo" maxlength="500" value="${esc(t.observacao || '')}"></div>
    <p class="rounded-xl bg-stone-100 p-3 text-sm text-stone-700 dark:bg-stone-800 dark:text-stone-300" data-transf-resumo aria-live="polite"></p>`;
}

/** Liga o botão de trocar as contas e o resumo ("R$ 200,00 saem de X e entram em Y"). Retorna `atualizar()`. */
export function ligarTransferencia(form) {
  const resumo = form.querySelector('[data-transf-resumo]');
  const atualizar = () => {
    const valor = lerValor(form.valor.value);
    const de = form.transf_de.value, para = form.transf_para.value;
    resumo.innerHTML = de && de === para
      ? 'Escolha duas contas diferentes.'
      : `${valor > 0 ? `<strong class="tabular-nums">${brl(valor)}</strong> saem` : 'O valor sai'} de <strong>${esc(nomeConta(de))}</strong> e ${valor > 0 ? 'entram' : 'entra'} em <strong>${esc(nomeConta(para))}</strong>. Não conta como gasto nem como entrada: só muda o saldo das duas contas.`;
  };
  form.querySelector('[data-inverter]').onclick = () => {
    [form.transf_de.value, form.transf_para.value] = [form.transf_para.value, form.transf_de.value];
    atualizar();
  };
  form.addEventListener('input', (e) => (e.target.name === 'valor' || e.target.name?.startsWith('transf_')) && atualizar());
  form.addEventListener('change', (e) => e.target.name?.startsWith('transf_') && atualizar());
  atualizar();
  return atualizar;
}

/** Lê e confere os campos. Retorna { valor, de, para, data, descricao, observacao } ou null (e mostra os erros). */
export function lerTransferencia(form) {
  const valor = lerValor(form.valor.value);
  const d = {
    valor, de: form.transf_de.value, para: form.transf_para.value, data: form.transf_data.value,
    descricao: form.descricao.value.trim() || DESCRICAO_PADRAO, observacao: form.transf_obs.value.trim() || null,
  };
  let ok = true;
  const erro = (campo, msg) => { erroNoCampo(form, campo, msg); ok = false; };
  if (!(valor > 0)) erro('valor', 'Digite quanto foi transferido.');
  else if (valor > VALOR_MAXIMO) erro('valor', `O valor máximo é ${valorMaximoTexto()}.`);
  if (!d.de) erro('transf_de', 'Escolha de qual conta saiu.');
  if (!d.para) erro('transf_para', 'Escolha para qual conta foi.');
  else if (d.de === d.para) erro('transf_para', 'Escolha uma conta diferente da de origem.');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d.data)) erro('transf_data', 'Escolha a data.');
  if (!ok) form.querySelector('[aria-invalid]')?.focus();
  return ok ? d : null;
}

/** Valores das duas pontas: [saída na origem, entrada no destino] */
function pontas(d, pago = true) {
  const comum = {
    valor: d.valor, descricao: d.descricao, observacao: d.observacao, vencimento: d.data, pago, data_pagamento: pago ? d.data : null,
    categoria_id: null, pessoa_id: null, competencia: null, valor_original: null, desconto: null, juros: null,
  };
  return [
    { ...comum, tipo: 'saida', conta_id: d.de, transferencia_conta_id: d.para },
    { ...comum, tipo: 'entrada', conta_id: d.para, transferencia_conta_id: d.de },
  ];
}

export const textoTransferencia = (d) => `${brl(d.valor)} de ${nomeConta(d.de)} para ${nomeConta(d.para)}`;

/** Cria a transferência. Retorna { ids, mensagem }. */
export async function criarTransferencia(d) {
  const transferencia = crypto.randomUUID();
  const salvos = await criarLancamentos(pontas(d).map((p) => ({ ...p, transferencia })));
  lembrado.de = d.de; lembrado.para = d.para;
  return { ids: salvos.map((s) => s.id), mensagem: `Transferência salva: ${textoTransferencia(d)}` };
}

/** As duas pontas da transferência deste lançamento: { saida, entrada, todas } */
async function pontasSalvas(l) {
  const todas = await lancamentosDaTransferencia(l.transferencia);
  if (!todas.some((x) => x.id === l.id)) todas.push(l);
  return { saida: todas.find((x) => x.tipo === 'saida'), entrada: todas.find((x) => x.tipo === 'entrada'), todas };
}

/** Marca (ou desmarca) as duas pontas como feitas. Retorna `desfazer()`. */
export async function alternarTransferenciaFeita(l) {
  const { todas } = await pontasSalvas(l);
  const pago = !l.pago;
  return atualizarSequencia(todas.map((x) => ({ id: x.id, valores: { pago, data_pagamento: pago ? (x.data_pagamento || x.vencimento || hojeISO()) : null } })));
}

/** Abre a transferência para mudar ou excluir (as duas pontas juntas). `desfazendo` vem de lancamento.js. */
export async function abrirTransferencia(l, atualizar, desfazendo) {
  const { saida, entrada, todas } = await pontasSalvas(l);
  const t = {
    valor: Number(l.valor), descricao: l.descricao === DESCRICAO_PADRAO ? '' : l.descricao, observacao: l.observacao,
    data: l.vencimento, de: saida?.conta_id || l.transferencia_conta_id, para: entrada?.conta_id || l.transferencia_conta_id,
  };
  const d = dialogo({
    titulo: 'Transferência entre contas',
    corpo: `
      <form class="grid gap-4" novalidate>
        ${campoValor(t.valor)}
        ${campoDescricao(t.descricao, 'Ex.: Saque, Pix para a poupança')}
        ${camposTransferencia(t)}
        <div class="mt-2 flex flex-col-reverse gap-2 sm:flex-row sm:justify-between">
          <button type="button" class="btn-neutro text-red-700 dark:text-red-400" data-excluir>${icone('lixo')} Excluir</button>
          <button type="submit" class="btn-primario">${icone('check')} Salvar alterações</button>
        </div>
      </form>`,
  });
  const form = d.querySelector('form');
  form.querySelector('label[for="f-descricao"]').innerHTML = `Descrição ${OPCIONAL}`;
  mascaraDinheiro(form.valor);
  ligarTransferencia(form);

  d.querySelector('[data-excluir]').onclick = async () => {
    d.close();
    if (!(await confirmar(`A transferência de ${textoTransferencia(t)} será excluída (a saída e a entrada).`, { botao: 'Excluir', perigo: true }))) return;
    try {
      const desfazer = await excluirLancamentos(todas.map((x) => x.id));
      toast('Transferência excluída', { acao: desfazendo(desfazer, atualizar) });
      atualizar();
    } catch (err) { toast(err.message, { tipo: 'erro' }); }
  };

  form.onsubmit = semRepetir(async (e) => {
    e.preventDefault();
    limparErros(form);
    const novo = lerTransferencia(form);
    if (!novo) return;
    const botao = form.querySelector('[type=submit]');
    botao.disabled = true;
    try {
      // feita ou não continua como estava; a data de pagamento acompanha a data escolhida
      const [vSaida, vEntrada] = pontas(novo, l.pago);
      const mudancas = [saida && { id: saida.id, valores: vSaida }, entrada && { id: entrada.id, valores: vEntrada }].filter(Boolean);
      let desfazer = await atualizarSequencia(mudancas);
      // se faltava uma das pontas (dado antigo ou importado pela metade), ela é refeita
      const falta = [!saida && vSaida, !entrada && vEntrada].filter(Boolean);
      if (falta.length) {
        const criados = await criarLancamentos(falta.map((p) => ({ ...p, transferencia: l.transferencia })));
        const voltar = desfazer;
        desfazer = async () => { await excluirLancamentos(criados.map((x) => x.id)); await voltar(); };
      }
      d.close();
      toast(`Transferência atualizada: ${textoTransferencia(novo)}`, { acao: desfazendo(desfazer, atualizar) });
      atualizar();
    } catch (err) {
      toast(err.message, { tipo: 'erro' });
      botao.disabled = false;
    }
  });
}
