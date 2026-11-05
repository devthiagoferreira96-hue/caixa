// Contas feitas em cima dos dados (substituem as fórmulas SUMIF/SUMIFS da planilha)

/** Gastos que contam no mês: saídas do caixa (menos pagamento de fatura, para não contar duas vezes) */
export const saidasReais = (lancamentos) => lancamentos.filter((l) => l.tipo === 'saida' && !l.fatura_cartao_id);
export const entradas = (lancamentos) => lancamentos.filter((l) => l.tipo === 'entrada');
export const somar = (lista, campo = 'valor') => lista.reduce((s, x) => s + Number(x[campo] || 0), 0);

/** Total gasto por categoria (caixa + parcelas de cartão). Retorna Map(categoria_id → valor) */
export function gastosPorCategoria(lancamentos, parcelas) {
  const totais = new Map();
  const somarEm = (id, v) => totais.set(id ?? null, (totais.get(id ?? null) || 0) + Number(v));
  saidasReais(lancamentos).forEach((l) => somarEm(l.categoria_id, l.valor));
  parcelas.forEach((p) => somarEm(p.compra.categoria_id, p.valor));
  return totais;
}

/** Itens (caixa e cartão) de uma categoria, para mostrar o detalhe */
export function itensDaCategoria(categoriaId, lancamentos, parcelas) {
  return [
    ...saidasReais(lancamentos)
      .filter((l) => (l.categoria_id ?? null) === categoriaId)
      .map((l) => ({ data: l.vencimento, descricao: l.descricao, valor: Number(l.valor), origem: 'caixa' })),
    ...parcelas
      .filter((p) => (p.compra.categoria_id ?? null) === categoriaId)
      .map((p) => ({
        data: p.compra.data_compra,
        descricao: p.compra.descricao + (p.compra.qtd_parcelas > 1 ? ` (${p.numero}/${p.compra.qtd_parcelas})` : ''),
        valor: p.valor,
        origem: 'cartao',
        cartao_id: p.compra.cartao_id,
      })),
  ].sort((a, b) => b.valor - a.valor);
}

export const totalDoCartao = (parcelas, cartaoId) =>
  somar(parcelas.filter((p) => p.compra.cartao_id === cartaoId));
