// Importar a planilha do Excel (modelo NOVO_CAIXA.xlsx): escolher o arquivo, conferir e importar
import { lerXlsx } from '../lib/ler-xlsx.js';
import { reconhecerAbas, montarPlano, NOMES_MESES } from '../lib/importar-planilha.js';
import { importarPlanilha } from '../lib/api.js';
import { dialogo, toast, icone } from '../lib/ui.js';
import { esc, brl } from '../lib/format.js';
import { store } from '../lib/store.js';
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
  // (para contar, considera que tudo seria criado: a contagem mostra todas as linhas da aba)
  const tudoCriar = new Proxy({}, { get: () => 'criar' });
  const contar = (a, mes, ano) => montarPlano([a], { [a.nome]: { usar: true, mes, ano } }, tudoCriar).abas[0] || { caixa: 0, cartao: 0 };
  const escolhas = Object.fromEntries(modelo.map((a) => {
    const c = contar(a, a.mes || 1, a.ano);
    return [a.nome, { usar: !a.oculta && c.caixa + c.cartao > 0, mes: a.mes || 1, ano: a.ano, contagem: c, semMes: !a.mes }];
  }));
  const ignoradas = abas.filter((a) => !a.modelo).map((a) => a.nome);
  const resolucoes = {}; // decisão de cada item que não existe no sistema

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
      <div data-pendencias></div>
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
    plano = montarPlano(modelo, escolhas, resolucoes);
    desenharPendencias();
    const caixa = plano.lancamentos.length;
    const cartao = plano.compras.length;
    const n = plano.novos;
    const saldos = [...plano.saldosIniciais.values()];
    d.querySelector('[data-resumo]').innerHTML = plano.total || plano.repetidos || plano.linhasPendentes ? `
      <p class="text-base"><strong>Vai importar:</strong> ${caixa} ${caixa === 1 ? 'lançamento' : 'lançamentos'} do caixa${plano.faturas ? ` (${plano.faturas} ${plano.faturas === 1 ? 'é pagamento' : 'são pagamentos'} de fatura)` : ''} e ${cartao} ${cartao === 1 ? 'compra' : 'compras'} no cartão.</p>
      ${plano.linhasPendentes ? `<p class="font-semibold text-amber-900 dark:text-amber-200">Mais ${plano.linhasPendentes} ${plano.linhasPendentes === 1 ? 'linha espera' : 'linhas esperam'} as decisões acima.</p>` : ''}
      ${plano.linhasPuladas ? `<p>${plano.linhasPuladas} ${plano.linhasPuladas === 1 ? 'linha fica' : 'linhas ficam'} de fora, porque você escolheu "não importar".</p>` : ''}
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
    botao.disabled = !plano.total || plano.faltaResolver > 0;
    d.querySelector('[data-texto-botao]').textContent = plano.faltaResolver
      ? `Resolva ${plano.faltaResolver} ${plano.faltaResolver === 1 ? 'pendência' : 'pendências'} acima`
      : plano.total ? `Importar ${plano.total} ${plano.total === 1 ? 'item' : 'itens'}` : 'Importar';
  };

  // ----- pendências: itens da planilha que não existem no sistema
  const NOMES = { categoria: ['a categoria', 'categorias', 'Categoria'], conta: ['a conta', 'contas', 'Conta'], cartao: ['o cartão', 'cartoes', 'Cartão'] };
  const listaDe = { categoria: 'categorias', conta: 'contas', cartao: 'cartoes' };
  let chavesDesenhadas = '';
  const desenharPendencias = () => {
    const area = d.querySelector('[data-pendencias]');
    const chaves = plano.pendentes.map((p) => p.chave).join('|');
    if (chaves === chavesDesenhadas) { atualizarEstado(); return; }
    chavesDesenhadas = chaves;
    if (!plano.pendentes.length) { area.innerHTML = ''; return; }
    area.innerHTML = `<section class="grid gap-3 rounded-xl border-2 border-amber-400 bg-amber-50 p-4 dark:border-amber-700 dark:bg-amber-900/20" aria-labelledby="titulo-pendencias">
      <h3 id="titulo-pendencias" class="flex items-center gap-2 font-bold text-amber-900 dark:text-amber-100">${icone('alerta', 'size-5 shrink-0')} <span data-titulo-pendencias></span></h3>
      <p class="text-sm text-amber-900 dark:text-amber-100">A planilha usa nomes que não existem no Caixa da Família. Para cada um, escolha o que fazer. Sem isso não dá para importar (ou apague essas linhas no Excel e importe de novo).</p>
      ${plano.pendentes.map((p, i) => {
        const [artigo, , Tipo] = NOMES[p.tipo];
        const nome = p.nome || `(${p.tipo === 'cartao' ? 'cartão' : p.tipo} em branco)`;
        const onde = p.exemplos.map((e) => `${esc(e.aba)}, linha ${e.linha}${e.texto ? ` ("${esc(String(e.texto).slice(0, 40))}")` : ''}`).join('; ');
        const opcoes = store[listaDe[p.tipo]].filter((x) => x.ativa !== false && x.ativo !== false).sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
        const r = resolucoes[p.chave];
        const sugestao = p.sugestao;
        return `<fieldset class="grid gap-2 rounded-xl bg-white p-3 dark:bg-stone-900" data-pendencia="${esc(p.chave)}">
          <legend class="sr-only">${Tipo} ${esc(nome)}</legend>
          <p class="font-semibold"><span data-situacao="${i}"></span>${p.nome ? `${artigo.replace(/^./, (c) => c.toUpperCase())} <q class="font-bold">${esc(nome)}</q> da planilha não existe no sistema.` : `Há linhas com ${Tipo.toLowerCase()} em branco.`}</p>
          <p class="text-sm text-stone-600 dark:text-stone-400">${p.linhas} ${p.linhas === 1 ? 'linha' : 'linhas'}: ${onde}${p.linhas > p.exemplos.length ? '…' : ''}</p>
          <label class="flex min-h-11 cursor-pointer items-center gap-3"><input type="radio" class="size-5 shrink-0 accent-brand-600" name="pend-${i}" value="criar" ${r === 'criar' ? 'checked' : ''}>
            <span>Criar ${artigo} <strong>${esc(p.nome || (p.tipo === 'conta' ? 'Sem conta' : p.tipo === 'categoria' ? 'Sem categoria' : 'Cartão'))}</strong> no sistema${p.tipo === 'categoria' ? ' (grupo "Outros")' : p.tipo === 'cartao' ? ' (confira depois o dia de fechamento)' : ''}</span></label>
          ${opcoes.length ? `<div class="grid gap-2 sm:grid-cols-[auto_minmax(0,1fr)] sm:items-center">
            <label class="flex min-h-11 cursor-pointer items-center gap-3"><input type="radio" class="size-5 shrink-0 accent-brand-600" name="pend-${i}" value="usar" ${r?.usar ? 'checked' : ''}>
              <span>Usar ${artigo === 'o cartão' ? 'um' : 'uma'} que já existe:</span></label>
            <label class="sr-only" for="pend-sel-${i}">${Tipo} do sistema para ${esc(nome)}</label>
            <select id="pend-sel-${i}" class="campo" data-usar-existente>
              ${opcoes.map((o) => `<option value="${o.id}" ${(r?.usar ? r.usar === o.id : sugestao?.id === o.id) ? 'selected' : ''}>${esc(o.nome)}${sugestao?.id === o.id ? ' (parecida)' : ''}</option>`).join('')}
            </select></div>` : ''}
          ${sugestao ? `<p class="text-sm text-stone-600 dark:text-stone-400">Parecido com <strong>${esc(sugestao.nome)}</strong>. Se for o mesmo, escolha "usar ${artigo === 'o cartão' ? 'um' : 'uma'} que já existe".</p>` : ''}
          <label class="flex min-h-11 cursor-pointer items-center gap-3"><input type="radio" class="size-5 shrink-0 accent-brand-600" name="pend-${i}" value="pular" ${r === 'pular' ? 'checked' : ''}>
            <span>Não importar ${p.linhas === 1 ? 'esta linha' : `estas ${p.linhas} linhas`}</span></label>
        </fieldset>`;
      }).join('')}
    </section>`;
    atualizarEstado();
  };
  // título e marcação de cada pendência (sem redesenhar os campos, para não perder o foco)
  const atualizarEstado = () => {
    const titulo = d.querySelector('[data-titulo-pendencias]');
    if (!titulo) return;
    titulo.textContent = plano.faltaResolver
      ? `${plano.faltaResolver} ${plano.faltaResolver === 1 ? 'item precisa' : 'itens precisam'} da sua decisão`
      : 'Tudo resolvido';
    plano.pendentes.forEach((p, i) => {
      const el = d.querySelector(`[data-situacao="${i}"]`);
      if (el) el.innerHTML = p.resolvida ? `<span class="mr-1 text-entrada">${icone('check', 'inline size-4 -mt-0.5')}</span><span class="sr-only">Resolvido: </span>` : '';
    });
  };
  d.querySelector('[data-pendencias]').addEventListener('change', (e) => {
    const caixa = e.target.closest('[data-pendencia]');
    if (!caixa) return;
    e.stopPropagation();
    const chave = caixa.dataset.pendencia;
    const escolhido = caixa.querySelector('input[type=radio]:checked')?.value;
    if (e.target.matches('[data-usar-existente]')) caixa.querySelector('input[value=usar]').checked = true;
    const valor = e.target.matches('[data-usar-existente]') ? 'usar' : escolhido;
    resolucoes[chave] = valor === 'usar' ? { usar: caixa.querySelector('[data-usar-existente]').value } : valor;
    atualizar();
  });

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
