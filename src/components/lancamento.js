// Uma linha de lançamento (usada no Início e no Extrato) + edição/exclusão
import { esc, brl, diaMes, dataCompleta, diasAte, quandoVence, hojeISO } from '../lib/format.js';
import { buscar } from '../lib/store.js';
import { icone, toast, dialogo, confirmar, mascaraDinheiro, limparErros, semRepetir } from '../lib/ui.js';
import { atualizarLancamento, atualizarSequencia, criarLancamentos, excluirLancamentos, lancamentosDoGrupo, lancamentosDaDivisao, pessoaPorNome, pararRecorrencia } from '../lib/api.js';
import { passoDe, nomesDoPasso, mudancasNaSequencia } from '../lib/recorrencia.js';
import { campoValor, campoDescricao, campoCategoria, camposCaixa, lerCamposCaixa, ligarCamposCaixa, atualizarCategorias } from './form-lancamento.js';
import { abrirTransferencia, alternarTransferenciaFeita } from './transferencia.js';

/** Botão "Desfazer" padrão dos avisos: desfaz, avisa e redesenha a tela */
export const desfazendo = (desfazer, atualizar) => ({
  texto: 'Desfazer',
  fn: async () => {
    try {
      await desfazer();
      toast('Desfeito');
      atualizar?.();
    } catch (e) {
      toast(e.message, { tipo: 'erro' });
    }
  },
});

function situacao(l) {
  const entrada = l.tipo === 'entrada';
  if (l.transferencia) return l.pago ? ['selo-ok', 'Feita'] : diasAte(l.vencimento) < 0 ? ['selo-atraso', 'Atrasada'] : ['selo-aberto', 'Agendada'];
  if (l.pago) return ['selo-ok', entrada ? 'Recebido' : 'Pago'];
  if (diasAte(l.vencimento) < 0) return ['selo-atraso', 'Atrasado'];
  return ['selo-aberto', entrada ? 'A receber' : 'A pagar'];
}

/** `selecao`: undefined = sem caixinha; true/false = mostra a caixinha de "selecionar para somar" (marcada ou não) */
export function itemLancamento(l, { mostrarPrazo = false, selecao } = {}) {
  const entrada = l.tipo === 'entrada';
  const [classeSelo, textoSelo] = situacao(l);
  const detalhes = l.virtual === 'fatura' ? [
    'Fatura do cartão',
    l.adiantado > 0 && `total ${brl(l.total)}, já adiantado ${brl(l.adiantado)}`,
  ].filter(Boolean) : l.transferencia ? [
    `Transferência ${entrada ? 'de' : 'para'} ${buscar('contas', l.transferencia_conta_id)?.nome || 'outra conta'}`,
    buscar('contas', l.conta_id)?.nome,
  ].filter(Boolean) : [
    l.fatura_cartao_id ? (l.adiantamento ? 'Adiantamento de fatura' : 'Pagamento de fatura') : buscar('categorias', l.categoria_id)?.nome,
    buscar('contas', l.conta_id)?.nome,
    buscar('pessoas', l.pessoa_id)?.nome,
    l.parcela && `parcela ${l.parcela}`,
    l.recorrente && nomesDoPasso(passoDe(l)).todo,
    l.divisao && 'pagamento dividido',
    (l.resina_movimento_id || l.resina_entrega_id || l.resina_receber_id) && 'veio da Resina',
    l.competencia && l.competencia !== l.vencimento && `competência ${dataCompleta(l.competencia)}`,
    l.pago && l.data_pagamento && l.data_pagamento !== l.vencimento && `${entrada ? 'recebido' : 'pago'} em ${diaMes(l.data_pagamento)}`,
    Number(l.desconto) > 0 && `desconto ${brl(l.desconto)}`,
    Number(l.juros) > 0 && `juros ${brl(l.juros)}`,
  ].filter(Boolean);
  const verbo = l.transferencia ? 'feita' : entrada ? 'recebido' : 'pago';
  const corValor = l.transferencia ? 'text-stone-700 dark:text-stone-300' : entrada ? 'valor-entrada' : 'valor-saida';
  return `
  <li class="@container border-t border-stone-100 py-3 first:border-t-0 dark:border-stone-800 ${selecao ? 'bg-brand-50/70 dark:bg-brand-950/40' : ''}">
   <div class="flex flex-wrap items-center gap-x-1 gap-y-1">
    ${selecao === undefined ? '' : `<label class="flex size-9 shrink-0 cursor-pointer items-center justify-center" title="Selecionar para somar">
      <input type="checkbox" data-sel="${l.id}" class="size-5 cursor-pointer accent-brand-600" ${selecao ? 'checked' : ''}>
      <span class="sr-only">Selecionar “${esc(l.descricao)}” (${brl(l.valor)}) para somar</span></label>`}
    <button type="button" data-pagar="${l.id}" class="check ${l.pago ? 'ligado' : ''}" aria-pressed="${l.pago}"
      aria-label="${l.pago ? `Desmarcar “${esc(l.descricao)}” como ${verbo}` : `Marcar “${esc(l.descricao)}” como ${verbo}`}"
      title="${l.pago ? 'Desmarcar' : `Marcar como ${verbo}`}">${l.pago ? icone('check', 'size-4') : ''}</button>
    <button type="button" data-editar="${l.id}" class="min-w-[42%] flex-1 cursor-pointer rounded-lg px-2 py-1 text-left transition hover:bg-stone-50 dark:hover:bg-stone-800/60"
      aria-label="${l.virtual === 'fatura' ? `Ver a “${esc(l.descricao)}” na tela Cartões` : `Abrir “${esc(l.descricao)}” para ver ou editar`}">
      <span class="line-clamp-2 font-medium">${esc(l.descricao)}</span>
      <span class="line-clamp-2 text-sm text-stone-600 dark:text-stone-400">${l.pago && l.data_pagamento && l.data_pagamento !== l.vencimento ? 'vence ' : ''}${diaMes(l.vencimento)}${mostrarPrazo && !l.pago ? ` · ${quandoVence(l.vencimento)}` : ''} · ${detalhes.map(esc).join(' · ')}</span>
      ${l.observacao ? `<span class="line-clamp-1 text-sm italic text-stone-600 dark:text-stone-400" title="${esc(l.observacao)}">Obs.: ${esc(l.observacao)}</span>` : ''}
    </button>
    <div class="text-right @max-[15.5rem]:flex @max-[15.5rem]:basis-full @max-[15.5rem]:flex-wrap @max-[15.5rem]:items-center @max-[15.5rem]:gap-2 @max-[15.5rem]:pl-12 @max-[15.5rem]:text-left">
      <span class="block text-sm font-semibold tabular-nums sm:text-base ${corValor}">${l.transferencia ? `<span class="sr-only">Transferência: </span>${icone('transferir', 'mr-1 inline size-4 align-[-2px] text-stone-500')}` : ''}${entrada ? '+' : '−'} ${brl(l.valor)}</span>
      <span class="selo ${classeSelo}">${textoSelo}</span>
    </div>
   </div>
  </li>`;
}

const quando = (iso) => {
  const d = new Date(iso);
  const hojeStr = new Date().toDateString();
  const dia = d.toDateString() === hojeStr ? 'hoje' : `em ${d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })}`;
  return `${dia} às ${d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`;
};

/** "Lançado hoje às 12:31 · Alterado em 05/11 às 08:02" */
export function rodapeDatas(item) {
  const linhas = [];
  if (item.criado_em) linhas.push(['calendario', `Lançado ${quando(item.criado_em)}`]);
  if (item.alterado_em) linhas.push(['editar', `Alterado ${quando(item.alterado_em)}`]);
  if (!linhas.length) return '';
  return `<div class="grid gap-1 rounded-xl bg-stone-100 p-3 text-sm text-stone-600 dark:bg-stone-800 dark:text-stone-400">${linhas
    .map(([ic, t]) => `<p class="flex items-center gap-2">${icone(ic, 'size-4')}<span>${t}</span></p>`).join('')}</div>`;
}

/**
 * Trata cliques nas linhas de lançamento. Retorna true se o clique foi tratado.
 * `lista` = lançamentos que estão na tela; `atualizar` = recarrega a tela.
 */
export async function cliqueEmLancamento(e, lista, atualizar) {
  const botaoPagar = e.target.closest('[data-pagar]');
  if (botaoPagar) {
    const l = lista.find((x) => x.id === botaoPagar.dataset.pagar);
    botaoPagar.disabled = true;
    const pago = !l.pago;
    try {
      // transferência: as duas pontas (saída e entrada) mudam juntas
      const desfazer = l.transferencia ? await alternarTransferenciaFeita(l)
        : (await atualizarLancamento(l.id, { pago, data_pagamento: pago ? hojeISO() : null })).desfazer;
      const verbo = l.transferencia ? 'feita' : l.tipo === 'entrada' ? 'recebido' : 'pago';
      toast(pago ? `“${l.descricao}” marcad${l.transferencia ? 'a' : 'o'} como ${verbo}` : `“${l.descricao}” voltou para em aberto`, {
        acao: desfazendo(desfazer, atualizar),
      });
      atualizar();
    } catch (err) {
      toast(err.message, { tipo: 'erro' });
      botaoPagar.disabled = false;
    }
    return true;
  }
  const botaoEditar = e.target.closest('[data-editar]');
  if (botaoEditar) {
    abrirEdicao(lista.find((x) => x.id === botaoEditar.dataset.editar), atualizar);
    return true;
  }
  return false;
}

/** Pergunta se a mudança vale só para este lançamento da sequência ou também para os próximos. Retorna 'um', 'todos' ou '' (cancelou) */
function perguntarAlcance(l) {
  const este = l.parcela ? `esta parcela (${l.parcela})` : nomesDoPasso(passoDe(l)).esta;
  return new Promise((resolver) => {
    const j = dialogo({
      titulo: l.parcela ? 'Este lançamento é parcelado' : 'Este lançamento se repete',
      largura: 'max-w-sm',
      corpo: `<p class="text-stone-600 dark:text-stone-300">Quer salvar a mudança só em ${esc(este)} ou também nos próximos?</p>
        <p class="mt-2 text-sm text-stone-600 dark:text-stone-400">Nos próximos mudam descrição, valor, categoria, conta, pessoa, observação e as datas (cada um no seu mês ou semana). O que já foi pago continua como está.</p>
        <div class="mt-5 grid gap-2">
          <button class="btn-primario" data-r="todos">Este e os próximos</button>
          <button class="btn-neutro" data-r="um">Só este</button>
          <button class="btn-sec" data-r="">Cancelar</button>
        </div>`,
    });
    let r = '';
    j.addEventListener('click', (ev) => { const b = ev.target.closest('[data-r]'); if (b) { r = b.dataset.r; j.close(); } });
    j.addEventListener('close', () => resolver(r));
  });
}

async function excluir(l, atualizar, d) {
  let ids = [l.id];
  let todos = false;
  if (l.grupo) {
    const escolha = await new Promise((resolver) => {
      const j = dialogo({
        titulo: 'Este lançamento se repete',
        largura: 'max-w-sm',
        corpo: `<p class="text-stone-600 dark:text-stone-300">Quer excluir só ${l.parcela ? 'esta parcela' : nomesDoPasso(passoDe(l)).esta} ou este e os próximos?${l.recorrente ? ' "Este e os próximos" também para a repetição: o sistema não lança mais.' : ''}</p>
          <div class="mt-5 grid gap-2">
            <button class="btn-perigo" data-r="todos">Este e os próximos</button>
            <button class="btn-neutro" data-r="um">Só este</button>
            <button class="btn-sec" data-r="">Cancelar</button>
          </div>`,
      });
      let r = '';
      j.addEventListener('click', (ev) => { const b = ev.target.closest('[data-r]'); if (b) { r = b.dataset.r; j.close(); } });
      j.addEventListener('close', () => resolver(r));
    });
    if (!escolha) return;
    todos = escolha === 'todos';
    if (todos) ids = (await lancamentosDoGrupo(l.grupo, l.vencimento)).map((x) => x.id);
  } else if (l.divisao) {
    const partes = await lancamentosDaDivisao(l.divisao);
    const escolha = partes.length < 2 ? 'um' : await new Promise((resolver) => {
      const j = dialogo({
        titulo: 'Pagamento dividido',
        largura: 'max-w-sm',
        corpo: `<p class="text-stone-600 dark:text-stone-300">“${esc(l.descricao)}” foi dividido entre ${partes.length} contas. Quer excluir todas as partes ou só esta (${brl(l.valor)} em ${esc(buscar('contas', l.conta_id)?.nome || 'conta')})?</p>
          <div class="mt-5 grid gap-2">
            <button class="btn-perigo" data-r="todos">Todas as partes (${brl(partes.reduce((s, x) => s + Number(x.valor), 0))})</button>
            <button class="btn-neutro" data-r="um">Só esta parte</button>
            <button class="btn-sec" data-r="">Cancelar</button>
          </div>`,
      });
      let r = '';
      j.addEventListener('click', (ev) => { const b = ev.target.closest('[data-r]'); if (b) { r = b.dataset.r; j.close(); } });
      j.addEventListener('close', () => resolver(r));
    });
    if (!escolha) return;
    if (escolha === 'todos') ids = partes.map((x) => x.id);
    else if (partes.length < 2 && !(await confirmar(`“${l.descricao}” será excluído.`, { botao: 'Excluir', perigo: true }))) return;
  } else if (!(await confirmar(`“${l.descricao}” será excluído.`, { botao: 'Excluir', perigo: true }))) {
    return;
  }
  try {
    let desfazer = await excluirLancamentos(ids);
    // "este e os próximos" numa repetição "sempre": encerra a repetição (os meses que ficaram não voltam a se repetir)
    if (todos && l.recorrente) {
      const voltarExcluidos = desfazer;
      const voltarRepeticao = await pararRecorrencia(l.grupo);
      desfazer = async () => { await voltarExcluidos(); await voltarRepeticao(); };
    }
    d?.close();
    toast(ids.length > 1 ? `${ids.length} lançamentos excluídos` : `“${l.descricao}” excluído`, { acao: desfazendo(desfazer, atualizar) });
    atualizar();
  } catch (err) {
    toast(err.message, { tipo: 'erro' });
  }
}

/**
 * Abre o lançamento para editar. Com `duplicar`, abre uma cópia dele (sem repetição, parcela nem pagamento)
 * para a pessoa mudar o que precisar: ao salvar, cria um lançamento novo e o original fica como está.
 */
export function abrirEdicao(l, atualizar, { duplicar = false } = {}) {
  const original = l;
  if (l.transferencia) {
    abrirTransferencia(l, atualizar, desfazendo).catch((err) => toast(err.message, { tipo: 'erro' }));
    return;
  }
  if (duplicar) {
    l = {
      tipo: l.tipo, valor: l.valor, valor_original: l.valor_original, desconto: l.desconto, juros: l.juros,
      descricao: l.descricao, categoria_id: l.categoria_id, conta_id: l.conta_id, pessoa_id: l.pessoa_id,
      vencimento: l.vencimento, competencia: l.competencia, observacao: l.observacao, pago: false, data_pagamento: null,
    };
  }
  if (!duplicar && l.fatura_cartao_id) {
    confirmar(`Este é o pagamento da fatura (${brl(l.valor)}). Quer desfazer o pagamento? A fatura volta a ficar em aberto.`, {
      titulo: l.descricao, botao: 'Desfazer pagamento', perigo: true,
    }).then(async (sim) => {
      if (!sim) return;
      const desfazer = await excluirLancamentos([l.id]);
      toast('Pagamento da fatura desfeito', { acao: desfazendo(desfazer, atualizar) });
      atualizar();
    });
    return;
  }
  const d = dialogo({
    titulo: duplicar ? 'Duplicar lançamento' : 'Editar lançamento',
    corpo: `
      <form class="grid gap-4" novalidate>
        ${duplicar ? `<p class="rounded-xl bg-stone-100 px-3 py-2 text-sm text-stone-700 dark:bg-stone-800 dark:text-stone-300">${icone('copiar', 'mr-1 inline size-4 align-[-3px]')}Cópia de “${esc(original.descricao)}”. Mude o que precisar e salve: o original continua como está.</p>` : ''}
        ${l.resina_receber_id && !duplicar ? `<p class="rounded-xl bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:bg-amber-900/30 dark:text-amber-100">${icone('alerta', 'mr-1 inline size-4 align-[-3px]')}Parte do produtor nos <a href="#insumos" class="font-semibold underline">Insumos</a>. Quando ele pagar, marque como recebido: o crédito entra sozinho na Conta corrente da Resina.</p>` : ''}
        ${l.resina_movimento_id || l.resina_entrega_id ? `<p class="rounded-xl bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:bg-amber-900/30 dark:text-amber-100">${icone('alerta', 'mr-1 inline size-4 align-[-3px]')}Este lançamento veio da Resina (${l.resina_movimento_id ? 'recebimento da <a href="#conta-corrente" class="font-semibold underline">Conta corrente</a>' : 'compra de <a href="#insumos" class="font-semibold underline">Insumos</a>'}). Se mudar lá, ele é refeito aqui. Mudanças feitas só aqui não voltam para a Resina.</p>` : ''}
        <fieldset class="grid grid-cols-2 gap-2">
          <legend class="sr-only">Tipo</legend>
          <label class="opcao-modo"><input type="radio" name="tipo" value="saida" class="sr-only" ${l.tipo === 'saida' ? 'checked' : ''}>${icone('saida')} Saída</label>
          <label class="opcao-modo"><input type="radio" name="tipo" value="entrada" class="sr-only" ${l.tipo === 'entrada' ? 'checked' : ''}>${icone('entrada')} Entrada</label>
        </fieldset>
        ${l.divisao ? '<p class="rounded-xl bg-amber-50 p-3 text-sm text-amber-900 dark:bg-amber-900/40 dark:text-amber-100">Este lançamento é uma parte de um pagamento dividido entre contas. O que você mudar aqui vale só para esta parte.</p>' : ''}
        ${campoValor(l.valor_original ?? l.valor)}
        ${campoDescricao(l.descricao, 'Ex.: Conta de luz')}
        ${campoCategoria(l.categoria_id, l.tipo)}
        ${camposCaixa(l)}
        ${duplicar ? '' : rodapeDatas(l)}
        <div class="mt-2 flex flex-col-reverse gap-2 sm:flex-row sm:justify-between">
          ${duplicar ? '<button type="button" class="btn-sec" data-cancelar>Cancelar</button>' : `<div class="flex flex-col-reverse gap-2 sm:flex-row">
            <button type="button" class="btn-neutro text-red-700 dark:text-red-400" data-excluir>${icone('lixo')} Excluir</button>
            <button type="button" class="btn-neutro" data-duplicar>${icone('copiar')} Duplicar</button>
          </div>`}
          <button type="submit" class="btn-primario">${icone('check')} ${duplicar ? 'Salvar cópia' : 'Salvar alterações'}</button>
        </div>
      </form>`,
  });
  const form = d.querySelector('form');
  mascaraDinheiro(form.valor);
  ligarCamposCaixa(form);
  const textosDoTipo = () => {
    const entrada = form.tipo.value === 'entrada';
    form.querySelector('[data-texto-pago]').textContent = entrada ? 'Já foi recebido' : 'Já foi pago';
    form.querySelector('[data-rotulo-pagamento]').textContent = entrada ? 'Data do recebimento' : 'Data do pagamento';
  };
  textosDoTipo();
  form.addEventListener('change', (e) => {
    if (e.target.name !== 'tipo') return;
    atualizarCategorias(form, form.tipo.value);
    textosDoTipo();
  });
  if (duplicar) d.querySelector('[data-cancelar]').onclick = () => d.close();
  else {
    d.querySelector('[data-excluir]').onclick = () => excluir(l, atualizar, d);
    d.querySelector('[data-duplicar]').onclick = () => { d.close(); abrirEdicao(l, atualizar, { duplicar: true }); };
  }
  form.onsubmit = semRepetir(async (e) => {
    e.preventDefault();
    limparErros(form);
    const dados = lerCamposCaixa(form, form.tipo.value);
    if (!dados) return;
    const botao = form.querySelector('[type=submit]');
    if (duplicar) {
      botao.disabled = true;
      try {
        const { pessoaNome, ...resto } = dados;
        const [novo] = await criarLancamentos([{ ...resto, pessoa_id: await pessoaPorNome(pessoaNome) }]);
        d.close();
        toast(`Cópia de “${resto.descricao}” salva`, { acao: desfazendo(() => excluirLancamentos([novo.id]), atualizar) });
        atualizar();
      } catch (err) {
        toast(err.message, { tipo: 'erro' });
        botao.disabled = false;
      }
      return;
    }
    const alcance = l.grupo ? await perguntarAlcance(l) : 'um';
    if (!alcance) return;
    botao.disabled = true;
    try {
      const { pessoaNome, ...resto } = dados;
      const valores = { ...resto, pessoa_id: await pessoaPorNome(pessoaNome) };
      let desfazer;
      let quantos = 1;
      if (alcance === 'todos') {
        const mudancas = mudancasNaSequencia(l, valores, await lancamentosDoGrupo(l.grupo, '0000-01-01'));
        desfazer = await atualizarSequencia(mudancas);
        quantos = mudancas.length;
      } else {
        desfazer = (await atualizarLancamento(l.id, valores)).desfazer;
      }
      d.close();
      toast(quantos > 1 ? 'Alterações salvas neste e nos próximos' : `Alterações em “${resto.descricao}” salvas`, { acao: desfazendo(desfazer, atualizar) });
      atualizar();
    } catch (err) {
      toast(err.message, { tipo: 'erro' });
      botao.disabled = false;
    }
  });
}
