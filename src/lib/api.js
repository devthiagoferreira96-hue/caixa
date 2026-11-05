// =====================================================================
// Todas as leituras e gravações de dados passam por aqui.
// As telas nunca mexem no armazenamento direto: elas usam estas funções.
// Os dados ficam no aparelho (local-db.js), cifrados com a senha.
// =====================================================================
import { local } from './local-db.js';
import { store } from './store.js';
import { mesISO } from './format.js';

/** Transforma erros técnicos em mensagens que qualquer pessoa entende */
export function traduzirErro(e) {
  const m = String(e?.message || e || '');
  if (e?.code === '23503' || /foreign key/i.test(m)) return new Error('Esse item já foi usado em lançamentos, por isso não pode ser excluído.');
  return new Error(m || 'Algo deu errado. Tente de novo.');
}

const ok = ({ data, error }) => {
  if (error) throw traduzirErro(error);
  return data;
};

// ---------- Escritas: aplica na cópia local e coloca na fila
const COM_DATA = ['lancamentos', 'compras_cartao']; // guardam quando foram lançados/alterados
const agora = () => new Date().toISOString();

async function inserir(tabela, linhas) {
  const novas = linhas.map((l) => ({ id: crypto.randomUUID(), ...(COM_DATA.includes(tabela) ? { criado_em: agora() } : {}), ...l }));
  return ok(await local.from(tabela).insert(novas).select());
}
async function alterar(tabela, ids, valores) {
  if (COM_DATA.includes(tabela)) valores = { ...valores, alterado_em: agora() };
  return ok(await local.from(tabela).update(valores).in('id', ids).select());
}
async function remover(tabela, ids) {
  ok(await local.from(tabela).delete().in('id', ids));
}

// ---------- Desfazer: guardar como estava antes e saber voltar
const copiar = async (tabela, coluna, valores) =>
  valores.length ? ok(await local.from(tabela).select('*').in(coluna, valores)) : [];
/** Coloca de volta itens excluídos, com os mesmos ids */
async function reinserir(tabela, linhas) {
  if (!linhas.length) return;
  ok(await local.from(tabela).insert(linhas));
}
/** Volta os campos alterados ao valor anterior */
const valoresAnteriores = (antes, valores) => Object.fromEntries(Object.keys(valores).map((k) => [k, antes[k] ?? null]));

// ---------- Cadastros (contas, cartões, categorias, pessoas)
export async function carregarCadastros() {
  for (const t of ['contas', 'cartoes', 'categorias', 'pessoas']) {
    store[t] = ok(await local.from(t).select('*').order('nome'));
  }
}

/**
 * Cria (sem id) ou atualiza (com id) um item e atualiza a lista em memória.
 * Retorna o item salvo com `desfazer()`.
 */
export async function salvarItem(tabela, item) {
  const { id, ...valores } = item;
  let salvo, desfazer;
  if (id) {
    const [antes] = await copiar(tabela, 'id', [id]);
    [salvo] = await alterar(tabela, [id], valores);
    desfazer = () => alterar(tabela, [id], valoresAnteriores(antes, valores));
  } else {
    [salvo] = await inserir(tabela, [valores]);
    desfazer = () => remover(tabela, [salvo.id]);
  }
  await carregarCadastros();
  return { ...salvo, desfazer: async () => { await desfazer(); await carregarCadastros(); } };
}

/** Exclui um item de Ajustes. Retorna `desfazer()`, que traz de volta o item e o que dependia dele. */
export async function excluirItem(tabela, id) {
  const [item] = await copiar(tabela, 'id', [id]);
  let compras = [], parcelas = [], lancs = [], coluna = null;
  if (tabela === 'cartoes') {
    compras = await copiar('compras_cartao', 'cartao_id', [id]);
    parcelas = await copiar('parcelas', 'compra_id', compras.map((c) => c.id));
    lancs = await copiar('lancamentos', 'fatura_cartao_id', [id]);
    coluna = 'fatura_cartao_id';
  }
  if (tabela === 'pessoas') { lancs = await copiar('lancamentos', 'pessoa_id', [id]); coluna = 'pessoa_id'; }
  await remover(tabela, [id]);
  await carregarCadastros();
  return async () => {
    await reinserir(tabela, [item]);
    await reinserir('compras_cartao', compras);
    await reinserir('parcelas', parcelas);
    if (lancs.length) await alterar('lancamentos', lancs.map((l) => l.id), { [coluna]: id });
    await carregarCadastros();
  };
}

/** Encontra a pessoa pelo nome ou cadastra uma nova */
export async function pessoaPorNome(nome) {
  nome = nome.trim();
  if (!nome) return null;
  const existente = store.pessoas.find((p) => p.nome.toLowerCase() === nome.toLowerCase());
  return existente ? existente.id : (await salvarItem('pessoas', { nome, tipo: 'Outro' })).id;
}

// ---------- Lançamentos do caixa
export const lancamentosEntre = async (inicio, fim) =>
  ok(await local.from('lancamentos').select('*').gte('vencimento', inicio).lt('vencimento', fim).order('vencimento'));

export const lancamentosDoMes = (mes = store.mes) => lancamentosEntre(mesISO(mes), mesISO(mes, 1));

/** Tudo que ainda não foi pago e vence até a data informada (inclui atrasados) */
export const pendentesAte = async (data) =>
  ok(await local.from('lancamentos').select('*').eq('pago', false).lte('vencimento', data).order('vencimento'));

export const criarLancamentos = (linhas) => inserir('lancamentos', linhas);

/** Altera um lançamento. Retorna o lançamento com `desfazer()`. */
export async function atualizarLancamento(id, valores) {
  const [antes] = await copiar('lancamentos', 'id', [id]);
  const [depois] = await alterar('lancamentos', [id], valores);
  return { ...depois, desfazer: () => alterar('lancamentos', [id], valoresAnteriores(antes, valores)) };
}

/** Exclui lançamentos. Retorna `desfazer()`, que coloca todos de volta. */
export async function excluirLancamentos(ids) {
  const linhas = await copiar('lancamentos', 'id', ids);
  await remover('lancamentos', ids);
  return () => reinserir('lancamentos', linhas);
}

/** Lançamentos repetidos (mesmo grupo) a partir de uma data */
export const lancamentosDoGrupo = async (grupo, aPartirDe) =>
  ok(await local.from('lancamentos').select('*').eq('grupo', grupo).gte('vencimento', aPartirDe));

/** Saldo de cada conta: saldo inicial + entradas pagas − saídas pagas. Retorna Map(conta_id → saldo) */
export async function saldosContas() {
  const pagos = ok(await local.from('lancamentos').select('*').eq('pago', true));
  const saldos = new Map(store.contas.map((c) => [c.id, Number(c.saldo_inicial || 0)]));
  for (const l of pagos) {
    if (saldos.has(l.conta_id)) saldos.set(l.conta_id, saldos.get(l.conta_id) + (l.tipo === 'entrada' ? 1 : -1) * Number(l.valor));
  }
  return saldos;
}

// ---------- Cartões
/** Parcelas cujas faturas vencem entre as datas, já com os dados da compra em `p.compra` */
export async function parcelasEntre(inicio, fim) {
  const parcelas = ok(await local.from('parcelas').select('*').gte('fatura_mes', inicio).lt('fatura_mes', fim));
  const ids = [...new Set(parcelas.map((p) => p.compra_id))];
  const compras = ids.length ? ok(await local.from('compras_cartao').select('*').in('id', ids)) : [];
  const porId = new Map(compras.map((c) => [c.id, c]));
  return parcelas
    .map((p) => ({ ...p, valor: Number(p.valor), compra: porId.get(p.compra_id) }))
    .filter((p) => p.compra)
    .sort((a, b) => a.compra.data_compra.localeCompare(b.compra.data_compra));
}

export const parcelasDoMes = (mes = store.mes) => parcelasEntre(mesISO(mes), mesISO(mes, 1));

/** Salva a compra e as parcelas (a ordem na fila garante que a compra chega antes das parcelas) */
export async function criarCompra(compra, parcelas) {
  const [salva] = await inserir('compras_cartao', [compra]);
  await inserir('parcelas', parcelas.map((p) => ({ ...p, compra_id: salva.id })));
  return salva;
}

/** Exclui a compra e as parcelas. Retorna `desfazer()`. */
export async function excluirCompra(id) {
  const compra = await copiar('compras_cartao', 'id', [id]);
  const parcelas = await copiar('parcelas', 'compra_id', [id]);
  await remover('compras_cartao', [id]);
  return async () => {
    await reinserir('compras_cartao', compra);
    await reinserir('parcelas', parcelas);
  };
}

// ---------- Gasto parecido já lançado (evita lançar a mesma coisa duas vezes)
const normalizar = (t) => String(t || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9 ]/g, ' ').trim();
const parecidos = (a, b) => {
  const [x, y] = [normalizar(a), normalizar(b)];
  if (!x || !y) return false;
  return x === y || x.includes(y) || y.includes(x) || x.split(' ')[0] === y.split(' ')[0];
};

/**
 * Procura um lançamento ou compra no cartão parecido com o que vai ser salvo:
 * mesmo valor, mesma data e (mesma categoria ou descrição parecida).
 * Retorna o item encontrado (com `origem`: 'caixa' ou 'cartao') ou null.
 */
export async function procurarParecido({ tipo, valor, data, categoria_id, descricao }) {
  const centavos = (v) => Math.round(Number(v) * 100);
  const candidatos = [];
  const lancs = ok(await local.from('lancamentos').select('*').eq('vencimento', data));
  lancs
    .filter((l) => !l.fatura_cartao_id && (tipo === 'entrada' ? l.tipo === 'entrada' : l.tipo === 'saida'))
    .forEach((l) => candidatos.push({ ...l, origem: 'caixa', valorTotal: l.valor }));
  if (tipo !== 'entrada') {
    ok(await local.from('compras_cartao').select('*').eq('data_compra', data))
      .forEach((c) => candidatos.push({ ...c, origem: 'cartao', valorTotal: c.valor_total }));
  }
  return candidatos.find((c) => centavos(c.valorTotal) === centavos(valor) &&
    (c.categoria_id === categoria_id || parecidos(c.descricao, descricao))) || null;
}

/** Pagamentos de fatura registrados para um mês (são lançamentos com fatura_mes preenchido) */
export const pagamentosDeFatura = async (mes = store.mes) =>
  ok(await local.from('lancamentos').select('*').eq('fatura_mes', mesISO(mes)));

// ---------- Backup
/** Monta o conteúdo do arquivo de backup (todos os dados, sem a senha) */
export function conteudoBackup() {
  return {
    app: 'caixa-familia',
    versao: 1,
    exportado_em: new Date().toISOString(),
    usuario: local.usuario,
    tabelas: local.tabelas(),
  };
}

/** Lê e confere um arquivo de backup. Retorna as tabelas ou lança erro com mensagem clara. */
export function lerBackup(textoDoArquivo) {
  let dados;
  try { dados = JSON.parse(textoDoArquivo); } catch { throw new Error('Esse arquivo não é um backup do Caixa da Família.'); }
  if (dados?.app !== 'caixa-familia' || typeof dados.tabelas !== 'object') {
    throw new Error('Esse arquivo não é um backup do Caixa da Família.');
  }
  for (const t of local.TABELAS) {
    if (dados.tabelas[t] !== undefined && !Array.isArray(dados.tabelas[t])) throw new Error('O arquivo de backup está danificado.');
  }
  return dados;
}

/** Restaura um backup. Retorna `desfazer()`, que volta os dados de antes. */
export async function restaurarBackup(dados) {
  const antes = structuredClone(local.tabelas());
  await local.substituir(dados.tabelas);
  await carregarCadastros();
  return async () => { await local.substituir(antes); await carregarCadastros(); };
}
