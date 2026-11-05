// =====================================================================
// Todas as conversas com os dados ficam aqui. As telas nunca falam com o
// Supabase direto: elas usam estas funções.
//
// FUNCIONA SEM INTERNET:
//  - leituras vêm da cópia local (local-db.js);
//  - alterações são aplicadas na cópia local na hora e entram na fila
//    (sync.js), que é enviada ao Supabase quando houver conexão.
// Só login, criar família e entrar com convite precisam de internet.
// =====================================================================
import { supabase } from './supabase.js';
import { local } from './local-db.js';
import { enfileirar } from './sync.js';
import { store } from './store.js';
import { mesISO } from './format.js';

/** Transforma erros técnicos em mensagens que qualquer pessoa entende */
export function traduzirErro(e) {
  const m = String(e?.message || e || '');
  if (/invalid login/i.test(m)) return new Error('E-mail ou senha incorretos.');
  if (/email not confirmed/i.test(m)) return new Error('Falta confirmar o e-mail: abra o link que enviamos para sua caixa de entrada.');
  if (/already registered|already been registered/i.test(m)) return new Error('Esse e-mail já tem cadastro. Use a opção "Entrar".');
  if (/password should be|at least 6/i.test(m)) return new Error('A senha precisa ter pelo menos 6 caracteres.');
  if (/rate limit/i.test(m)) return new Error('Muitas tentativas seguidas. Espere um minuto e tente de novo.');
  if (e?.code === '23503' || /foreign key/i.test(m)) return new Error('Esse item já foi usado em lançamentos, por isso não pode ser excluído.');
  if (/muitas tentativas de codigo/i.test(m)) return new Error('Muitas tentativas com código errado. Espere uma hora e tente de novo.');
  if (/codigo de convite/i.test(m)) return new Error('Código de convite não encontrado. Confira as letras e números.');
  if (/outra família/i.test(m)) return new Error('Algum item escolhido não pertence à sua família.');
  if (/failed to fetch|networkerror|load failed/i.test(m)) return new Error('Sem conexão com a internet. Verifique e tente de novo.');
  return new Error(m || 'Algo deu errado. Tente de novo.');
}

const ok = ({ data, error }) => {
  if (error) throw traduzirErro(error);
  return data;
};
const exigirInternet = (acao) => {
  if (!navigator.onLine) throw new Error(`Para ${acao} é preciso estar conectado à internet.`);
};

// ---------- Escritas: aplica na cópia local e coloca na fila
const COM_AUTORIA = ['lancamentos', 'compras_cartao'];
const agora = () => new Date().toISOString();

async function inserir(tabela, linhas) {
  const autoria = COM_AUTORIA.includes(tabela) ? { criado_por: store.user.id, criado_em: agora() } : {};
  const novas = linhas.map((l) => ({ id: crypto.randomUUID(), familia_id: store.familia.id, ...autoria, ...l }));
  const salvas = ok(await local.from(tabela).insert(novas).select());
  await enfileirar({ op: 'insert', tabela, linhas: novas });
  return salvas;
}
async function alterar(tabela, ids, valores) {
  if (COM_AUTORIA.includes(tabela)) valores = { ...valores, alterado_por: store.user.id, alterado_em: agora() };
  const salvas = ok(await local.from(tabela).update(valores).in('id', ids).select());
  await enfileirar({ op: 'update', tabela, ids, valores });
  return salvas;
}
async function remover(tabela, ids) {
  ok(await local.from(tabela).delete().in('id', ids));
  await enfileirar({ op: 'delete', tabela, ids });
}

// ---------- Desfazer: guardar como estava antes e saber voltar
const copiar = async (tabela, coluna, valores) =>
  valores.length ? ok(await local.from(tabela).select('*').in(coluna, valores)) : [];
/** Coloca de volta itens excluídos, com os mesmos ids (o servidor aceita porque o id é UUID) */
async function reinserir(tabela, linhas) {
  if (!linhas.length) return;
  ok(await local.from(tabela).insert(linhas));
  await enfileirar({ op: 'insert', tabela, linhas });
}
/** Volta os campos alterados ao valor anterior */
const valoresAnteriores = (antes, valores) => Object.fromEntries(Object.keys(valores).map((k) => [k, antes[k] ?? null]));

// ---------- Login (precisa de internet)
export const auth = {
  entrar: async (email, senha) => ok(await supabase.auth.signInWithPassword({ email, password: senha })),
  criarConta: async (email, senha) =>
    ok(await supabase.auth.signUp({ email, password: senha, options: { emailRedirectTo: location.href.split('#')[0] } })),
  recuperarSenha: async (email) =>
    ok(await supabase.auth.resetPasswordForEmail(email, { redirectTo: location.href.split('#')[0] })),
  sair: async () => ok(await supabase.auth.signOut()),
};

// ---------- Família
/** Busca a família no Supabase (com internet) ou usa a que está guardada no aparelho */
export async function minhaFamilia() {
  if (!navigator.onLine) return local.familia;
  const vinculo = ok(await supabase.from('membros').select('familia_id').eq('user_id', store.user.id).maybeSingle());
  if (!vinculo) return null;
  const familia = ok(await supabase.from('familias').select('*').eq('id', vinculo.familia_id).single());
  local.definirFamilia(familia);
  return familia;
}
export async function criarFamilia(nome) {
  exigirInternet('criar a família');
  ok(await supabase.rpc('criar_familia', { p_nome: nome }));
  return minhaFamilia();
}
export async function entrarFamilia(codigo) {
  exigirInternet('entrar na família');
  const familiaId = ok(await supabase.rpc('entrar_familia', { p_codigo: codigo.trim().toUpperCase() }));
  if (!familiaId) throw new Error('Código de convite não encontrado. Confira as letras e números.');
  return minhaFamilia();
}
/** Muda o nome com que você aparece no sistema ("Thiago") */
export async function mudarMeuNome(nome) {
  ok(await local.from('membros').update({ nome }).eq('user_id', store.user.id));
  await enfileirar({ op: 'update', tabela: 'membros', onde: { user_id: store.user.id, familia_id: store.familia.id }, valores: { nome } });
  await carregarCadastros();
}

export async function renomearFamilia(nome) {
  const familia = { ...store.familia, nome };
  local.definirFamilia(familia);
  await enfileirar({ op: 'update', tabela: 'familias', ids: [familia.id], valores: { nome } });
  return familia;
}

// ---------- Cadastros (contas, cartões, categorias, pessoas)
export async function carregarCadastros() {
  for (const t of ['contas', 'cartoes', 'categorias', 'pessoas']) {
    store[t] = ok(await local.from(t).select('*').order('nome'));
  }
  store.membros = ok(await local.from('membros').select('*').order('user_id'));
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
 * mesmo valor, mesma data e (mesma categoria, descrição parecida ou lançado há menos de 2 horas).
 * Só considera o que foi lançado por OUTRA pessoa, ou por você mesmo há menos de 10 minutos.
 * Retorna o item encontrado (com `origem`: 'caixa' ou 'cartao') ou null.
 */
export async function procurarParecido({ tipo, valor, data, categoria_id, descricao }) {
  const centavos = (v) => Math.round(Number(v) * 100);
  const minutosDesde = (iso) => (iso ? (Date.now() - new Date(iso)) / 60000 : Infinity);
  const candidatos = [];
  const lancs = ok(await local.from('lancamentos').select('*').eq('vencimento', data));
  lancs
    .filter((l) => !l.fatura_cartao_id && (tipo === 'entrada' ? l.tipo === 'entrada' : l.tipo === 'saida'))
    .forEach((l) => candidatos.push({ ...l, origem: 'caixa', valorTotal: l.valor, data: l.vencimento }));
  if (tipo !== 'entrada') {
    ok(await local.from('compras_cartao').select('*').eq('data_compra', data))
      .forEach((c) => candidatos.push({ ...c, origem: 'cartao', valorTotal: c.valor_total, data: c.data_compra }));
  }
  return candidatos.find((c) => {
    if (centavos(c.valorTotal) !== centavos(valor) || !c.criado_por) return false;
    const minutos = minutosDesde(c.criado_em);
    const deOutro = c.criado_por !== store.user.id;
    if (!deOutro && minutos > 10) return false;
    return c.categoria_id === categoria_id || parecidos(c.descricao, descricao) || minutos < 120;
  }) || null;
}

/** Pagamentos de fatura registrados para um mês (são lançamentos com fatura_mes preenchido) */
export const pagamentosDeFatura = async (mes = store.mes) =>
  ok(await local.from('lancamentos').select('*').eq('fatura_mes', mesISO(mes)));
