// =====================================================================
// Todas as conversas com o banco de dados ficam aqui.
// As telas nunca chamam o Supabase direto: elas usam estas funções.
// =====================================================================
import { supabase, modoDemo } from './supabase.js';
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
  if (/outra família/i.test(m)) return new Error('Algum item escolhido não pertence à sua família. Recarregue a página e tente de novo.');
  if (/failed to fetch|networkerror|load failed/i.test(m)) return new Error('Sem conexão com a internet. Verifique e tente de novo.');
  return new Error(m || 'Algo deu errado. Tente de novo.');
}

const ok = ({ data, error }) => {
  if (error) throw traduzirErro(error);
  return data;
};
const daFamilia = (obj) => ({ ...obj, familia_id: store.familia.id });

// ---------- Login
export const auth = {
  entrar: async (email, senha) => ok(await supabase.auth.signInWithPassword({ email, password: senha })),
  criarConta: async (email, senha) =>
    ok(await supabase.auth.signUp({ email, password: senha, options: { emailRedirectTo: location.href.split('#')[0] } })),
  recuperarSenha: async (email) =>
    ok(await supabase.auth.resetPasswordForEmail(email, { redirectTo: location.href.split('#')[0] })),
  sair: async () => ok(await supabase.auth.signOut()),
};

// ---------- Família
export async function minhaFamilia() {
  const vinculo = ok(await supabase.from('membros').select('familia_id').eq('user_id', store.user.id).maybeSingle());
  if (!vinculo) return null;
  return ok(await supabase.from('familias').select('*').eq('id', vinculo.familia_id).single());
}
export async function criarFamilia(nome) {
  ok(await supabase.rpc('criar_familia', { p_nome: nome }));
  return minhaFamilia();
}
export async function entrarFamilia(codigo) {
  const familiaId = ok(await supabase.rpc('entrar_familia', { p_codigo: codigo.trim().toUpperCase() }));
  if (!familiaId) throw new Error('Código de convite não encontrado. Confira as letras e números.');
  return minhaFamilia();
}
export const renomearFamilia = async (nome) =>
  ok(await supabase.from('familias').update({ nome }).eq('id', store.familia.id).select().single());

// ---------- Cadastros (contas, cartões, categorias, pessoas)
export async function carregarCadastros() {
  const [contas, cartoes, categorias, pessoas] = await Promise.all(
    ['contas', 'cartoes', 'categorias', 'pessoas'].map((t) => supabase.from(t).select('*').order('nome')),
  );
  Object.assign(store, { contas: ok(contas), cartoes: ok(cartoes), categorias: ok(categorias), pessoas: ok(pessoas) });
}

/** Cria (sem id) ou atualiza (com id) um item e atualiza a lista em memória */
export async function salvarItem(tabela, item) {
  const { id, ...valores } = item;
  const salvo = id
    ? ok(await supabase.from(tabela).update(valores).eq('id', id).select().single())
    : ok(await supabase.from(tabela).insert(daFamilia(valores)).select().single());
  const lista = store[tabela];
  const i = lista.findIndex((x) => x.id === salvo.id);
  i >= 0 ? (lista[i] = salvo) : lista.push(salvo);
  lista.sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
  return salvo;
}
export async function excluirItem(tabela, id) {
  ok(await supabase.from(tabela).delete().eq('id', id));
  store[tabela] = store[tabela].filter((x) => x.id !== id);
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
  ok(await supabase.from('lancamentos').select('*').gte('vencimento', inicio).lt('vencimento', fim).order('vencimento'));

export const lancamentosDoMes = (mes = store.mes) => lancamentosEntre(mesISO(mes), mesISO(mes, 1));

/** Tudo que ainda não foi pago e vence até a data informada (inclui atrasados) */
export const pendentesAte = async (data) =>
  ok(await supabase.from('lancamentos').select('*').eq('pago', false).lte('vencimento', data).order('vencimento'));

export const criarLancamentos = async (linhas) =>
  ok(await supabase.from('lancamentos').insert(linhas.map(daFamilia)).select());

export const atualizarLancamento = async (id, valores) =>
  ok(await supabase.from('lancamentos').update(valores).eq('id', id).select().single());

export const excluirLancamentos = async (ids) => ok(await supabase.from('lancamentos').delete().in('id', ids));

/** Lançamentos repetidos (mesmo grupo) a partir de uma data */
export const lancamentosDoGrupo = async (grupo, aPartirDe) =>
  ok(await supabase.from('lancamentos').select('*').eq('grupo', grupo).gte('vencimento', aPartirDe));

/** Saldo de cada conta: saldo inicial + entradas pagas − saídas pagas. Retorna Map(conta_id → saldo) */
export async function saldosContas() {
  if (!modoDemo) {
    const linhas = ok(await supabase.from('saldo_contas').select('*'));
    return new Map(linhas.map((l) => [l.conta_id, Number(l.saldo)]));
  }
  const pagos = ok(await supabase.from('lancamentos').select('*').eq('pago', true));
  const saldos = new Map(store.contas.map((c) => [c.id, Number(c.saldo_inicial || 0)]));
  for (const l of pagos) {
    if (saldos.has(l.conta_id)) saldos.set(l.conta_id, saldos.get(l.conta_id) + (l.tipo === 'entrada' ? 1 : -1) * Number(l.valor));
  }
  return saldos;
}

// ---------- Cartões
/** Parcelas cujas faturas vencem entre as datas, já com os dados da compra em `p.compra` */
export async function parcelasEntre(inicio, fim) {
  const parcelas = ok(await supabase.from('parcelas').select('*').gte('fatura_mes', inicio).lt('fatura_mes', fim));
  const ids = [...new Set(parcelas.map((p) => p.compra_id))];
  const compras = ids.length ? ok(await supabase.from('compras_cartao').select('*').in('id', ids)) : [];
  const porId = new Map(compras.map((c) => [c.id, c]));
  return parcelas
    .map((p) => ({ ...p, valor: Number(p.valor), compra: porId.get(p.compra_id) }))
    .filter((p) => p.compra)
    .sort((a, b) => a.compra.data_compra.localeCompare(b.compra.data_compra));
}

export const parcelasDoMes = (mes = store.mes) => parcelasEntre(mesISO(mes), mesISO(mes, 1));

export async function criarCompra(compra, parcelas) {
  const salva = ok(await supabase.from('compras_cartao').insert(daFamilia(compra)).select().single());
  try {
    ok(await supabase.from('parcelas').insert(parcelas.map((p) => daFamilia({ ...p, compra_id: salva.id }))));
  } catch (e) {
    await supabase.from('compras_cartao').delete().eq('id', salva.id); // desfaz a compra pela metade
    throw e;
  }
  return salva;
}

export const excluirCompra = async (id) => ok(await supabase.from('compras_cartao').delete().eq('id', id));

/** Pagamentos de fatura registrados para um mês (são lançamentos com fatura_mes preenchido) */
export const pagamentosDeFatura = async (mes = store.mes) =>
  ok(await supabase.from('lancamentos').select('*').eq('fatura_mes', mesISO(mes)));
