// Importar planilhas do Excel. A importação geral (importarQualquerPlanilha) reconhece cada aba e manda
// para o lugar certo: Caixa (modelo NOVO_CAIXA), produção da Resina (CONTROLE ANUAL / SAFRAS) ou
// conta corrente do arrendamento. Também lê o backup em Excel gerado pelo sistema (as três juntas).
import { lerXlsx } from '../lib/ler-xlsx.js';
import { lerPlanilhaConta } from '../modulos/resina/importar-conta.js';
import { lerSafras } from '../modulos/resina/importar-safras.js';
import { reconhecerAbas, montarPlano, NOMES_MESES } from '../lib/importar-planilha.js';
import { importarPlanilha } from '../lib/api.js';
import { dialogo, toast, icone } from '../lib/ui.js';
import { esc, brl } from '../lib/format.js';
import { store } from '../lib/store.js';
import { desfazendo } from './lancamento.js';

export const ERROS = {
  XLS_ANTIGO: 'Essa planilha tem senha ou é do Excel antigo (.xls). No Excel, tire a senha e use "Salvar como" > Pasta de Trabalho do Excel (.xlsx).',
  DANIFICADO: 'A planilha parece danificada ou incompleta. Abra no Excel, salve de novo e tente outra vez.',
  NAO_ZIP: 'Esse arquivo não é uma planilha do Excel (.xlsx).',
  NAO_XLSX: 'Esse arquivo não é uma planilha do Excel (.xlsx).',
  FORMATO: 'Não consegui ler essa planilha. Abra no Excel e salve de novo como .xlsx.',
};

/** Escolher o arquivo. `json: true` aceita também o backup completo (.json) e o PDF gerado pelo sistema */
export function escolherArquivo({ json = false } = {}) {
  return new Promise((resolver) => {
    const input = Object.assign(document.createElement('input'), {
      type: 'file',
      accept: `.xlsx,.xlsm,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet${json ? ',.json,application/json,.pdf,application/pdf' : ''}`,
    });
    input.addEventListener('change', () => resolver(input.files?.[0] || null));
    input.addEventListener('cancel', () => resolver(null));
    input.click();
  });
}

const ehJson = (arquivo) => /\.json$/i.test(arquivo.name) || arquivo.type === 'application/json';
const ehPdf = (arquivo) => /\.pdf$/i.test(arquivo.name) || arquivo.type === 'application/pdf';

const NOMES_TABELAS = {
  lancamentos: ['lançamento', 'lançamentos'], compras_cartao: ['compra no cartão', 'compras no cartão'], parcelas: ['parcela', 'parcelas'],
  contas: ['conta', 'contas'], cartoes: ['cartão', 'cartões'], categorias: ['categoria', 'categorias'], pessoas: ['pessoa', 'pessoas'],
  resina_cargas: ['carga', 'cargas'], resina_carga_itens: ['entrega de produtor', 'entregas de produtores'],
  resina_movimentos: ['movimento da conta corrente', 'movimentos da conta corrente'], resina_insumos: ['insumo', 'insumos'],
  resina_produtores: ['produtor', 'produtores'], resina_titulares: ['conta da conta corrente', 'contas da conta corrente'],
  resina_fazendas: ['fazenda', 'fazendas'], resina_motoristas: ['motorista', 'motoristas'], resina_caminhoes: ['caminhão', 'caminhões'],
  resina_produtos: ['produto', 'produtos'], resina_precos: ['preço do kg', 'preços do kg'],
};
const quantos = (tabela, n) => `${n} ${(NOMES_TABELAS[tabela] || [tabela, tabela])[n === 1 ? 0 : 1]}`;

/** Lê os dados de dentro do PDF, mostra o que vai entrar e junta (sem apagar nem duplicar) */
async function importarPdf(arquivo, aoTerminar) {
  const { lerAnexoDoPdf, juntarTabelas } = await import('../lib/dados-periodo.js');
  const { lerBackup, juntarDados } = await import('../lib/api.js');
  const { local } = await import('../lib/local-db.js');
  let dados;
  try {
    const texto = await lerAnexoDoPdf(new Uint8Array(await arquivo.arrayBuffer()));
    if (!texto) {
      toast('Esse PDF não tem os dados para importar. Só dá para importar o PDF gerado pelo sistema com a opção "Permitir importar este PDF de volta" marcada. Para trazer tudo, use o backup (.json).', { tipo: 'erro' });
      return;
    }
    dados = lerBackup(texto);
  } catch (e) {
    toast(e.message === 'NAO_PDF' ? 'Esse arquivo não é um PDF.' : 'Não consegui ler os dados desse PDF. Gere o PDF de novo no sistema.', { tipo: 'erro' });
    return;
  }
  const previa = juntarTabelas(local.tabelas(), dados.tabelas);
  const periodo = dados.periodo?.nome ? ` (${esc(dados.periodo.nome)})` : '';
  if (!previa.total) {
    toast(`Tudo o que está nesse PDF${periodo} já está no sistema. Nada foi mudado.`);
    return;
  }
  const itens = Object.entries(previa.novos).map(([t, n]) => `<li>${esc(quantos(t, n))}</li>`).join('');
  const { confirmar } = await import('../lib/ui.js');
  const ok = await confirmar(
    `Os dados do PDF${periodo} vão ser JUNTADOS aos do sistema. Vai entrar só o que ainda não existe; nada que já está aqui é apagado ou mudado.`,
    { titulo: 'Importar os dados deste PDF?', botao: 'Importar', detalhes: `<ul class="mt-2 list-disc pl-5 text-sm">${itens}</ul>` },
  );
  if (!ok) return;
  const r = await juntarDados(dados);
  toast(`Dados do PDF importados: ${Object.entries(r.novos).map(([t, n]) => quantos(t, n)).join(', ')}.`, {
    acao: { texto: 'Desfazer', fn: async () => { await r.desfazer(); toast('Importação desfeita'); aoTerminar?.(); } },
  });
  aoTerminar?.();
}

const lista = (nomes, max = 10) =>
  `${nomes.slice(0, max).map((n) => `<span class="selo selo-neutro">${esc(n)}</span>`).join(' ')}${nomes.length > max ? ` <span class="text-sm">e mais ${nomes.length - max}</span>` : ''}`;

/**
 * Que tipo de planilha é cada aba.
 * @returns {{caixa: string[], producao: string[], conta: string[], resumo: string[], outras: string[]}}
 */
export function classificarAbas(abas) {
  const r = { caixa: [], producao: [], conta: [], resumo: [], outras: [] };
  const caixa = new Set(reconhecerAbas(abas).filter((a) => a.modelo).map((a) => a.nome));
  const conta = new Set(lerPlanilhaConta(abas).map((a) => a.aba));
  const { blocos, resumos } = lerSafras(abas);
  const producao = new Set(blocos.map((b) => b.aba));
  for (const a of abas) {
    if (caixa.has(a.nome)) r.caixa.push(a.nome);
    else if (producao.has(a.nome)) r.producao.push(a.nome);
    else if (conta.has(a.nome)) r.conta.push(a.nome);
    else if (resumos.includes(a.nome)) r.resumo.push(a.nome);
    else r.outras.push(a.nome);
  }
  return r;
}

const TIPOS_PLANILHA = {
  caixa: ['Caixa', 'lançamentos e cartões (modelo NOVO_CAIXA)'],
  producao: ['Produção da resina', 'cargas de cada produtor (CONTROLE ANUAL / SAFRAS)'],
  conta: ['Conta corrente', 'arrendamento: cargas, insumos e PIX (Conta corrente arrendo)'],
};

/**
 * Importar qualquer uma das planilhas (ou o backup em Excel com todas): reconhece cada aba e abre
 * a conferência de cada parte, uma depois da outra (Caixa, depois Produção, depois Conta corrente,
 * para a conta corrente completar as cargas que vieram da produção). `contaAtual` = conta já escolhida na tela.
 */
export async function importarQualquerPlanilha(aoTerminar, { contaAtual = null } = {}) {
  const arquivo = await escolherArquivo({ json: true });
  if (!arquivo) return;
  // backup completo (.json): restaura tudo (com confirmação e Desfazer)
  if (ehJson(arquivo)) {
    const { restaurarComConfirmacao } = await import('./backup.js');
    const { lerBackup } = await import('../lib/api.js');
    let dados;
    try { dados = lerBackup(await arquivo.text()); } catch (e) { toast(e.message, { tipo: 'erro' }); return; }
    return restaurarComConfirmacao(aoTerminar, dados);
  }
  // PDF gerado pelo sistema com "Permitir importar este PDF de volta": junta os dados do período
  if (ehPdf(arquivo)) return importarPdf(arquivo, aoTerminar);
  let abas;
  try {
    abas = await lerXlsx(arquivo);
  } catch (e) {
    if (!ERROS[e.message]) console.error(e);
    toast(ERROS[e.message] || 'Não consegui ler essa planilha. Confira se é o arquivo certo (.xlsx).', { tipo: 'erro' });
    return;
  }
  const tipos = classificarAbas(abas);
  const achados = Object.keys(TIPOS_PLANILHA).filter((k) => tipos[k].length);
  if (!achados.length) {
    toast(tipos.resumo.length
      ? 'Essa planilha só tem o resumo por mês (CONTROLE DE CARGA ANUAL). Para importar as cargas, use a aba das SAFRAS (DATA | TBS | PESO - KG).'
      : 'Não reconheci essa planilha. O sistema importa o caixa (NOVO_CAIXA), a produção da resina (CONTROLE ANUAL / SAFRAS) e a conta corrente do arrendamento.', { tipo: 'erro' });
    return;
  }
  let escolhidos = achados;
  if (achados.length > 1) {
    escolhidos = await escolherPartes(arquivo, tipos, achados);
    if (!escolhidos?.length) return;
  }
  const lido = { arquivo, abas };
  if (escolhidos.includes('caixa')) await importarDoExcel(aoTerminar, lido);
  if (escolhidos.includes('producao')) {
    const { importarSafras } = await import('../modulos/resina/importar-safras-tela.js');
    await importarSafras(lido, aoTerminar);
  }
  if (escolhidos.includes('conta')) {
    const { importarConta } = await import('../modulos/resina/importar-conta-tela.js');
    // uma conferência por aba (cada aba é uma conta: CNPJ, CPF...)
    for (const aba of tipos.conta) await importarConta(contaAtual, aoTerminar, { ...lido, aba });
  }
}

/** Janela "o que tem neste arquivo": a pessoa escolhe o que importar */
function escolherPartes(arquivo, tipos, achados) {
  return new Promise((resolver) => {
    let resposta = null;
    const d = dialogo({
      titulo: 'O que tem nesta planilha',
      largura: 'max-w-lg',
      corpo: `<form class="grid gap-4" novalidate>
        <p class="text-sm text-stone-700 dark:text-stone-300">Arquivo <strong class="break-all">${esc(arquivo.name)}</strong>. Encontrei:</p>
        <fieldset class="grid gap-2"><legend class="sr-only">Partes para importar</legend>
          ${achados.map((k) => `<label class="opcao-lista">
            <input type="checkbox" class="mt-0.5 size-5 shrink-0 accent-brand-600" value="${k}" checked>
            <span class="grid gap-0.5"><span class="font-semibold">${TIPOS_PLANILHA[k][0]}</span>
            <span class="text-sm text-stone-600 dark:text-stone-400">${TIPOS_PLANILHA[k][1]}. Abas: ${tipos[k].map(esc).join(', ')}</span></span>
          </label>`).join('')}
        </fieldset>
        ${tipos.resumo.length ? `<p class="text-sm text-stone-600 dark:text-stone-400">A aba ${tipos.resumo.map(esc).join(', ')} é só o resumo por mês e não precisa ser importada.</p>` : ''}
        ${tipos.outras.length ? `<p class="text-sm text-stone-600 dark:text-stone-400">Abas que não reconheci e ficam de fora: ${tipos.outras.map(esc).join(', ')}.</p>` : ''}
        <p class="text-sm text-stone-600 dark:text-stone-400">Cada parte abre a sua conferência, uma depois da outra, antes de gravar.</p>
        <div class="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <button type="button" class="btn-neutro" data-fechar>Cancelar</button>
          <button type="submit" class="btn-primario">${icone('check')} Continuar</button>
        </div>
      </form>`,
    });
    d.querySelector('form').addEventListener('submit', (e) => {
      e.preventDefault();
      resposta = [...d.querySelectorAll('input[type=checkbox]:checked')].map((x) => x.value);
      d.close();
    });
    d.addEventListener('close', () => resolver(resposta));
  });
}

/**
 * Importar só o caixa (modelo NOVO_CAIXA). `aoTerminar` é chamado depois de importar (e depois de desfazer).
 * `lido` = arquivo já aberto pela importação geral ({arquivo, abas}). Retorna uma Promise que termina quando a janela fecha.
 */
export async function importarDoExcel(aoTerminar, lido = null) {
  const arquivo = lido?.arquivo || await escolherArquivo();
  if (!arquivo) return;
  let abas;
  try {
    abas = reconhecerAbas(lido?.abas || await lerXlsx(arquivo));
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
  // na importação geral, as outras abas vão para a Resina (não são "ignoradas")
  const ignoradas = lido ? [] : abas.filter((a) => !a.modelo).map((a) => a.nome);
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
  return new Promise((resolver) => d.addEventListener('close', () => resolver()));
}

function textoContagem(c) {
  if (!c.caixa && !c.cartao) return 'Aba vazia';
  return `${c.caixa} no caixa · ${c.cartao} no cartão`;
}
