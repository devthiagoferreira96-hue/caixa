// Abas do Caixa no mesmo formato da planilha NOVO_CAIXA (uma aba por mês), para o backup em Excel.
// O arquivo gerado volta para o sistema pela importação (importar-planilha.js), por isso as colunas
// e os textos seguem o que ela entende:
//   A STATUS | B D. PGTO | C VENCIMENTO | D CONTA BANCÁRIA | E CATEGORIA | F PESSOA | G DESCRIÇÃO |
//   H REFERENCIA (observação) | I PARCELA | J DÉBITO/CRÉDITO (saída negativa) | K SALDO (fórmula)
//   M/N: saldo de cada conta (SOMASES) e total por categoria (SOMASE)
//   A partir de Q: um bloco por cartão — mês | DATA COMPRA | PARCELA | CATEGORIA | SUBCATEGORIA | DESCRIÇÃO | REFERENCIA | VALOR
// As primeiras linhas de cada mês são o "SALDO ANTERIOR" de cada conta (na importação, só o do 1º mês vira saldo inicial).
import { local } from './local-db.js';
import { store, categoriasPorGrupo } from './store.js';
import { E, T, N, D, F, coluna } from './exportar-excel.js';

export const MESES_PLANILHA = ['JANEIRO', 'FEVEREIRO', 'MARÇO', 'ABRIL', 'MAIO', 'JUNHO', 'JULHO', 'AGOSTO', 'SETEMBRO', 'OUTUBRO', 'NOVEMBRO', 'DEZEMBRO'];
const TITULOS_CAIXA = ['STATUS', 'D. PGTO', 'VENCIMENTO', 'CONTA BANCÁRIA', 'CATEGORIA', 'PESSOA', 'DESCRIÇÃO', 'REFERENCIA', 'PARCELA', 'DÉBITO/CRÉDITO', 'SALDO'];
const TITULOS_CARTAO = ['DATA COMPRA', 'PARCELA', 'CATEGORIA', 'SUBCATEGORIA', 'DESCRIÇÃO', 'REFERENCIA', 'VALOR'];
const COL_RESUMO = 12; // M
const COL_CARTOES = 16; // Q
const LARGURA_BLOCO = 9; // 8 colunas + 1 de espaço
// linha (Excel) do "TOTAL FATURA" na planilha original: 74 no 1º cartão e 76 nos outros
const LINHA_TOTAL_FATURA = [74, 76];
// as fórmulas do resumo vão até a linha 135, como na planilha original
const ULTIMA_LINHA = 135;
// larguras das colunas da planilha original (A até AP); cartões a mais repetem as do último bloco
const LARGURAS = [7.28, 9.41, 18.57, 16, 26.42, 12.15, 31.71, 17.71, 13.85, 22.28, 13.41, 8.43, 26.42, 13.71, 11.57, 8.43,
  9.85, 9.85, 12.15, 26.42, 14, 27.15, 13.85, 11.28, 8.43,
  9.85, 12.15, 12.15, 26.42, 12.15, 21.71, 6.14, 11.71, 8.43,
  10, 13.15, 8.57, 26.42, 14.28, 42.71, 11.42, 10.57, 8.43];

const nome = (lista, id) => store[lista].find((x) => x.id === id)?.nome ?? '';
const arred = (v) => Math.round(v * 100) / 100;
const mesDe = (iso) => iso.slice(0, 7);
const pad = (n) => String(n).padStart(2, '0');
const somarMes = (ym, n) => {
  const [a, m] = ym.split('-').map(Number);
  const d = new Date(a, m - 1 + n, 1);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
};
const aspas = (t) => `"${String(t).replace(/"/g, '""')}"`;

/** Texto da coluna DESCRIÇÃO do pagamento de fatura (a importação reconhece "FATURA" + nome do cartão) */
function descricaoFatura(l) {
  const cartao = nome('cartoes', l.fatura_cartao_id) || 'CARTÃO';
  if (l.adiantamento) return `ADIANTAMENTO FATURA ${cartao.toUpperCase()}`;
  return /fatura/i.test(l.descricao || '') && (l.descricao || '').toUpperCase().includes(cartao.toUpperCase()) ? l.descricao : `FATURA ${cartao.toUpperCase()}`;
}

/** Texto da coluna PARCELA de uma parcela de cartão */
function parcelaCartao(p, c) {
  if (c.tipo === 'estorno' || c.recorrente || c.recorrente_base) return '';
  return c.qtd_parcelas > 1 ? `${p.numero}/${c.qtd_parcelas}` : '';
}

/**
 * Monta as abas do caixa do período.
 * @param {{inicio: string, fim: string}} periodo  datas ISO (fim não incluso)
 * @returns {{nome, linhas, larguras, mesclar, congelar}[]} (vazio se não houver nada no período)
 */
export function abasCaixa(periodo) {
  const t = local.tabelas();
  const dentro = (d) => d >= periodo.inicio && d < periodo.fim;
  const lancs = t.lancamentos.filter((l) => dentro(l.vencimento));
  const compras = new Map(t.compras_cartao.map((c) => [c.id, c]));
  const parcelas = t.parcelas.filter((p) => dentro(p.fatura_mes) && compras.has(p.compra_id));
  // meses do primeiro ao último com movimento (sem pular os do meio, como na planilha).
  // Sem nenhum lançamento no período, sai a aba do mês escolhido em branco (com o saldo anterior de cada conta),
  // como a aba vazia da planilha, pronta para preencher.
  const mesVazio = periodo.inicio > '0000-01-01' ? mesDe(periodo.inicio) : mesDe(new Date().toISOString());
  const mesesComDados = lancs.length || parcelas.length
    ? [...lancs.map((l) => mesDe(l.vencimento)), ...parcelas.map((p) => mesDe(p.fatura_mes))].sort()
    : [mesVazio];
  const meses = [];
  for (let m = mesesComDados[0]; m <= mesesComDados.at(-1); m = somarMes(m, 1)) meses.push(m);
  const umAno = new Set(meses.map((m) => m.slice(0, 4))).size === 1;

  // contas que aparecem: as ativas e as que têm movimento
  const usadas = new Set(t.lancamentos.map((l) => l.conta_id));
  const contas = t.contas.filter((c) => c.ativa !== false || usadas.has(c.id)); // ordem do cadastro
  const cartoes = store.cartoes.filter((c) => c.ativo !== false || parcelas.some((p) => compras.get(p.compra_id).cartao_id === c.id));

  return meses.map((ym) => {
    const [ano, mes] = ym.split('-').map(Number);
    const inicioMes = `${ym}-01`;
    const nomeAba = umAno ? MESES_PLANILHA[mes - 1] : `${MESES_PLANILHA[mes - 1]} ${ano}`;
    const linhas = [[], [...TITULOS_CAIXA.map((x) => T(x, E.cabecalho))]];
    const mesclar = [];
    const por = (r, c, cel) => { (linhas[r] ||= [])[c] = cel; };

    // ----- caixa: saldo anterior de cada conta (o que foi pago com vencimento antes deste mês)
    const caixa = [];
    for (const c of contas) {
      const saldo = arred(Number(c.saldo_inicial || 0) + t.lancamentos
        .filter((l) => l.pago && l.conta_id === c.id && l.vencimento < inicioMes)
        .reduce((s, l) => s + (l.tipo === 'entrada' ? 1 : -1) * Number(l.valor), 0));
      caixa.push([T('OK'), D(inicioMes), D(inicioMes), T(c.nome), T(''), T(''), T('SALDO ANTERIOR'), T(''), T(''), N(saldo), saldo]);
    }
    const doMes = lancs.filter((l) => mesDe(l.vencimento) === ym)
      .sort((a, b) => (a.vencimento < b.vencimento ? -1 : a.vencimento > b.vencimento ? 1 : String(a.criado_em || '').localeCompare(String(b.criado_em || ''))));
    for (const l of doMes) {
      const v = arred((l.tipo === 'entrada' ? 1 : -1) * Number(l.valor));
      const fatura = Boolean(l.fatura_cartao_id);
      caixa.push([
        T(l.pago ? 'OK' : ''), l.pago ? D(l.data_pagamento || l.vencimento) : T(''), D(l.vencimento), T(nome('contas', l.conta_id)),
        T(fatura ? '' : l.transferencia ? `Transferência ${l.tipo === 'entrada' ? 'de' : 'para'} ${nome('contas', l.transferencia_conta_id)}` : nome('categorias', l.categoria_id)), T(nome('pessoas', l.pessoa_id)),
        T(fatura ? descricaoFatura(l) : l.descricao || ''),
        T(fatura && l.fatura_mes ? `Fatura ${l.fatura_mes.slice(5, 7)}/${l.fatura_mes.slice(0, 4)}` : l.observacao || ''),
        T(l.parcela || '', E.texto), N(v), v,
      ]);
    }
    let saldo = 0;
    caixa.forEach((cel, i) => {
      const r = 2 + i; // linha 3 do Excel
      const v = cel.pop();
      saldo = arred(saldo + v);
      cel.forEach((x, j) => por(r, j, x));
      por(r, 10, F(i === 0 ? `J${r + 1}` : `K${r}+J${r + 1}`, saldo, E.dinheiro));
    });
    const ultimaCaixa = Math.max(2 + caixa.length, 3); // última linha (Excel) do caixa
    for (let r = 2 + caixa.length; r < 2 + caixa.length + 12; r++) por(r, 10, F(`K${r}+J${r + 1}`, saldo, E.dinheiro));

    // ----- cartões: um bloco por cartão com as parcelas que caem na fatura deste mês
    let maiorCartao = 2;
    const totaisCartao = [];
    cartoes.forEach((cartao, k) => {
      const c0 = COL_CARTOES + k * LARGURA_BLOCO;
      por(0, c0, T(`CARTÃO ${cartao.nome.toUpperCase()}`, E.tituloCentro));
      mesclar.push(`${coluna(c0)}1:${coluna(c0 + 7)}1`);
      por(1, c0, T(MESES_PLANILHA[mes - 1], E.cabecalho));
      TITULOS_CARTAO.forEach((x, i) => por(1, c0 + 1 + i, T(x, E.cabecalho)));
      const doCartao = parcelas.filter((p) => mesDe(p.fatura_mes) === ym && compras.get(p.compra_id).cartao_id === cartao.id)
        .sort((a, b) => compras.get(a.compra_id).data_compra.localeCompare(compras.get(b.compra_id).data_compra));
      let total = 0;
      doCartao.forEach((p, i) => {
        const c = compras.get(p.compra_id);
        const r = 2 + i;
        const v = arred(-Number(p.valor)); // compra negativa (como no caixa); reembolso fica positivo
        total = arred(total + v);
        por(r, c0 + 1, D(c.data_compra));
        por(r, c0 + 2, T(parcelaCartao(p, c), E.texto));
        por(r, c0 + 3, T(nome('categorias', c.categoria_id)));
        por(r, c0 + 4, T(c.subcategoria || ''));
        por(r, c0 + 5, T(c.descricao || ''));
        por(r, c0 + 6, T(c.tipo === 'estorno' ? 'Reembolso' : ''));
        por(r, c0 + 7, N(v));
      });
      maiorCartao = Math.max(maiorCartao, 2 + doCartao.length);
      totaisCartao.push({ c0, total, ultima: 2 + doCartao.length });
    });

    // ----- resumo (M/N): saldo de cada conta e total por categoria, com fórmulas como na planilha
    const fim = Math.max(ULTIMA_LINHA, ultimaCaixa + 60, maiorCartao + 60); // as fórmulas cobrem linhas a mais, como na planilha
    const rJ = `J3:J${fim}`, rA = `A3:A${fim}`, rD = `D3:D${fim}`, rE = `E3:E${fim}`;
    let r = 2;
    for (const c of contas) {
      const valor = arred(caixa.filter((x) => x[0].v === 'OK' && x[3].v === c.nome).reduce((s, x) => s + x[9].v, 0));
      por(r, COL_RESUMO, T(c.nome));
      por(r, COL_RESUMO + 1, F(`SUMIFS(${rJ},${rA},"OK",${rD},${aspas(c.nome)})`, valor, E.dinheiro));
      r++;
    }
    por(r, COL_RESUMO, T('SOMA SALDO', E.negrito));
    por(r, COL_RESUMO + 1, F(`SUM(N3:N${r})`, arred(contas.reduce((s, c, i) => s + (linhas[2 + i]?.[COL_RESUMO + 1]?.v || 0), 0))));
    r += 2;
    por(r, COL_RESUMO, T('CATEGORIA', E.cabecalho));
    por(r, COL_RESUMO + 1, T('VALOR', E.cabecalho));
    r++;
    const grupos = Object.values(categoriasPorGrupo());
    for (const [g, cats] of grupos.entries()) {
      if (g > 0) r++; // linha em branco entre os grupos
      for (const c of cats) {
      const n = aspas(c.nome);
      const partes = [`SUMIF(${rE},${n},${rJ})`, ...totaisCartao.map(({ c0 }) =>
        `SUMIF(${coluna(c0 + 3)}3:${coluna(c0 + 3)}${fim},${n},${coluna(c0 + 7)}3:${coluna(c0 + 7)}${fim})`)];
      const valor = arred(caixa.filter((x) => x[4].v === c.nome).reduce((s, x) => s + x[9].v, 0)
        + parcelas.filter((p) => mesDe(p.fatura_mes) === ym && compras.get(p.compra_id).categoria_id === c.id).reduce((s, p) => s - Number(p.valor), 0));
      por(r, COL_RESUMO, T(c.nome));
      por(r, COL_RESUMO + 1, F(partes.join('+'), valor, E.dinheiro));
      r++;
      }
    }

    // ----- "TOTAL FATURA" embaixo de cada cartão: linha 74 no 1º e 76 nos outros (como na planilha);
    // se o mês tiver mais linhas do que isso, desce junto
    const minimo = Math.max(ultimaCaixa + 12, maiorCartao, r) + 2;
    totaisCartao.forEach(({ c0, total }, k) => {
      const linha = Math.max(LINHA_TOTAL_FATURA[Math.min(k, 1)], minimo); // linha do Excel
      por(linha - 1, c0, T('TOTAL FATURA', E.negrito));
      mesclar.push(`${coluna(c0)}${linha}:${coluna(c0 + 6)}${linha}`);
      por(linha - 1, c0 + 7, F(`SUM(${coluna(c0 + 7)}3:${coluna(c0 + 7)}${linha - 1})`, total));
    });

    // completa as linhas vazias (o gerador espera listas)
    for (let i = 0; i < linhas.length; i++) linhas[i] ||= [];
    const colunas = COL_CARTOES + Math.max(3, cartoes.length) * LARGURA_BLOCO;
    const larguras = Array.from({ length: colunas }, (_, i) => LARGURAS[i] ?? LARGURAS[LARGURAS.length - LARGURA_BLOCO + ((i - COL_CARTOES) % LARGURA_BLOCO)]);
    return { nome: nomeAba, linhas, larguras, mesclar, congelar: 2 };
  });
}
