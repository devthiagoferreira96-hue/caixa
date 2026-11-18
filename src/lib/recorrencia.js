// =====================================================================
// Contas e compras que se repetem "sempre" (aluguel, internet, assinatura no cartão).
// Não existe "infinito" guardado: o sistema mantém os próximos meses já lançados
// (até HORIZONTE_MESES à frente) e, cada vez que o app abre, completa o que faltar.
// Sem tela e sem banco: fácil de testar.
// =====================================================================
import { somarMeses, mesISO, parseISO, toISO } from './format.js';

/** recorrente_intervalo de quem se repete toda semana (os outros valores são meses: 1 = todo mês, 12 = todo ano) */
export const SEMANAL = 'semana';

/** Passo guardado no lançamento: SEMANAL, 12 (ano) ou 1 (mês) */
export const passoDe = (l) => (l?.recorrente_intervalo === SEMANAL ? SEMANAL : Number(l?.recorrente_intervalo) === 12 ? 12 : 1);

/** Data mais n dias ("2026-11-28" + 7 = "2026-12-05") */
export const somarDiasA = (s, n) => { const d = parseISO(s); d.setDate(d.getDate() + n); return toISO(d); };

/** Dias inteiros de `a` até `b` */
export const diasEntre = (a, b) => Math.round((parseISO(b) - parseISO(a)) / 86400000);

/** A i-ésima data depois de `base` no passo escolhido (semana, mês ou ano) */
export const avancar = (base, i, passo) => (passo === SEMANAL ? somarDiasA(base, 7 * i) : somarMeses(base, i * passo));

/** Nomes do passo para os textos: { um: 'semana', varios: 'semanas', todo: 'toda semana' } */
export const nomesDoPasso = (passo) => (passo === SEMANAL ? { um: 'semana', varios: 'semanas', todo: 'toda semana', esta: 'esta semana' }
  : passo === 12 ? { um: 'ano', varios: 'anos', todo: 'todo ano', esta: 'este ano' } : { um: 'mês', varios: 'meses', todo: 'todo mês', esta: 'este mês' });

/** Quantos meses à frente ficam sempre lançados */
export const HORIZONTE_MESES = 12;

/** Limite (exclusivo): o 1º dia do mês que fica HORIZONTE_MESES depois do mês de `hoje` */
export const limiteRecorrencia = (hoje = new Date()) => mesISO(hoje, HORIZONTE_MESES + 1);

/** Meses inteiros de `a` até `b` ("2026-01-31" → "2026-03-05" = 2) */
export const mesesEntre = (a, b) => (Number(b.slice(0, 4)) - Number(a.slice(0, 4))) * 12 + Number(b.slice(5, 7)) - Number(a.slice(5, 7));

/**
 * Próximas datas de uma repetição (todo mês: passo 1; todo ano: passo 12; toda semana: SEMANAL).
 * `base` = data da 1ª ocorrência (o dia do mês vem dela: dia 31 vira 30/28 nos meses curtos);
 * `ultima` = data da última já lançada; `limite` = até antes desta data.
 * Retorna [{indice, data}] (indice 0 = a própria base, 1 = a seguinte...).
 */
export function proximasDatas(base, ultima, limite, passo = 1) {
  const lista = [];
  const inicio = passo === SEMANAL ? Math.floor(diasEntre(base, ultima) / 7) + 1 : Math.floor(mesesEntre(base, ultima) / passo) + 1;
  for (let i = inicio; ; i++) {
    const data = avancar(base, i, passo);
    if (data >= limite) break;
    lista.push({ indice: i, data });
  }
  return lista;
}

/**
 * Lançamentos que faltam para manter cada repetição "sempre" lançada até o limite.
 * Cada lançamento recorrente guarda: grupo, recorrente: true, recorrente_base (1ª data), recorrente_ate (última data já gerada)
 * e recorrente_intervalo (1 = todo mês, 12 = todo ano, SEMANAL = toda semana).
 * O `recorrente_ate` não muda quando alguém exclui um mês ("só este"), então o mês excluído não volta.
 * Retorna { novos: [...], atualizar: Map(grupo → recorrente_ate novo) }.
 */
export function completarLancamentos(lancamentos, limite) {
  const grupos = new Map();
  for (const l of lancamentos) {
    if (!l.grupo || l.recorrente !== true) continue;
    (grupos.get(l.grupo) || grupos.set(l.grupo, []).get(l.grupo)).push(l);
  }
  const novos = [];
  const atualizar = new Map();
  for (const [grupo, itens] of grupos) {
    const ultimo = itens.reduce((a, b) => (b.vencimento > a.vencimento ? b : a));
    const base = itens.find((x) => x.recorrente_base)?.recorrente_base || itens.reduce((a, b) => (b.vencimento < a.vencimento ? b : a)).vencimento;
    const ate = itens.reduce((m, x) => (x.recorrente_ate && x.recorrente_ate > m ? x.recorrente_ate : m), ultimo.vencimento);
    const passo = passoDe(ultimo);
    const datas = proximasDatas(base, ate, limite, passo);
    if (!datas.length) continue;
    for (const { data } of datas) {
      novos.push({
        tipo: ultimo.tipo, valor: ultimo.valor, descricao: ultimo.descricao, categoria_id: ultimo.categoria_id ?? null,
        conta_id: ultimo.conta_id ?? null, pessoa_id: ultimo.pessoa_id ?? null,
        vencimento: data, pago: false, data_pagamento: null, parcela: null,
        grupo, recorrente: true, recorrente_base: base, recorrente_intervalo: passo,
        // observação e competência acompanham (a competência anda junto com o vencimento)
        observacao: ultimo.observacao ?? null,
        competencia: !ultimo.competencia ? null
          : passo === SEMANAL ? somarDiasA(ultimo.competencia, diasEntre(ultimo.vencimento, data))
          : somarMeses(ultimo.competencia, mesesEntre(ultimo.vencimento, data)),
      });
    }
    atualizar.set(grupo, datas[datas.length - 1].data);
  }
  return { novos, atualizar };
}

/**
 * Parcelas que faltam para as assinaturas no cartão (compras com recorrente: true).
 * Cada cobrança é uma parcela com o valor cheio (valor_total = valor de cada cobrança). Anual: recorrente_intervalo 12.
 * `parcelasPorCompra` = Map(compra_id → parcelas). Retorna { novas: [...], atualizar: Map(compra_id → {recorrente_ate, qtd_parcelas}) }.
 */
export function completarAssinaturas(compras, parcelasPorCompra, limite) {
  const novas = [];
  const atualizar = new Map();
  for (const c of compras) {
    if (c.recorrente !== true) continue;
    const ps = parcelasPorCompra.get(c.id) || [];
    if (!ps.length && !c.recorrente_base) continue;
    const base = c.recorrente_base || ps.reduce((a, b) => (b.fatura_mes < a.fatura_mes ? b : a)).fatura_mes;
    const ultima = ps.reduce((m, p) => (p.fatura_mes > m ? p.fatura_mes : m), c.recorrente_ate || base);
    const ate = c.recorrente_ate && c.recorrente_ate > ultima ? c.recorrente_ate : ultima;
    const datas = proximasDatas(base, ate, limite, Number(c.recorrente_intervalo) === 12 ? 12 : 1);
    if (!datas.length) continue;
    for (const { indice, data } of datas) novas.push({ compra_id: c.id, numero: indice + 1, valor: Number(c.valor_total), fatura_mes: data });
    atualizar.set(c.id, { recorrente_ate: datas[datas.length - 1].data, qtd_parcelas: datas[datas.length - 1].indice + 1 });
  }
  return { novas, atualizar };
}

/** Campos que valem para a sequência toda quando a pessoa escolhe "Este e os próximos" ao editar */
const CAMPOS_DA_SEQUENCIA = ['tipo', 'descricao', 'categoria_id', 'conta_id', 'pessoa_id', 'observacao'];

/**
 * O que mudar em cada lançamento da sequência quando `l` é editado com `valores` e a pessoa escolhe "Este e os próximos".
 * `grupo` = todos os lançamentos do mesmo grupo (parcelas ou repetição).
 * - `l` recebe tudo o que foi digitado;
 * - os próximos (vencimento a partir do de `l`) recebem só o que mudou: descrição, categoria, conta, pessoa, observação, tipo,
 *   valor (sem o desconto/juros, que valem só para este), vencimento e competência (andando junto, cada um no seu mês ou semana);
 * - pago e data do pagamento nunca passam para os outros;
 * - numa repetição "sempre", se o vencimento mudou, a data-base também muda, para os próximos lançados sozinhos seguirem o novo dia.
 * Retorna [{ id, valores }].
 */
export function mudancasNaSequencia(l, valores, grupo) {
  const passo = passoDe(l);
  const semana = passo === SEMANAL;
  // a mesma distância que `x` tinha de `l`, a partir da nova data
  const mover = (nova, x) => (semana ? somarDiasA(nova, diasEntre(l.vencimento, x)) : somarMeses(nova, mesesEntre(l.vencimento, x)));
  const comum = {};
  for (const k of CAMPOS_DA_SEQUENCIA) if (k in valores && (valores[k] ?? null) !== (l[k] ?? null)) comum[k] = valores[k] ?? null;
  const original = (x) => Number(x.valor_original ?? x.valor);
  if ('valor' in valores && original(valores) !== original(l)) Object.assign(comum, { valor: original(valores), valor_original: null, desconto: null, juros: null });
  const venceuMudou = valores.vencimento && valores.vencimento !== l.vencimento;
  const competenciaMudou = 'competencia' in valores && (valores.competencia || null) !== (l.competencia || null);

  const lista = [{ id: l.id, valores }];
  for (const x of grupo) {
    if (x.id === l.id) continue;
    const v = {};
    if (x.vencimento >= l.vencimento) {
      Object.assign(v, comum);
      if (venceuMudou) v.vencimento = mover(valores.vencimento, x.vencimento);
      if (competenciaMudou) v.competencia = valores.competencia ? mover(valores.competencia, x.vencimento) : null;
    }
    if (venceuMudou && l.recorrente) {
      if (x.recorrente_base) v.recorrente_base = mover(valores.vencimento, x.recorrente_base);
      if (x.recorrente_ate) v.recorrente_ate = mover(valores.vencimento, x.recorrente_ate);
    }
    if (Object.keys(v).length) lista.push({ id: x.id, valores: v });
  }
  if (venceuMudou && l.recorrente) {
    if (l.recorrente_base) valores.recorrente_base = mover(valores.vencimento, l.recorrente_base);
    if (l.recorrente_ate) valores.recorrente_ate = mover(valores.vencimento, l.recorrente_ate);
  }
  return lista;
}
