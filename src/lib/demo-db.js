// =====================================================================
// MODO DEMONSTRAÇÃO
// Um "Supabase de mentira" que guarda tudo na memória do navegador.
// Serve para ver o sistema funcionando antes de configurar o banco.
// Ele imita só os comandos que o app usa (select, insert, update, delete,
// eq, in, gte, lt, lte, order, single, rpc e auth). Ao recarregar a página
// os dados voltam ao exemplo.
// =====================================================================
import { faturaDe, dividirParcelas } from './faturas.js';
import { somarDias, toISO, hoje } from './format.js';

const PADROES = {
  contas: { ativa: true, saldo_inicial: 0 },
  cartoes: { ativo: true },
  categorias: { grupo: 'Casa', no_grafico: true },
  pessoas: { tipo: 'Outro' },
  lancamentos: { pago: false },
};

export function criarDemo() {
  let seq = 1;
  const FAMILIA = 'familia-demo';
  const USUARIO = { id: 'usuario-demo', email: 'demonstracao@caixa.app' };
  const db = {
    familias: [{ id: FAMILIA, nome: 'Família Demonstração', codigo_convite: 'DEMO42' }],
    membros: [{ familia_id: FAMILIA, user_id: USUARIO.id }],
    contas: [], cartoes: [], categorias: [], pessoas: [],
    lancamentos: [], compras_cartao: [], parcelas: [],
  };

  const inserir = (tabela, obj) => {
    const linha = { id: seq++, familia_id: FAMILIA, criado_em: new Date().toISOString(), ...PADROES[tabela], ...obj };
    db[tabela].push(linha);
    return linha;
  };

  popular(inserir);

  class Consulta {
    constructor(tabela) {
      this.tabela = tabela;
      this.op = 'select';
      this.filtros = [];
      this.ordem = null;
      this.unico = false;
    }
    select() { return this; }
    insert(linhas) { this.op = 'insert'; this.linhas = [].concat(linhas); return this; }
    update(valores) { this.op = 'update'; this.valores = valores; return this; }
    delete() { this.op = 'delete'; return this; }
    eq(c, v) { this.filtros.push((r) => r[c] === v); return this; }
    in(c, lista) { this.filtros.push((r) => lista.includes(r[c])); return this; }
    gte(c, v) { this.filtros.push((r) => r[c] != null && r[c] >= v); return this; }
    gt(c, v) { this.filtros.push((r) => r[c] != null && r[c] > v); return this; }
    lte(c, v) { this.filtros.push((r) => r[c] != null && r[c] <= v); return this; }
    lt(c, v) { this.filtros.push((r) => r[c] != null && r[c] < v); return this; }
    order(c, { ascending = true } = {}) { this.ordem = { c, asc: ascending }; return this; }
    single() { this.unico = true; return this; }
    maybeSingle() { this.unico = true; return this; }
    then(ok, falha) {
      // pequeno atraso para parecer uma chamada de rede de verdade
      return new Promise((r) => setTimeout(() => r(this.executar()), 80)).then(ok, falha);
    }
    executar() {
      const passa = (r) => this.filtros.every((f) => f(r));
      let dados;
      if (this.op === 'insert') {
        dados = this.linhas.map((o) => inserir(this.tabela, structuredClone(o)));
      } else if (this.op === 'update') {
        dados = db[this.tabela].filter(passa);
        dados.forEach((r) => Object.assign(r, this.valores));
      } else if (this.op === 'delete') {
        dados = db[this.tabela].filter(passa);
        const ids = dados.map((r) => r.id);
        if (this.tabela === 'categorias' && db.lancamentos.some((l) => ids.includes(l.categoria_id))) {
          return { data: null, error: { code: '23503', message: 'foreign key violation' } };
        }
        if (this.tabela === 'contas' && db.lancamentos.some((l) => ids.includes(l.conta_id))) {
          return { data: null, error: { code: '23503', message: 'foreign key violation' } };
        }
        db[this.tabela] = db[this.tabela].filter((r) => !passa(r));
        if (this.tabela === 'compras_cartao') db.parcelas = db.parcelas.filter((p) => !ids.includes(p.compra_id));
        if (this.tabela === 'cartoes') {
          const compras = db.compras_cartao.filter((c) => ids.includes(c.cartao_id)).map((c) => c.id);
          db.compras_cartao = db.compras_cartao.filter((c) => !compras.includes(c.id));
          db.parcelas = db.parcelas.filter((p) => !compras.includes(p.compra_id));
        }
        if (this.tabela === 'pessoas') db.lancamentos.forEach((l) => ids.includes(l.pessoa_id) && (l.pessoa_id = null));
      } else {
        dados = db[this.tabela].filter(passa);
      }
      dados = dados.map((r) => ({ ...r }));
      if (this.ordem) {
        const { c, asc } = this.ordem;
        dados.sort((a, b) => (a[c] > b[c] ? 1 : a[c] < b[c] ? -1 : 0) * (asc ? 1 : -1));
      }
      return { data: this.unico ? (dados[0] ?? null) : dados, error: null };
    }
  }

  let sessao = { user: USUARIO };
  const ouvintes = [];
  const avisar = (evento) => ouvintes.forEach((f) => f(evento, sessao));

  return {
    from: (tabela) => new Consulta(tabela),
    rpc: async () => ({ data: FAMILIA, error: null }),
    auth: {
      getSession: async () => ({ data: { session: sessao }, error: null }),
      onAuthStateChange(fn) {
        ouvintes.push(fn);
        return { data: { subscription: { unsubscribe() {} } } };
      },
      async signInWithPassword() { sessao = { user: USUARIO }; avisar('SIGNED_IN'); return { data: { session: sessao }, error: null }; },
      async signUp() { sessao = { user: USUARIO }; avisar('SIGNED_IN'); return { data: { session: sessao }, error: null }; },
      async signOut() { sessao = null; avisar('SIGNED_OUT'); return { error: null }; },
      async resetPasswordForEmail() { return { error: null }; },
    },
  };
}

// ---------- Dados de exemplo
function popular(inserir) {
  const contas = Object.fromEntries(
    [['Espécie', 850], ['MMP', 6200], ['Nubank', 1450], ['TMP', 300], ['M.C.', 0]]
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
    ['Venda', 'Financeiro', false], ['Rendimentos Bancários', 'Financeiro', false],
    ['Empréstimos Bancários', 'Financeiro', false], ['Empréstimos Dívidas', 'Financeiro', false],
    ['Tarifas Bancárias', 'Financeiro', false], ['Ajuste Caixa', 'Financeiro', false],
    ['Assinatura Canais', 'Serviços', false], ['Segurança', 'Serviços', false], ['Telefone', 'Serviços', false],
  ].forEach(([nome, grupo, no_grafico]) => (cat[nome] = inserir('categorias', { nome, grupo, no_grafico }).id));

  const joao = inserir('pessoas', { nome: 'João', tipo: 'Funcionário' }).id;
  const maria = inserir('pessoas', { nome: 'Maria', tipo: 'Prestador' }).id;
  inserir('pessoas', { nome: 'Thays', tipo: 'Família' });

  const L = (tipo, valor, descricao, categoria, conta, dias, pago, pessoa_id = null) =>
    inserir('lancamentos', {
      tipo, valor, descricao, categoria_id: cat[categoria], conta_id: contas[conta],
      vencimento: somarDias(dias), pago, data_pagamento: pago ? somarDias(Math.min(dias, 0)) : null, pessoa_id,
    });
  L('saida', 180.9, 'Conta de luz', 'Despesas Fixas Casa', 'Nubank', -6, true);
  L('saida', 2400, 'Salário do João', 'Despesas Fazenda', 'MMP', 2, false, joao);
  L('saida', 650, 'Ração do gado', 'Insumos Fazenda', 'MMP', -2, false);
  L('entrada', 8500, 'Venda de bezerros', 'Venda', 'MMP', -3, true);
  L('saida', 99.9, 'Internet', 'Telefone', 'Nubank', 5, false);
  L('saida', 320, 'Diarista', 'Despesas Fixas Casa', 'Espécie', -1, true, maria);
  L('saida', 145, 'Pizzaria', 'Restaurantes/Padarias', 'Nubank', -2, true);
  L('saida', 230, 'Gasolina', 'Veículo', 'Nubank', -1, true);
  L('saida', 189.9, 'Ração e vacina da Mel', 'Pet Despesas', 'Espécie', -3, true);
  L('saida', 420, 'Mensalidade do curso', 'Ensino', 'MMP', 6, false);

  const C = (cartao, dias, total, n, descricao, categoria) => {
    const data_compra = somarDias(dias);
    const compra = inserir('compras_cartao', {
      cartao_id: cartao.id, data_compra, valor_total: total, qtd_parcelas: n, descricao, categoria_id: cat[categoria],
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
