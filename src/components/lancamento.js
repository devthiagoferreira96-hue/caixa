// Uma linha de lançamento (usada no Início e no Extrato) + edição/exclusão
import { esc, brl, diaMes, diasAte, quandoVence, hojeISO } from '../lib/format.js';
import { buscar } from '../lib/store.js';
import { icone, toast, dialogo, confirmar, mascaraDinheiro, limparErros } from '../lib/ui.js';
import { atualizarLancamento, excluirLancamentos, lancamentosDoGrupo, pessoaPorNome } from '../lib/api.js';
import { campoValor, campoDescricao, campoCategoria, camposCaixa, lerCamposCaixa } from './form-lancamento.js';

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
  <li class="flex items-center gap-3 border-t border-stone-100 py-3 first:border-t-0 dark:border-stone-800">
    <button type="button" data-pagar="${l.id}" class="check ${l.pago ? 'ligado' : ''}" aria-pressed="${l.pago}"
      aria-label="${l.pago ? `Desmarcar “${esc(l.descricao)}” como ${verbo}` : `Marcar “${esc(l.descricao)}” como ${verbo}`}"
      title="${l.pago ? 'Desmarcar' : `Marcar como ${verbo}`}">${l.pago ? icone('check', 'size-4') : ''}</button>
    <button type="button" data-editar="${l.id}" class="-mx-2 min-w-0 flex-1 cursor-pointer rounded-lg px-2 py-1 text-left transition hover:bg-stone-50 dark:hover:bg-stone-800/60"
      aria-label="Abrir “${esc(l.descricao)}” para ver ou editar">
      <span class="block truncate font-medium">${esc(l.descricao)}</span>
      <span class="block truncate text-sm text-stone-600 dark:text-stone-400">${diaMes(l.vencimento)}${mostrarPrazo && !l.pago ? ` · ${quandoVence(l.vencimento)}` : ''} · ${detalhes.map(esc).join(' · ')}</span>
    </button>
    <div class="shrink-0 text-right">
      <span class="block font-semibold tabular-nums ${entrada ? 'valor-entrada' : 'valor-saida'}">${entrada ? '+' : '−'} ${brl(l.valor)}</span>
      <span class="selo ${classeSelo}">${textoSelo}</span>
    </div>
  </li>`;
}

/**
 * Trata cliques nas linhas de lançamento. Retorna true se o clique foi tratado.
 * `lista` = lançamentos que estão na tela; `atualizar` = recarrega a tela.
 */
export async function cliqueEmLancamento(e, lista, atualizar) {
  const botaoPagar = e.target.closest('[data-pagar]');
  if (botaoPagar) {
    const l = lista.find((x) => x.id === Number(botaoPagar.dataset.pagar));
    botaoPagar.disabled = true;
    const pago = !l.pago;
    try {
      await atualizarLancamento(l.id, { pago, data_pagamento: pago ? hojeISO() : null });
      const verbo = l.tipo === 'entrada' ? 'recebido' : 'pago';
      toast(pago ? `“${l.descricao}” marcado como ${verbo}` : `“${l.descricao}” voltou para em aberto`, {
        acao: { texto: 'Desfazer', fn: async () => { await atualizarLancamento(l.id, { pago: l.pago, data_pagamento: l.data_pagamento }); atualizar(); } },
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
    abrirEdicao(lista.find((x) => x.id === Number(botaoEditar.dataset.editar)), atualizar);
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
    await excluirLancamentos(ids);
    d?.close();
    toast(ids.length > 1 ? `${ids.length} lançamentos excluídos` : 'Lançamento excluído');
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
      await excluirLancamentos([l.id]);
      toast('Pagamento da fatura desfeito');
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
      await atualizarLancamento(l.id, {
        ...resto,
        pessoa_id: await pessoaPorNome(pessoaNome),
        data_pagamento: resto.pago ? l.data_pagamento || hojeISO() : null,
      });
      d.close();
      toast('Alterações salvas');
      atualizar();
    } catch (err) {
      toast(err.message, { tipo: 'erro' });
      botao.disabled = false;
    }
  };
}
