// Gera uma planilha do Excel (.xlsx) com os dados do período.
// O .xlsx é um .zip com arquivos XML dentro; montamos tudo aqui, sem biblioteca externa.
import { criarZip } from './zip.js';
import { dadosDoPeriodo, textoDoPeriodo } from './exportar-dados.js';
import { local } from './local-db.js';

// Estilos (posição em <cellXfs> no styles.xml)
const E = { normal: 0, cabecalho: 1, dinheiro: 2, data: 3, mes: 4, porcento: 5, negrito: 6, titulo: 7, totalDinheiro: 8, rotulo: 9 };

const xml = (s) =>
  String(s ?? '')
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const coluna = (n) => {
  let s = '';
  for (n += 1; n > 0; n = Math.floor((n - 1) / 26)) s = String.fromCharCode(65 + ((n - 1) % 26)) + s;
  return s;
};

/** Data ISO (aaaa-mm-dd) → número de série do Excel */
const serial = (iso) => {
  const [a, m, d] = iso.split('-').map(Number);
  return (Date.UTC(a, m - 1, d) - Date.UTC(1899, 11, 30)) / 86400000;
};

// Tipos de célula: texto, número, data, fórmula
const T = (v, s = E.normal) => ({ t: 'texto', v, s });
const N = (v, s = E.dinheiro) => ({ t: 'num', v, s });
const D = (iso, s = E.data) => (iso ? { t: 'num', v: serial(iso), s } : T(''));
const F = (formula, valor, s = E.totalDinheiro) => ({ t: 'formula', f: formula, v: valor, s });

function celula(c, ref) {
  if (c == null || (c.t === 'texto' && c.v === '' && !c.s)) return '';
  if (c.t === 'texto') return `<c r="${ref}" t="inlineStr" s="${c.s}"><is><t xml:space="preserve">${xml(c.v)}</t></is></c>`;
  if (c.t === 'formula') return `<c r="${ref}" s="${c.s}"><f>${xml(c.f)}</f><v>${Number(c.v) || 0}</v></c>`;
  return `<c r="${ref}" s="${c.s}"><v>${Number(c.v) || 0}</v></c>`;
}

/**
 * Monta uma aba.
 * @param {{linhas: Array<Array<object>>, larguras: number[], congelar?: number, filtro?: string}} aba
 */
function abaXML({ linhas, larguras, congelar = 0, filtro }) {
  const cols = larguras.map((w, i) => `<col min="${i + 1}" max="${i + 1}" width="${w}" customWidth="1"/>`).join('');
  const vista = congelar
    ? `<sheetViews><sheetView workbookViewId="0"><pane ySplit="${congelar}" topLeftCell="A${congelar + 1}" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>`
    : '<sheetViews><sheetView workbookViewId="0"/></sheetViews>';
  const corpo = linhas
    .map((linha, i) => `<row r="${i + 1}">${linha.map((c, j) => celula(c, `${coluna(j)}${i + 1}`)).join('')}</row>`)
    .join('');
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheetPr><pageSetUpPr fitToPage="1"/></sheetPr>${vista}<sheetFormatPr defaultRowHeight="15"/><cols>${cols}</cols><sheetData>${corpo}</sheetData>${filtro ? `<autoFilter ref="${filtro}"/>` : ''}<pageMargins left="0.5" right="0.5" top="0.6" bottom="0.6" header="0.3" footer="0.3"/><pageSetup orientation="landscape" fitToWidth="1" fitToHeight="0"/></worksheet>`;
}

const ESTILOS = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
<numFmts count="3"><numFmt numFmtId="164" formatCode="&quot;R$&quot; #,##0.00;[Red]-&quot;R$&quot; #,##0.00"/><numFmt numFmtId="165" formatCode="dd/mm/yyyy"/><numFmt numFmtId="166" formatCode="mm/yyyy"/></numFmts>
<fonts count="4"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="15"/><color rgb="FF1F5F4A"/><name val="Calibri"/></font><font><b/><sz val="11"/><color rgb="FFFFFFFF"/><name val="Calibri"/></font></fonts>
<fills count="4"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FF1F6F54"/><bgColor indexed="64"/></patternFill></fill><fill><patternFill patternType="solid"><fgColor rgb="FFE8F3EE"/><bgColor indexed="64"/></patternFill></fill></fills>
<borders count="2"><border/><border><top style="thin"><color rgb="FF1F6F54"/></top></border></borders>
<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
<cellXfs count="10">
<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>
<xf numFmtId="0" fontId="3" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1"/>
<xf numFmtId="164" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>
<xf numFmtId="165" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>
<xf numFmtId="166" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>
<xf numFmtId="10" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>
<xf numFmtId="0" fontId="1" fillId="0" borderId="1" xfId="0" applyFont="1" applyBorder="1"/>
<xf numFmtId="0" fontId="2" fillId="0" borderId="0" xfId="0" applyFont="1"/>
<xf numFmtId="164" fontId="1" fillId="0" borderId="1" xfId="0" applyNumberFormat="1" applyFont="1" applyBorder="1"/>
<xf numFmtId="0" fontId="1" fillId="3" borderId="0" xfId="0" applyFont="1" applyFill="1"/>
</cellXfs>
<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>
</styleSheet>`;

/** Linha de total com SUBTOTAL (o total acompanha o filtro do Excel) */
function linhaTotal(qtdColunas, colunasSoma, primeira, ultima, valores) {
  const linha = Array.from({ length: qtdColunas }, (_, i) => (i === 0 ? T('Total', E.negrito) : T('', E.negrito)));
  colunasSoma.forEach((c, k) => {
    linha[c] = ultima >= primeira
      ? F(`SUBTOTAL(9,${coluna(c)}${primeira}:${coluna(c)}${ultima})`, valores[k])
      : N(0, E.totalDinheiro);
  });
  return linha;
}

/**
 * Gera o arquivo .xlsx do período.
 * @returns {Uint8Array}
 */
export function gerarExcel(periodo) {
  const d = dadosDoPeriodo(periodo);
  const geradoEm = new Date().toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
  const r = d.resumo;

  // --- Resumo
  const resumo = [
    [T('Caixa da Família', E.titulo)],
    [T(`Período: ${textoDoPeriodo(periodo)}`)],
    [T(`Gerado em ${geradoEm} por ${local.usuario || ''}`)],
    [],
    [T('Resumo do período', E.cabecalho), T('', E.cabecalho)],
    [T('Entradas'), N(r.entradas)],
    [T('Gastos no caixa'), N(r.saidasCaixa)],
    [T('Gastos no cartão (faturas)'), N(r.cartao)],
    [T('Total de gastos', E.negrito), N(r.gastos, E.totalDinheiro)],
    [T('Sobrou (entradas − gastos)', E.negrito), N(r.saldo, E.totalDinheiro)],
    [T('Ainda a pagar no período'), N(r.aPagar)],
    [],
    [T('Resultado por área', E.cabecalho), T('Entradas', E.cabecalho), T('Gastos', E.cabecalho), T('Resultado', E.cabecalho)],
    ...d.areas.map((a) => [T(a.area), N(a.entradas), N(a.gastos), N(a.resultado)]),
    [T('Casa = tudo que não é dos grupos Fazenda e Empresa.')],
    [],
    [T('Saldo das contas hoje', E.cabecalho), T('', E.cabecalho)],
    ...d.contas.map((c) => [T(c.ativa ? c.conta : `${c.conta} (desativada)`), N(c.saldo)]),
  ];
  const fimContas = resumo.length;
  resumo.push(linhaTotal(2, [1], fimContas - d.contas.length + 1, fimContas, [d.contas.reduce((s, c) => s + c.saldo, 0)]));
  resumo.push([], [T('Cada aba tem filtros no cabeçalho. Os valores negativos são saídas.')]);

  // --- Lançamentos
  const cabL = ['Data', 'Descrição', 'Tipo', 'Categoria', 'Conta', 'Pessoa', 'Valor', 'Situação'];
  const linhasL = d.lancamentos.map((l) => [D(l.data), T(l.descricao), T(l.tipo), T(l.categoria), T(l.conta), T(l.pessoa), N(l.valor), T(l.situacao)]);
  const lancamentos = [cabL.map((c) => T(c, E.cabecalho)), ...linhasL,
    linhaTotal(8, [6], 2, linhasL.length + 1, [d.lancamentos.reduce((s, l) => s + l.valor, 0)])];

  // --- Cartões
  const cabC = ['Fatura', 'Data da compra', 'Cartão', 'Descrição', 'Categoria', 'Parcela', 'Valor'];
  const linhasC = d.cartao.map((c) => [D(c.fatura, E.mes), D(c.data), T(c.cartao), T(c.descricao), T(c.categoria), T(c.parcela), N(c.valor)]);
  const cartoes = [cabC.map((c) => T(c, E.cabecalho)), ...linhasC,
    linhaTotal(7, [6], 2, linhasC.length + 1, [d.cartao.reduce((s, c) => s + c.valor, 0)])];

  // --- Por categoria
  const cabG = ['Categoria', 'Grupo', 'Caixa', 'Cartão', 'Total', '% dos gastos'];
  const linhasG = d.categorias.map((c) => [T(c.categoria), T(c.grupo), N(c.caixa), N(c.cartao), N(c.total), N(c.parte, E.porcento)]);
  const categorias = [cabG.map((c) => T(c, E.cabecalho)), ...linhasG,
    linhaTotal(6, [2, 3, 4], 2, linhasG.length + 1, [
      d.categorias.reduce((s, c) => s + c.caixa, 0), d.categorias.reduce((s, c) => s + c.cartao, 0), d.resumo.gastos,
    ])];

  const abas = [
    { nome: 'Resumo', linhas: resumo, larguras: [34, 20, 20, 20] },
    { nome: 'Lançamentos', linhas: lancamentos, larguras: [12, 34, 20, 28, 14, 16, 19, 11], congelar: 1, filtro: `A1:H${linhasL.length + 1}` },
    { nome: 'Cartões', linhas: cartoes, larguras: [10, 15, 18, 32, 28, 10, 19], congelar: 1, filtro: `A1:G${linhasC.length + 1}` },
    { nome: 'Por categoria', linhas: categorias, larguras: [30, 14, 19, 19, 19, 13], congelar: 1, filtro: `A1:F${linhasG.length + 1}` },
  ];

  const arquivos = [
    {
      nome: '[Content_Types].xml',
      conteudo: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>${abas.map((_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('')}<Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/></Types>`,
    },
    {
      nome: '_rels/.rels',
      conteudo: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/></Relationships>`,
    },
    {
      nome: 'docProps/core.xml',
      conteudo: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"><dc:title>Caixa da Família - ${xml(textoDoPeriodo(periodo))}</dc:title><dc:creator>${xml(local.usuario || 'Caixa da Família')}</dc:creator><dcterms:created xsi:type="dcterms:W3CDTF">${new Date().toISOString().slice(0, 19)}Z</dcterms:created></cp:coreProperties>`,
    },
    {
      nome: 'xl/workbook.xml',
      conteudo: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><bookViews><workbookView/></bookViews><sheets>${abas.map((a, i) => `<sheet name="${xml(a.nome)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join('')}</sheets><definedNames>${abas.map((a, i) => (a.filtro ? `<definedName name="_xlnm._FilterDatabase" localSheetId="${i}" hidden="1">'${xml(a.nome)}'!$${a.filtro.replace(':', ':$').replace(/([A-Z])(\d)/g, '$1$$$2')}</definedName>` : '')).join('')}</definedNames></workbook>`,
    },
    {
      nome: 'xl/_rels/workbook.xml.rels',
      conteudo: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${abas.map((_, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join('')}<Relationship Id="rId${abas.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`,
    },
    { nome: 'xl/styles.xml', conteudo: ESTILOS },
    ...abas.map((a, i) => ({ nome: `xl/worksheets/sheet${i + 1}.xml`, conteudo: abaXML(a) })),
  ];
  return criarZip(arquivos);
}
