// Lê um arquivo do Excel (.xlsx) no próprio aparelho, sem internet e sem biblioteca externa.
// O .xlsx é um .zip com arquivos XML; o zip é aberto aqui e descompactado com o recurso
// nativo do navegador (DecompressionStream).

const texto = new TextDecoder();

/** Abre o .zip e devolve um Map(nome do arquivo → bytes) só dos arquivos pedidos */
async function abrirZip(bytes, quer) {
  const v = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  // fim do diretório central: procura de trás para frente
  let fim = -1;
  for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 65557); i--) {
    if (v.getUint32(i, true) === 0x06054b50) { fim = i; break; }
  }
  if (fim < 0) throw new Error('DANIFICADO'); // começa como .zip, mas o fim do arquivo sumiu
  const total = v.getUint16(fim + 10, true);
  let p = v.getUint32(fim + 16, true);
  const saida = new Map();
  for (let n = 0; n < total; n++) {
    if (v.getUint32(p, true) !== 0x02014b50) throw new Error('DANIFICADO');
    const metodo = v.getUint16(p + 10, true);
    const tamanho = v.getUint32(p + 20, true);
    const lenNome = v.getUint16(p + 28, true);
    const lenExtra = v.getUint16(p + 30, true);
    const lenComent = v.getUint16(p + 32, true);
    const local = v.getUint32(p + 42, true);
    const nome = texto.decode(bytes.subarray(p + 46, p + 46 + lenNome));
    p += 46 + lenNome + lenExtra + lenComent;
    if (!quer(nome)) continue;
    const inicio = local + 30 + v.getUint16(local + 26, true) + v.getUint16(local + 28, true);
    const dados = bytes.subarray(inicio, inicio + tamanho);
    if (metodo === 0) saida.set(nome, dados);
    else if (metodo === 8) {
      try { saida.set(nome, await descompactar(dados)); } catch { throw new Error('DANIFICADO'); }
    }
    else throw new Error('FORMATO');
  }
  return saida;
}

async function descompactar(dados) {
  const fluxo = new Blob([dados]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
  return new Uint8Array(await new Response(fluxo).arrayBuffer());
}

const xml = (bytes) => new DOMParser().parseFromString(texto.decode(bytes), 'application/xml');
const filhos = (el, nome) => [...el.getElementsByTagName(nome)];

/** "AB12" → [linha 11, coluna 27] (base 0) */
function posicao(ref) {
  const m = /^([A-Z]+)(\d+)$/.exec(ref);
  let col = 0;
  for (const ch of m[1]) col = col * 26 + (ch.charCodeAt(0) - 64);
  return [Number(m[2]) - 1, col - 1];
}

/**
 * Lê o .xlsx.
 * @returns {Promise<{nome: string, linhas: Array<Array<string|number|boolean|null>>}[]>}
 *   Cada aba com as linhas e colunas (base 0). Fórmulas vêm com o último valor calculado.
 */
export async function lerXlsx(arquivo) {
  const bytes = new Uint8Array(await arquivo.arrayBuffer());
  if (bytes.length < 4) throw new Error('NAO_ZIP');
  // formato OLE: Excel antigo (.xls) OU .xlsx protegido por senha (o Excel guarda assim quando tem senha)
  if (bytes[0] === 0xd0 && bytes[1] === 0xcf) throw new Error('XLS_ANTIGO');
  if (bytes[0] !== 0x50 || bytes[1] !== 0x4b) throw new Error('NAO_ZIP');

  const arquivos = await abrirZip(bytes, (n) => n === 'xl/workbook.xml' || n === 'xl/_rels/workbook.xml.rels' || n === 'xl/sharedStrings.xml' || n.startsWith('xl/worksheets/sheet'));
  if (!arquivos.has('xl/workbook.xml')) throw new Error('NAO_XLSX');

  // textos compartilhados
  const textos = arquivos.has('xl/sharedStrings.xml')
    ? filhos(xml(arquivos.get('xl/sharedStrings.xml')).documentElement, 'si').map((si) => filhos(si, 't').map((t) => t.textContent).join(''))
    : [];

  // nome de cada aba → arquivo
  const rels = new Map(filhos(xml(arquivos.get('xl/_rels/workbook.xml.rels')).documentElement, 'Relationship')
    .map((r) => [r.getAttribute('Id'), r.getAttribute('Target').replace(/^\/?(xl\/)?/, 'xl/')]));
  const abas = filhos(xml(arquivos.get('xl/workbook.xml')).documentElement, 'sheet').map((s) => ({
    nome: s.getAttribute('name'),
    caminho: rels.get(s.getAttribute('r:id') || s.getAttributeNS('http://schemas.openxmlformats.org/officeDocument/2006/relationships', 'id')),
    oculta: s.getAttribute('state') === 'hidden' || s.getAttribute('state') === 'veryHidden',
  }));

  return abas.filter((a) => arquivos.has(a.caminho)).map((a) => {
    const doc = xml(arquivos.get(a.caminho));
    const linhas = [];
    for (const c of filhos(doc.documentElement, 'c')) {
      const ref = c.getAttribute('r');
      if (!ref) continue;
      const [l, col] = posicao(ref);
      const t = c.getAttribute('t');
      const vEl = c.getElementsByTagName('v')[0];
      let valor = null;
      if (t === 's') valor = vEl ? textos[Number(vEl.textContent)] ?? null : null;
      else if (t === 'inlineStr') valor = filhos(c, 't').map((x) => x.textContent).join('');
      else if (t === 'str') valor = vEl?.textContent ?? null;
      else if (t === 'b') valor = vEl ? vEl.textContent === '1' : null;
      else if (t === 'e') valor = null;
      else if (vEl && vEl.textContent !== '') valor = Number(vEl.textContent);
      if (valor === null || valor === '') continue;
      (linhas[l] ||= [])[col] = valor;
    }
    return { nome: a.nome, oculta: a.oculta, linhas };
  });
}
