// Junta os dados de um período para exportar em Excel ou PDF.
// Tudo é lido das tabelas locais; nada sai do aparelho até a pessoa compartilhar o arquivo.
import { local } from './local-db.js';
import { store } from './store.js';
import { mesISO, nomeMes, dataCompleta, hojeISO } from './format.js';
import { saidasReais, entradas, somar } from './calculos.js';

/** Períodos que a pessoa pode escolher */
export function periodos(mes = store.mes) {
  const ano = mes.getFullYear();
  return [
    { id: 'mes', nome: `Mês aberto (${nomeMes(mes)})`, curto: nomeMes(mes), inicio: mesISO(mes), fim: mesISO(mes, 1) },
    { id: 'ano', nome: `Ano de ${ano}`, curto: `Ano de ${ano}`, inicio: `${ano}-01-01`, fim: `${ano + 1}-01-01` },
    { id: 'tudo', nome: 'Tudo o que já foi lançado', curto: 'Todo o período', inicio: '0000-01-01', fim: '9999-12-31' },
  ];
}

const nomeDe = (lista, id, padrao = '') => store[lista].find((x) => x.id === id)?.nome ?? padrao;

/**
 * Monta as linhas de cada parte do relatório.
 * @param {{inicio: string, fim: string}} periodo  datas ISO (fim não incluso)
 */
export function dadosDoPeriodo(periodo) {
  const t = local.tabelas();
  const dentro = (d) => d >= periodo.inicio && d < periodo.fim;

  const lancs = t.lancamentos
    .filter((l) => dentro(l.vencimento))
    .sort((a, b) => a.vencimento.localeCompare(b.vencimento) || String(a.descricao).localeCompare(String(b.descricao)));

  const compras = new Map(t.compras_cartao.map((c) => [c.id, c]));
  const parcelas = t.parcelas
    .filter((p) => dentro(p.fatura_mes) && compras.has(p.compra_id))
    .map((p) => ({ ...p, valor: Number(p.valor), compra: compras.get(p.compra_id) }))
    .sort((a, b) => a.fatura_mes.localeCompare(b.fatura_mes) || a.compra.data_compra.localeCompare(b.compra.data_compra));

  const lancamentos = lancs.map((l) => ({
    data: l.vencimento,
    descricao: l.descricao || '',
    tipo: l.tipo === 'entrada' ? 'Entrada' : l.fatura_cartao_id ? 'Pagamento de fatura' : 'Saída',
    categoria: l.fatura_cartao_id ? `Fatura ${nomeDe('cartoes', l.fatura_cartao_id)}` : nomeDe('categorias', l.categoria_id, 'Sem categoria'),
    conta: nomeDe('contas', l.conta_id),
    pessoa: nomeDe('pessoas', l.pessoa_id),
    valor: (l.tipo === 'entrada' ? 1 : -1) * Number(l.valor),
    situacao: l.pago ? 'Pago' : l.vencimento < hojeISO() ? 'Atrasado' : 'A pagar',
  }));

  const cartao = parcelas.map((p) => ({
    fatura: p.fatura_mes,
    data: p.compra.data_compra,
    cartao: nomeDe('cartoes', p.compra.cartao_id),
    descricao: p.compra.descricao || '',
    categoria: nomeDe('categorias', p.compra.categoria_id, 'Sem categoria'),
    parcela: p.compra.qtd_parcelas > 1 ? `${p.numero}/${p.compra.qtd_parcelas}` : 'À vista',
    valor: p.valor,
  }));

  // Gastos por categoria (caixa + cartão), do maior para o menor
  const porCat = new Map();
  const somarEm = (id, campo, v) => {
    const c = porCat.get(id ?? null) || { caixa: 0, cartao: 0 };
    c[campo] += Number(v);
    porCat.set(id ?? null, c);
  };
  saidasReais(lancs).forEach((l) => somarEm(l.categoria_id, 'caixa', l.valor));
  parcelas.forEach((p) => somarEm(p.compra.categoria_id, 'cartao', p.valor));
  const totalGastos = [...porCat.values()].reduce((s, c) => s + c.caixa + c.cartao, 0);
  const categorias = [...porCat.entries()]
    .map(([id, c]) => {
      const cat = store.categorias.find((x) => x.id === id);
      const total = c.caixa + c.cartao;
      return {
        categoria: cat?.nome ?? 'Sem categoria',
        grupo: cat ? cat.grupo || 'Outros' : 'Sem categoria',
        noGrafico: !!cat?.no_grafico,
        caixa: c.caixa,
        cartao: c.cartao,
        total,
        parte: totalGastos ? total / totalGastos : 0,
      };
    })
    .sort((a, b) => b.total - a.total);

  // Saldo de cada conta hoje (não depende do período)
  const saldos = new Map(store.contas.map((c) => [c.id, Number(c.saldo_inicial || 0)]));
  t.lancamentos.filter((l) => l.pago && saldos.has(l.conta_id))
    .forEach((l) => saldos.set(l.conta_id, saldos.get(l.conta_id) + (l.tipo === 'entrada' ? 1 : -1) * Number(l.valor)));
  const contas = store.contas.map((c) => ({ conta: c.nome, saldo: saldos.get(c.id), ativa: c.ativa !== false }));

  const totalEntradas = somar(entradas(lancs));
  const totalCaixa = somar(saidasReais(lancs));
  const totalCartao = somar(parcelas);
  return {
    lancamentos,
    cartao,
    categorias,
    contas,
    resumo: {
      entradas: totalEntradas,
      saidasCaixa: totalCaixa,
      cartao: totalCartao,
      gastos: totalCaixa + totalCartao,
      saldo: totalEntradas - totalCaixa - totalCartao,
      aPagar: somar(lancs.filter((l) => !l.pago && l.tipo === 'saida')),
    },
  };
}

/** "01/11/2026 a 30/11/2026" ou "Todo o período" */
export function textoDoPeriodo(p) {
  if (p.id === 'tudo') return 'Todo o período';
  const ultimo = new Date(`${p.fim}T12:00:00`);
  ultimo.setDate(ultimo.getDate() - 1);
  return `${dataCompleta(p.inicio)} a ${ultimo.toLocaleDateString('pt-BR')}`;
}
