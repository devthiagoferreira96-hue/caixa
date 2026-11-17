// =====================================================================
// Dados de um período para levar DENTRO do PDF (opção "Permitir importar este PDF de volta")
// e para JUNTAR de volta no sistema sem apagar nem duplicar nada.
//
// O que vai no PDF: todos os cadastros (contas, cartões, categorias, pessoas, produtores...)
// e os movimentos do período (lançamentos, compras com as parcelas, cargas com os itens,
// movimentos e insumos da Resina), na mesma estrutura do backup .json.
//
// Ao juntar:
//   - cadastro que já existe (mesmo código ou mesmo nome) é usado, não é criado de novo;
//   - movimento que já existe (mesmo código) fica como está; só entra o que falta;
//   - nada do que está no sistema é apagado ou alterado.
// =====================================================================

/** Cadastros e o campo que identifica cada um pelo nome (para não criar "Nubank" duas vezes) */
export const CADASTROS = {
  contas: 'nome', cartoes: 'nome', categorias: 'nome', pessoas: 'nome',
  resina_fazendas: 'nome', resina_produtores: 'nome', resina_motoristas: 'nome', resina_caminhoes: 'nome',
  resina_titulares: 'nome', resina_produtos: 'nome', resina_precos: 'inicio',
};
/** Movimentos: a data que diz se ele é do período */
const MOVIMENTOS = {
  lancamentos: (l) => [l.vencimento, l.data_pagamento],
  compras_cartao: (c) => [c.data_compra],
  resina_cargas: (c) => [c.data],
  resina_movimentos: (m) => [m.data],
  resina_insumos: (i) => [i.data],
};
/** Linhas "filhas", que vão junto com o pai: tabela → [tabela do pai, campo] */
const FILHAS = { parcelas: ['compras_cartao', 'compra_id'], resina_carga_itens: ['resina_cargas', 'carga_id'] };

const chaveNome = (v) => String(v ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').trim().toLowerCase();
const ehLigacao = (campo) => campo.endsWith('_id') && campo !== 'id';

/**
 * Separa os dados do período (para o anexo do PDF).
 * @param {object} t todas as tabelas (local.tabelas())
 * @param {{inicio: string, fim: string}} periodo fim exclusivo
 */
export function dadosDoPeriodoParaAnexo(t, periodo) {
  const dentro = (d) => !!d && d >= periodo.inicio && d < periodo.fim;
  const saida = {};
  for (const tabela of Object.keys(CADASTROS)) saida[tabela] = [...(t[tabela] || [])];

  // movimentos do período (compras: também as que têm parcela em fatura do período)
  const escolhidos = {};
  for (const [tabela, datas] of Object.entries(MOVIMENTOS)) {
    escolhidos[tabela] = new Set((t[tabela] || []).filter((l) => datas(l).some(dentro)).map((l) => l.id));
  }
  (t.parcelas || []).filter((p) => dentro(p.fatura_mes)).forEach((p) => escolhidos.compras_cartao.add(p.compra_id));

  // o que está ligado a um movimento escolhido vai junto (ex.: o insumo da Resina e o gasto no Caixa)
  const dono = new Map(); // id → tabela de movimento
  for (const tabela of Object.keys(MOVIMENTOS)) (t[tabela] || []).forEach((l) => dono.set(l.id, tabela));
  for (let mudou = true; mudou;) {
    mudou = false;
    for (const tabela of Object.keys(MOVIMENTOS)) {
      for (const l of t[tabela] || []) {
        const dentroJa = escolhidos[tabela].has(l.id);
        for (const [campo, valor] of Object.entries(l)) {
          if (!ehLigacao(campo) || !dono.has(valor)) continue;
          const outra = dono.get(valor);
          if (dentroJa && !escolhidos[outra].has(valor)) { escolhidos[outra].add(valor); mudou = true; }
          if (!dentroJa && escolhidos[outra].has(valor)) { escolhidos[tabela].add(l.id); mudou = true; break; }
        }
      }
    }
  }
  for (const tabela of Object.keys(MOVIMENTOS)) saida[tabela] = (t[tabela] || []).filter((l) => escolhidos[tabela].has(l.id));
  for (const [tabela, [pai, campo]] of Object.entries(FILHAS)) saida[tabela] = (t[tabela] || []).filter((l) => escolhidos[pai].has(l[campo]));
  return saida;
}

/**
 * Junta `novas` (já conferidas) em `atuais` sem apagar nem alterar nada.
 * @returns {{tabelas: object, novos: Record<string, number>, total: number}}
 */
export function juntarTabelas(atuais, novas) {
  const tabelas = structuredClone(atuais);
  const troca = new Map(); // código no arquivo → código no sistema (cadastro que já existia com outro código)
  const novos = {};
  const conta = (tabela, n) => { if (n) novos[tabela] = (novos[tabela] || 0) + n; };

  // 1) cadastros: usa o que já existe (mesmo código ou mesmo nome); o resto entra
  for (const [tabela, campo] of Object.entries(CADASTROS)) {
    const lista = (tabelas[tabela] ||= []);
    const porId = new Set(lista.map((l) => l.id));
    const porNome = new Map(lista.map((l) => [chaveNome(l[campo]), l.id]));
    let n = 0;
    for (const l of novas[tabela] || []) {
      if (porId.has(l.id)) continue;
      const igual = porNome.get(chaveNome(l[campo]));
      if (igual) { troca.set(l.id, igual); continue; }
      lista.push({ ...l }); porId.add(l.id); porNome.set(chaveNome(l[campo]), l.id); n++;
    }
    conta(tabela, n);
  }
  const ajustar = (l) => {
    const c = { ...l };
    for (const [campo, valor] of Object.entries(c)) if (ehLigacao(campo) && troca.has(valor)) c[campo] = troca.get(valor);
    return c;
  };
  // ajusta as ligações dos cadastros que acabaram de entrar (ex.: preço → fazenda)
  for (const tabela of Object.keys(CADASTROS)) tabelas[tabela] = tabelas[tabela].map((l) => (troca.size ? ajustar(l) : l));

  // 2) movimentos e linhas filhas: só entra o que ainda não existe (mesmo código)
  for (const tabela of [...Object.keys(MOVIMENTOS), ...Object.keys(FILHAS)]) {
    const lista = (tabelas[tabela] ||= []);
    const porId = new Set(lista.map((l) => l.id));
    let n = 0;
    for (const l of novas[tabela] || []) {
      if (porId.has(l.id)) continue;
      lista.push(ajustar(l)); porId.add(l.id); n++;
    }
    conta(tabela, n);
  }
  return { tabelas, novos, total: Object.values(novos).reduce((a, b) => a + b, 0) };
}

// ---------- O anexo dentro do PDF
export const NOME_ANEXO = 'caixa-familia-dados.json';
const MARCA = '/CaixaFamiliaDados 1';

async function passar(bytes, transformacao) {
  return new Uint8Array(await new Response(new Blob([bytes]).stream().pipeThrough(transformacao)).arrayBuffer());
}
/** JSON → bytes comprimidos (zlib, o mesmo /FlateDecode do PDF) */
export const comprimir = (texto) => passar(new TextEncoder().encode(texto), new CompressionStream('deflate'));

/** Objetos do PDF que guardam o anexo (o gerador do PDF acrescenta e liga no catálogo) */
export function objetosDoAnexo(comprimido, descricao) {
  const binario = Array.from(comprimido, (b) => String.fromCharCode(b)).join('');
  return {
    arquivo: `<< /Type /EmbeddedFile /Subtype /application#2Fjson /Filter /FlateDecode /Length ${comprimido.length} ${MARCA} >>\nstream\n${binario}\nendstream`,
    especificacao: (idArquivo) => `<< /Type /Filespec /F (${NOME_ANEXO}) /UF (${NOME_ANEXO}) /Desc (${descricao}) /EF << /F ${idArquivo} 0 R >> >>`,
  };
}

/**
 * Lê o anexo de um PDF gerado pelo sistema. Retorna o texto JSON, ou null se o PDF não tiver os dados.
 * @param {Uint8Array} bytes
 */
export async function lerAnexoDoPdf(bytes) {
  const texto = Array.from(bytes, (b) => String.fromCharCode(b)).join('');
  if (!texto.startsWith('%PDF')) throw new Error('NAO_PDF');
  const i = texto.indexOf(MARCA);
  if (i < 0) return null;
  const dic = texto.slice(texto.lastIndexOf('<<', i), texto.indexOf('>>', i));
  const tamanho = Number(/\/Length (\d+)/.exec(dic)?.[1]);
  const inicio = texto.indexOf('stream\n', i) + 'stream\n'.length;
  if (!tamanho || inicio < 'stream\n'.length) return null;
  const dados = await passar(bytes.slice(inicio, inicio + tamanho), new DecompressionStream('deflate'));
  return new TextDecoder().decode(dados);
}
