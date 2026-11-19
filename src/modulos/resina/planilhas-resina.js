// Abas da Resina para o backup em Excel, no formato das planilhas da empresa:
//   - "CONTROLE ANUAL": Tbs de cada produtor por mês × ano (como a Planilha1 do CONTROLE ANUAL FAZENDA; só resumo)
//   - "SAFRAS": como a aba SAFRAS: produtores lado a lado (DATA | TBS | PESO - KG e o TOTAL de cada um)
//     e uma safra (agosto a julho) embaixo da outra; é dela que a importação tira as cargas
//   - "CONTA CORRENTE - <conta>": uma aba por conta (CNPJ/CPF), como a planilha "Conta corrente arrendo"
// Tudo volta para o sistema pela importação (importar-safras.js e importar-conta.js).
import { local } from '../../lib/local-db.js';
import { store } from '../../lib/store.js';
import { dataCompleta } from '../../lib/format.js';
import { E, T, N, D, F, coluna } from '../../lib/exportar-excel.js';
import { calcularCarga, linhasContaCorrente, extratoContaCorrente, creditosDoCaixa } from './calculos.js';
import { abaContaCorrente, nomeDeAba } from './exportar-conta.js';
import { safraDe } from './importar-safras.js';

const MESES = ['JANEIRO', 'FEVEREIRO', 'MARÇO', 'ABRIL', 'MAIO', 'JUNHO', 'JULHO', 'AGOSTO', 'SETEMBRO', 'OUTUBRO', 'NOVEMBRO', 'DEZEMBRO'];
const nomeProdutor = (id) => store.resina_produtores.find((p) => p.id === id)?.nome ?? 'Produtor excluído';
const meio = (v) => Math.round(Number(v) * 2) / 2;

/** Cada produtor de cada carga do período, com o kg calculado: [{data, produtor_id, tbs, kg, obs}] */
function entregasDoPeriodo(t, periodo) {
  const dentro = (d) => d >= periodo.inicio && d < periodo.fim;
  const itensPorCarga = new Map();
  t.resina_carga_itens.forEach((i) => (itensPorCarga.get(i.carga_id) || itensPorCarga.set(i.carga_id, []).get(i.carga_id)).push(i));
  const lista = [];
  for (const c of t.resina_cargas.filter((x) => dentro(x.data)).sort((a, b) => (a.data < b.data ? -1 : a.data > b.data ? 1 : (a.numero || 0) - (b.numero || 0)))) {
    const itens = itensPorCarga.get(c.id) || [];
    const r = calcularCarga(c, itens);
    r.itens.forEach((l, n) => lista.push({ data: c.data, produtor_id: itens[n].produtor_id, tbs: Number(itens[n].tbs) || 0, kg: r.peso ? l.kg : null, obs: c.obs || '' }));
  }
  return { lista, itensPorCarga };
}

/** Aba "CONTROLE ANUAL": Tbs por produtor, um bloco por mês, uma coluna por ano */
function abaControleAnual(entregas) {
  const anos = [...new Set(entregas.map((e) => Number(e.data.slice(0, 4))))].sort();
  const produtores = [...new Set(entregas.map((e) => e.produtor_id))].sort((a, b) => nomeProdutor(a).localeCompare(nomeProdutor(b), 'pt-BR'));
  const soma = new Map();
  for (const e of entregas) {
    const k = `${e.produtor_id}|${e.data.slice(0, 7)}`;
    soma.set(k, meio((soma.get(k) || 0) + e.tbs));
  }
  const linhas = [[T('CONTROLE DE CARGA ANUAL', E.tituloCentro)], []];
  MESES.forEach((m, i) => {
    linhas.push([T(m, E.cabecalho), ...anos.map((a) => (linhas.length === 2 ? N(a, E.cabecalho) : T('', E.cabecalho)))]);
    for (const p of produtores) {
      linhas.push([T(nomeProdutor(p).toUpperCase()), ...anos.map((a) => N(soma.get(`${p}|${a}-${String(i + 1).padStart(2, '0')}`) || 0, E.normal))]);
    }
    linhas.push([]);
  });
  return {
    nome: 'CONTROLE ANUAL', linhas, congelar: 0, mesclar: [`A1:${coluna(Math.max(1, anos.length))}1`],
    larguras: [26, ...anos.map(() => 10)],
  };
}

/** "2024/2025" → "PRODUÇÃO SAFRA 08/24 - 08/25" (como na aba SAFRAS) */
const tituloSafra = (s) => `PRODUÇÃO SAFRA 08/${s.slice(2, 4)} - 08/${s.slice(7, 9)}`;

/**
 * Aba "SAFRAS", como a aba SAFRAS do CONTROLE ANUAL FAZENDA:
 * os produtores ficam LADO A LADO (um grupo de 4 colunas cada: DATA | TBS | PESO - KG | anotação)
 * e as safras vêm UMA EMBAIXO DA OUTRA (cada faixa com o título "PRODUÇÃO SAFRA 08/24 - 08/25" em cima de cada produtor).
 */
function abaSafras(entregas) {
  const safras = [...new Set(entregas.map((e) => safraDe(e.data)))].sort();
  const produtores = [...new Set(entregas.map((e) => e.produtor_id))].sort((a, b) => nomeProdutor(a).localeCompare(nomeProdutor(b), 'pt-BR'));
  const linhas = [];
  const mesclar = [];
  const por = (r, c, cel) => { (linhas[r] ||= [])[c] = cel; };
  let topo = 0;
  for (const s of safras) {
    const porProdutor = produtores.map((p) => entregas.filter((e) => e.produtor_id === p && safraDe(e.data) === s));
    // a planilha original reserva 18 linhas de dados por safra; se tiver mais cargas, a faixa cresce
    const altura = Math.max(18, ...porProdutor.map((l) => l.length));
    produtores.forEach((p, k) => {
      const c = k * 4;
      por(topo, c, T(tituloSafra(s), E.tituloCentro));
      mesclar.push(`${coluna(c)}${topo + 1}:${coluna(c + 2)}${topo + 1}`);
      por(topo + 2, c, T(nomeProdutor(p).toUpperCase(), E.negrito));
      ['DATA', 'TBS', 'PESO - KG'].forEach((x, i) => por(topo + 3, c + i, T(x, E.cabecalho)));
      porProdutor[k].forEach((e, i) => {
        const r = topo + 4 + i;
        por(r, c, D(e.data));
        por(r, c + 1, N(e.tbs, E.normal));
        por(r, c + 2, e.kg == null ? T('') : N(Math.round(e.kg * 100) / 100, E.kg));
        if (e.obs) por(r, c + 3, T(e.obs));
      });
      const rTotal = topo + 4 + altura;
      const [ini, fim] = [topo + 5, topo + 4 + altura];
      por(rTotal, c, T('TOTAL', E.negrito));
      por(rTotal, c + 1, F(`SUM(${coluna(c + 1)}${ini}:${coluna(c + 1)}${fim})`, meio(porProdutor[k].reduce((t, e) => t + e.tbs, 0)), E.negrito));
      por(rTotal, c + 2, F(`SUM(${coluna(c + 2)}${ini}:${coluna(c + 2)}${fim})`, Math.round(porProdutor[k].reduce((t, e) => t + (e.kg || 0), 0)), E.kg));
    });
    topo += 4 + altura + 3; // título, nome, colunas, linhas, TOTAL e 2 linhas de espaço até a próxima safra
  }
  for (let i = 0; i < linhas.length; i++) linhas[i] ||= [];
  return { nome: 'SAFRAS', linhas, congelar: 0, mesclar, larguras: produtores.flatMap(() => [12, 6, 12, 14]) };
}

/**
 * Abas da Resina do período (vazio se não houver nada).
 * @param {{inicio: string, fim: string, id?: string}} periodo
 * @param {{producao?: boolean, conta?: boolean}} partes o que incluir
 */
export function abasResina(periodo, { producao = true, conta = true } = {}) {
  const t = local.tabelas();
  const abas = [];
  const { lista, itensPorCarga } = entregasDoPeriodo(t, periodo);
  if (producao && lista.length) abas.push(abaControleAnual(lista), abaSafras(lista));

  if (conta) {
    // uma aba por conta (CNPJ/CPF) que tenha movimento; e uma "Sem conta" se houver itens sem conta
    const insumos = t.resina_insumos;
    const movimentos = [...t.resina_movimentos, ...creditosDoCaixa(t.lancamentos)];
    const cargas = t.resina_cargas;
    const ids = [...store.resina_titulares.map((x) => x.id), null];
    const textoPeriodo = periodo.id === 'tudo' ? '' : `${dataCompleta(periodo.inicio)} a ${dataCompleta(ultimoDia(periodo.fim))}`;
    for (const id of ids) {
      const todas = linhasContaCorrente(cargas, itensPorCarga, movimentos, id, insumos);
      const extrato = extratoContaCorrente(todas, periodo.inicio, periodo.fim);
      if (!extrato.linhas.length && !extrato.saldoAnterior) continue;
      const nome = id ? store.resina_titulares.find((x) => x.id === id)?.nome || 'Conta' : 'Sem conta';
      abas.push(abaContaCorrente({
        conta: nome, periodo: textoPeriodo, inicio: periodo.inicio === '0000-01-01' ? (extrato.linhas[0]?.data || periodo.inicio) : periodo.inicio,
        extrato, nomeProdutor, nomeAba: `CONTA CORRENTE - ${nome}`,
      }));
    }
  }
  return abas;
}

function ultimoDia(fim) {
  if (fim >= '9999') return fim;
  const d = new Date(`${fim}T12:00:00`);
  d.setDate(d.getDate() - 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** Nome da conta escrito no título/aba "CONTA CORRENTE - Maria CNPJ" (para a importação sugerir a conta) */
export function contaDoTitulo(texto) {
  const m = /CONTA\s*CORRENTE\s*[-·:]\s*([^·]+)/i.exec(String(texto || ''));
  return m ? m[1].trim() : '';
}
export { nomeDeAba };
