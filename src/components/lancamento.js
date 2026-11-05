// Uma linha de lançamento (usada no Início e no Extrato) + edição/exclusão
import { esc, brl, diaMes, diasAte, quandoVence, hojeISO } from '../lib/format.js';
import { buscar, autor } from '../lib/store.js';
import { icone, toast, dialogo, confirmar, mascaraDinheiro, limparErros } from '../lib/ui.js';
import { atualizarLancamento, excluirLancamentos, lancamentosDoGrupo, pessoaPorNome } from '../lib/api.js';
import { campoValor, campoDescricao, campoCategoria, camposCaixa, lerCamposCaixa } from './form-lancamento.js';

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
  if (l.pago) return ['selo-ok', entrada ? 'Recebido' : 'Pago'];
  if (diasAte(l.vencimento) < 0) return ['selo-atraso', 'Atrasado'];
  return ['selo-aberto', entrada ? 'A receber' : 'A pagar'];
}

export function itemLancamento(l, { mostrarPrazo = false } = {}) {
  const entrada = l.tipo === 'entrada';
  const [classeSelo, textoSelo] = situacao(l);
  const detalhes = [
    l.fatura_cartao_id ? 'Pagamento de fatura' : buscar('categorias', l.categoria_id)?.nome,
    buscar('contas', l.conta_id)?.nome,
    buscar('pessoas', l.pessoa_id)?.nome,
    l.parcela && `parcela ${l.parcela}`,
  ].filter(Boolean);
  const verbo = entrada ? 'recebido' : 'pago';
  return `
  <li class="@container border-t border-stone-100 py-3 first:border-t-0 dark:border-stone-800">
   <div class="flex flex-wrap items-center gap-x-1 gap-y-1">
    <button type="button" data-pagar="${l.id}" class="check ${l.pago ? 'ligado' : ''}" aria-pressed="${l.pago}"
      aria-label="${l.pago ? `Desmarcar “${esc(l.descricao)}” como ${verbo}` : `Marcar “${esc(l.descricao)}” como ${verbo}`}"
      title="${l.pago ? 'Desmarcar' : `Marcar como ${verbo}`}">${l.pago ? icone('check', 'size-4') : ''}</button>
    <button type="button" data-editar="${l.id}" class="min-w-[42%] flex-1 cursor-pointer rounded-lg px-2 py-1 text-left transition hover:bg-stone-50 dark:hover:bg-stone-800/60"
      aria-label="Abrir “${esc(l.descricao)}” para ver ou editar">
      <span class="line-clamp-2 font-medium">${esc(l.descricao)}</span>
      <span class="line-clamp-2 text-sm text-stone-600 dark:text-stone-400">${diaMes(l.vencimento)}${mostrarPrazo && !l.pago ? ` · ${quandoVence(l.vencimento)}` : ''} · ${detalhes.map(esc).join(' · ')}</span>
    </button>
    <div class="text-right @max-[15.5rem]:flex @max-[15.5rem]:basis-full @max-[15.5rem]:flex-wrap @max-[15.5rem]:items-center @max-[15.5rem]:gap-2 @max-[15.5rem]:pl-12 @max-[15.5rem]:text-left">
      <span class="block text-sm font-semibold tabular-nums sm:text-base ${entrada ? 'valor-entrada' : 'valor-saida'}">${entrada ? '+' : '−'} ${brl(l.valor)}</span>
      <span class="inline-flex flex-wrap items-center justify-end gap-1"><span class="selo ${classeSelo}">${textoSelo}</span>${seloAutor(l.criado_por)}</span>
    </div>
   </div>
  </li>`;
}

/** Bolinha com as iniciais de quem lançou (cor fixa por pessoa) */
export function seloAutor(userId) {
  const a = autor(userId);
  if (!a) return '';
  const texto = `Lançado por ${a.souEu ? `você (${a.nome})` : a.nome}`;
  return `<span class="inline-flex size-6 shrink-0 items-center justify-center rounded-full text-[0.65rem] font-bold ${a.cor}" title="${esc(texto)}" role="img" aria-label="${esc(texto)}">${esc(a.iniciais)}</span>`;
}

const quando = (iso) => {
  const d = new Date(iso);
  const hojeStr = new Date().toDateString();
  const dia = d.toDateString() === hojeStr ? 'hoje' : `em ${d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })}`;
  return `${dia} às ${d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`;
};

/** "Lançado por Thays hoje às 12:31 · Alterado por Thiago em 05/11 às 08:02" */
export function rodapeAutoria(item) {
  const linhas = [];
  const criou = autor(item.criado_por);
  if (criou && item.criado_em) linhas.push([ 'pessoas', `Lançado por <strong class="font-semibold text-stone-800 dark:text-stone-200">${esc(criou.souEu ? 'você' : criou.nome)}</strong> ${quando(item.criado_em)}` ]);
  const alterou = autor(item.alterado_por);
  if (alterou && item.alterado_em) linhas.push([ 'editar', `Alterado por <strong class="font-semibold text-stone-800 dark:text-stone-200">${esc(alterou.souEu ? 'você' : alterou.nome)}</strong> ${quando(item.alterado_em)}` ]);
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
      const r = await atualizarLancamento(l.id, { pago, data_pagamento: pago ? hojeISO() : null });
      const verbo = l.tipo === 'entrada' ? 'recebido' : 'pago';
      toast(pago ? `“${l.descricao}” marcado como ${verbo}` : `“${l.descricao}” voltou para em aberto`, {
        acao: desfazendo(r.desfazer, atualizar),
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

async function excluir(l, atualizar, d) {
  let ids = [l.id];
  if (l.grupo) {
    const escolha = await new Promise((resolver) => {
      const j = dialogo({
        titulo: 'Este lançamento se repete',
        largura: 'max-w-sm',
        corpo: `<p class="text-stone-600 dark:text-stone-300">Quer excluir só este mês ou este e os próximos?</p>
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
    if (escolha === 'todos') ids = (await lancamentosDoGrupo(l.grupo, l.vencimento)).map((x) => x.id);
  } else if (!(await confirmar(`“${l.descricao}” será excluído.`, { botao: 'Excluir', perigo: true }))) {
    return;
  }
  try {
    const desfazer = await excluirLancamentos(ids);
    d?.close();
    toast(ids.length > 1 ? `${ids.length} lançamentos excluídos` : `“${l.descricao}” excluído`, { acao: desfazendo(desfazer, atualizar) });
    atualizar();
  } catch (err) {
    toast(err.message, { tipo: 'erro' });
  }
}

export function abrirEdicao(l, atualizar) {
  if (l.fatura_cartao_id) {
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
    titulo: 'Editar lançamento',
    corpo: `
      <form class="grid gap-4" novalidate>
        <fieldset class="grid grid-cols-2 gap-2">
          <legend class="sr-only">Tipo</legend>
          <label class="opcao-modo"><input type="radio" name="tipo" value="saida" class="sr-only" ${l.tipo === 'saida' ? 'checked' : ''}>${icone('saida')} Saída</label>
          <label class="opcao-modo"><input type="radio" name="tipo" value="entrada" class="sr-only" ${l.tipo === 'entrada' ? 'checked' : ''}>${icone('entrada')} Entrada</label>
        </fieldset>
        ${campoValor(l.valor)}
        ${campoDescricao(l.descricao, 'Ex.: Conta de luz')}
        ${campoCategoria(l.categoria_id)}
        ${camposCaixa(l)}
        ${rodapeAutoria(l)}
        <div class="mt-2 flex flex-col-reverse gap-2 sm:flex-row sm:justify-between">
          <button type="button" class="btn-neutro text-red-700 dark:text-red-400" data-excluir>${icone('lixo')} Excluir</button>
          <button type="submit" class="btn-primario">${icone('check')} Salvar alterações</button>
        </div>
      </form>`,
  });
  const form = d.querySelector('form');
  mascaraDinheiro(form.valor);
  d.querySelector('[data-excluir]').onclick = () => excluir(l, atualizar, d);
  form.onsubmit = async (e) => {
    e.preventDefault();
    limparErros(form);
    const dados = lerCamposCaixa(form, form.tipo.value);
    if (!dados) return;
    const botao = form.querySelector('[type=submit]');
    botao.disabled = true;
    try {
      const { pessoaNome, ...resto } = dados;
      const r = await atualizarLancamento(l.id, {
        ...resto,
        pessoa_id: await pessoaPorNome(pessoaNome),
        data_pagamento: resto.pago ? l.data_pagamento || hojeISO() : null,
      });
      d.close();
      toast(`Alterações em “${resto.descricao}” salvas`, { acao: desfazendo(r.desfazer, atualizar) });
      atualizar();
    } catch (err) {
      toast(err.message, { tipo: 'erro' });
      botao.disabled = false;
    }
  };
}
