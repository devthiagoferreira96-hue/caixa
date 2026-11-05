// =====================================================================
// Dados iniciais: contas, cartões e categorias da planilha.
// Opcionalmente, também lançamentos de exemplo para conhecer o sistema.
// =====================================================================
import { faturaDe, dividirParcelas } from './faturas.js';
import { somarDias, toISO, hoje } from './format.js';
import { criarConsultas, tabelasVazias } from './consulta-local.js';

/** Categorias da planilha que não são de saída */
export const TIPO_PADRAO = {
  Venda: 'entrada',
  'Rendimentos Bancários': 'entrada',
  'Empréstimos Bancários': 'ambos', // entra quando pega, sai quando paga
  'Empréstimos Dívidas': 'ambos',
  'Ajuste Caixa': 'ambos', // corrige o saldo para mais ou para menos
};

/** Retorna as tabelas prontas para começar a usar */
export function dadosIniciais({ comExemplo = false } = {}) {
  const banco = { tabelas: tabelasVazias() };
  const consultar = criarConsultas(banco);
  const inserir = (tabela, obj) => consultar(tabela).insert(obj).executar().data[0];

  const saldos = comExemplo ? [850, 6200, 1450, 300, 0] : [0, 0, 0, 0, 0];
  const contas = Object.fromEntries(
    ['Espécie', 'MMP', 'Nubank', 'TMP', 'M.C.'].map((nome, i) => [nome, saldos[i]])
      .map(([nome, saldo_inicial]) => [nome, inserir('contas', { nome, saldo_inicial }).id]),
  );
  const cartoes = [
    inserir('cartoes', { nome: 'Mercado Pago', dia_fechamento: 3, dia_vencimento: 10 }),
    inserir('cartoes', { nome: 'Nubank', dia_fechamento: 1, dia_vencimento: 8 }),
    inserir('cartoes', { nome: 'Cartão Thays', dia_fechamento: 5, dia_vencimento: 12 }),
  ];
  const cat = {};
  [
    ['Cuidados Estéticos', 'Casa', true], ['Jogos', 'Casa', true], ['Roupas', 'Casa', true],
    ['Compras Pessoais', 'Casa', true], ['Lazer', 'Casa', true], ['Pet Despesas', 'Casa', true],
    ['Presentes/Doações', 'Casa', true], ['Ensino', 'Casa', true], ['Saúde/Farmácia', 'Casa', true],
    ['Despesas Fixas Casa', 'Casa', true], ['Alimentação/Produtos Limpeza', 'Casa', true],
    ['Restaurantes/Padarias', 'Casa', true], ['Veículo', 'Casa', true], ["Cigarro/Vap's", 'Casa', true],
    ['Despesas Fazenda', 'Fazenda', false], ['Insumos Fazenda', 'Fazenda', false], ['Cargas', 'Fazenda', false],
    ['Despesas Empresas', 'Empresa', false], ['Jurídico', 'Empresa', false],
    ['Venda', 'Fazenda', false], ['Rendimentos Bancários', 'Financeiro', false],
    ['Empréstimos Bancários', 'Financeiro', false], ['Empréstimos Dívidas', 'Financeiro', false],
    ['Tarifas Bancárias', 'Financeiro', false], ['Ajuste Caixa', 'Financeiro', false],
    ['Assinatura Canais', 'Serviços', false], ['Segurança', 'Serviços', false], ['Telefone', 'Serviços', false],
  ].forEach(([nome, grupo, no_grafico]) => (cat[nome] = inserir('categorias', { nome, grupo, no_grafico, tipo: TIPO_PADRAO[nome] || 'saida' }).id));

  if (comExemplo) exemplos(inserir, { contas, cartoes, cat });
  return banco.tabelas;
}

// ---------- Lançamentos de exemplo
function exemplos(inserir, { contas, cartoes, cat }) {
  const joao = inserir('pessoas', { nome: 'João', tipo: 'Funcionário' }).id;
  const maria = inserir('pessoas', { nome: 'Maria', tipo: 'Prestador' }).id;
  inserir('pessoas', { nome: 'Thays', tipo: 'Família' });

  let vez = 0;
  const autoria = (data) => ({
    criado_em: new Date(`${data}T${String(9 + (vez++ % 10)).padStart(2, '0')}:15:00`).toISOString(),
  });
  const L = (tipo, valor, descricao, categoria, conta, dias, pago, pessoa_id = null) =>
    inserir('lancamentos', {
      tipo, valor, descricao, categoria_id: cat[categoria], conta_id: contas[conta],
      vencimento: somarDias(dias), pago, data_pagamento: pago ? somarDias(Math.min(dias, 0)) : null, pessoa_id,
      ...autoria(somarDias(Math.min(dias, 0))),
    });
  L('saida', 180.9, 'Conta de luz', 'Despesas Fixas Casa', 'Nubank', -6, true);
  L('saida', 2400, 'Salário do João', 'Despesas Fazenda', 'MMP', 2, false, joao);
  L('saida', 650, 'Ração do gado', 'Insumos Fazenda', 'MMP', -2, false);
  L('entrada', 8500, 'Venda de bezerros', 'Venda', 'MMP', -3, true);
  L('saida', 99.9, 'Internet', 'Telefone', 'Nubank', 5, false);
  L('entrada', 38.5, 'Rendimento da poupança', 'Rendimentos Bancários', 'Nubank', -1, true);
  L('saida', 320, 'Diarista', 'Despesas Fixas Casa', 'Espécie', -1, true, maria);
  L('saida', 145, 'Pizzaria', 'Restaurantes/Padarias', 'Nubank', -2, true);
  L('saida', 230, 'Gasolina', 'Veículo', 'Nubank', -1, true);
  L('saida', 189.9, 'Ração e vacina da Mel', 'Pet Despesas', 'Espécie', -3, true);
  L('saida', 420, 'Mensalidade do curso', 'Ensino', 'MMP', 6, false);

  const C = (cartao, dias, total, n, descricao, categoria) => {
    const data_compra = somarDias(dias);
    const compra = inserir('compras_cartao', {
      cartao_id: cartao.id, data_compra, valor_total: total, qtd_parcelas: n, descricao, categoria_id: cat[categoria],
      ...autoria(data_compra),
    });
    dividirParcelas(total, n).forEach((valor, i) =>
      inserir('parcelas', { compra_id: compra.id, numero: i + 1, valor, fatura_mes: faturaDe(cartao, data_compra, i) }),
    );
  };
  C(cartoes[0], -20, 1200, 6, 'Geladeira', 'Despesas Fixas Casa');
  C(cartoes[1], -8, 286.4, 1, 'Supermercado', 'Alimentação/Produtos Limpeza');
  C(cartoes[2], -4, 159.9, 2, 'Tênis', 'Roupas');
  C(cartoes[1], -3, 74, 1, 'Farmácia', 'Saúde/Farmácia');
  C(cartoes[0], -15, 540, 3, 'Peças do trator', 'Despesas Fazenda');
  C(cartoes[2], -35, 210, 1, 'Presente de aniversário', 'Presentes/Doações');

  // Meses anteriores, para o relatório ter histórico
  const base = hoje();
  [[1, 3100], [2, 2750], [3, 3380], [4, 2900], [5, 3050]].forEach(([m, total]) => {
    const d = new Date(base.getFullYear(), base.getMonth() - m, 12);
    [['Alimentação/Produtos Limpeza', 0.34], ['Despesas Fixas Casa', 0.28], ['Veículo', 0.14], ['Restaurantes/Padarias', 0.1], ['Lazer', 0.08], ['Saúde/Farmácia', 0.06]]
      .forEach(([c, p], i) => inserir('lancamentos', {
        tipo: 'saida', valor: Math.round(total * p), descricao: c, categoria_id: cat[c],
        conta_id: contas.MMP, vencimento: toISO(new Date(d.getFullYear(), d.getMonth(), 5 + i * 3)), pago: true,
      }));
    inserir('lancamentos', {
      tipo: 'entrada', valor: 7000 + m * 250, descricao: 'Venda', categoria_id: cat.Venda, conta_id: contas.MMP,
      vencimento: toISO(d), pago: true,
    });
  });
}
