// =====================================================================
// Consultas nos dados guardados no aparelho, no estilo from().select().eq().order().
// (É a mesma "cara" de bibliotecas de banco como o Supabase, então dá para trocar
// por um banco na nuvem no futuro sem reescrever as telas.)
// =====================================================================

export const TABELAS = ['contas', 'cartoes', 'categorias', 'pessoas', 'lancamentos', 'compras_cartao', 'parcelas'];
const COM_DATA = ['lancamentos', 'compras_cartao'];

const PADROES = {
  contas: { ativa: true, saldo_inicial: 0 },
  cartoes: { ativo: true },
  categorias: { grupo: 'Casa', no_grafico: true },
  pessoas: { tipo: 'Outro' },
  lancamentos: { pago: false },
};

const erroFK = { code: '23503', message: 'foreign key violation' };

/**
 * `banco` = { tabelas: { contas: [...], ... }, aoMudar() }
 * Retorna uma função `from(tabela)`.
 */
export function criarConsultas(banco) {
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
    upsert(linhas) { this.op = 'upsert'; this.linhas = [].concat(linhas); return this; }
    update(valores) { this.op = 'update'; this.valores = valores; return this; }
    delete() { this.op = 'delete'; return this; }
    eq(c, v) { this.filtros.push((r) => r[c] === v); return this; }
    in(c, lista) { this.filtros.push((r) => lista.includes(r[c])); return this; }
    gte(c, v) { this.filtros.push((r) => r[c] != null && r[c] >= v); return this; }
    gt(c, v) { this.filtros.push((r) => r[c] != null && r[c] > v); return this; }
    lte(c, v) { this.filtros.push((r) => r[c] != null && r[c] <= v); return this; }
    lt(c, v) { this.filtros.push((r) => r[c] != null && r[c] < v); return this; }
    order(c, { ascending = true } = {}) { this.ordem = { c, asc: ascending }; return this; }
    range() { return this; }
    single() { this.unico = true; return this; }
    maybeSingle() { this.unico = true; return this; }
    then(ok, falha) { return Promise.resolve().then(() => this.executar()).then(ok, falha); }

    executar() {
      const t = banco.tabelas;
      const passa = (r) => this.filtros.every((f) => f(r));
      let dados;
      if (this.op === 'insert' || this.op === 'upsert') {
        dados = [];
        for (const o of this.linhas) {
          const existente = o.id && t[this.tabela].find((r) => r.id === o.id);
          if (existente) {
            if (this.op === 'insert') return { data: null, error: { code: '23505', message: 'duplicate key' } };
            continue; // upsert com ignoreDuplicates: já existe, não faz nada
          }
          const linha = {
            ...PADROES[this.tabela],
            ...(COM_DATA.includes(this.tabela) ? { criado_em: new Date().toISOString() } : {}),
            ...structuredClone(o),
            id: o.id || crypto.randomUUID(),
          };
          t[this.tabela].push(linha);
          dados.push(linha);
        }
      } else if (this.op === 'update') {
        dados = t[this.tabela].filter(passa);
        dados.forEach((r) => Object.assign(r, structuredClone(this.valores)));
      } else if (this.op === 'delete') {
        dados = t[this.tabela].filter(passa);
        const ids = dados.map((r) => r.id);
        const usado = (tabela, col) => t[tabela].some((x) => ids.includes(x[col]));
        // mesmas regras do banco de verdade
        if (this.tabela === 'categorias' && (usado('lancamentos', 'categoria_id') || usado('compras_cartao', 'categoria_id'))) return { data: null, error: erroFK };
        if (this.tabela === 'contas' && usado('lancamentos', 'conta_id')) return { data: null, error: erroFK };
        t[this.tabela] = t[this.tabela].filter((r) => !passa(r));
        if (this.tabela === 'compras_cartao') t.parcelas = t.parcelas.filter((p) => !ids.includes(p.compra_id));
        if (this.tabela === 'cartoes') {
          const compras = t.compras_cartao.filter((c) => ids.includes(c.cartao_id)).map((c) => c.id);
          t.compras_cartao = t.compras_cartao.filter((c) => !compras.includes(c.id));
          t.parcelas = t.parcelas.filter((p) => !compras.includes(p.compra_id));
          t.lancamentos.forEach((l) => ids.includes(l.fatura_cartao_id) && (l.fatura_cartao_id = null));
        }
        if (this.tabela === 'pessoas') t.lancamentos.forEach((l) => ids.includes(l.pessoa_id) && (l.pessoa_id = null));
      } else {
        dados = t[this.tabela].filter(passa);
      }
      if (this.op !== 'select') banco.aoMudar?.();
      dados = dados.map((r) => ({ ...r }));
      if (this.ordem) {
        const { c, asc } = this.ordem;
        dados.sort((a, b) => (a[c] > b[c] ? 1 : a[c] < b[c] ? -1 : 0) * (asc ? 1 : -1));
      }
      return { data: this.unico ? (dados[0] ?? null) : dados, error: null };
    }
  }
  return (tabela) => new Consulta(tabela);
}

export const tabelasVazias = () => Object.fromEntries(TABELAS.map((t) => [t, []]));
