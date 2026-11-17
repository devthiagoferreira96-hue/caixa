// =====================================================================
// Contas e compras que se repetem "sempre" (aluguel, internet, assinatura no cartão).
// Não existe "infinito" guardado: o sistema mantém os próximos meses já lançados
// (até HORIZONTE_MESES à frente) e, cada vez que o app abre, completa o que faltar.
// Sem tela e sem banco: fácil de testar.
// =====================================================================
import { somarMeses, mesISO } from './format.js';

/** Quantos meses à frente ficam sempre lançados */
export const HORIZONTE_MESES = 12;

/** Limite (exclusivo): o 1º dia do mês que fica HORIZONTE_MESES depois do mês de `hoje` */
export const limiteRecorrencia = (hoje = new Date()) => mesISO(hoje, HORIZONTE_MESES + 1);

/** Meses inteiros de `a` até `b` ("2026-01-31" → "2026-03-05" = 2) */
export const mesesEntre = (a, b) => (Number(b.slice(0, 4)) - Number(a.slice(0, 4))) * 12 + Number(b.slice(5, 7)) - Number(a.slice(5, 7));

/**
 * Próximas datas de uma repetição (todo mês: passo 1; todo ano: passo 12).
 * `base` = data da 1ª ocorrência (o dia do mês vem dela: dia 31 vira 30/28 nos meses curtos);
 * `ultima` = data da última já lançada; `limite` = até antes desta data.
 * Retorna [{indice, data}] (indice 0 = a própria base, 1 = a seguinte...).
 */
export function proximasDatas(base, ultima, limite, passo = 1) {
  const lista = [];
  for (let i = Math.floor(mesesEntre(base, ultima) / passo) + 1; ; i++) {
    const data = somarMeses(base, i * passo);
    if (data >= limite) break;
    lista.push({ indice: i, data });
  }
  return lista;
}

/**
 * Lançamentos que faltam para manter cada repetição "sempre" lançada até o limite.
 * Cada lançamento recorrente guarda: grupo, recorrente: true, recorrente_base (1ª data), recorrente_ate (última data já gerada)
 * e recorrente_intervalo (1 = todo mês, 12 = todo ano).
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
    const passo = Number(ultimo.recorrente_intervalo) === 12 ? 12 : 1;
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
        competencia: ultimo.competencia ? somarMeses(ultimo.competencia, mesesEntre(ultimo.vencimento, data)) : null,
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
