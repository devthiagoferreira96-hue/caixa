// =====================================================================
// Leituras e gravações do módulo Resina (cargas e seus produtores).
// Os cadastros (produtores, motoristas...) usam salvarItem/excluirItem de api.js.
// =====================================================================
import { local } from '../../lib/local-db.js';
import { traduzirErro, carregarCadastros } from '../../lib/api.js';
import { mesISO } from '../../lib/format.js';
import { store } from '../../lib/store.js';
import { proximoNumero, creditosDoCaixa } from './calculos.js';
import { lerPreferencias } from '../../lib/preferencias.js';

const ok = ({ data, error }) => {
  if (error) throw traduzirErro(error);
  return data;
};
const agora = () => new Date().toISOString();

/** O módulo aparece quando a pessoa ligou em Ajustes (ou, se nunca mexeu, quando já existem dados da resina) */
export function resinaAtiva() {
  const p = lerPreferencias().resina;
  if (p === true || p === false) return p;
  const t = local.tabelas?.() || {};
  return Boolean(t.resina_cargas?.length || t.resina_produtores?.length);
}

/** Cargas de um período, com os produtores de cada uma */
export async function cargasEntre(inicio, fim) {
  const cargas = ok(await local.from('resina_cargas').select('*').gte('data', inicio).lt('data', fim).order('data'));
  const itens = cargas.length ? ok(await local.from('resina_carga_itens').select('*').in('carga_id', cargas.map((c) => c.id))) : [];
  const porCarga = new Map(cargas.map((c) => [c.id, []]));
  itens.forEach((i) => porCarga.get(i.carga_id)?.push(i));
  return { cargas, itensPorCarga: porCarga };
}
export const cargasDoMes = (mes = store.mes) => cargasEntre(mesISO(mes), mesISO(mes, 1));

export async function lerCarga(id) {
  const carga = ok(await local.from('resina_cargas').select('*').eq('id', id).maybeSingle());
  if (!carga) return null;
  const itens = ok(await local.from('resina_carga_itens').select('*').eq('carga_id', id));
  return { carga, itens };
}

/** A última carga registrada (para sugerir motorista, caminhão e produtores) */
export async function ultimaCarga() {
  const todas = ok(await local.from('resina_cargas').select('*').order('criado_em', { ascending: false }));
  return todas[0] ? lerCarga(todas[0].id) : null;
}

export async function numeroPara(data, idAtual) {
  const todas = ok(await local.from('resina_cargas').select('*'));
  return proximoNumero(todas.filter((c) => c.id !== idAtual), data);
}

/**
 * Salva a carga e a lista de produtores dela (cria ou atualiza).
 * Retorna a carga salva com `desfazer()`.
 */
export async function salvarCarga(carga, itens) {
  const antes = carga.id ? await lerCarga(carga.id) : null;
  let salva;
  if (antes) {
    const { id, ...valores } = carga;
    [salva] = ok(await local.from('resina_cargas').update({ ...valores, alterado_em: agora() }).eq('id', id).select());
    ok(await local.from('resina_carga_itens').delete().eq('carga_id', id));
  } else {
    // o número é conferido de novo na hora de salvar (outra aba pode ter criado uma carga)
    const numero = await numeroPara(carga.data);
    [salva] = ok(await local.from('resina_cargas').insert([{ ...carga, id: crypto.randomUUID(), numero, criado_em: agora() }]).select());
  }
  const linhas = itens.map(({ produtor_id, tbs, arrendamento, kg_manual }) => ({
    id: crypto.randomUUID(), carga_id: salva.id, produtor_id, tbs, arrendamento, kg_manual: kg_manual ?? null,
  }));
  if (linhas.length) ok(await local.from('resina_carga_itens').insert(linhas));

  const desfazer = async () => {
    ok(await local.from('resina_cargas').delete().eq('id', salva.id)); // apaga os itens junto
    if (antes) {
      ok(await local.from('resina_cargas').insert([antes.carga]));
      if (antes.itens.length) ok(await local.from('resina_carga_itens').insert(antes.itens));
    }
  };
  return { ...salva, desfazer };
}

/** Exclui a carga (e os produtores dela). Retorna `desfazer()`. */
export async function excluirCarga(id) {
  const antes = await lerCarga(id);
  if (!antes) return async () => {};
  ok(await local.from('resina_cargas').delete().eq('id', id));
  return async () => {
    ok(await local.from('resina_cargas').insert([antes.carga]));
    if (antes.itens.length) ok(await local.from('resina_carga_itens').insert(antes.itens));
  };
}

// ---------- Conta corrente do arrendamento
/** Todas as cargas (o saldo da conta corrente vem desde o começo) */
export const todasAsCargas = () => cargasEntre('0000-01-01', '9999-12-31');

/** Destinos já usados, do mais recente para o mais antigo (sugestões no campo da carga) */
export async function destinosUsados() {
  const todas = ok(await local.from('resina_cargas').select('*').order('data', { ascending: false }));
  const vistos = new Map();
  for (const c of todas) {
    const d = (c.destino || '').trim();
    if (d && !vistos.has(d.toLowerCase())) vistos.set(d.toLowerCase(), d);
  }
  return [...vistos.values()];
}

export const lerMovimentos = async () => ok(await local.from('resina_movimentos').select('*').order('data'));

/** Lançamentos da conta corrente + a parte dos insumos já recebida no Caixa (para os saldos; os do Caixa não se editam aqui) */
export const movimentosComCaixa = async () => [...await lerMovimentos(), ...creditosDoCaixa(local.tabelas().lancamentos)];

/** Cria ou atualiza um lançamento manual da conta corrente. Retorna o salvo com `desfazer()`. */
export async function salvarMovimento(mov) {
  const { id, ...valores } = mov;
  if (id) {
    const antes = ok(await local.from('resina_movimentos').select('*').eq('id', id).maybeSingle());
    const [salvo] = ok(await local.from('resina_movimentos').update({ ...valores, alterado_em: agora() }).eq('id', id).select());
    return { ...salvo, desfazer: async () => { ok(await local.from('resina_movimentos').delete().eq('id', id)); ok(await local.from('resina_movimentos').insert([antes])); } };
  }
  const [salvo] = ok(await local.from('resina_movimentos').insert([{ ...valores, id: crypto.randomUUID(), criado_em: agora() }]).select());
  return { ...salvo, desfazer: async () => ok(await local.from('resina_movimentos').delete().eq('id', salvo.id)) };
}

export async function excluirMovimento(id) {
  const antes = ok(await local.from('resina_movimentos').select('*').eq('id', id).maybeSingle());
  ok(await local.from('resina_movimentos').delete().eq('id', id));
  return async () => { if (antes) ok(await local.from('resina_movimentos').insert([antes])); };
}

// ---------- Insumos usados por produtor
/** Lançamentos de insumos de um período (início incluído, fim não) */
export const insumosEntre = async (inicio, fim) =>
  ok(await local.from('resina_insumos').select('*').gte('data', inicio).lt('data', fim).order('data'));

/**
 * Grava vários produtos de uma vez para um produtor (uma linha por produto).
 * Com `substituirIds`, apaga essas linhas antes (usado ao mudar uma entrega). Retorna `desfazer()`.
 */
export async function salvarInsumos(linhas, substituirIds = []) {
  const antes = substituirIds.length ? ok(await local.from('resina_insumos').select('*').in('id', substituirIds)) : [];
  if (substituirIds.length) ok(await local.from('resina_insumos').delete().in('id', substituirIds));
  const novas = linhas.map((l) => ({ ...l, id: crypto.randomUUID(), criado_em: agora() }));
  if (novas.length) ok(await local.from('resina_insumos').insert(novas));
  return async () => {
    if (novas.length) ok(await local.from('resina_insumos').delete().in('id', novas.map((n) => n.id)));
    if (antes.length) ok(await local.from('resina_insumos').insert(antes));
  };
}

export async function excluirInsumos(ids) {
  const antes = ok(await local.from('resina_insumos').select('*').in('id', ids));
  ok(await local.from('resina_insumos').delete().in('id', ids));
  return async () => { if (antes.length) ok(await local.from('resina_insumos').insert(antes)); };
}

// ---------- Importar a planilha da conta corrente
/**
 * Grava o plano montado por montarImportacao (importar-conta.js): produtos novos, cargas,
 * insumos e lançamentos. Se algo falhar no meio, volta tudo. Retorna `desfazer()`.
 */
export async function gravarImportacaoConta(plano) {
  const antes = structuredClone(local.tabelas());
  try {
    if (plano.produtosNovos.length) ok(await local.from('resina_produtos').insert(plano.produtosNovos));
    const todas = ok(await local.from('resina_cargas').select('*'));
    const base = Date.now();
    const quando = (ordem) => new Date(base + ordem).toISOString(); // mantém a ordem da planilha no mesmo dia
    for (const { carga, itens, linhas } of plano.cargas) {
      const numero = proximoNumero(todas, carga.data);
      const nova = { ...carga, id: crypto.randomUUID(), numero, criado_em: quando(linhas[0]) };
      ok(await local.from('resina_cargas').insert([nova]));
      todas.push(nova);
      ok(await local.from('resina_carga_itens').insert(itens.map(({ produtor_id, tbs, arrendamento, kg_manual }) => ({
        id: crypto.randomUUID(), carga_id: nova.id, produtor_id, tbs, arrendamento, kg_manual: kg_manual ?? null,
      }))));
    }
    // cargas que já existiam (vindas da planilha de safras): ganham conta, preço, nota e o % do arrendamento
    for (const c of plano.completar || []) {
      ok(await local.from('resina_cargas').update({ ...c.carga, alterado_em: agora() }).eq('id', c.carga_id));
      ok(await local.from('resina_carga_itens').update({ arrendamento: c.arrendamento }).eq('id', c.item_id));
    }
    if (plano.insumos.length) {
      ok(await local.from('resina_insumos').insert(plano.insumos.map(({ ordem, linha, ...i }) => ({ ...i, id: crypto.randomUUID(), criado_em: quando(ordem) }))));
    }
    if (plano.movimentos.length) {
      ok(await local.from('resina_movimentos').insert(plano.movimentos.map(({ ordem, linha, ...m }) => ({ ...m, id: crypto.randomUUID(), criado_em: quando(ordem) }))));
    }
  } catch (e) {
    await local.substituir(antes);
    await carregarCadastros();
    throw e;
  }
  await carregarCadastros();
  return async () => { await local.substituir(antes); await carregarCadastros(); };
}

// ---------- Importar a planilha de produção (CONTROLE ANUAL / SAFRAS)
/**
 * Grava o plano montado por montarImportacaoSafras (importar-safras.js): produtores novos e cargas.
 * Se algo falhar no meio, volta tudo. Retorna `desfazer()`.
 */
export async function gravarImportacaoSafras(plano) {
  const antes = structuredClone(local.tabelas());
  try {
    if (plano.produtoresNovos.length) ok(await local.from('resina_produtores').insert(plano.produtoresNovos));
    const todas = ok(await local.from('resina_cargas').select('*'));
    const base = Date.now();
    plano.cargas.forEach((x, i) => { x.ordem = i; });
    for (const { carga, itens, ordem } of plano.cargas) {
      const nova = { ...carga, id: crypto.randomUUID(), numero: proximoNumero(todas, carga.data), criado_em: new Date(base + ordem).toISOString() };
      ok(await local.from('resina_cargas').insert([nova]));
      todas.push(nova);
      ok(await local.from('resina_carga_itens').insert(itens.map(({ produtor_id, tbs, arrendamento, kg_manual }) => ({
        id: crypto.randomUUID(), carga_id: nova.id, produtor_id, tbs, arrendamento, kg_manual: kg_manual ?? null,
      }))));
    }
  } catch (e) {
    await local.substituir(antes);
    await carregarCadastros();
    throw e;
  }
  await carregarCadastros();
  return async () => { await local.substituir(antes); await carregarCadastros(); };
}
