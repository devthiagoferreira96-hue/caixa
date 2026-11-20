// =====================================================================
// Contas do módulo Resina (sem tela, fáceis de testar).
// =====================================================================

const centavos = (v) => Math.round(v * 100) / 100;
const pesoOk = (v) => (Number.isFinite(v) && v > 0 ? v : 0);

/** Peso que vale para o pagamento: o da fazenda ou o da chegada, conforme a escolha */
export function pesoDaCarga(carga) {
  return pesoOk(carga.peso_base === 'fazenda' ? carga.peso_fazenda : carga.peso_chegada);
}

/**
 * Diferença entre a pesagem da chegada e a da fazenda (só quando as duas existem).
 * Negativa = chegou menos do que saiu da fazenda.
 */
export function diferencaDePeso(carga) {
  const f = pesoOk(carga.peso_fazenda), c = pesoOk(carga.peso_chegada);
  if (!f || !c) return null;
  const kg = c - f;
  return { kg, pct: (kg / f) * 100, valor: centavos(Math.abs(kg) * (carga.preco_kg || 0)) };
}

/**
 * Calcula a carga inteira.
 * - Cada produtor tem Tbs e % de arrendamento.
 * - O kg sai dos Tbs: o peso da carga é dividido pela quantidade de Tbs. Se a pessoa digitou
 *   o kg de um produtor (kg_manual), ele fica como está e o resto do peso é dividido entre os outros.
 * - Valor = kg × preço; o arrendamento é a % do valor; o produtor fica com o resto.
 */
export function calcularCarga(carga, itens) {
  const preco = carga.preco_kg || 0;
  const peso = pesoDaCarga(carga);
  const manual = (i) => i.kg_manual != null && Number.isFinite(i.kg_manual);
  const somaManual = itens.filter(manual).reduce((s, i) => s + i.kg_manual, 0);
  const tbsAuto = itens.filter((i) => !manual(i)).reduce((s, i) => s + (i.tbs || 0), 0);
  const kgPorTb = tbsAuto ? Math.max(0, peso - somaManual) / tbsAuto : 0;

  const linhas = itens.map((i) => {
    const kg = manual(i) ? i.kg_manual : (i.tbs || 0) * kgPorTb;
    const valor = centavos(kg * preco);
    const arrendamento = centavos(valor * (i.arrendamento || 0) / 100);
    return { ...i, kg, manual: manual(i), valor, arrendamento, produtor: centavos(valor - arrendamento) };
  });
  const soma = (k) => linhas.reduce((s, l) => s + l[k], 0);
  const totais = {
    tbs: itens.reduce((s, i) => s + (i.tbs || 0), 0),
    kg: soma('kg'),
    valor: centavos(soma('valor')),
    arrendamento: centavos(soma('arrendamento')),
    produtor: centavos(soma('produtor')),
  };

  const avisos = [];
  const temManual = itens.some(manual);
  if (!peso && !temManual) avisos.push({ tipo: 'sem-peso' });
  if (peso && somaManual > peso + 0.5) avisos.push({ tipo: 'manual-passa', manual: somaManual, peso });
  if (peso && temManual && !tbsAuto && Math.abs(somaManual - peso) >= 1) avisos.push({ tipo: 'soma-diferente', manual: somaManual, peso });

  return { peso, kgPorTb: totais.tbs ? totais.kg / totais.tbs : 0, diferenca: diferencaDePeso(carga), itens: linhas, totais, avisos };
}

/** Preço do kg que vale numa data (o último cadastrado com início até aquela data) */
export function precoNaData(precos, data) {
  return [...precos].filter((p) => p.inicio <= data).sort((a, b) => (a.inicio < b.inicio ? 1 : -1))[0] || null;
}

/** Próximo número de carga do ano (C-2026-0001, C-2026-0002...) */
export function proximoNumero(cargas, data) {
  const ano = data.slice(0, 4);
  return cargas.filter((c) => c.data?.slice(0, 4) === ano).reduce((m, c) => Math.max(m, c.numero || 0), 0) + 1;
}
export const codigoCarga = (c) => `C-${c.data.slice(0, 4)}-${String(c.numero).padStart(4, '0')}`;

/**
 * Resumo de várias cargas (ex.: do mês): totais e o que cada produtor produziu.
 * `itensPorCarga` = Map(carga_id → itens).
 */
export function resumoDasCargas(cargas, itensPorCarga) {
  const porProdutor = new Map();
  const total = { cargas: cargas.length, tbs: 0, kg: 0, valor: 0, arrendamento: 0, produtor: 0, difKg: 0, difValor: 0, comDiferenca: 0 };
  for (const c of cargas) {
    const r = calcularCarga(c, itensPorCarga.get(c.id) || []);
    for (const k of ['tbs', 'kg', 'valor', 'arrendamento', 'produtor']) total[k] += r.totais[k];
    if (r.diferenca) {
      total.difKg += r.diferenca.kg;
      total.difValor += Math.sign(r.diferenca.kg) * r.diferenca.valor;
      total.comDiferenca++;
    }
    for (const l of r.itens) {
      const p = porProdutor.get(l.produtor_id) || porProdutor.set(l.produtor_id, { produtor_id: l.produtor_id, cargas: 0, tbs: 0, kg: 0, valor: 0, arrendamento: 0, produtor: 0 }).get(l.produtor_id);
      p.cargas++;
      for (const k of ['tbs', 'kg', 'valor', 'arrendamento', 'produtor']) p[k] += l[k];
    }
  }
  for (const k of ['valor', 'arrendamento', 'produtor', 'difValor']) total[k] = centavos(total[k]);
  const produtores = [...porProdutor.values()].map((p) => ({ ...p, valor: centavos(p.valor), arrendamento: centavos(p.arrendamento), produtor: centavos(p.produtor) }))
    .sort((a, b) => b.tbs - a.tbs);
  return { total, produtores };
}

// ---------- Conta corrente do arrendamento
/**
 * Linhas da conta corrente de uma conta da proprietária (CNPJ ou CPF), em ordem de data.
 * - Cada produtor de cada carga vira uma linha. O DÉBITO é o arrendamento, ou seja, o que a
 *   proprietária tem para receber. UNI. é o valor de um tambor (média × R$ do kg), então
 *   débito = tambores × UNI. × % arrendo.
 * - Os lançamentos manuais (resina_movimentos) entram como crédito (recebimento) ou débito.
 * O saldo é créditos − débitos: negativo quer dizer que ainda falta receber.
 */
export function linhasContaCorrente(cargas, itensPorCarga, movimentos, titularId, insumos = []) {
  const linhas = [];
  for (const c of cargas) {
    if ((c.titular_id || null) !== (titularId || null)) continue;
    const itens = itensPorCarga.get(c.id) || [];
    const r = calcularCarga(c, itens);
    r.itens.forEach((l, n) => {
      const pctArr = itens[n].arrendamento || 0;
      const media = l.tbs ? l.kg / l.tbs : null;
      linhas.push({
        tipo: 'carga', carga_id: c.id, carga: c, data: c.data, produtor_id: l.produtor_id,
        nota: c.nota || '', destino: c.destino || '', tbs: l.tbs || 0, pct: pctArr, kg: l.kg,
        media, preco: c.preco_kg || 0,
        credito: 0, debito: l.arrendamento,
      });
    });
  }
  // a parte do produtor nos insumos é descontada dele: entra como débito (a proprietária tem a receber)
  for (const i of insumos) {
    if ((i.titular_id || null) !== (titularId || null)) continue;
    const debito = parteDoProdutor(i);
    if (!debito) continue; // 0% do produtor: a proprietária paga tudo, nada a receber
    linhas.push({
      tipo: 'insumo', insumo: i, data: i.data, produtor_id: i.produtor_id, produto_id: i.produto_id,
      quantidade: i.quantidade || 0, valor_unitario: i.valor_unitario || 0, nota: i.nota || '', destino: '', obs: i.obs || '',
      total: totalDoInsumo(i), pct_produtor: pctDoProdutor(i),
      credito: 0, debito,
    });
  }
  for (const m of movimentos) {
    if ((m.titular_id || null) !== (titularId || null)) continue;
    linhas.push({
      tipo: 'movimento', movimento: m, data: m.data, produtor_id: m.produtor_id || null, descricao: m.descricao || '',
      nota: m.nota || '', destino: '', credito: m.tipo === 'credito' ? m.valor : 0, debito: m.tipo === 'debito' ? m.valor : 0,
    });
  }
  // mesma data: cargas na ordem do número, depois insumos e lançamentos na ordem em que foram feitos
  const chaveOrdem = (l) => (l.tipo === 'carga' ? `0${String(l.carga.numero || 0).padStart(6, '0')}` : `1${(l.movimento || l.insumo).criado_em || ''}`);
  return linhas
    .map((l, i) => ({ l, i }))
    .sort((a, b) => (a.l.data !== b.l.data ? (a.l.data < b.l.data ? -1 : 1) : chaveOrdem(a.l) < chaveOrdem(b.l) ? -1 : chaveOrdem(a.l) > chaveOrdem(b.l) ? 1 : a.i - b.i))
    .map(({ l }) => l);
}

/**
 * Extrato de um período (início incluído, fim não): saldo que vinha de antes,
 * as linhas do período com o saldo depois de cada uma, e os totais.
 * Com `produtorId`, considera só as linhas daquele produtor.
 */
export function extratoContaCorrente(linhas, inicio, fim, produtorId = null) {
  const doProdutor = produtorId ? linhas.filter((l) => l.produtor_id === produtorId) : linhas;
  let saldo = 0;
  const periodo = [];
  for (const l of doProdutor) {
    if (l.data >= fim) break;
    saldo = centavos(saldo + l.credito - l.debito);
    if (l.data >= inicio) periodo.push({ ...l, saldo });
  }
  const credito = centavos(periodo.reduce((s, l) => s + l.credito, 0));
  const debito = centavos(periodo.reduce((s, l) => s + l.debito, 0));
  const saldoAnterior = centavos(saldo - credito + debito);
  return { saldoAnterior, linhas: periodo, credito, debito, saldoFinal: saldo };
}

/**
 * A parte do produtor nos insumos que já foi recebida no Caixa (entrada "a receber" marcada como recebida)
 * vira crédito na conta corrente. Recebe os lançamentos do Caixa e devolve "movimentos" de crédito
 * (com `caixa_id`), para juntar aos lançamentos manuais.
 */
export function creditosDoCaixa(lancamentos) {
  return lancamentos
    .filter((l) => l.resina_receber_id && l.pago && l.tipo === 'entrada')
    .map((l) => ({
      id: `caixa-${l.id}`, caixa_id: l.id, tipo: 'credito', valor: Number(l.valor), data: l.data_pagamento || l.vencimento,
      titular_id: l.resina_titular_id || null, produtor_id: l.resina_produtor_id || null,
      descricao: 'Recebido no Caixa · parte dos insumos', nota: l.resina_nota || '', criado_em: l.criado_em || '',
    }));
}

// ---------- Insumos (produtos usados para coletar a resina)
/** Valor total de um lançamento de insumo: o total guardado, ou quantidade × valor unitário */
export const totalDoInsumo = (i) => (Number.isFinite(i.valor_total) ? i.valor_total : centavos((i.quantidade || 0) * (i.valor_unitario || 0)));

/** % do insumo que é cobrado do produtor (o resto fica com a proprietária). Lançamentos antigos, sem o campo, valem 100%. */
export const pctDoProdutor = (i) => (Number.isFinite(i.pct_produtor) ? Math.min(100, Math.max(0, i.pct_produtor)) : 100);

/** Quanto do insumo é descontado do produtor (vai para a conta corrente) */
export const parteDoProdutor = (i) => centavos(totalDoInsumo(i) * pctDoProdutor(i) / 100);

/**
 * Divide uma entrega (uma nota com um ou mais produtores) por produtor, na ordem em que aparecem:
 * [{ produtor_id, total (o valor cheio dos produtos dele), parte (o que é cobrado dele), itens }].
 */
export function divisaoDaEntrega(itens) {
  const porProdutor = new Map();
  for (const i of itens) {
    const d = porProdutor.get(i.produtor_id) || porProdutor.set(i.produtor_id, { produtor_id: i.produtor_id, total: 0, parte: 0, itens: [] }).get(i.produtor_id);
    d.total = centavos(d.total + totalDoInsumo(i));
    d.parte = centavos(d.parte + parteDoProdutor(i));
    d.itens.push(i);
  }
  return [...porProdutor.values()];
}

/**
 * Como divisaoDaEntrega, mas separando também pela conta (CNPJ ou CPF) de cada produto:
 * [{ produtor_id, titular_id, total, parte, itens }]. Numa nota, cada produtor pode ser cobrado numa conta diferente.
 */
export function divisaoPorConta(itens) {
  const grupos = new Map();
  for (const i of itens) {
    const k = `${i.produtor_id}|${i.titular_id || ''}`;
    const d = grupos.get(k) || grupos.set(k, { produtor_id: i.produtor_id, titular_id: i.titular_id || null, total: 0, parte: 0, itens: [] }).get(k);
    d.total = centavos(d.total + totalDoInsumo(i));
    d.parte = centavos(d.parte + parteDoProdutor(i));
    d.itens.push(i);
  }
  return [...grupos.values()];
}

/** Quanto acima da média de custo por kg um produtor precisa estar para ganhar o alerta */
export const LIMITE_ALERTA = 0.25;

/**
 * Compara o gasto com insumos e a produção de cada produtor no período.
 * `produtores` = resumoDasCargas(...).produtores; `insumos` = lançamentos do mesmo período.
 * - custoPorKg: R$ de insumo para cada kg de resina entregue (menor é melhor)
 * - pctDoValor: quanto do valor da resina dele foi gasto em insumos
 * - descontado: a parte dos insumos cobrada do produtor (pct_produtor de cada lançamento)
 * - liquidoProdutor: parte do produtor na resina − insumos descontados dele
 * - alerta: 'sem-producao' (usou insumo e não entregou resina) ou 'acima' (custo/kg 25% ou mais acima da média)
 */
export function comparativoInsumos(produtores, insumos) {
  const porId = new Map();
  const linha = (id) => porId.get(id) || porId.set(id, {
    produtor_id: id, cargas: 0, tbs: 0, kg: 0, valor: 0, arrendamento: 0, produtor: 0, gasto: 0, descontado: 0, lancamentos: 0, porProduto: new Map(),
  }).get(id);
  for (const p of produtores) Object.assign(linha(p.produtor_id), { cargas: p.cargas, tbs: p.tbs, kg: p.kg, valor: p.valor, arrendamento: p.arrendamento, produtor: p.produtor });
  for (const i of insumos) {
    const l = linha(i.produtor_id);
    const total = totalDoInsumo(i);
    l.gasto = centavos(l.gasto + total);
    l.descontado = centavos(l.descontado + parteDoProdutor(i));
    l.lancamentos++;
    const pp = l.porProduto.get(i.produto_id) || l.porProduto.set(i.produto_id, { quantidade: 0, gasto: 0 }).get(i.produto_id);
    pp.quantidade += i.quantidade || 0;
    pp.gasto = centavos(pp.gasto + total);
  }
  const linhas = [...porId.values()];
  const total = {
    gasto: centavos(linhas.reduce((s, l) => s + l.gasto, 0)),
    descontado: centavos(linhas.reduce((s, l) => s + l.descontado, 0)),
    kg: linhas.reduce((s, l) => s + l.kg, 0),
    valor: centavos(linhas.reduce((s, l) => s + l.valor, 0)),
    arrendamento: centavos(linhas.reduce((s, l) => s + l.arrendamento, 0)),
    produtor: centavos(linhas.reduce((s, l) => s + l.produtor, 0)),
  };
  // média ponderada: todo o insumo dividido por toda a resina (só de quem entregou resina)
  const comKg = linhas.filter((l) => l.kg > 0);
  const media = comKg.reduce((s, l) => s + l.kg, 0) ? comKg.reduce((s, l) => s + l.gasto, 0) / comKg.reduce((s, l) => s + l.kg, 0) : null;
  total.custoPorKg = media;
  for (const l of linhas) {
    l.custoPorKg = l.kg > 0 ? l.gasto / l.kg : null;
    l.pctDoValor = l.valor > 0 ? (l.gasto / l.valor) * 100 : null;
    l.liquidoProdutor = centavos(l.produtor - l.descontado);
    l.vsMedia = l.custoPorKg != null && media ? l.custoPorKg / media - 1 : null;
    l.alerta = l.gasto > 0 && !l.kg ? 'sem-producao' : l.vsMedia != null && l.vsMedia >= LIMITE_ALERTA && l.gasto > 0 ? 'acima' : null;
  }
  return { linhas: linhas.sort((a, b) => b.kg - a.kg || b.gasto - a.gasto), total };
}

/**
 * Saldo de cada conta (CNPJ/CPF) da conta corrente até uma data (exclusiva), para o Início do Caixa.
 * Saldo negativo = a proprietária ainda tem a receber. Retorna [{ titular_id, saldo, aReceber }].
 */
export function aReceberPorConta(cargas, itensPorCarga, movimentos, insumos, titularIds, ate) {
  return titularIds.map((id) => {
    const { saldoFinal } = extratoContaCorrente(linhasContaCorrente(cargas, itensPorCarga, movimentos, id, insumos), '0000-01-01', ate);
    return { titular_id: id, saldo: saldoFinal, aReceber: saldoFinal < 0 ? -saldoFinal : 0 };
  });
}
