// Importar a planilha do Excel (modelo NOVO_CAIXA.xlsx): escolher o arquivo, conferir e importar
import { lerXlsx } from '../lib/ler-xlsx.js';
import { reconhecerAbas, montarPlano, NOMES_MESES } from '../lib/importar-planilha.js';
import { importarPlanilha } from '../lib/api.js';
import { dialogo, toast, icone } from '../lib/ui.js';
import { esc, brl } from '../lib/format.js';
import { desfazendo } from './lancamento.js';

const ERROS = {
  XLS_ANTIGO: 'Esse arquivo é do Excel antigo (.xls). Abra no Excel e use "Salvar como" > "Pasta de Trabalho do Excel (.xlsx)".',
  NAO_ZIP: 'Esse arquivo não é uma planilha do Excel (.xlsx).',
  NAO_XLSX: 'Esse arquivo não é uma planilha do Excel (.xlsx).',
  FORMATO: 'Não consegui ler essa planilha. Abra no Excel e salve de novo como .xlsx.',
};

function escolherArquivo() {
  return new Promise((resolver) => {
    const input = Object.assign(document.createElement('input'), {
      type: 'file',
      accept: '.xlsx,.xlsm,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    });
    input.addEventListener('change', () => resolver(input.files?.[0] || null));
    input.addEventListener('cancel', () => resolver(null));
    input.click();
  });
}

const lista = (nomes, max = 10) =>
  `${nomes.slice(0, max).map((n) => `<span class="selo selo-neutro">${esc(n)}</span>`).join(' ')}${nomes.length > max ? ` <span class="text-sm">e mais ${nomes.length - max}</span>` : ''}`;

/** Fluxo completo. `aoTerminar` é chamado depois de importar (e depois de desfazer). */
export async function importarDoExcel(aoTerminar) {
  const arquivo = await escolherArquivo();
  if (!arquivo) return;
  let abas;
  try {
    abas = reconhecerAbas(await lerXlsx(arquivo));
  } catch (e) {
    if (!ERROS[e.message]) console.error(e);
    toast(ERROS[e.message] || 'Não consegui ler essa planilha. Confira se é o arquivo certo (.xlsx).', { tipo: 'erro' });
    return;
  }
  const modelo = abas.filter((a) => a.modelo);
  if (!modelo.length) {
    toast('Essa planilha não está no modelo do caixa. Ela precisa ter as colunas STATUS, VENCIMENTO, CONTA BANCÁRIA, CATEGORIA, DESCRIÇÃO e DÉBITO/CRÉDITO.', { tipo: 'erro' });
    return;
  }

  // quantas linhas cada aba tem (para mostrar e para já desmarcar as vazias)
  const contar = (a, mes, ano) => montarPlano([a], { [a.nome]: { usar: true, mes, ano } }).abas[0] || { caixa: 0, cartao: 0 };
  const escolhas = Object.fromEntries(modelo.map((a) => {
    const c = contar(a, a.mes || 1, a.ano);
    return [a.nome, { usar: !a.oculta && c.caixa + c.cartao > 0, mes: a.mes || 1, ano: a.ano, contagem: c, semMes: !a.mes }];
  }));
  const ignoradas = abas.filter((a) => !a.modelo).map((a) => a.nome);

  const d = dialogo({
    titulo: 'Importar planilha do Excel',
    largura: 'max-w-2xl',
    corpo: `<form class="grid gap-4" data-form-importar novalidate>
      <p class="text-sm text-stone-700 dark:text-stone-300">Arquivo <strong class="break-all">${esc(arquivo.name)}</strong>. Cada aba é um mês: confira se o mês e o ano estão certos e desmarque o que não quiser trazer.</p>
      <fieldset class="grid gap-2">
        <legend class="rotulo mb-1">Abas da planilha</legend>
        ${modelo.map((a, i) => {
          const e = escolhas[a.nome];
          return `<div class="grid gap-2 rounded-xl border border-stone-200 p-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center dark:border-stone-700" data-aba="${i}">
            <label class="flex min-h-11 cursor-pointer items-center gap-3">
              <input type="checkbox" class="size-5 shrink-0 accent-brand-600" data-usar ${e.usar ? 'checked' : ''}>
              <span class="min-w-0"><span class="block font-semibold">${esc(a.nome)}</span>
              <span class="block text-sm text-stone-600 dark:text-stone-400" data-contagem>${textoContagem(e.contagem)}</span></span>
            </label>
            <div class="flex flex-wrap gap-2">
              <label class="sr-only" for="imp-mes-${i}">Mês da aba ${esc(a.nome)}</label>
              <select id="imp-mes-${i}" class="campo min-w-[9.5rem] flex-1" data-mes>${NOMES_MESES.map((m, k) => `<option value="${k + 1}" ${k + 1 === e.mes ? 'selected' : ''}>${m}</option>`).join('')}</select>
              <label class="sr-only" for="imp-ano-${i}">Ano da aba ${esc(a.nome)}</label>
              <input id="imp-ano-${i}" class="campo w-24 grow tabular-nums sm:grow-0" data-ano type="number" inputmode="numeric" min="2000" max="2100" value="${e.ano}">
            </div>
            ${e.semMes ? `<p class="text-sm text-amber-800 sm:col-span-2 dark:text-amber-300">${icone('alerta', 'inline size-4')} Não consegui descobrir o mês pelo nome da aba. Escolha o mês certo.</p>` : ''}
          </div>`;
        }).join('')}
      </fieldset>
      ${ignoradas.length ? `<p class="text-sm text-stone-600 dark:text-stone-400">Abas que não são do modelo do caixa e serão ignoradas: ${ignoradas.map(esc).join(', ')}.</p>` : ''}
      <div class="grid gap-3 rounded-xl bg-stone-100 p-4 text-sm dark:bg-stone-800" aria-live="polite" data-resumo></div>
      <div class="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <button type="button" class="btn-neutro" data-fechar>Cancelar</button>
        <button type="submit" class="btn-primario" data-importar-confirmar>${icone('check')} <span data-texto-botao>Importar</span></button>
      </div>
    </form>`,
  });
  const form = d.querySelector('form');
  let plano;

  const ler = () => {
    form.querySelectorAll('[data-aba]').forEach((el) => {
      const a = modelo[el.dataset.aba];
      const e = escolhas[a.nome];
      e.usar = el.querySelector('[data-usar]').checked;
      e.mes = Number(el.querySelector('[data-mes]').value);
      const ano = Number(el.querySelector('[data-ano]').value);
      e.ano = ano >= 2000 && ano <= 2100 ? ano : e.ano;
    });
  };

  const atualizar = (mudou) => {
    ler();
    if (mudou) {
      const el = mudou.closest('[data-aba]');
      const a = modelo[el.dataset.aba];
      escolhas[a.nome].contagem = contar(a, escolhas[a.nome].mes, escolhas[a.nome].ano);
      el.querySelector('[data-contagem]').textContent = textoContagem(escolhas[a.nome].contagem);
    }
    plano = montarPlano(modelo, escolhas);
    const caixa = plano.lancamentos.length;
    const cartao = plano.compras.length;
    const n = plano.novos;
    const saldos = [...plano.saldosIniciais.values()];
    d.querySelector('[data-resumo]').innerHTML = plano.total || plano.repetidos ? `
      <p class="text-base"><strong>Vai importar:</strong> ${caixa} ${caixa === 1 ? 'lançamento' : 'lançamentos'} do caixa${plano.faturas ? ` (${plano.faturas} ${plano.faturas === 1 ? 'é pagamento' : 'são pagamentos'} de fatura)` : ''} e ${cartao} ${cartao === 1 ? 'compra' : 'compras'} no cartão.</p>
      ${plano.parcelasCompletadas ? `<p>${plano.parcelasCompletadas} parcela(s) de compras parceladas que não estão na planilha (meses seguintes) serão criadas para aparecer nas próximas faturas.</p>` : ''}
      ${plano.repetidos ? `<p>${icone('check', 'inline size-4')} ${plano.repetidos} item(ns) já estão no sistema e serão pulados (não duplica).</p>` : ''}
      ${saldos.length ? `<p><strong>Saldo inicial</strong> (das linhas de saldo anterior): ${saldos.map((s) => `${esc(s.nome)} ${brl(s.valor)}`).join(' · ')}</p>` : ''}
      ${n.contas.length ? `<div><p class="mb-1 font-semibold">Contas novas</p>${lista(n.contas.map((c) => c.nome))}</div>` : ''}
      ${n.cartoes.length ? `<div><p class="mb-1 font-semibold">Cartões novos</p>${lista(n.cartoes.map((c) => c.nome))}<p class="mt-1">Depois confira o dia de fechamento deles em Ajustes.</p></div>` : ''}
      ${n.categorias.length ? `<div><p class="mb-1 font-semibold">Categorias novas (grupo "Outros")</p>${lista(n.categorias.map((c) => c.nome))}</div>` : ''}
      ${n.pessoas.length ? `<div><p class="mb-1 font-semibold">Pessoas novas</p>${lista(n.pessoas.map((c) => c.nome))}</div>` : ''}
      ${plano.mudarTipo.length ? `<p>Usadas como entrada e como saída, passam para o tipo "Os dois": ${plano.mudarTipo.map((m) => esc(m.nome)).join(', ')}.</p>` : ''}
      ${plano.avisos.length ? `<details class="rounded-lg bg-amber-50 p-3 text-amber-900 dark:bg-amber-900/30 dark:text-amber-100">
        <summary class="cursor-pointer font-semibold">${plano.avisos.length} ${plano.avisos.length === 1 ? 'aviso' : 'avisos'} para conferir</summary>
        <ul class="mt-2 grid list-disc gap-1 pl-5">${plano.avisos.slice(0, 60).map((a) => `<li>${esc(a)}</li>`).join('')}${plano.avisos.length > 60 ? `<li>e mais ${plano.avisos.length - 60}…</li>` : ''}</ul>
      </details>` : ''}
      <p class="text-stone-600 dark:text-stone-400">Se algo sair errado, dá para desfazer a importação inteira logo depois.</p>`
      : '<p class="text-base"><strong>Nada para importar</strong> nas abas marcadas.</p>';
    const botao = d.querySelector('[data-importar-confirmar]');
    botao.disabled = !plano.total;
    d.querySelector('[data-texto-botao]').textContent = plano.total ? `Importar ${plano.total} ${plano.total === 1 ? 'item' : 'itens'}` : 'Importar';
  };

  form.addEventListener('change', (e) => atualizar(e.target.matches('[data-mes],[data-ano]') ? e.target : null));
  atualizar();

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!plano?.total) return;
    const botao = d.querySelector('[data-importar-confirmar]');
    botao.disabled = true;
    botao.setAttribute('aria-busy', 'true');
    d.querySelector('[data-texto-botao]').textContent = 'Importando…';
    try {
      const desfazer = await importarPlanilha(plano);
      d.close();
      toast(`Planilha importada: ${plano.lancamentos.length} lançamentos e ${plano.compras.length} compras no cartão.`, {
        acao: desfazendo(desfazer, aoTerminar),
      });
      aoTerminar?.();
    } catch (err) {
      console.error(err);
      toast('Não foi possível importar. Nada foi alterado.', { tipo: 'erro' });
      botao.disabled = false;
      botao.removeAttribute('aria-busy');
      d.querySelector('[data-texto-botao]').textContent = `Importar ${plano.total} itens`;
    }
  });
}

function textoContagem(c) {
  if (!c.caixa && !c.cartao) return 'Aba vazia';
  return `${c.caixa} no caixa · ${c.cartao} no cartão`;
}
