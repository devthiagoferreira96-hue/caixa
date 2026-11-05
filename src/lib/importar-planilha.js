// Entende a planilha do caixa (o mesmo modelo do NOVO_CAIXA.xlsx) e monta o que será importado.
//
// Cada aba é um mês. Em cada aba:
//   - Caixa: STATUS | D. PGTO | VENCIMENTO | CONTA BANCÁRIA | CATEGORIA | PESSOA | DESCRIÇÃO | REFERENCIA | PARCELA | DÉBITO/CRÉDITO
//     (DÉBITO/CRÉDITO negativo = saída, positivo = entrada; STATUS "OK" = já pago)
//   - Cartões: um bloco por cartão, com o nome do cartão na linha de cima:
//     DATA COMPRA | PARCELA | CATEGORIA | SUBCATEGORIA | DESCRIÇÃO | REFERENCIA | VALOR
//     (cada linha é a parcela que caiu na fatura daquele mês)
// As colunas são achadas pelo título, então a ordem pode mudar um pouco sem problema.
import { store } from './store.js';
import { local } from './local-db.js';
import { somarMeses } from './format.js';
import { TIPO_PADRAO } from './exemplo.js';

const MESES = ['JANEIRO', 'FEVEREIRO', 'MARCO', 'ABRIL', 'MAIO', 'JUNHO', 'JULHO', 'AGOSTO', 'SETEMBRO', 'OUTUBRO', 'NOVEMBRO', 'DEZEMBRO'];
export const NOMES_MESES = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];

/** Texto para comparar: sem acento, maiúsculo, só letras e números ("T MP" = "TMP", "M.C. " = "MC") */
export const chave = (t) => String(t ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().replace(/[^A-Z0-9]/g, '');
const limpo = (t) => String(t ?? '').replace(/\s+/g, ' ').trim();
const pad = (n) => String(n).padStart(2, '0');
const iso = (a, m, d) => `${a}-${pad(m)}-${pad(d)}`;
const valida = (a, m, d) => m >= 1 && m <= 12 && d >= 1 && d <= new Date(a, m, 0).getDate();

/** Mês escrito no nome da aba ("DEZEMBRO (2)", "Mar 2025", "dez-25") → {mes, ano} */
export function mesDoNome(nome) {
  const k = chave(nome);
  const i = MESES.findIndex((m) => k.includes(m) || k.startsWith(m.slice(0, 3)));
  const semCopia = String(nome).replace(/\(\d+\)/g, '').trim(); // "DEZEMBRO (2)" → "DEZEMBRO"
  const ano4 = /(20\d\d)/.exec(semCopia)?.[1];
  const ano2 = /[^\d](\d{2})$/.exec(semCopia)?.[1];
  const ano = ano4 ? Number(ano4) : ano2 ? 2000 + Number(ano2) : null;
  return { mes: i >= 0 ? i + 1 : null, ano };
}

/**
 * Data de uma célula → "aaaa-mm-dd".
 * Aceita data do Excel (número), "05/11/2026", "05/11/26", "2026-11-05" e "05/11" (sem ano).
 * Sem ano: usa o ano do mês de referência; `antesDe` = a data não pode passar do mês de referência
 * (compra no cartão sempre é antes da fatura).
 */
export function lerData(v, ref, { antesDe = false } = {}) {
  if (v == null || v === '') return null;
  if (typeof v === 'number') {
    if (v < 20000 || v > 80000) return null;
    const d = new Date(Date.UTC(1899, 11, 30) + Math.round(v) * 86400000);
    return iso(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate());
  }
  const s = String(v).trim();
  let m = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(s);
  if (m) return valida(+m[1], +m[2], +m[3]) ? iso(+m[1], +m[2], +m[3]) : null;
  m = /^(\d{1,2})[/.-](\d{1,2})(?:[/.-](\d{2,4}))?$/.exec(s);
  if (!m) return null;
  const d = +m[1], mes = +m[2];
  let ano = m[3] ? +m[3] : null;
  if (ano !== null && ano < 100) ano += 2000;
  if (ano === null) {
    ano = ref.ano;
    if (antesDe && mes > ref.mes) ano--; // compra de dezembro na fatura de janeiro
    else if (!antesDe && mes - ref.mes > 6) ano--;
    else if (!antesDe && ref.mes - mes > 6) ano++;
  }
  return valida(ano, mes, d) ? iso(ano, mes, d) : null;
}

/** Número de uma célula: 150, "-150,50", "R$ 1.234,56", "(80,00)" → número (ou null) */
export function lerNumero(v) {
  if (typeof v === 'number') return Number.isFinite(v) ? Math.round(v * 100) / 100 : null;
  if (v == null) return null;
  let s = String(v).trim();
  if (!s) return null;
  const negativo = /^\(.*\)$/.test(s) || /^-|^R\$\s*-|−/.test(s);
  s = s.replace(/[^\d,.]/g, '');
  if (!s) return null;
  if (s.includes(',')) s = s.replace(/\./g, '').replace(',', '.');
  else if (/^\d{1,3}(\.\d{3})+$/.test(s)) s = s.replace(/\./g, '');
  const n = Number(s);
  return Number.isFinite(n) ? Math.round((negativo ? -n : n) * 100) / 100 : null;
}

/**
 * Texto da parcela: "2/6", "2 de 6". Se o Excel transformou "2/6" em data (2 de junho),
 * o dia é a parcela e o mês é o total.
 */
export function lerParcela(v) {
  if (typeof v === 'number' && v > 20000 && v < 80000) {
    const d = new Date(Date.UTC(1899, 11, 30) + Math.round(v) * 86400000);
    return { numero: d.getUTCDate(), total: d.getUTCMonth() + 1, texto: `${d.getUTCDate()}/${d.getUTCMonth() + 1}` };
  }
  const m = /(\d+)\s*(?:\/|de|DE)\s*(\d+)/.exec(String(v ?? ''));
  if (m && +m[2] >= 1 && +m[1] >= 1 && +m[1] <= +m[2] && +m[2] <= 72) return { numero: +m[1], total: +m[2], texto: `${+m[1]}/${+m[2]}` };
  return null;
}

/** Acha os títulos das colunas da aba. Retorna null se a aba não for do modelo do caixa. */
function lerTitulos(linhas) {
  for (let l = 0; l < Math.min(linhas.length, 8); l++) {
    const t = (linhas[l] || []).map(chave);
    const col = (nome, desde = 0, ate = t.length) => {
      for (let i = desde; i < ate; i++) if (t[i] === nome) return i;
      return -1;
    };
    const valor = [col('DEBITOCREDITO'), col('DEBITOECREDITO'), col('VALOR')].find((i) => i >= 0) ?? -1;
    const blocos = [];
    t.forEach((x, i) => {
      if (x !== 'DATACOMPRA') return;
      const ate = i + 9;
      const b = {
        data: i, parcela: col('PARCELA', i, ate), categoria: col('CATEGORIA', i, ate), sub: col('SUBCATEGORIA', i, ate),
        descricao: col('DESCRICAO', i, ate), referencia: col('REFERENCIA', i, ate), valor: col('VALOR', i, ate),
      };
      // nome do cartão: na linha de cima, perto do bloco
      const cima = linhas[l - 1] || [];
      for (let j = i - 2; j <= b.valor && !b.cartao; j++) if (typeof cima[j] === 'string' && cima[j].trim()) b.cartao = cima[j].trim();
      // mês escrito no título do bloco (ex.: "DEZEMBRO" logo antes de DATA COMPRA)
      b.mesTitulo = typeof linhas[l][i - 1] === 'string' ? linhas[l][i - 1] : null;
      if (b.valor > i) blocos.push(b);
    });
    const fimCaixa = blocos.length ? blocos[0].data : t.length;
    const caixa = {
      status: col('STATUS', 0, fimCaixa), pagamento: col('DPGTO', 0, fimCaixa) >= 0 ? col('DPGTO', 0, fimCaixa) : col('DATAPAGAMENTO', 0, fimCaixa),
      vencimento: col('VENCIMENTO', 0, fimCaixa), conta: [col('CONTABANCARIA', 0, fimCaixa), col('CONTA', 0, fimCaixa)].find((i) => i >= 0) ?? -1,
      categoria: col('CATEGORIA', 0, fimCaixa), pessoa: col('PESSOA', 0, fimCaixa), descricao: col('DESCRICAO', 0, fimCaixa),
      referencia: col('REFERENCIA', 0, fimCaixa), parcela: col('PARCELA', 0, fimCaixa), valor: valor < fimCaixa ? valor : -1,
    };
    // precisa das colunas próprias do modelo (STATUS ou VENCIMENTO), não basta ter Descrição e Valor
    const temCaixa = caixa.valor >= 0 && (caixa.descricao >= 0 || caixa.categoria >= 0) && (caixa.status >= 0 || caixa.vencimento >= 0);
    if (temCaixa || blocos.length) return { linha: l, caixa: temCaixa ? caixa : null, blocos };
  }
  return null;
}

/** Linha de total do modelo (ex.: "TOTAL FATURA" com a soma embaixo de cada cartão) */
const TOTAL = /^(TOTAL|SOMA|SUBTOTAL)/;

const SALDO_ANTERIOR = /SALDOANTERIOR|SALDOINICIAL|SALDODOMESANTERIOR|SALDOMESANTERIOR|TRANSPORTE/;

/**
 * Primeira leitura do arquivo: quais abas são do modelo e qual mês cada uma parece ser.
 * @returns {{nome, titulos, linhas, mes, ano, vazia, oculta}[]}
 */
export function reconhecerAbas(abas) {
  const hoje = new Date();
  const lidas = abas.map((a) => {
    const titulos = lerTitulos(a.linhas);
    if (!titulos) return { nome: a.nome, modelo: false };
    const pelo = mesDoNome(a.nome);
    if (!pelo.mes) {
      const t = titulos.blocos.map((b) => b.mesTitulo).find((x) => x && mesDoNome(x).mes);
      if (t) pelo.mes = mesDoNome(t).mes;
    }
    // datas de vencimento ajudam a descobrir o ano (e o mês, se o nome não disser)
    const datas = [];
    if (titulos.caixa) {
      for (let l = titulos.linha + 1; l < a.linhas.length; l++) {
        const v = a.linhas[l]?.[titulos.caixa.vencimento];
        // só datas completas (com ano) servem para descobrir o mês e o ano da aba
        const completa = typeof v === 'number' || /^\d{4}-\d|^\d{1,2}[/.-]\d{1,2}[/.-]\d{2,4}$/.test(String(v ?? '').trim());
        const d = completa ? lerData(v, { ano: 2000, mes: 1 }) : null;
        if (d) datas.push(d);
      }
    }
    const moda = (lista) => {
      const c = new Map();
      lista.forEach((x) => c.set(x, (c.get(x) || 0) + 1));
      return [...c.entries()].sort((x, y) => y[1] - x[1])[0]?.[0] ?? null;
    };
    const mes = pelo.mes ?? (moda(datas.map((d) => +d.slice(5, 7))) || null);
    const ano = pelo.ano ?? moda(datas.filter((d) => +d.slice(5, 7) === mes).map((d) => +d.slice(0, 4))) ?? moda(datas.map((d) => +d.slice(0, 4)));
    return { nome: a.nome, modelo: true, oculta: a.oculta, titulos, linhas: a.linhas, mes, ano, anoAdivinhado: !ano };
  });
  // ano não encontrado: o ano atual (ou o anterior, se o mês ainda não chegou)
  for (const a of lidas) {
    if (!a.modelo || a.ano) continue;
    a.ano = a.mes && a.mes > hoje.getMonth() + 1 ? hoje.getFullYear() - 1 : hoje.getFullYear();
  }
  return lidas;
}

/**
 * Monta o plano de importação para as abas escolhidas.
 * @param {ReturnType<typeof reconhecerAbas>} abas
 * @param {Record<string, {usar: boolean, mes: number, ano: number}>} escolhas por nome da aba
 */
export function montarPlano(abas, escolhas) {
  const avisos = [];
  const novos = { contas: [], cartoes: [], categorias: [], pessoas: [] };
  const tiposUsados = new Map(); // categoria id → Set(tipos) para ajustar o tipo depois
  const t = local.tabelas();
  const semDados = !t.lancamentos.length && !t.compras_cartao.length;

  // --- cadastros: acha pelo nome; se não existir, cria
  const achar = (lista, nome, criar) => {
    const k = chave(nome);
    if (!k) return null;
    const existente = store[lista].find((x) => chave(x.nome) === k) || novos[lista].find((x) => chave(x.nome) === k);
    if (existente) return existente;
    const item = { id: crypto.randomUUID(), ...criar(limpo(nome)) };
    novos[lista].push(item);
    return item;
  };
  const conta = (nome) => achar('contas', nome || 'Sem conta (planilha)', (n) => ({ nome: n, saldo_inicial: 0, ativa: true }));
  const pessoa = (nome) => (limpo(nome) ? achar('pessoas', nome, (n) => ({ nome: n, tipo: 'Outro' })) : null);
  const cartao = (nome) => {
    const k = chave(nome).replace(/^CARTAO(DE)?(CREDITO)?/, '');
    const existente = [...store.cartoes, ...novos.cartoes].find((c) => {
      const kc = chave(c.nome).replace(/^CARTAO(DE)?(CREDITO)?/, '');
      return kc && (kc === k || k.includes(kc) || kc.includes(k));
    });
    if (existente) return existente;
    const item = { id: crypto.randomUUID(), nome: limpo(nome).replace(/^cart[aã]o\s+/i, '').replace(/^\w/, (c) => c.toUpperCase()) || 'Cartão', dia_fechamento: 1, dia_vencimento: 10, ativo: true };
    novos.cartoes.push(item);
    return item;
  };
  const categoria = (nome, tipo) => {
    if (!limpo(nome)) return null;
    const c = achar('categorias', nome, (n) => ({ nome: n, grupo: 'Outros', no_grafico: false, tipo: TIPO_PADRAO[n] || tipo }));
    (tiposUsados.get(c.id) || tiposUsados.set(c.id, new Set()).get(c.id)).add(tipo);
    return c;
  };

  // --- duplicados: compara com o que já está no sistema (contando repetições)
  const contagem = (lista) => {
    const m = new Map();
    lista.forEach((k) => m.set(k, (m.get(k) || 0) + 1));
    return m;
  };
  const kLanc = (l) => [l.tipo, l.vencimento, Number(l.valor).toFixed(2), chave(l.descricao)].join('|');
  const kCompra = (c) => [c.cartao_id, c.data_compra, chave(c.descricao), c.qtd_parcelas, c.qtd_parcelas === 1 ? Number(c.valor_total).toFixed(2) : ''].join('|');
  const jaTemLanc = contagem(t.lancamentos.map(kLanc));
  const jaTemCompra = contagem(t.compras_cartao.map(kCompra));
  const repetido = (mapa, k) => (mapa.get(k) > 0 ? (mapa.set(k, mapa.get(k) - 1), true) : false);

  const usadas = abas.filter((a) => a.modelo && escolhas[a.nome]?.usar)
    .map((a) => ({ ...a, mes: escolhas[a.nome].mes, ano: escolhas[a.nome].ano }))
    .sort((a, b) => a.ano - b.ano || a.mes - b.mes);
  const primeira = usadas[0];

  // mesmo mês em duas abas: pode ser cópia
  const vistos = new Map();
  usadas.forEach((a) => {
    const k = `${a.ano}-${a.mes}`;
    if (vistos.has(k)) avisos.push(`As abas "${vistos.get(k)}" e "${a.nome}" são as duas de ${NOMES_MESES[a.mes - 1].toLowerCase()} de ${a.ano}. Confira se uma não é cópia da outra.`);
    vistos.set(k, a.nome);
  });

  const lancamentos = [];
  const saldosIniciais = new Map();
  const linhasCartao = [];
  const resumoAbas = new Map(usadas.map((a) => [a.nome, { caixa: 0, cartao: 0 }]));
  let repetidos = 0, saldoAnteriorIgnorado = 0, faturas = 0;
  const aviso = (a, l, msg) => avisos.push(`${a.nome}, linha ${l + 1}: ${msg}`);

  for (const a of usadas) {
    const ref = { ano: a.ano, mes: a.mes };
    const mesISO = iso(a.ano, a.mes, 1);
    const { caixa, blocos } = a.titulos;
    const cel = (linha, i) => (i >= 0 ? linha[i] : null);

    // ----- caixa
    if (caixa) {
      for (let l = a.titulos.linha + 1; l < a.linhas.length; l++) {
        const r = a.linhas[l] || [];
        const desc = limpo(cel(r, caixa.descricao));
        const cat = limpo(cel(r, caixa.categoria));
        const bruto = cel(r, caixa.valor);
        if (!desc && !cat && (bruto == null || bruto === '')) continue; // linha vazia (ou só com a fórmula do saldo)
        if (TOTAL.test(chave(desc)) || TOTAL.test(chave(cat))) continue;
        const v = lerNumero(bruto);
        if (!v) { aviso(a, l, `"${desc || cat}" está sem valor e não foi importado.`); continue; }
        if (Math.abs(v) > 99_999_999.99) { aviso(a, l, `"${desc || cat}" tem valor acima do limite e não foi importado.`); continue; }
        const tipo = v > 0 ? 'entrada' : 'saida';
        const contaItem = conta(cel(r, caixa.conta));

        if (SALDO_ANTERIOR.test(chave(desc)) || SALDO_ANTERIOR.test(chave(cat))) {
          // saldo que vem do mês anterior: o sistema calcula sozinho; só a 1ª aba vira saldo inicial
          if (a === primeira && semDados) saldosIniciais.set(contaItem.id, { nome: contaItem.nome, valor: (saldosIniciais.get(contaItem.id)?.valor || 0) + v });
          else saldoAnteriorIgnorado++;
          continue;
        }

        const pago = ['OK', 'PAGO', 'RECEBIDO', 'SIM', 'X'].includes(chave(cel(r, caixa.status)));
        const venc = lerData(cel(r, caixa.vencimento), ref) || lerData(cel(r, caixa.pagamento), ref) || mesISO;
        const dataPgto = pago ? lerData(cel(r, caixa.pagamento), ref) || venc : null;
        const parc = cel(r, caixa.parcela);
        const textoParcela = lerParcela(parc)?.texto || (typeof parc === 'number' ? '' : limpo(parc));
        const extra = [limpo(cel(r, caixa.referencia)), textoParcela && `(${textoParcela})`].filter(Boolean);
        const descricao = [desc || cat || 'Sem descrição', ...extra].join(' ').slice(0, 120);

        // pagamento de fatura de cartão (ex.: categoria "Fatura Nubank" ou "Cartão Thays")
        const textoTodo = chave(`${cat} ${desc}`);
        const cartaoPago = tipo === 'saida' && /FATURA|CARTAO/.test(textoTodo) && !store.categorias.some((c) => chave(c.nome) === chave(cat))
          ? [...store.cartoes, ...novos.cartoes].find((c) => textoTodo.includes(chave(c.nome).replace(/^CARTAO/, '')))
          : null;

        const item = {
          id: crypto.randomUUID(), tipo, valor: Math.abs(v), descricao, vencimento: venc, pago, data_pagamento: dataPgto,
          conta_id: contaItem.id, pessoa_id: pessoa(cel(r, caixa.pessoa))?.id ?? null, origem: 'planilha',
          categoria_id: cartaoPago ? null : categoria(cat || 'Sem categoria', tipo)?.id ?? null,
          ...(cartaoPago ? { fatura_cartao_id: cartaoPago.id, fatura_mes: mesISO } : {}),
        };
        if (repetido(jaTemLanc, kLanc(item))) { repetidos++; continue; }
        if (cartaoPago) faturas++;
        lancamentos.push(item);
        resumoAbas.get(a.nome).caixa++;
      }
    }

    // ----- cartões
    for (const b of blocos) {
      const cartaoItem = cartao(b.cartao || `Cartão ${blocos.indexOf(b) + 1}`);
      for (let l = a.titulos.linha + 1; l < a.linhas.length; l++) {
        const r = a.linhas[l] || [];
        const desc = limpo(cel(r, b.descricao));
        const cat = limpo(cel(r, b.categoria));
        const bruto = cel(r, b.valor);
        if (!desc && !cat && (bruto == null || bruto === '')) continue;
        // linha "TOTAL FATURA" (fica na coluna do mês, antes de DATA COMPRA) não é compra
        if ([b.data - 1, b.data, b.categoria, b.descricao].some((i) => i >= 0 && TOTAL.test(chave(r[i])))) continue;
        const v = lerNumero(bruto);
        if (!v) { aviso(a, l, `compra "${desc || cat}" no ${cartaoItem.nome} está sem valor e não foi importada.`); continue; }
        if (v < 0) { aviso(a, l, `"${desc || cat}" no ${cartaoItem.nome} tem valor negativo (estorno) e não foi importado. Lance como entrada se precisar.`); continue; }
        const { numero, total } = lerParcela(cel(r, b.parcela)) || { numero: 1, total: 1 };
        // sem data da compra: considera o dia 1º do mês da 1ª parcela
        const dataCompra = lerData(cel(r, b.data), ref, { antesDe: true }) || somarMeses(mesISO, -(numero - 1));
        linhasCartao.push({
          aba: a.nome, cartao: cartaoItem, numero, total, valor: v, fatura: mesISO, data: dataCompra,
          descricao: [desc || cat || 'Compra no cartão', limpo(cel(r, b.referencia))].filter(Boolean).join(' ').slice(0, 120),
          categoria: categoria(cat || 'Sem categoria', 'saida'), sub: limpo(cel(r, b.sub)) || null,
        });
        resumoAbas.get(a.nome).cartao++;
      }
    }
  }

  // ----- junta as parcelas da mesma compra (que aparecem em meses diferentes) e completa as que faltam
  const grupos = [];
  for (const x of linhasCartao) {
    const k = [x.cartao.id, x.data, chave(x.descricao), x.total].join('|');
    const g = x.total > 1 && grupos.find((y) => y.k === k && !y.parcelas.has(x.numero));
    if (g) g.parcelas.set(x.numero, x);
    else grupos.push({ k, x, parcelas: new Map([[x.numero, x]]) });
  }
  const compras = [];
  for (const g of grupos) {
    const { x } = g;
    const conhecidas = [...g.parcelas.values()].sort((a, b) => a.numero - b.numero);
    const base = conhecidas[0];
    const parcelas = Array.from({ length: x.total }, (_, i) => {
      const n = i + 1;
      const achada = g.parcelas.get(n);
      const perto = achada || conhecidas.reduce((m, c) => (Math.abs(c.numero - n) < Math.abs(m.numero - n) ? c : m), base);
      return { id: crypto.randomUUID(), numero: n, valor: perto.valor, fatura_mes: achada ? achada.fatura : somarMeses(base.fatura, n - base.numero) };
    });
    const compra = {
      id: crypto.randomUUID(), cartao_id: x.cartao.id, data_compra: x.data, descricao: x.descricao,
      categoria_id: x.categoria?.id ?? null, subcategoria: x.sub, qtd_parcelas: x.total, origem: 'planilha',
      valor_total: Math.round(parcelas.reduce((s, p) => s + p.valor, 0) * 100) / 100,
    };
    if (repetido(jaTemCompra, kCompra(compra))) { repetidos++; continue; }
    compras.push({ compra, parcelas: parcelas.map((p) => ({ ...p, compra_id: compra.id })), completadas: x.total - g.parcelas.size });
  }
  const parcelasCompletadas = compras.reduce((s, c) => s + c.completadas, 0);

  // ----- categorias que já existiam mas foram usadas no outro tipo viram "os dois"
  const mudarTipo = [];
  for (const [id, tipos] of tiposUsados) {
    const c = store.categorias.find((x) => x.id === id) || novos.categorias.find((x) => x.id === id);
    if (!c) continue;
    const precisa = tipos.size > 1 ? 'ambos' : [...tipos][0];
    const atual = c.tipo || 'saida';
    if (atual !== 'ambos' && atual !== precisa) {
      if (novos.categorias.includes(c)) c.tipo = 'ambos';
      else mudarTipo.push({ id, nome: c.nome, tipo: 'ambos' });
    }
  }

  if (saldoAnteriorIgnorado) avisos.push(`${saldoAnteriorIgnorado} linha(s) de "saldo anterior" não foram importadas: o sistema calcula o saldo de cada mês sozinho.`);
  return {
    abas: usadas.map((a) => ({ nome: a.nome, mes: a.mes, ano: a.ano, ...resumoAbas.get(a.nome) })),
    lancamentos, compras, novos, mudarTipo, saldosIniciais, avisos, repetidos, faturas,
    parcelasCompletadas,
    total: lancamentos.length + compras.length,
  };
}
