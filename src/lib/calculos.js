// Contas feitas em cima dos dados (substituem as fórmulas SUMIF/SUMIFS da planilha)

/**
 * Transferência entre contas (saque, Pix de uma conta para outra): são dois lançamentos pagos, ligados pelo mesmo
 * `transferencia`: uma saída na conta de origem e uma entrada na de destino (`transferencia_conta_id` = a outra conta).
 * Mudam o saldo de cada conta, mas não são gasto nem entrada: o dinheiro só trocou de lugar.
 */
export const ehTransferencia = (l) => Boolean(l.transferencia);

/** Gastos que contam no mês: saídas do caixa (menos pagamento de fatura, para não contar duas vezes, e transferências) */
export const saidasReais = (lancamentos) => lancamentos.filter((l) => l.tipo === 'saida' && !l.fatura_cartao_id && !l.transferencia);
export const entradas = (lancamentos) => lancamentos.filter((l) => l.tipo === 'entrada' && !l.transferencia);

/**
 * Transferências que entram nos totais quando só algumas contas estão na tela: a que vai (ou vem) de uma conta
 * que não está entre elas mexe no dinheiro dessas contas. Entre duas contas da tela, uma anula a outra.
 * `contas` = ids (texto) das contas na tela, ou null/vazio = todas (aí nenhuma transferência conta).
 */
export function transferenciasDeFora(lancamentos, contas) {
  if (!contas?.length) return [];
  const dentro = new Set(contas.map(String));
  return lancamentos.filter((l) => l.transferencia && !dentro.has(String(l.transferencia_conta_id)));
}
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
        descricao: p.compra.descricao + (p.compra.tipo === 'estorno' ? ' (reembolso)' : p.compra.recorrente_base ? '' : p.compra.qtd_parcelas > 1 ? ` (${p.numero}/${p.compra.qtd_parcelas})` : ''),
        valor: p.valor,
        origem: 'cartao',
        cartao_id: p.compra.cartao_id,
      })),
  ].sort((a, b) => b.valor - a.valor);
}

export const totalDoCartao = (parcelas, cartaoId) =>
  somar(parcelas.filter((p) => p.compra.cartao_id === cartaoId));

/**
 * Entradas, gastos e resultado separados por área (Casa, Fazenda, Empresa).
 * `areaDe(categoria_id)` diz a área de cada categoria. Gastos = caixa + parcelas de cartão.
 * Retorna { Casa: {entradas, gastos, resultado, ...}, Fazenda: {...}, ... } com todas as áreas de `areas`.
 */
export function resumoPorArea(lancamentos, parcelas, areaDe, areas = ['Casa']) {
  const r = Object.fromEntries(areas.map((a) => [a, { entradas: 0, gastos: 0, gastosCaixa: 0, gastosCartao: 0, movimentos: 0 }]));
  const em = (id) => (r[areaDe(id)] ||= { entradas: 0, gastos: 0, gastosCaixa: 0, gastosCartao: 0, movimentos: 0 });
  entradas(lancamentos).forEach((l) => { const a = em(l.categoria_id); a.entradas += Number(l.valor); a.movimentos++; });
  saidasReais(lancamentos).forEach((l) => { const a = em(l.categoria_id); a.gastosCaixa += Number(l.valor); a.movimentos++; });
  parcelas.forEach((p) => { const a = em(p.compra.categoria_id); a.gastosCartao += Number(p.valor); a.movimentos++; });
  for (const a of Object.values(r)) {
    a.gastos = a.gastosCaixa + a.gastosCartao;
    a.resultado = a.entradas - a.gastos;
  }
  return r;
}

/** Entradas de um conjunto de categorias, por categoria: Map(categoria_id → valor) */
export function entradasPorCategoria(lancamentos) {
  const m = new Map();
  entradas(lancamentos).forEach((l) => m.set(l.categoria_id ?? null, (m.get(l.categoria_id ?? null) || 0) + Number(l.valor)));
  return m;
}

/**
 * Situação da fatura de um cartão num mês. `pagamentos` = lançamentos com fatura_cartao_id desse cartão e fatura_mes desse mês
 * (pagamento da fatura e adiantamentos). Retorna { pago, falta, agendado, estado }, com estado:
 * 'sem' (sem compras), 'paga', 'parcial' (adiantou uma parte), 'agendada' (pagamento lançado mas não pago) ou 'aberta'.
 * Fatura só com reembolso (total negativo) conta como crédito: estado 'credito'.
 */
export function situacaoFatura(total, pagamentos) {
  const c = (v) => Math.round(v * 100) / 100;
  const pago = c(somar(pagamentos.filter((p) => p.pago)));
  const agendado = pagamentos.find((p) => !p.pago) || null;
  const falta = c(Math.max(0, total - pago));
  const estado = total < -0.004 ? 'credito'
    : total < 0.005 && !pago ? 'sem'
    : falta < 0.005 ? 'paga'
    : agendado ? 'agendada'
    : pago > 0 ? 'parcial' : 'aberta';
  return { pago, falta, agendado, estado };
}

// ---------- Pagamento dividido entre contas
const arred = (v) => Math.round(v * 100) / 100;

/** Divide desconto e juros entre as partes de um pagamento, na proporção de cada parte */
export function dividirAjustes(partes, { desconto, juros }) {
  const total = partes.reduce((s, p) => s + p.valor, 0);
  let restoD = desconto || 0, restoJ = juros || 0;
  return partes.map((p, i) => {
    const ultima = i === partes.length - 1;
    const d = ultima ? arred(restoD) : arred(((desconto || 0) * p.valor) / total);
    const j = ultima ? arred(restoJ) : arred(((juros || 0) * p.valor) / total);
    restoD -= d; restoJ -= j;
    const ajuste = d > 0 || j > 0;
    return { ...p, desconto: d > 0 ? d : null, juros: j > 0 ? j : null, valor_original: ajuste ? arred(p.valor + d - j) : null };
  });
}

// ---------- Em qual mês cada lançamento entra nos relatórios
/**
 * Bases para organizar os relatórios:
 *  - vencimento: o dia em que vence (padrão)
 *  - competencia: o mês a que a conta se refere (sem competência, vale o vencimento)
 *  - pagamento: o dia em que o dinheiro saiu ou entrou de fato (regime de caixa; o que não foi pago fica de fora)
 * As compras no cartão entram sempre pelo mês da fatura.
 */
export const BASES_RELATORIO = {
  vencimento: { nome: 'Vencimento', explica: 'Cada lançamento entra no mês em que vence.' },
  competencia: { nome: 'Competência', explica: 'Cada lançamento entra no mês a que se refere (ex.: a luz de outubro paga em novembro conta em outubro). Sem competência, vale o vencimento.' },
  pagamento: { nome: 'Pagamento', explica: 'Só o que já foi pago ou recebido, no mês em que o dinheiro saiu ou entrou. O que está em aberto fica de fora.' },
};

/** Data (ISO) que decide o mês do lançamento na base escolhida, ou null se ele não entra (em aberto, na base pagamento) */
export function dataDeReferencia(l, base = 'vencimento') {
  if (base === 'competencia') return l.competencia ? `${l.competencia.slice(0, 7)}-01` : l.vencimento;
  if (base === 'pagamento') return l.pago ? l.data_pagamento || l.vencimento : null;
  return l.vencimento;
}

/** Dia em que o lançamento aparece no Extrato: o que já foi pago, no dia do pagamento; o que está em aberto, no vencimento */
export const dataNoExtrato = (l) => (l.pago ? l.data_pagamento || l.vencimento : l.vencimento);

/**
 * Faturas do mês que ainda faltam pagar, para o Extrato mostrar como uma saída "a pagar" no dia do vencimento.
 * O valor é o que falta, já tirando os adiantamentos (que aparecem no Extrato no dia em que foram pagos).
 * Fatura paga, sem compras, com crédito ou com pagamento agendado (que já é um lançamento) não entra.
 * Retorna lançamentos que não existem no banco: `virtual: 'fatura'` e id `fatura:<cartão>`.
 */
export function faturasAPagar(cartoes, parcelasDoMes, pagamentos, mes, vencimentoDe) {
  return cartoes.flatMap((c) => {
    const total = totalDoCartao(parcelasDoMes, c.id);
    const sit = situacaoFatura(total, pagamentos.filter((p) => p.fatura_cartao_id === c.id && p.fatura_mes === mes));
    if (sit.estado !== 'aberta' && sit.estado !== 'parcial') return [];
    return [{
      id: `fatura:${c.id}`, virtual: 'fatura', tipo: 'saida', valor: sit.falta, total: Math.round(total * 100) / 100, adiantado: sit.pago,
      descricao: `Fatura ${c.nome}`, vencimento: vencimentoDe(c, mes), pago: false, data_pagamento: null,
      fatura_cartao_id: c.id, fatura_mes: mes, conta_id: null, categoria_id: null,
    }];
  });
}

/**
 * Saldo das contas ao fim de cada dia, como no extrato do banco: saldo inicial + o que foi pago ou recebido até o dia.
 * `pagos` = lançamentos pagos (de todas as datas); `contas` = contas que entram na conta. Retorna Map(dia → saldo).
 */
export function saldoAoFimDoDia(dias, pagos, contas) {
  const ids = new Set(contas.map((c) => c.id));
  let saldo = contas.reduce((s, c) => s + Number(c.saldo_inicial || 0), 0);
  const movimentos = pagos
    .filter((l) => l.pago && ids.has(l.conta_id))
    .map((l) => [dataNoExtrato(l), (l.tipo === 'entrada' ? 1 : -1) * Number(l.valor || 0)])
    .sort((a, b) => a[0].localeCompare(b[0]));
  const r = new Map();
  let i = 0;
  for (const dia of [...dias].sort()) {
    while (i < movimentos.length && movimentos[i][0] <= dia) saldo += movimentos[i++][1];
    r.set(dia, Math.round(saldo * 100) / 100);
  }
  return r;
}

/**
 * Projeção do caixa: o saldo como se tudo o que está em aberto fosse pago (ou recebido) no vencimento.
 * O que já passou do vencimento e não foi pago conta como se fosse pago hoje (ainda vai sair).
 * Assim o saldo previsto do fim de um mês é o saldo inicial do mês seguinte.
 *
 * - `pagos`: lançamentos pagos (todas as datas); `abertos`: lançamentos em aberto (todas as datas)
 * - `faturas`: faturas de cartão a pagar (de faturasAPagar), entram só se `comFaturas` (elas ainda não têm conta)
 * - `contas`: contas que entram na conta; transferência entre duas delas não muda o saldo nem entra em entradas/saídas
 * - `inicio`/`fim`: o mês ("AAAA-MM-DD", fim exclusivo); `hoje`: "AAAA-MM-DD"
 * Retorna { inicial, entradas, saidas, final, previstoAte(dia) }. `inicial` é o real se o mês já começou.
 */
export function projecaoDoMes({ pagos, abertos, faturas = [], comFaturas = false, contas, inicio, fim, hoje }) {
  const ids = new Set(contas.map((c) => c.id));
  const base = contas.reduce((s, c) => s + Number(c.saldo_inicial || 0), 0);
  const interna = (l) => l.transferencia && ids.has(l.transferencia_conta_id);
  const sinal = (l) => (l.tipo === 'entrada' ? 1 : -1) * Number(l.valor || 0);
  const quando = (d) => (d < hoje ? hoje : d);
  const movs = [
    ...pagos.filter((l) => l.pago && ids.has(l.conta_id)).map((l) => ({ dia: dataNoExtrato(l), v: sinal(l), real: true, interna: interna(l) })),
    ...abertos.filter((l) => !l.pago && ids.has(l.conta_id)).map((l) => ({ dia: quando(l.vencimento), v: sinal(l), interna: interna(l) })),
    ...(comFaturas ? faturas : []).map((f) => ({ dia: quando(f.vencimento), v: -Number(f.valor || 0) })),
  ];
  const r2 = (n) => Math.round(n * 100) / 100;
  const previstoAte = (dia) => r2(movs.reduce((s, m) => (m.dia <= dia ? s + m.v : s), base));
  const antes = movs.filter((m) => m.dia < inicio);
  const inicial = r2((inicio <= hoje ? antes.filter((m) => m.real) : antes).reduce((s, m) => s + m.v, base));
  const doMes = movs.filter((m) => m.dia >= inicio && m.dia < fim && !m.interna);
  const entradas = r2(doMes.filter((m) => m.v > 0).reduce((s, m) => s + m.v, 0));
  const saidas = r2(doMes.filter((m) => m.v < 0).reduce((s, m) => s - m.v, 0));
  // o que ficou em aberto de meses anteriores (atrasado) já está em "hoje", dentro do mês atual: final = inicial + entradas − saídas
  return { inicial, entradas, saidas, final: r2(inicial + entradas - saidas), previstoAte };
}

/**
 * Separa os lançamentos de um dia por conta, na ordem da lista de contas (como no extrato do banco:
 * tudo de uma conta, depois tudo da outra). Cada ponta de uma transferência fica na conta dela.
 * O que não tem conta (fatura do cartão a pagar) vai por último. Dentro de cada conta, a ordem não muda.
 * Retorna [{ conta_id, itens }].
 */
export function agruparPorConta(itens, contas) {
  const ordem = new Map(contas.map((c, i) => [c.id, i]));
  const grupos = new Map();
  for (const l of itens) {
    const id = l.conta_id ?? null;
    (grupos.get(id) || grupos.set(id, []).get(id)).push(l);
  }
  const posicao = (id) => (id === null ? Infinity : ordem.get(id) ?? contas.length);
  return [...grupos].map(([conta_id, lista]) => ({ conta_id, itens: lista }))
    .sort((a, b) => posicao(a.conta_id) - posicao(b.conta_id));
}

/** "AAAA-MM" do lançamento na base escolhida, ou null */
export const mesDeReferencia = (l, base = 'vencimento') => dataDeReferencia(l, base)?.slice(0, 7) ?? null;
