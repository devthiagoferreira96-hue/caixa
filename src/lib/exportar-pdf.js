// Gera um relatório em PDF do período, pronto para imprimir ou mandar.
// O PDF é montado aqui mesmo (texto e retângulos), sem biblioteca externa, para funcionar offline.
import { LARGURAS } from './pdf-fontes.js';
import { dadosDoPeriodo, textoDoPeriodo } from './exportar-dados.js';
import { local } from './local-db.js';
import { dataCompleta, nomeMes, parseISO } from './format.js';

// A4 em pontos
const LARG = 595.28, ALT = 841.89, MARGEM = 40;
const UTIL = LARG - 2 * MARGEM;

const COR = {
  texto: [0.11, 0.1, 0.09],
  suave: [0.38, 0.36, 0.34],
  marca: [0.12, 0.44, 0.33],
  marcaClara: [0.91, 0.95, 0.93],
  linha: [0.86, 0.84, 0.82],
  zebra: [0.97, 0.96, 0.95],
  verde: [0.08, 0.45, 0.25],
  vermelho: [0.72, 0.15, 0.15],
  ambar: [0.6, 0.38, 0.03],
};

// Letras de 0x80 a 0x9F na codificação WinAnsi (o resto é igual ao Latin-1)
const WIN = { '€': 0x80, '‚': 0x82, 'ƒ': 0x83, '„': 0x84, '…': 0x85, '†': 0x86, '‡': 0x87, 'ˆ': 0x88, '‰': 0x89, 'Š': 0x8a, '‹': 0x8b, 'Œ': 0x8c, 'Ž': 0x8e, '‘': 0x91, '’': 0x92, '“': 0x93, '”': 0x94, '•': 0x95, '–': 0x96, '—': 0x97, '˜': 0x98, '™': 0x99, 'š': 0x9a, '›': 0x9b, 'œ': 0x9c, 'ž': 0x9e, 'Ÿ': 0x9f };
const TROCAS = { '−': '-', ' ': ' ', ' ': ' ', '\t': ' ', '\n': ' ', '\r': ' ' };

/** Texto → códigos WinAnsi (o que não existe na fonte vira "?") */
function codigos(texto) {
  const out = [];
  for (let ch of String(texto ?? '')) {
    ch = TROCAS[ch] ?? ch;
    const c = ch.codePointAt(0);
    if (WIN[ch]) out.push(WIN[ch]);
    else if ((c >= 32 && c < 127) || (c >= 160 && c <= 255)) out.push(c);
    else {
      // tenta tirar o acento (ex.: letras de outros idiomas); se não der, "?"
      const base = ch.normalize('NFD')[0].codePointAt(0);
      out.push(base >= 32 && base < 127 ? base : 63);
    }
  }
  return out;
}

const larguraTexto = (texto, tam, negrito = false) => {
  const t = negrito ? LARGURAS.negrito : LARGURAS.normal;
  return codigos(texto).reduce((s, c) => s + (t[c - 32] || 556), 0) * tam / 1000;
};

/** Corta o texto com "…" para caber na largura */
function caber(texto, largura, tam, negrito) {
  texto = String(texto ?? '').replace(/\s+/g, ' ').trim();
  if (larguraTexto(texto, tam, negrito) <= largura) return texto;
  let fim = texto.length;
  while (fim > 0 && larguraTexto(`${texto.slice(0, fim).trimEnd()}…`, tam, negrito) > largura) fim--;
  return `${texto.slice(0, fim).trimEnd()}…`;
}

const literal = (texto) =>
  `(${codigos(texto).map((c) => (c === 40 || c === 41 || c === 92 ? `\\${String.fromCharCode(c)}` : c < 128 ? String.fromCharCode(c) : `\\${c.toString(8).padStart(3, '0')}`)).join('')})`;

const n = (v) => (Math.round(v * 100) / 100).toString();
const cor = (c, tipo = 'rg') => `${c.map(n).join(' ')} ${tipo}`;

/** Valor em reais sem depender do formato do aparelho: "R$ 1.234,56" / "-R$ 12,00" */
export function reais(v) {
  const neg = v < 0;
  const [int, dec] = Math.abs(v).toFixed(2).split('.');
  return `${neg ? '-' : ''}R$ ${int.replace(/\B(?=(\d{3})+(?!\d))/g, '.')},${dec}`;
}

// ---------------------------------------------------------------------------
// "Folha": guarda os comandos de desenho de cada página
class Documento {
  constructor() {
    this.paginas = [];
    this.novaPagina();
  }
  novaPagina() {
    this.cmds = [];
    this.paginas.push(this.cmds);
    this.y = ALT - MARGEM;
  }
  /** Garante espaço; se não houver, começa outra página. Retorna true se mudou de página. */
  espaco(altura) {
    if (this.y - altura < MARGEM + 20) {
      this.novaPagina();
      return true;
    }
    return false;
  }
  texto(x, y, texto, { tam = 10, negrito = false, c = COR.texto, direita = false, largura } = {}) {
    if (largura) texto = caber(texto, largura, tam, negrito);
    if (direita) x -= larguraTexto(texto, tam, negrito);
    this.cmds.push(`BT /${negrito ? 'F2' : 'F1'} ${n(tam)} Tf ${cor(c)} ${n(x)} ${n(y)} Td ${literal(texto)} Tj ET`);
  }
  retangulo(x, y, l, a, c) {
    this.cmds.push(`${cor(c)} ${n(x)} ${n(y)} ${n(l)} ${n(a)} re f`);
  }
  linha(x1, y1, x2, y2, c = COR.linha, esp = 0.6) {
    this.cmds.push(`${cor(c, 'RG')} ${n(esp)} w ${n(x1)} ${n(y1)} m ${n(x2)} ${n(y2)} l S`);
  }

  titulo(texto) {
    // título + cabeçalho da tabela + 2 linhas: o título nunca fica sozinho no fim da página
    this.espaco(32 + 17 * 3);
    this.y -= 22;
    this.texto(MARGEM, this.y, texto, { tam: 13, negrito: true, c: COR.marca });
    this.y -= 6;
    this.linha(MARGEM, this.y, MARGEM + UTIL, this.y, COR.marca, 1);
    this.y -= 4;
  }

  /**
   * Tabela simples. colunas: [{titulo, largura, direita?}]; linhas: arrays de textos
   * opcoes.cores: função (linha, coluna) → cor do texto
   * opcoes.extra: função (linha, coluna, x, yDeBaixo) para desenhar algo a mais na célula
   */
  tabela(colunas, linhas, { cores, total, vazio = 'Nada neste período.', extra } = {}) {
    const ALTURA = 17, TAM = 8.6;
    const cabecalho = () => {
      this.retangulo(MARGEM, this.y - ALTURA, UTIL, ALTURA, COR.marcaClara);
      let x = MARGEM;
      for (const c of colunas) {
        this.texto(c.direita ? x + c.largura - 5 : x + 5, this.y - 11.8, c.titulo, { tam: TAM, negrito: true, c: COR.marca, direita: c.direita });
        x += c.largura;
      }
      this.y -= ALTURA;
    };
    this.espaco(ALTURA * 2);
    cabecalho();
    if (!linhas.length) {
      this.y -= ALTURA;
      this.texto(MARGEM + 5, this.y + 5.5, vazio, { tam: TAM, c: COR.suave });
      return;
    }
    const desenhar = (linha, i, negrito = false) => {
      if (this.espaco(ALTURA)) cabecalho();
      if (negrito) this.linha(MARGEM, this.y, MARGEM + UTIL, this.y, COR.texto, 0.8);
      else if (i % 2) this.retangulo(MARGEM, this.y - ALTURA, UTIL, ALTURA, COR.zebra);
      let x = MARGEM;
      linha.forEach((valor, j) => {
        const c = colunas[j];
        // valores (colunas à direita) nunca são cortados: se não couber, a letra diminui
        let tam = TAM;
        if (c.direita) while (tam > 5.5 && larguraTexto(valor, tam, negrito) > c.largura - 8) tam -= 0.2;
        this.texto(c.direita ? x + c.largura - 4 : x + 5, this.y - 11.8, valor, {
          tam, negrito, direita: c.direita, largura: c.direita ? undefined : c.largura - 10, c: (!negrito && cores?.(i, j)) || COR.texto,
        });
        if (!negrito) extra?.(i, j, x, this.y - ALTURA);
        x += c.largura;
      });
      this.y -= ALTURA;
    };
    linhas.forEach((l, i) => desenhar(l, i));
    if (total) desenhar(total, -1, true);
  }

  /** Monta o arquivo PDF final */
  arquivo(rodape) {
    const objetos = [];
    const add = (s) => objetos.push(s);
    add('<< /Type /Catalog /Pages 2 0 R >>'); // 1
    add(''); // 2: páginas (preenchido abaixo)
    add('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>'); // 3
    add('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>'); // 4
    const filhos = [];
    const total = this.paginas.length;
    this.paginas.forEach((cmds, i) => {
      const r = rodape(i + 1, total);
      const extra = [
        `${cor(COR.linha, 'RG')} 0.6 w ${MARGEM} ${MARGEM - 4} m ${n(MARGEM + UTIL)} ${MARGEM - 4} l S`,
        `BT /F1 8 Tf ${cor(COR.suave)} ${MARGEM} ${MARGEM - 16} Td ${literal(r.esquerda)} Tj ET`,
        `BT /F1 8 Tf ${cor(COR.suave)} ${n(MARGEM + UTIL - larguraTexto(r.direita, 8))} ${MARGEM - 16} Td ${literal(r.direita)} Tj ET`,
      ];
      const conteudo = [...cmds, ...extra].join('\n');
      add(`<< /Length ${conteudo.length} >>\nstream\n${conteudo}\nendstream`);
      const idConteudo = objetos.length;
      add(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${LARG} ${ALT}] /Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents ${idConteudo} 0 R >>`);
      filhos.push(`${objetos.length} 0 R`);
    });
    objetos[1] = `<< /Type /Pages /Kids [${filhos.join(' ')}] /Count ${total} >>`;
    add(`<< /Title ${literal('Caixa da Família')} /Producer ${literal('Caixa da Família')} >>`);
    const info = objetos.length;

    // Tudo aqui é ASCII (letras acentuadas foram escritas como \ooo), então 1 caractere = 1 byte
    let pdf = '%PDF-1.4\n%\xe2\xe3\xcf\xd3\n';
    const posicoes = [];
    objetos.forEach((o, i) => {
      posicoes.push(pdf.length);
      pdf += `${i + 1} 0 obj\n${o}\nendobj\n`;
    });
    const xref = pdf.length;
    pdf += `xref\n0 ${objetos.length + 1}\n0000000000 65535 f \n${posicoes.map((p) => `${String(p).padStart(10, '0')} 00000 n \n`).join('')}`;
    pdf += `trailer\n<< /Size ${objetos.length + 1} /Root 1 0 R /Info ${info} 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
    return Uint8Array.from(pdf, (c) => c.charCodeAt(0) & 0xff);
  }
}

const mesCurto = (iso) => {
  const d = parseISO(iso);
  return `${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
};

/**
 * Gera o relatório em PDF do período.
 * @returns {Uint8Array}
 */
export function gerarPDF(periodo) {
  const d = dadosDoPeriodo(periodo);
  const r = d.resumo;
  const doc = new Documento();
  const geradoEm = new Date().toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });

  // Cabeçalho
  doc.retangulo(MARGEM, doc.y - 30, 30, 30, COR.marca);
  doc.texto(MARGEM + 15 - larguraTexto('R$', 11, true) / 2, doc.y - 19, 'R$', { tam: 11, negrito: true, c: [1, 1, 1] });
  doc.texto(MARGEM + 40, doc.y - 13, 'Caixa da Família', { tam: 17, negrito: true, c: COR.marca });
  doc.texto(MARGEM + 40, doc.y - 28, `Relatório: ${periodo.id === 'mes' ? nomeMes(parseISO(periodo.inicio)) : periodo.curto}`, { tam: 10.5, c: COR.texto });
  doc.y -= 44;
  doc.texto(MARGEM, doc.y, `Período: ${textoDoPeriodo(periodo)}   ·   Gerado em ${geradoEm}${local.usuario ? ` por ${local.usuario}` : ''}`, { tam: 8.5, c: COR.suave, largura: UTIL });
  doc.y -= 14;

  // Quadros do resumo
  const quadros = [
    ['Entradas', r.entradas, COR.verde],
    ['Gastos (caixa + cartão)', r.gastos, COR.vermelho],
    [r.saldo >= 0 ? 'Sobrou' : 'Faltou', r.saldo, r.saldo >= 0 ? COR.verde : COR.vermelho],
    ['Ainda a pagar', r.aPagar, COR.ambar],
  ];
  const espaco = 8, lq = (UTIL - espaco * 3) / 4;
  quadros.forEach(([rotulo, valor, c], i) => {
    const x = MARGEM + i * (lq + espaco);
    doc.retangulo(x, doc.y - 46, lq, 46, COR.zebra);
    doc.retangulo(x, doc.y - 46, 3, 46, c);
    doc.texto(x + 10, doc.y - 16, rotulo, { tam: 8, c: COR.suave, largura: lq - 14 });
    let tam = 12;
    while (tam > 7 && larguraTexto(reais(Math.abs(valor)), tam, true) > lq - 14) tam -= 0.25;
    doc.texto(x + 10, doc.y - 34, reais(Math.abs(valor)), { tam, negrito: true, c });
  });
  doc.y -= 52;
  doc.texto(MARGEM, doc.y - 4, `Gastos no caixa: ${reais(r.saidasCaixa)}   ·   Gastos no cartão (faturas do período): ${reais(r.cartao)}`, { tam: 8.5, c: COR.suave, largura: UTIL });
  doc.y -= 8;

  // Por categoria, com barrinha
  doc.titulo('Gastos por categoria');
  const maior = Math.max(...d.categorias.map((c) => c.total), 1);
  const colsCat = [
    { titulo: 'Categoria', largura: 142 }, { titulo: '', largura: 72 },
    { titulo: 'Caixa', largura: 84, direita: true }, { titulo: 'Cartão', largura: 84, direita: true },
    { titulo: 'Total', largura: 88, direita: true }, { titulo: '%', largura: UTIL - 470, direita: true },
  ];
  const linhasCat = d.categorias.map((c) => [c.categoria, '', reais(c.caixa), reais(c.cartao), reais(c.total),
    c.parte > 0 && c.parte < 0.001 ? '<0,1%' : `${(c.parte * 100).toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%`]);
  doc.tabela(colsCat, linhasCat, {
    // barrinha proporcional ao maior gasto, na 2ª coluna
    extra: (i, j, x, y) => {
      if (j !== 1) return;
      const c = d.categorias[i];
      doc.retangulo(x + 5, y + 5, Math.max((c.total / maior) * 62, 1.5), 7, c.grupo === 'Casa' ? COR.marca : [0.66, 0.64, 0.62]);
    },
    total: ['Total', '', reais(d.categorias.reduce((s, c) => s + c.caixa, 0)), reais(d.categorias.reduce((s, c) => s + c.cartao, 0)), reais(r.gastos), d.categorias.length ? '100%' : ''],
    vazio: 'Nenhum gasto neste período.',
  });
  if (d.categorias.some((c) => c.grupo !== 'Casa')) {
    doc.y -= 12;
    doc.texto(MARGEM, doc.y, 'Barra verde: gastos da casa. Barra cinza: Fazenda, Empresa, Financeiro e Serviços.', { tam: 7.5, c: COR.suave });
  }

  // Contas
  doc.titulo('Saldo das contas hoje');
  doc.tabela(
    [{ titulo: 'Conta', largura: UTIL - 120 }, { titulo: 'Saldo', largura: 120, direita: true }],
    d.contas.map((c) => [c.ativa ? c.conta : `${c.conta} (desativada)`, reais(c.saldo)]),
    {
      total: ['Total', reais(d.contas.reduce((s, c) => s + c.saldo, 0))],
      cores: (i, j) => (j === 1 && d.contas[i]?.saldo < 0 ? COR.vermelho : null),
      vazio: 'Nenhuma conta cadastrada.',
    },
  );

  // Lançamentos
  doc.titulo(`Lançamentos do caixa (${d.lancamentos.length})`);
  doc.tabela(
    [
      { titulo: 'Data', largura: 58 }, { titulo: 'Descrição', largura: 150 }, { titulo: 'Categoria', largura: 112 },
      { titulo: 'Conta', largura: 62 }, { titulo: 'Situação', largura: 50 }, { titulo: 'Valor', largura: UTIL - 432, direita: true },
    ],
    d.lancamentos.map((l) => [dataCompleta(l.data), l.descricao, l.categoria, l.conta, l.situacao, reais(l.valor)]),
    {
      cores: (i, j) => {
        const l = d.lancamentos[i];
        if (j === 5) return l.valor >= 0 ? COR.verde : COR.texto;
        if (j === 4 && l.situacao === 'Atrasado') return COR.vermelho;
        if (j === 4 && l.situacao === 'A pagar') return COR.ambar;
        return null;
      },
      total: ['Total', '', '', '', '', reais(d.lancamentos.reduce((s, l) => s + l.valor, 0))],
      vazio: 'Nenhum lançamento neste período.',
    },
  );

  // Cartão
  doc.titulo(`Compras no cartão (${d.cartao.length} parcelas)`);
  doc.tabela(
    [
      { titulo: 'Fatura', largura: 48 }, { titulo: 'Compra', largura: 58 }, { titulo: 'Cartão', largura: 80 },
      { titulo: 'Descrição', largura: 140 }, { titulo: 'Parcela', largura: 50 }, { titulo: 'Valor', largura: UTIL - 376, direita: true },
    ],
    d.cartao.map((c) => [mesCurto(c.fatura), dataCompleta(c.data), c.cartao, c.descricao, c.parcela, reais(c.valor)]),
    { total: ['Total', '', '', '', '', reais(d.cartao.reduce((s, c) => s + c.valor, 0))], vazio: 'Nenhuma compra no cartão neste período.' },
  );

  return doc.arquivo((pag, total) => ({ esquerda: `Caixa da Família  ·  ${textoDoPeriodo(periodo)}`, direita: `Página ${pag} de ${total}` }));
}
