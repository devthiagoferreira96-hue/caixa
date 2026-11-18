// Planilha da conta corrente no mesmo formato da planilha da empresa ("Conta corrente arrendo"):
//   linha 1: CONTA CORRENTE (título, células unidas de A a L)
//   linha 2: DATA | DESCRIÇÃO | NOTA | DESTINO CARGA | TAMBORES | % ARRENDO | QUANTIDADE | MÉDIA | R$ UNITARIO | CRÉDITO | DÉBITO | SALDO
// O débito sai negativo e o saldo é fórmula (saldo anterior + crédito + débito), como na planilha original.
// O arquivo volta para o sistema pela importação da conta corrente (importar-conta.js).
import { montarXlsx, E, T, N, D, F } from '../../lib/exportar-excel.js';
import { store } from '../../lib/store.js';
import { codigoCarga } from './calculos.js';

export const COLUNAS_CONTA = ['DATA', 'DESCRIÇÃO', 'NOTA', 'DESTINO CARGA', 'TAMBORES', '% ARRENDO', 'QUANTIDADE', 'MÉDIA', 'R$ UNITARIO', 'CRÉDITO', 'DÉBITO', 'SALDO'];

/** "125 kg Pasta" (sem depender da tela de insumos) */
export function textoInsumoPadrao(l) {
  const p = store.resina_produtos.find((x) => x.id === l.produto_id);
  return `${(l.quantidade || 0).toLocaleString('pt-BR', { maximumFractionDigits: 3 })} ${p?.unidade ?? 'un'} ${p?.nome ?? 'Insumo'}`;
}

/** Texto da coluna DESCRIÇÃO */
export function descricaoDaLinha(l, nomeProdutor, textoInsumo = textoInsumoPadrao) {
  if (l.tipo === 'carga') return `Carga ${codigoCarga(l.carga)} · ${nomeProdutor(l.produtor_id)}`;
  if (l.tipo === 'insumo') return `${textoInsumo(l)}${l.obs ? ` - ${l.obs}` : ''} · ${nomeProdutor(l.produtor_id)}`;
  const base = l.descricao || (l.credito ? 'Recebimento' : 'Valor a receber');
  return l.produtor_id ? `${base} · ${nomeProdutor(l.produtor_id)}` : base;
}

/** Nome de aba que o Excel aceita (até 31 letras, sem : \ / ? * [ ]) */
export const nomeDeAba = (t) => String(t).replace(/[:\\/?*[\]]/g, '-').replace(/\s+/g, ' ').trim().slice(0, 31);

/**
 * Uma aba da conta corrente (para juntar com outras no mesmo arquivo).
 * @param {{conta: string, periodo: string, inicio: string, extrato: object, nomeProdutor: (id) => string, textoInsumo?: (linha) => string, nomeAba?: string}} p
 */
export function abaContaCorrente({ conta, periodo, inicio, extrato, nomeProdutor, textoInsumo = textoInsumoPadrao, nomeAba = 'Conta corrente' }) {
  const linhas = [
    [T(`CONTA CORRENTE · ${conta}${periodo ? ` · ${periodo}` : ''}`, E.tituloCentro)],
    COLUNAS_CONTA.map((c) => T(c, E.cabecalho)),
    [D(inicio), T('SALDO ANTERIOR', E.negrito), ...Array(9).fill(T('')), N(extrato.saldoAnterior, E.totalDinheiro)],
  ];
  const primeira = linhas.length + 1; // linha (do Excel) da primeira movimentação
  let saldo = extrato.saldoAnterior;
  extrato.linhas.forEach((l, i) => {
    const r = primeira + i;
    saldo = l.saldo;
    const carga = l.tipo === 'carga';
    const insumo = l.tipo === 'insumo';
    linhas.push([
      D(l.data), T(descricaoDaLinha(l, nomeProdutor, textoInsumo)), T(l.nota || ''), T(l.destino || ''),
      carga ? N(l.tbs, E.normal) : T(''), carga ? N(l.pct / 100, E.porcento) : T(''),
      carga ? N(l.kg, E.numero) : insumo ? N(l.quantidade, E.numero) : T(''),
      carga && l.media != null ? N(l.media, E.numero) : T(''), carga ? N(l.preco) : insumo ? N(l.valor_unitario) : T(''),
      l.credito ? N(l.credito) : T(''), l.debito ? N(-l.debito) : T(''),
      F(`L${r - 1}+J${r}+K${r}`, l.saldo, E.dinheiro),
    ]);
  });
  const ultima = primeira + extrato.linhas.length - 1;
  const soma = (c, v) => (extrato.linhas.length ? F(`SUM(${c}${primeira}:${c}${ultima})`, v) : N(v, E.totalDinheiro));
  linhas.push([
    T('TOTAL', E.negrito), ...Array(8).fill(T('', E.negrito)),
    soma('J', extrato.credito), soma('K', -extrato.debito), N(saldo, E.totalDinheiro),
  ]);
  linhas.push([], [T(saldo < 0 ? `Falta receber: R$ ${(-saldo).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : 'Nada a receber neste saldo.', E.negrito)]);
  linhas.push([T('Débito = arrendamento e insumos descontados do produtor (o que a proprietária tem para receber). Crédito = o que já foi recebido.')]);

  return {
    nome: nomeDeAba(nomeAba), linhas, congelar: 2, mesclar: ['A1:L1'],
    larguras: [11, 44, 22, 18, 10, 10, 12, 9, 12, 14, 14, 15],
  };
}

/**
 * Arquivo só com a conta corrente (botão "Exportar" da tela da conta corrente).
 * @returns {Uint8Array}
 */
export function gerarExcelConta(p) {
  return montarXlsx([abaContaCorrente(p)], `Conta corrente - ${p.conta} - ${p.periodo}`);
}
