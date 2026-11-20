// PDF da conta corrente (botão "Exportar PDF" da tela da conta corrente): as mesmas colunas da planilha,
// em folha deitada, com o resumo do mês em cima. Bom para imprimir ou mandar para o produtor.
import { Documento, COR, MARGEM, reais } from '../../lib/exportar-pdf.js';
import { dataCompleta } from '../../lib/format.js';
import { descricaoDaLinha, textoInsumoPadrao } from './exportar-conta.js';

/** Valor sem o "R$" (a tabela avisa que os valores são em reais, como na planilha) */
const moeda = (v) => reais(v || 0).replace('R$ ', '');
const numero = (v, casas = 0) => (v || 0).toLocaleString('pt-BR', { maximumFractionDigits: casas });
const pct = (v) => `${numero(v, 1)}%`;
const situacao = (v) => (v < -0.004 ? 'Falta receber' : v > 0.004 ? 'Recebido a mais' : 'Em dia');
const corSaldo = (v) => (v < -0.004 ? COR.ambar : COR.marca);

/**
 * @param {{conta: string, periodo: string, produtor?: string, inicio: string, extrato: object,
 *   nomeProdutor: (id) => string, textoInsumo?: (linha) => string}} p
 * @returns {Uint8Array}
 */
export function gerarPdfConta({ conta, periodo, produtor = '', inicio, extrato, nomeProdutor, textoInsumo = textoInsumoPadrao }) {
  const doc = new Documento({ paisagem: true, titulo: `Conta corrente - ${conta} - ${periodo}` });
  const UTIL = doc.util;
  const geradoEm = new Date().toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });

  // Cabeçalho
  doc.texto(MARGEM, doc.y - 14, 'Conta corrente do arrendamento', { tam: 16, negrito: true, c: COR.marca });
  doc.texto(MARGEM, doc.y - 30, conta, { tam: 11, negrito: true, largura: UTIL });
  doc.y -= 44;
  doc.texto(MARGEM, doc.y, `${periodo}${produtor ? `   ·   Produtor: ${produtor}` : ''}   ·   Gerado em ${geradoEm}`, { tam: 8.5, c: COR.suave, largura: UTIL });
  doc.y -= 12;

  // Quadros do resumo
  const mes = periodo.split(' ')[0].toLowerCase();
  const quadros = [
    ['Saldo anterior', extrato.saldoAnterior, situacao(extrato.saldoAnterior), corSaldo(extrato.saldoAnterior), true],
    [`Débitos de ${mes}`, extrato.debito, 'Arrendamento e insumos', COR.ambar],
    [`Créditos de ${mes}`, extrato.credito, 'Recebido', COR.verde],
    ['Saldo no fim do mês', extrato.saldoFinal, situacao(extrato.saldoFinal), corSaldo(extrato.saldoFinal), true],
  ];
  const esp = 8, lq = (UTIL - esp * 3) / 4;
  quadros.forEach(([rotulo, valor, legenda, c, ehSaldo], i) => {
    const x = MARGEM + i * (lq + esp);
    doc.retangulo(x, doc.y - 52, lq, 52, COR.zebra);
    doc.retangulo(x, doc.y - 52, 3, 52, c);
    doc.texto(x + 10, doc.y - 15, rotulo, { tam: 8, c: COR.suave, largura: lq - 14 });
    doc.texto(x + 10, doc.y - 32, reais(Math.abs(valor)), { tam: 12.5, negrito: true, c: ehSaldo ? c : COR.texto });
    doc.texto(x + 10, doc.y - 45, legenda, { tam: 7.5, negrito: ehSaldo, c: ehSaldo ? c : COR.suave, largura: lq - 14 });
  });
  doc.y -= 58;

  // Movimento do mês
  doc.titulo(`Movimento de ${periodo.toLowerCase()} (valores em R$)`);
  const larguras = [58, 0, 64, 58, 30, 38, 52, 42, 52, 62, 62, 64];
  larguras[1] = UTIL - larguras.reduce((s, l) => s + l, 0);
  const titulos = ['Data', 'Descrição', 'Nota', 'Destino', 'Tbs', '% arr.', 'Quant.', 'Média', 'R$ unit.', 'Crédito', 'Débito', 'Saldo'];
  // descrição, nota e destino longos continuam na linha de baixo (não são cortados)
  const colunas = titulos.map((titulo, i) => ({ titulo, largura: larguras[i], direita: i >= 4, quebrar: i >= 1 && i <= 3 }));

  const linhas = [
    [dataCompleta(inicio), 'Saldo anterior', '', '', '', '', '', '', '', '', '', moeda(extrato.saldoAnterior)],
    ...extrato.linhas.map((l) => {
      const c = l.tipo === 'carga', ins = l.tipo === 'insumo';
      const parte = ins && l.pct_produtor < 100 ? ` (${numero(l.pct_produtor, 2)}% de ${reais(l.total)})` : '';
      return [
        dataCompleta(l.data), descricaoDaLinha(l, nomeProdutor, textoInsumo) + parte, l.nota || '', l.destino || '',
        c ? numero(l.tbs) : '', c ? pct(l.pct) : '',
        c ? numero(l.kg, 2) : ins ? numero(l.quantidade, 3) : '',
        c && l.media != null ? numero(l.media, 2) : '',
        c ? moeda(l.preco) : ins ? moeda(l.valor_unitario) : '',
        l.credito ? moeda(l.credito) : '', l.debito ? moeda(l.debito) : '', moeda(l.saldo),
      ];
    }),
  ];
  const saldos = [extrato.saldoAnterior, ...extrato.linhas.map((l) => l.saldo)];
  doc.tabela(colunas, linhas, {
    cores: (i, j) => (j === 9 ? COR.verde : j === 10 ? COR.ambar : j === 11 ? corSaldo(saldos[i]) : null),
    total: ['', 'Total do mês', '', '', '', '', '', '', '', moeda(extrato.credito), moeda(extrato.debito), moeda(extrato.saldoFinal)],
  });
  if (!extrato.linhas.length) {
    doc.y -= 14;
    doc.texto(MARGEM, doc.y, 'Nenhuma carga, insumo ou recebimento nesta conta no mês.', { tam: 8.5, c: COR.suave });
  }

  // Situação e legenda
  doc.espaco(40);
  doc.y -= 20;
  const fim = extrato.saldoFinal;
  const frase = fim < -0.004 ? `Falta receber: ${reais(-fim)}` : fim > 0.004 ? `Recebido a mais: ${reais(fim)}` : 'Nada a receber: a conta está em dia.';
  doc.texto(MARGEM, doc.y, frase, { tam: 11, negrito: true, c: corSaldo(fim) });
  doc.y -= 14;
  doc.texto(MARGEM, doc.y, 'Débito = arrendamento e insumos descontados do produtor (o que a proprietária tem para receber). Crédito = o que já foi recebido. Saldo negativo = ainda falta receber.', { tam: 7.5, c: COR.suave, largura: UTIL });

  const rodape = `Conta corrente  ·  ${conta}  ·  ${periodo}`;
  return doc.arquivo((pag, total) => ({ esquerda: rodape.length > 120 ? `${rodape.slice(0, 118)}…` : rodape, direita: `Página ${pag} de ${total}` }));
}
