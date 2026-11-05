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
async function inserir(tabela, linhas) {
  const novas = linhas.map((l) => ({ id: crypto.randomUUID(), familia_id: store.familia.id, ...l }));
  const salvas = ok(await local.from(tabela).insert(novas).select());
  await enfileirar({ op: 'insert', tabela, linhas: novas });
  return salvas;
}
async function alterar(tabela, ids, valores) {
  const salvas = ok(await local.from(tabela).update(valores).in('id', ids).select());
  await enfileirar({ op: 'update', tabela, ids, valores });
  return salvas;
}
async function remover(tabela, ids) {
  ok(await local.from(tabela).delete().in('id', ids));
  await enfileirar({ op: 'delete', tabela, ids });
}

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
}

/** Cria (sem id) ou atualiza (com id) um item e atualiza a lista em memória */
export async function salvarItem(tabela, item) {
  const { id, ...valores } = item;
  const [salvo] = id ? await alterar(tabela, [id], valores) : await inserir(tabela, [valores]);
  await carregarCadastros();
  return salvo;
}
export async function excluirItem(tabela, id) {
  await remover(tabela, [id]);
  await carregarCadastros();
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
export const atualizarLancamento = async (id, valores) => (await alterar('lancamentos', [id], valores))[0];
export const excluirLancamentos = (ids) => remover('lancamentos', ids);

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

export const excluirCompra = (id) => remover('compras_cartao', [id]);

/** Pagamentos de fatura registrados para um mês (são lançamentos com fatura_mes preenchido) */
export const pagamentosDeFatura = async (mes = store.mes) =>
  ok(await local.from('lancamentos').select('*').eq('fatura_mes', mesISO(mes)));
