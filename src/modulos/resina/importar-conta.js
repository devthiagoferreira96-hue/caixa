// =====================================================================
// Entende a planilha "Conta corrente arrendo" da empresa e monta o que será importado.
// Sem tela e sem banco: fácil de testar (a tela fica em importar-conta-tela.js).
//
// Colunas (achadas pelo título): DATA | DESCRIÇÃO | NOTA | DESTINO CARGA | TAMBORES | % ARRENDO |
// QUANTIDADE | UNI. | MÉDIA | R$ UNITARIO | CRÉDITO | DÉBITO | SALDO
//
// Na planilha da empresa as colunas de número costumam ficar vazias e a informação vem escrita
// na DESCRIÇÃO. Por isso cada linha é lida das colunas e, no que faltar, do texto:
//   - "CARGA 57 TBS = 11.480 KG X R$ 4,60 X 55%"          → carga (Tbs, kg, preço, %)
//   - "CARGA 32 TBS X 202,90 MEDIA X R$ 4,50 X 100%"       → carga (Tbs, média, preço, %)
//   - "125 KG PASTA", "1 MIL SAQUINHOS", "6,3KG ARAME"    → insumo (descontado do produtor)
//   - o resto ("PIX VIA IN RESINAS", "PIX P/ MARIA"...)   → lançamento da conta corrente;
//     crédito ou débito vem da coluna preenchida, ou a pessoa escolhe na conferência.
// =====================================================================

/** Texto para comparar: sem acento, maiúsculo, só letras e números */
export const chave = (t) => String(t ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().replace(/[^A-Z0-9]/g, '');
/** Texto com palavras separadas por um espaço, sem acento e maiúsculo (para achar nomes no meio da frase) */
const palavras = (t) => ` ${String(t ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().replace(/[^A-Z0-9]+/g, ' ').trim()} `;
const limpo = (t) => String(t ?? '').replace(/\s+/g, ' ').trim();
const centavos = (v) => Math.round(v * 100) / 100;
/** Tbs com meio tambor: 28,5 fica 28,5; 28,3 vira 28,5 */
const meio = (v) => Math.round(Number(v) * 2) / 2;
const pad = (n) => String(n).padStart(2, '0');

/** Número escrito do jeito brasileiro: 11.480 → 11480; 3803,5 → 3803.5; "R$ 4,60" → 4.6; -1.234,56 → -1234.56 */
export function numeroBR(v) {
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  if (v == null) return null;
  let s = String(v).trim();
  if (!s) return null;
  const negativo = /^\(.*\)$/.test(s) || /^-|^R\$\s*-|−/.test(s);
  s = s.replace(/[^\d,.]/g, '');
  if (!s || !/\d/.test(s)) return null;
  if (s.includes(',')) s = s.replace(/\./g, '').replace(',', '.');
  else if (/^\d{1,3}(\.\d{3})+$/.test(s)) s = s.replace(/\./g, '');
  const n = Number(s);
  return Number.isFinite(n) ? (negativo ? -n : n) : null;
}

/** Data da célula: número do Excel, "27/01/2026", "27/01/26" ou "2026-01-27" → "aaaa-mm-dd" (ou null) */
export function dataDaCelula(v) {
  if (v == null || v === '') return null;
  let a, m, d;
  if (typeof v === 'number') {
    if (v < 20000 || v > 80000) return null;
    const x = new Date(Date.UTC(1899, 11, 30) + Math.round(v) * 86400000);
    [a, m, d] = [x.getUTCFullYear(), x.getUTCMonth() + 1, x.getUTCDate()];
  } else {
    const s = String(v).trim();
    let r = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(s);
    if (r) [a, m, d] = [+r[1], +r[2], +r[3]];
    else if ((r = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})$/.exec(s))) [d, m, a] = [+r[1], +r[2], +r[3] < 100 ? 2000 + +r[3] : +r[3]];
    else return null;
  }
  if (m < 1 || m > 12 || d < 1 || d > new Date(a, m, 0).getDate()) return null;
  return `${a}-${pad(m)}-${pad(d)}`;
}

// ---------- 1) achar as colunas
const TITULOS = {
  data: ['DATA'],
  descricao: ['DESCRICAO', 'HISTORICO'],
  nota: ['NOTA', 'NF', 'NOTAFISCAL'],
  destino: ['DESTINOCARGA', 'DESTINO'],
  tbs: ['TAMBORES', 'TBS'],
  pct: ['ARRENDO', 'ARRENDAMENTO'],
  quantidade: ['QUANTIDADE', 'QTD', 'QTDE'],
  uni: ['UNI', 'UNIDADE'],
  media: ['MEDIA'],
  unitario: ['RUNITARIO', 'UNITARIO', 'VALORUNITARIO', 'PRECO'],
  credito: ['CREDITO'],
  debito: ['DEBITO'],
  saldo: ['SALDO'],
};

/** Linha de títulos: tem DATA, DESCRIÇÃO e CRÉDITO ou DÉBITO */
function acharColunas(linha) {
  const col = {};
  (linha || []).forEach((c, i) => {
    const k = chave(c);
    for (const [campo, nomes] of Object.entries(TITULOS)) if (col[campo] == null && nomes.includes(k)) col[campo] = i;
  });
  return col.data != null && col.descricao != null && (col.credito != null || col.debito != null) ? col : null;
}

/**
 * Lê as abas (saída de lerXlsx) e devolve as linhas de cada aba que está no modelo da conta corrente.
 * @returns {{aba: string, linhas: object[]}[]}
 */
export function lerPlanilhaConta(abas) {
  const saida = [];
  for (const aba of abas) {
    const i = aba.linhas.findIndex((l) => acharColunas(l));
    if (i < 0) continue;
    const col = acharColunas(aba.linhas[i]);
    const linhas = [];
    for (let r = i + 1; r < aba.linhas.length; r++) {
      const c = aba.linhas[r] || [];
      const v = (campo) => (col[campo] == null ? null : c[col[campo]]);
      const descricao = limpo(v('descricao'));
      const k = chave(descricao);
      if (!descricao || k === 'SALDOANTERIOR' || k === 'TOTAL') continue; // linhas de saldo/total (da exportação do sistema)
      const n = (campo) => { const x = numeroBR(v(campo)); return x === 0 ? null : x; };
      let pct = numeroBR(v('pct'));
      if (pct != null && pct > 0 && pct <= 1) pct = Math.round(pct * 10000) / 100; // célula formatada como %: 0,55 = 55%
      linhas.push({
        n: r + 1, // linha no Excel
        data: dataDaCelula(v('data')),
        dataOriginal: v('data'),
        descricao,
        nota: limpo(v('nota')),
        destino: limpo(v('destino')),
        tbs: n('tbs'), pct: pct || null, quantidade: n('quantidade'), uni: n('uni'), media: n('media'), unitario: n('unitario'),
        credito: n('credito'), debito: n('debito'),
      });
    }
    saida.push({ aba: aba.nome, linhas });
  }
  return saida;
}

// ---------- 2) entender cada linha
const UNIDADE_DO_TEXTO = [
  [/^KGS?$/, 'kg'], [/^G$/, 'g'], [/^(L|LT|LTS|LITROS?)$/, 'L'], [/^(SC|SACOS?)$/, 'saco'], [/^(CX|CAIXAS?)$/, 'caixa'],
  [/^(PCT|PACOTES?)$/, 'pacote'], [/^GAL(AO|OES)$/, 'galão'], [/^(UN|UND|UNID|UNIDADES?)$/, 'un'], [/^M$/, 'm'],
];
const RE_INSUMO = /^\s*(\d[\d.,]*)\s*(MIL(?![A-ZÀ-Ú]))?\s*(KGS?|KG|G|LITROS?|LTS?|LT|L|UNIDADES?|UNID|UND|UN|SACOS?|SC|CAIXAS?|CX|PACOTES?|PCT|GAL[AÃ]O|GAL[OÕ]ES|M)?(?![A-ZÀ-Ú])\s*([A-ZÀ-Ú].*)$/i;

/** Primeiro número que casa com a expressão (grupo 1) */
const doTexto = (re, t) => { const m = re.exec(t); return m ? numeroBR(m[1]) : null; };

/**
 * Classifica uma linha lida: carga, insumo, lançamento ou anotação (não importa).
 * Colunas preenchidas valem mais que o texto; diferenças viram aviso.
 */
export function entenderLinha(l) {
  const t = l.descricao.toUpperCase();
  const avisos = [];
  const valorPlanilha = l.debito != null ? Math.abs(l.debito) : l.credito != null ? Math.abs(l.credito) : null;

  if (/^CARGA\b/.test(t)) {
    const tbsTexto = doTexto(/(\d+(?:[.,]\d+)?)\s*TBS?\b/, t);
    if (l.tbs != null && tbsTexto != null && l.tbs !== tbsTexto) avisos.push(`a coluna TAMBORES diz ${l.tbs} e o texto diz ${tbsTexto} (usei ${l.tbs})`);
    const tbs = l.tbs ?? tbsTexto;
    const media = l.media ?? doTexto(/([\d.,]+)\s*M[EÉ]DIA/, t);
    const kgTexto = doTexto(/=\s*([\d.,]+)\s*KG/, t);
    const preco = l.unitario ?? doTexto(/R\$\s*([\d.,]*\d)/, t);
    const pct = l.pct ?? doTexto(/(\d+(?:[.,]\d+)?)\s*%/, t);
    const kg = l.quantidade ?? kgTexto ?? (media && tbs ? media * tbs : null);
    const falta = [!tbs && 'tambores', !kg && 'kg ou média', !preco && 'preço do kg', pct == null && '% do arrendamento'].filter(Boolean);
    if (falta.length) return { ...l, tipo: 'anotacao', motivo: `linha de carga sem ${falta.join(', ')}`, avisos };
    if (/NF\s*[\d.,]+\s*RECEBIDO/.test(t)) avisos.push('o preço da nota é diferente do recebido; usei o preço com R$ da descrição');
    return { ...l, tipo: 'carga', tbs, kg: centavos(kg), media: media || null, preco, pct, valorPlanilha, avisos };
  }

  const m = RE_INSUMO.exec(l.descricao);
  if (m && !/%/.test(l.descricao.slice(0, m[1].length + 3))) {
    let qtd = numeroBR(m[1]) * (m[2] ? 1000 : 1);
    let unidade = 'un';
    const u = chave(m[3] || '');
    for (const [re, x] of UNIDADE_DO_TEXTO) if (u && re.test(u)) unidade = x;
    if (unidade === 'g') { unidade = 'kg'; qtd /= 1000; }
    if (l.quantidade != null) qtd = l.quantidade;
    // "ARAME - BEATRIZ PAGOU - 50% PARTE MARIA" → produto "ARAME", observação o resto
    // "125 kg Pasta · Carlos" (planilha exportada pelo sistema) → produto "Pasta"
    const [semNome, ...depois] = limpo(m[4]).split(' · ');
    const [produto, ...resto] = semNome.split(/\s+-\s+/);
    const valor = valorPlanilha;
    const unitario = l.unitario ?? (valor != null && qtd ? valor / qtd : null);
    return {
      ...l, tipo: 'insumo', quantidade: qtd, unidade, produto: limpo(produto), obs: resto.join(' - ').slice(0, 120),
      nomeNoTexto: depois.join(' · '), valor, unitario, avisos,
    };
  }

  const tipoMov = l.credito != null && Math.abs(l.credito) > 0 ? 'credito' : l.debito != null && Math.abs(l.debito) > 0 ? 'debito' : '';
  return { ...l, tipo: 'movimento', tipoMov, valor: valorPlanilha, avisos };
}

/**
 * Produtor citado na linha (nome cadastrado escrito na descrição ou na nota).
 * Só devolve quando exatamente um produtor aparece.
 */
export function produtorDaLinha(l, produtores) {
  // planilha gerada pelo sistema: "Carga C-2026-0001 · Beatriz - Renato" — o nome depois do " · " é o produtor
  const depois = String(l.descricao || '').split(' · ').slice(1).map(chave);
  const exato = depois.length ? produtores.find((p) => depois.includes(chave(p.nome))) : null;
  if (exato) return exato.id;
  const texto = palavras(`${l.descricao} ${l.nota} ${l.nomeNoTexto || ''}`);
  const primeiros = new Map();
  for (const p of produtores) { const f = palavras(p.nome).trim().split(' ')[0]; primeiros.set(f, (primeiros.get(f) || 0) + 1); }
  const achados = produtores.filter((p) => {
    const nome = palavras(p.nome);
    if (nome.trim().length >= 3 && texto.includes(nome)) return true;
    const primeiro = nome.trim().split(' ')[0];
    return primeiro.length >= 4 && primeiros.get(primeiro) === 1 && texto.includes(` ${primeiro} `);
  });
  return achados.length === 1 ? achados[0].id : null;
}

/** Produto cadastrado com o mesmo nome (sem acento, sem espaço, sem plural simples) */
export function produtoParecido(nome, produtos) {
  const k = chave(nome);
  const sing = (x) => x.replace(/S$/, '');
  return produtos.find((p) => chave(p.nome) === k) || produtos.find((p) => sing(chave(p.nome)) === sing(k)) || null;
}

// ---------- 3) montar o plano
/**
 * @param {object[]} linhas  linhas já entendidas (entenderLinha), na ordem da planilha
 * @param {object} decisoes  { titular_id, porLinha: {n: {incluir, produtor_id, tipoMov, valor}}, produtos: {chaveProduto: 'criar' | id} }
 * @param {object} existentes { cargas, itensPorCarga, insumos, movimentos, produtos }
 * @returns plano com cargas, insumos, movimentos, produtos novos, pendências e contagens
 */
export function montarImportacao(linhas, decisoes, existentes) {
  const titular_id = decisoes.titular_id || null;
  const dec = (l) => decisoes.porLinha?.[l.n] || {};
  const plano = { cargas: [], insumos: [], movimentos: [], produtosNovos: [], pendentes: [], repetidas: [], puladas: [], anotacoes: [], avisos: [], completar: [] };

  // produtos: um por nome da planilha (só cria os que forem usados)
  const produtoDe = new Map();
  const produtoDaLinha = (l) => {
    const k = chave(l.produto);
    if (produtoDe.has(k)) return produtoDe.get(k);
    const escolha = decisoes.produtos?.[k];
    const existente = escolha && escolha !== 'criar' ? existentes.produtos.find((p) => p.id === escolha) : !escolha ? produtoParecido(l.produto, existentes.produtos) : null;
    if (existente) produtoDe.set(k, existente.id);
    else {
      const novo = { id: crypto.randomUUID(), nome: nomeBonito(l.produto), unidade: l.unidade, valor_unitario: 0, ativo: true };
      plano.produtosNovos.push(novo);
      produtoDe.set(k, novo.id);
    }
    return produtoDe.get(k);
  };

  // o que já está no sistema (para não duplicar ao importar de novo)
  const jaTem = {
    // cada produtor de cada carga: mesmo dia, preço, Tbs e % (não depende de quem foi escolhido como produtor)
    carga: new Set(existentes.cargas.flatMap((c) => (existentes.itensPorCarga.get(c.id) || []).map((i) =>
      `${c.titular_id || ''}|${c.data}|${Math.round((c.preco_kg || 0) * 100)}|${i.tbs}|${i.arrendamento}`))),
    insumo: new Set(existentes.insumos.map((i) => `${i.titular_id || ''}|${i.data}|${i.produtor_id}|${i.produto_id}|${Math.round(i.quantidade * 1000)}`)),
    movimento: new Set(existentes.movimentos.map((m) => `${m.titular_id || ''}|${m.data}|${m.tipo}|${Math.round(m.valor * 100)}|${chave(m.descricao)}`)),
  };
  // a mesma carga já veio de outra planilha (ex.: SAFRAS, que não tem preço nem conta): mesmo dia, produtor e Tbs
  const itemExistente = new Map();
  for (const c of existentes.cargas) {
    for (const i of existentes.itensPorCarga.get(c.id) || []) itemExistente.set(`${c.data}|${i.produtor_id}|${meio(i.tbs)}`, { carga: c, item: i });
  }
  const completadas = new Set();

  let ordem = 0; // mantém a ordem da planilha no mesmo dia
  for (const l of linhas) {
    const d = dec(l);
    if (l.tipo === 'anotacao') { plano.anotacoes.push(l); continue; }
    if (d.incluir === false) { plano.puladas.push(l); continue; }
    if (!l.data) { plano.pendentes.push({ linha: l, falta: 'data' }); continue; }
    const produtor_id = d.produtor_id || null;
    ordem++;

    if (l.tipo === 'carga') {
      if (jaTem.carga.has(`${titular_id || ''}|${l.data}|${Math.round(l.preco * 100)}|${meio(l.tbs)}|${l.pct}`)) { plano.repetidas.push(l); continue; }
      if (!produtor_id) { plano.pendentes.push({ linha: l, falta: 'produtor' }); continue; }
      const existe = itemExistente.get(`${l.data}|${produtor_id}|${meio(l.tbs)}`);
      if (existe && !completadas.has(existe.item.id)) {
        const c = existe.carga;
        // carga de outra conta, ou já completa: não mexe
        if ((c.titular_id && c.titular_id !== titular_id) || (c.titular_id && c.preco_kg > 0)) { plano.repetidas.push(l); continue; }
        completadas.add(existe.item.id);
        plano.completar.push({
          carga_id: c.id, item_id: existe.item.id, linha: l.n, arrendamento: l.pct,
          carga: { titular_id, preco_kg: c.preco_kg > 0 ? c.preco_kg : l.preco, nota: c.nota || l.nota.slice(0, 80), destino: c.destino || l.destino.slice(0, 80) },
        });
        continue;
      }
      const item = { produtor_id, tbs: meio(l.tbs), arrendamento: l.pct, kg: l.kg };
      // planilha gerada pelo sistema: "Carga C-2026-0001 · Pedro" (o código junta os produtores da mesma carga)
      const codigo = /\bC-\d{4}-\d+\b/.exec(l.descricao)?.[0] || null;
      // linhas seguidas da mesma carga (mesmo dia, preço, média e nota, ou o mesmo código) viram uma carga com vários produtores
      const anterior = plano.cargas[plano.cargas.length - 1];
      const mesmaCarga = anterior && anterior.ultimaLinha === ordem - 1 && anterior.carga.data === l.data
        && !anterior.itens.some((i) => i.produtor_id === produtor_id)
        && ((codigo && anterior.codigo === codigo)
          || (anterior.carga.preco_kg === l.preco && anterior.media && l.media && anterior.media === l.media && anterior.carga.nota === l.nota.slice(0, 80)));
      if (mesmaCarga) {
        anterior.itens.push(item);
        anterior.linhas.push(l.n);
        anterior.ultimaLinha = ordem;
        anterior.carga.peso_chegada = centavos(anterior.itens.reduce((s, i) => s + i.kg, 0));
        continue;
      }
      plano.cargas.push({
        carga: {
          data: l.data, titular_id, nota: l.nota.slice(0, 80), destino: l.destino.slice(0, 80), preco_kg: l.preco,
          peso_base: 'chegada', peso_chegada: l.kg, peso_fazenda: null, obs: codigo ? '' : l.descricao.slice(0, 300),
          fazenda_id: null, motorista_id: null, caminhao_id: null,
        },
        itens: [item], media: l.media, linhas: [l.n], ultimaLinha: ordem, valorPlanilha: l.valorPlanilha, codigo,
      });
    } else if (l.tipo === 'insumo') {
      const valor = d.valor ?? l.valor;
      if (!produtor_id) { plano.pendentes.push({ linha: l, falta: 'produtor' }); continue; }
      if (!(valor > 0)) { plano.pendentes.push({ linha: l, falta: 'valor' }); continue; }
      const existe = decisoes.produtos?.[chave(l.produto)];
      const produtoConhecido = existe && existe !== 'criar' ? existe : !existe ? produtoParecido(l.produto, existentes.produtos)?.id : null;
      const unit = d.valor != null && l.quantidade ? valor / l.quantidade : (l.unitario ?? valor / l.quantidade);
      const k = `${titular_id || ''}|${l.data}|${produtor_id}|${produtoConhecido}|${Math.round(l.quantidade * 1000)}`;
      if (produtoConhecido && jaTem.insumo.has(k)) { plano.repetidas.push(l); continue; }
      const produto_id = produtoDaLinha(l);
      plano.insumos.push({
        data: l.data, produtor_id, produto_id, titular_id, quantidade: l.quantidade, valor_unitario: unit, valor_total: centavos(valor),
        nota: l.nota.slice(0, 80), obs: l.obs, ordem, linha: l.n,
      });
    } else {
      const tipo = d.tipoMov ?? l.tipoMov;
      const valor = d.valor ?? l.valor;
      if (!tipo) { plano.pendentes.push({ linha: l, falta: 'tipo' }); continue; }
      if (!(valor > 0)) { plano.pendentes.push({ linha: l, falta: 'valor' }); continue; }
      // "PIX VIA IN RESINAS · Carlos" (planilha gerada pelo sistema): o " · nome" é o produtor, não faz parte da descrição
      const descricao = (produtor_id && l.descricao.includes(' · ') ? l.descricao.slice(0, l.descricao.lastIndexOf(' · ')) : l.descricao).slice(0, 120);
      const k = `${titular_id || ''}|${l.data}|${tipo}|${Math.round(valor * 100)}|${chave(descricao)}`;
      if (jaTem.movimento.has(k)) { plano.repetidas.push(l); continue; }
      plano.movimentos.push({
        data: l.data, titular_id, tipo, valor: centavos(valor), descricao, nota: l.nota.slice(0, 80),
        produtor_id, ordem, linha: l.n,
      });
    }
  }

  // insumos do mesmo dia, produtor e nota formam uma entrega (sem produto repetido)
  const entregas = new Map();
  for (const i of plano.insumos) {
    let k = `${i.data}|${i.produtor_id}|${i.nota}`;
    while (entregas.get(k)?.produtos.has(i.produto_id)) k += '+';
    const e = entregas.get(k) || entregas.set(k, { id: crypto.randomUUID(), produtos: new Set() }).get(k);
    e.produtos.add(i.produto_id);
    i.entrega_id = e.id;
  }

  // carga com vários produtores: guarda o kg de cada um (é o que a planilha diz)
  for (const c of plano.cargas) if (c.itens.length > 1) c.itens.forEach((i) => { i.kg_manual = i.kg; });

  for (const l of linhas) for (const a of l.avisos || []) plano.avisos.push(`Linha ${l.n}: ${a}.`);
  plano.total = plano.cargas.length + plano.insumos.length + plano.movimentos.length + plano.completar.length;
  return plano;
}

/** "PASTA ETHREL" → "Pasta ethrel"; mantém siglas curtas como estão */
export function nomeBonito(t) {
  const s = limpo(t);
  if (s !== s.toUpperCase()) return s.slice(0, 60);
  const baixo = s.toLowerCase();
  return (baixo.charAt(0).toUpperCase() + baixo.slice(1)).slice(0, 60);
}
