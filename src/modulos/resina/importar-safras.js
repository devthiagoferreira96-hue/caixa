// =====================================================================
// Entende a planilha "CONTROLE ANUAL" da produção (abas SAFRAS) e monta as cargas que serão importadas.
// Sem tela e sem banco: fácil de testar (a tela fica em importar-safras-tela.js).
//
// Cada bloco da planilha é um produtor numa safra (agosto a julho):
//     PRODUÇÃO SAFRA AGO/24 - AGO/25        ← título (opcional)
//     MARCOS                            ← produtor do bloco
//     DATA | TBS | PESO - KG | (nome)       ← títulos; a 4ª coluna, se tiver texto, diz de quem é a linha
//     12/08/24 | 25 | 5.190
//     TOTAL | =SOMA(...)                    ← fim do bloco
// Os blocos ficam lado a lado (uma safra em cada grupo de colunas) e um embaixo do outro (um produtor em cada faixa).
//
// Bloco de dois produtores ("PEDRO E PAULO"): a linha com nome vai inteira para quem está escrito;
// a linha sem nome é dividida meio a meio (decisão do usuário em 17/11/2026).
// A aba de resumo ("CONTROLE DE CARGA ANUAL", Tbs por mês × ano) não é importada: é só soma das cargas.
// =====================================================================

/** Texto para comparar: sem acento, maiúsculo, só letras e números */
export const chave = (t) => String(t ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().replace(/[^A-Z0-9]/g, '');
const limpo = (t) => String(t ?? '').replace(/\s+/g, ' ').trim();
const pad = (n) => String(n).padStart(2, '0');
const meio = (v) => Math.round(Number(v) * 2) / 2;
const dec = (v) => Math.round(Number(v) * 100) / 100;

/** Número da célula: 5190, "5.190", "3803,5", "28,5" */
export function numeroCelula(v) {
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  let s = String(v ?? '').trim().replace(/[^\d,.-]/g, '');
  if (!s || !/\d/.test(s)) return null;
  if (s.includes(',')) s = s.replace(/\./g, '').replace(',', '.');
  else if (/^\d{1,3}(\.\d{3})+$/.test(s)) s = s.replace(/\./g, '');
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

/** Data da célula: número do Excel, "12/08/2024", "12/08/24" ou "2024-08-12" → "aaaa-mm-dd" (ou null) */
export function dataCelula(v) {
  let a, m, d;
  if (typeof v === 'number') {
    if (v < 20000 || v > 80000) return null;
    const x = new Date(Date.UTC(1899, 11, 30) + Math.round(v) * 86400000);
    [a, m, d] = [x.getUTCFullYear(), x.getUTCMonth() + 1, x.getUTCDate()];
  } else {
    const s = String(v ?? '').trim();
    let r = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(s);
    if (r) [a, m, d] = [+r[1], +r[2], +r[3]];
    else if ((r = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})$/.exec(s))) [d, m, a] = [+r[1], +r[2], +r[3] < 100 ? 2000 + +r[3] : +r[3]];
    else return null;
  }
  if (m < 1 || m > 12 || d < 1 || d > new Date(a, m, 0).getDate()) return null;
  return `${a}-${pad(m)}-${pad(d)}`;
}

/** Safra de uma data: agosto a julho. "2025-03-10" → "2024/2025" */
export function safraDe(data) {
  const a = Number(data.slice(0, 4));
  return Number(data.slice(5, 7)) >= 8 ? `${a}/${a + 1}` : `${a - 1}/${a}`;
}

/** "PRODUÇÃO SAFRA AGO/24 - AGO/25" ou "08/24 - 08/25" → "2024/2025" (ou null) */
function safraDoTitulo(t) {
  const r = /(\d{2,4})\s*-\s*(?:[A-Z]{3}\/|\d{2}\/)?(\d{2,4})\s*$/.exec(String(t).toUpperCase().replace(/\s+/g, ' '));
  if (!r) return null;
  const ano = (x) => (x.length === 2 ? 2000 + Number(x) : Number(x));
  return `${ano(r[1])}/${ano(r[2])}`;
}

const ehTitulo = (k) => k === 'DATA';
const ehTbs = (k) => k === 'TBS' || k === 'TAMBORES' || k === 'TB';
const ehPeso = (k) => k.startsWith('PESO') || k === 'KG';
const ehTotal = (k) => /^(TOTAL|SOMA|SUBTOTAL)/.test(k);

/** A aba é o resumo anual (Tbs por mês × ano)? Só reconhece para avisar que não é importada. */
function ehResumoAnual(aba) {
  const linhas = aba.linhas || [];
  if (linhas.slice(0, 3).some((l) => (l || []).some((c) => chave(c).includes('CONTROLEDECARGA')))) return true;
  return linhas.slice(0, 8).some((l) => chave(l?.[0]) === 'JANEIRO' && (l || []).slice(1).some((c) => Number(c) >= 2000 && Number(c) <= 2100));
}

/**
 * Lê as abas (saída de lerXlsx) e devolve os blocos de produção encontrados.
 * @returns {{blocos: {aba, produtor, safra, linha, coluna, linhas: {n, data, tbs, kg, nome}[]}[], resumos: string[]}}
 */
export function lerSafras(abas) {
  const blocos = [];
  const resumos = [];
  for (const aba of abas) {
    const L = aba.linhas || [];
    let achou = false;
    for (let r = 0; r < L.length; r++) {
      const linha = L[r] || [];
      for (let c = 0; c < linha.length; c++) {
        if (!ehTitulo(chave(linha[c])) || !ehTbs(chave(linha[c + 1])) || !ehPeso(chave(linha[c + 2]))) continue;
        achou = true;
        // produtor: o primeiro texto acima do título que não é o título da safra
        let produtor = '', safra = null;
        for (let k = r - 1; k >= Math.max(0, r - 4); k--) {
          const t = limpo(L[k]?.[c]);
          if (!t) continue;
          if (/^PRODU/.test(chave(t))) { safra = safraDoTitulo(t); break; }
          if (!produtor) produtor = t;
        }
        const linhas = [];
        for (let k = r + 1; k < L.length; k++) {
          const x = L[k] || [];
          const k0 = chave(x[c]);
          if (ehTotal(k0) || ehTitulo(k0) || /^PRODU/.test(k0)) break;
          const data = dataCelula(x[c]);
          if (!data) {
            if (typeof x[c] === 'string' && x[c].trim()) break; // texto no lugar da data: começou outro bloco
            continue; // linha vazia
          }
          const tbs = numeroCelula(x[c + 1]);
          const kg = numeroCelula(x[c + 2]);
          if (!(tbs > 0) && !(kg > 0)) continue;
          const nome = typeof x[c + 3] === 'string' ? limpo(x[c + 3]) : '';
          linhas.push({ n: k + 1, data, tbs: tbs > 0 ? tbs : 0, kg: kg > 0 ? kg : null, nome });
        }
        blocos.push({ aba: aba.nome, produtor, safra, linha: r + 1, coluna: c, linhas });
      }
    }
    if (!achou && ehResumoAnual(aba)) resumos.push(aba.nome);
  }
  return { blocos, resumos };
}

/** Partes de um nome de bloco: "PEDRO E PAULO" → ["PEDRO", "PAULO"]; "BEATRIZ - RENATO" → ["BEATRIZ", "RENATO"] */
const partesDoNome = (nome) => limpo(nome).toUpperCase().split(/\s+E\s+|\s*[-/&+]\s*|\s*,\s*/).map(chave).filter(Boolean);
/** Chave do produtor que ignora o "e" e os separadores: "Beatriz e Renato" = "BEATRIZ - RENATO" */
export const chaveProdutor = (nome) => partesDoNome(nome).join('|') || chave(nome);

/** "BEATRIZ - RENATO" → "Beatriz - Renato" (mantém siglas e nomes já escritos com minúsculas) */
export function nomeProdutor(t) {
  const s = limpo(t);
  if (s !== s.toUpperCase()) return s.slice(0, 60);
  return s.toLowerCase().replace(/(^|[\s\-/])(\p{L})/gu, (_, a, b) => a + b.toUpperCase()).replace(/ E /g, ' e ').slice(0, 60);
}

/**
 * Transforma os blocos em entregas por produtor (já dividindo as linhas sem nome dos blocos de dois produtores).
 * @returns {{entregas: {produtor, chave, data, tbs, kg, obs, aba, n}[], grupos: Map}}
 */
export function entregasDosBlocos(blocos) {
  // quem aparece com nome na coluna ao lado, por bloco (para saber se o bloco é de várias pessoas)
  const individuais = new Map(); // chave do bloco → Map(parte → nome escrito)
  for (const b of blocos) {
    const partes = partesDoNome(b.produtor);
    if (partes.length < 2) continue;
    const kb = partes.join('|');
    for (const l of b.linhas) {
      const k = chave(l.nome);
      if (partes.includes(k)) (individuais.get(kb) || individuais.set(kb, new Map()).get(kb)).set(k, l.nome);
    }
  }
  const entregas = [];
  for (const b of blocos) {
    const partes = partesDoNome(b.produtor);
    const kb = partes.join('|');
    const pessoas = individuais.get(kb); // bloco de várias pessoas, com os nomes que aparecem
    for (const l of b.linhas) {
      const base = { data: l.data, aba: b.aba, n: l.n, safra: b.safra };
      const k = chave(l.nome);
      if (pessoas && pessoas.has(k)) {
        entregas.push({ ...base, produtor: l.nome, tbs: l.tbs, kg: l.kg, obs: '' });
      } else if (pessoas && pessoas.size >= 2) {
        // linha sem nome (ou com uma anotação, como "ACORDO LUCAS"): meio a meio entre as pessoas do bloco
        const nomes = partes.filter((p) => pessoas.has(p)).map((p) => pessoas.get(p));
        let restoTbs = l.tbs, restoKg = l.kg;
        nomes.forEach((nome, i) => {
          const ultima = i === nomes.length - 1;
          const tbs = ultima ? meio(restoTbs) : meio(l.tbs / nomes.length);
          const kg = l.kg == null ? null : ultima ? dec(restoKg) : dec(l.kg / nomes.length);
          restoTbs -= tbs; if (kg != null) restoKg -= kg;
          entregas.push({ ...base, produtor: nome, tbs, kg, obs: l.nome, dividida: nomes.length });
        });
      } else {
        entregas.push({ ...base, produtor: b.produtor, tbs: l.tbs, kg: l.kg, obs: l.nome });
      }
    }
  }
  for (const e of entregas) e.chave = chaveProdutor(e.produtor);
  return entregas;
}

/**
 * Monta o plano: produtores (existentes ou novos), cargas por dia e o que já existe.
 * @param {ReturnType<typeof lerSafras>['blocos']} blocos
 * @param {{produtores?: Record<string, 'criar'|string>, arrendamento?: Record<string, number>, titular_id?: string|null}} decisoes
 *   produtores: chave do produtor → 'criar' ou id de um produtor que já existe
 * @param {{produtores: object[], cargas: object[], itensPorCarga: Map, precos: object[]}} existentes
 */
export function montarImportacaoSafras(blocos, decisoes, existentes) {
  const entregas = entregasDosBlocos(blocos);
  const plano = { cargas: [], produtoresNovos: [], produtores: [], repetidas: 0, duplicadasNoArquivo: 0, semPeso: 0, avisos: [], entregas: 0 };

  // ----- produtores: acha pelo nome (ignorando "e", "-" e acento) ou cria
  const porChave = new Map();
  for (const e of entregas) {
    const p = porChave.get(e.chave) || porChave.set(e.chave, { chave: e.chave, nome: nomeProdutor(e.produtor), linhas: 0, tbs: 0 }).get(e.chave);
    p.linhas++; p.tbs += e.tbs;
  }
  const idDe = new Map();
  for (const p of porChave.values()) {
    const escolha = decisoes.produtores?.[p.chave];
    const achado = escolha && escolha !== 'criar'
      ? existentes.produtores.find((x) => x.id === escolha)
      : !escolha ? existentes.produtores.find((x) => chaveProdutor(x.nome) === p.chave) : null;
    if (achado) {
      idDe.set(p.chave, achado.id);
      plano.produtores.push({ ...p, existente: achado, arrendamento: Number(achado.arrendamento) || 0 });
    } else {
      const novo = { id: crypto.randomUUID(), nome: p.nome, arrendamento: Number(decisoes.arrendamento?.[p.chave]) || 0, ativo: true };
      plano.produtoresNovos.push(novo);
      idDe.set(p.chave, novo.id);
      plano.produtores.push({ ...p, novo, arrendamento: novo.arrendamento });
    }
  }
  const pctDe = (k) => plano.produtores.find((p) => p.chave === k).arrendamento;

  // ----- o que já está no sistema: mesmo dia, produtor e Tbs (de qualquer importação ou lançado à mão)
  const jaTem = new Set();
  for (const c of existentes.cargas) {
    for (const i of existentes.itensPorCarga.get(c.id) || []) jaTem.add(`${c.data}|${i.produtor_id}|${meio(i.tbs)}`);
  }

  // ----- linhas repetidas no próprio arquivo (a mesma safra aparece em duas abas)
  const vistas = new Set();
  const porDia = new Map();
  for (const e of entregas) {
    const id = idDe.get(e.chave);
    const kArq = `${e.chave}|${e.data}|${meio(e.tbs)}|${e.kg ?? ''}`;
    if (vistas.has(kArq)) { plano.duplicadasNoArquivo++; continue; }
    vistas.add(kArq);
    if (jaTem.has(`${e.data}|${id}|${meio(e.tbs)}`)) { plano.repetidas++; continue; }
    // o mesmo produtor duas vezes no mesmo dia = duas cargas (não soma: cada uma tem o seu peso e a sua linha na conta corrente)
    const doDia = porDia.get(e.data) || porDia.set(e.data, []).get(e.data);
    let dia = doDia.find((x) => !x.itens.has(id));
    if (!dia) doDia.push((dia = { itens: new Map(), obs: new Set(), linhas: [] }));
    const item = { produtor_id: id, tbs: meio(e.tbs), kg: e.kg == null ? 0 : dec(e.kg), semKg: e.kg == null, arrendamento: pctDe(e.chave) };
    dia.itens.set(id, item);
    if (e.obs) dia.obs.add(e.obs);
    dia.linhas.push(`${e.aba} L${e.n}`);
    plano.entregas++;
  }

  // ----- uma carga por dia (com todos os produtores daquele dia)
  const precoDe = (data) => [...(existentes.precos || [])].filter((p) => p.inicio <= data).sort((a, b) => (a.inicio < b.inicio ? 1 : -1))[0]?.valor_kg || 0;
  const dias = [...porDia].sort((a, b) => (a[0] < b[0] ? -1 : 1)).flatMap(([data, lista]) => lista.map((dia) => [data, dia]));
  for (const [data, dia] of dias) {
    const itens = [...dia.itens.values()];
    const todosComKg = itens.every((i) => !i.semKg);
    if (!todosComKg) plano.semPeso++;
    plano.cargas.push({
      carga: {
        data, titular_id: decisoes.titular_id || null, preco_kg: precoDe(data), peso_base: 'chegada',
        peso_chegada: todosComKg ? dec(itens.reduce((s, i) => s + i.kg, 0)) : null, peso_fazenda: null,
        nota: '', destino: '', obs: [...dia.obs].join(' · ').slice(0, 300), fazenda_id: null, motorista_id: null, caminhao_id: null,
      },
      // com vários produtores, o kg de cada um fica guardado (é o que a planilha diz)
      itens: itens.map((i) => ({ produtor_id: i.produtor_id, tbs: i.tbs, arrendamento: i.arrendamento, kg_manual: todosComKg && itens.length > 1 ? i.kg : null })),
      linhas: dia.linhas,
    });
  }
  if (plano.semPeso) plano.avisos.push(`${plano.semPeso} carga(s) sem o peso na planilha: ficam sem kg (dá para completar abrindo a carga).`);
  if (!(existentes.precos || []).length) plano.avisos.push('Não há preço do kg cadastrado: as cargas entram sem preço (o valor e o arrendamento ficam em zero até você informar o preço).');
  plano.total = plano.cargas.length;
  return plano;
}
