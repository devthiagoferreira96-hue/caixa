// =====================================================================
// Módulo Resina: quais tabelas existem e como conferir cada uma num backup.
// As tabelas ficam no mesmo arquivo cifrado do Caixa, mas são independentes dele.
// =====================================================================

/** Cadastros que ficam em memória (store) para as telas usarem sem esperar */
export const CADASTROS_RESINA = ['resina_fazendas', 'resina_produtores', 'resina_motoristas', 'resina_caminhoes', 'resina_precos', 'resina_titulares', 'resina_produtos'];

/** Unidades dos produtos (insumos) */
export const UNIDADES = [['un', 'unidade'], ['kg', 'kg'], ['L', 'litro'], ['saco', 'saco'], ['galão', 'galão'], ['caixa', 'caixa'], ['pacote', 'pacote'], ['m', 'metro']];

/** Tipos de lançamento manual da conta corrente */
export const TIPOS_MOVIMENTO = [['credito', 'Recebimento (crédito)'], ['debito', 'Valor a receber (débito)']];

/** Capacidade usada quando a carga não tem caminhão escolhido */
export const CAPACIDADE_PADRAO = 190;
export const CAPACIDADE_MAXIMA = 400;

/** Cores sugeridas para produtores novos (a pessoa pode trocar) */
export const CORES_PRODUTOR = ['#2E9E6B', '#7C3AED', '#C2410C', '#2563EB', '#DB2777', '#0891B2', '#65A30D', '#9333EA', '#B45309', '#0F766E'];

const COR = /^#[0-9a-f]{6}$/i;
export const corValida = (c) => typeof c === 'string' && COR.test(c);

/**
 * Confere as tabelas da resina de um backup (que pode ter sido editado à mão).
 * Corrige o que dá e deixa de fora o que não dá para usar. `comId` e os conferidores
 * vêm de api.js para seguir as mesmas regras do Caixa.
 */
export function conferirResina(entrada, saida, comId, { numero, dataValida, texto }) {
  let corrigidos = 0, ignorados = 0;
  const nome = (l, padrao) => {
    if (typeof l.nome === 'string' && l.nome.trim()) return l.nome.trim().slice(0, 60);
    corrigidos++;
    return padrao;
  };
  const lista = (t) => (Array.isArray(entrada[t]) ? entrada[t] : []);
  const pct = (v) => {
    const n = numero(v ?? 0);
    if (n === null || n < 0 || n > 100) { corrigidos++; return 0; }
    return n;
  };

  lista('resina_fazendas').forEach((l0) => {
    const l = comId(l0); if (!l) return;
    saida.resina_fazendas.push({ ...l, nome: nome(l, 'Fazenda'), proprietario: texto(l.proprietario, 60) });
  });
  lista('resina_produtores').forEach((l0, i) => {
    const l = comId(l0); if (!l) return;
    const cor = corValida(l.cor) ? l.cor : (corrigidos++, CORES_PRODUTOR[i % CORES_PRODUTOR.length]);
    saida.resina_produtores.push({ ...l, nome: nome(l, 'Produtor sem nome'), cor, arrendamento: pct(l.arrendamento), ativo: l.ativo !== false });
  });
  lista('resina_motoristas').forEach((l0) => {
    const l = comId(l0); if (!l) return;
    saida.resina_motoristas.push({ ...l, nome: nome(l, 'Motorista sem nome'), telefone: texto(l.telefone, 30), ativo: l.ativo !== false });
  });
  lista('resina_caminhoes').forEach((l0) => {
    const l = comId(l0); if (!l) return;
    const cap = Number.isInteger(+l.capacidade) && +l.capacidade >= 1 && +l.capacidade <= CAPACIDADE_MAXIMA ? +l.capacidade : (corrigidos++, CAPACIDADE_PADRAO);
    saida.resina_caminhoes.push({ ...l, nome: nome(l, 'Sem placa'), descricao: texto(l.descricao, 60), capacidade: cap, ativo: l.ativo !== false });
  });
  lista('resina_titulares').forEach((l0) => {
    const l = comId(l0); if (!l) return;
    saida.resina_titulares.push({ ...l, nome: nome(l, 'Conta sem nome'), documento: texto(l.documento, 20), ativo: l.ativo !== false });
  });
  lista('resina_produtos').forEach((l0) => {
    const l = comId(l0); if (!l) return;
    const unidade = UNIDADES.some(([u]) => u === l.unidade) ? l.unidade : (corrigidos++, 'un');
    saida.resina_produtos.push({ ...l, nome: nome(l, 'Produto sem nome'), unidade, valor_unitario: Math.max(0, numero(l.valor_unitario) ?? 0), ativo: l.ativo !== false });
  });
  lista('resina_precos').forEach((l0) => {
    const l = comId(l0); if (!l) return;
    const valor = numero(l.valor_kg);
    if (!dataValida(l.inicio) || !valor || valor < 0) { ignorados++; return; }
    saida.resina_precos.push({ ...l, valor_kg: valor });
  });

  const existe = (t, id) => saida[t].some((x) => x.id === id);
  const ref = (t, id) => (id == null || existe(t, id) ? id ?? null : (corrigidos++, null));
  const peso = (v) => {
    if (v == null || v === '') return null;
    const n = numero(v);
    return n !== null && n >= 0 ? n : (corrigidos++, null);
  };
  lista('resina_cargas').forEach((l0) => {
    const l = comId(l0); if (!l) return;
    if (!dataValida(l.data)) { ignorados++; return; }
    saida.resina_cargas.push({
      ...l,
      numero: Number.isInteger(+l.numero) && +l.numero >= 1 ? +l.numero : (corrigidos++, 1),
      fazenda_id: ref('resina_fazendas', l.fazenda_id),
      motorista_id: ref('resina_motoristas', l.motorista_id),
      caminhao_id: ref('resina_caminhoes', l.caminhao_id),
      preco_kg: Math.max(0, numero(l.preco_kg) ?? 0),
      peso_fazenda: peso(l.peso_fazenda),
      peso_chegada: peso(l.peso_chegada),
      peso_base: l.peso_base === 'fazenda' ? 'fazenda' : 'chegada',
      obs: texto(l.obs, 300),
      nota: texto(l.nota, 80),
      destino: texto(l.destino, 80),
      titular_id: ref('resina_titulares', l.titular_id),
    });
  });
  lista('resina_carga_itens').forEach((l0) => {
    const l = comId(l0); if (!l) return;
    const tbs = Number.isFinite(+l.tbs) && +l.tbs >= 0 ? Math.round(+l.tbs * 2) / 2 : null; // aceita meio tambor
    if (!existe('resina_cargas', l.carga_id) || !existe('resina_produtores', l.produtor_id) || tbs === null) { ignorados++; return; }
    saida.resina_carga_itens.push({ ...l, tbs, arrendamento: pct(l.arrendamento), kg_manual: peso(l.kg_manual) });
  });
  // % do insumo cobrado do produtor; sem o campo (ou inválido) fica de fora e vale 100%
  const pctProdutor = (v) => { const n = v == null || v === '' ? null : numero(v); return n !== null && n >= 0 && n <= 100 ? n : undefined; };
  lista('resina_insumos').forEach((l0) => {
    const l = comId(l0); if (!l) return;
    const qtd = typeof l.quantidade === 'number' ? l.quantidade : Number(String(l.quantidade ?? '').replace(',', '.'));
    const unit = numero(l.valor_unitario);
    if (!dataValida(l.data) || !existe('resina_produtores', l.produtor_id) || !existe('resina_produtos', l.produto_id)
      || !Number.isFinite(qtd) || qtd <= 0 || unit === null || unit < 0) { ignorados++; return; }
    const total = numero(l.valor_total);
    saida.resina_insumos.push({
      ...l, quantidade: qtd, valor_unitario: unit, obs: texto(l.obs, 120), nota: texto(l.nota, 80),
      titular_id: ref('resina_titulares', l.titular_id),
      valor_total: total !== null && total >= 0 ? total : Math.round(qtd * unit * 100) / 100,
      entrega_id: typeof l.entrega_id === 'string' && l.entrega_id ? l.entrega_id : l.id,
      pct_produtor: pctProdutor(l.pct_produtor),
    });
  });
  lista('resina_movimentos').forEach((l0) => {
    const l = comId(l0); if (!l) return;
    const valor = numero(l.valor);
    if (!dataValida(l.data) || !valor || valor <= 0 || !existe('resina_titulares', l.titular_id)) { ignorados++; return; }
    saida.resina_movimentos.push({
      ...l,
      valor,
      tipo: l.tipo === 'debito' ? 'debito' : 'credito',
      descricao: texto(l.descricao, 120),
      nota: texto(l.nota, 80),
      produtor_id: ref('resina_produtores', l.produtor_id),
    });
  });
  return { corrigidos, ignorados };
}
