// Testes dos dados que vão dentro do PDF e da junção sem duplicar. Rodar: node tests/dados-periodo.test.js
import assert from 'node:assert/strict';
import { dadosDoPeriodoParaAnexo, juntarTabelas, comprimir, objetosDoAnexo, lerAnexoDoPdf } from '../src/lib/dados-periodo.js';

let falhas = 0;
const teste = async (nome, fn) => {
  try { await fn(); console.log(`ok   ${nome}`); } catch (e) { falhas++; console.log(`FALHOU ${nome}\n     ${e.message}`); }
};

const base = () => ({
  contas: [{ id: 'c1', nome: 'Nubank' }, { id: 'c2', nome: 'Espécie' }],
  cartoes: [{ id: 'k1', nome: 'Mercado Pago' }],
  categorias: [{ id: 'g1', nome: 'Lazer' }],
  pessoas: [],
  lancamentos: [
    { id: 'l1', vencimento: '2026-10-05', valor: 10, conta_id: 'c1', categoria_id: 'g1' },
    { id: 'l2', vencimento: '2026-11-05', valor: 20, conta_id: 'c1', categoria_id: 'g1' },
    { id: 'l3', vencimento: '2026-11-20', valor: 30, conta_id: 'c2', resina_entrega_id: 'i1' },
  ],
  compras_cartao: [{ id: 'cp1', data_compra: '2026-09-10', cartao_id: 'k1', categoria_id: 'g1' }],
  parcelas: [
    { id: 'p1', compra_id: 'cp1', fatura_mes: '2026-10-01' },
    { id: 'p2', compra_id: 'cp1', fatura_mes: '2026-11-01' },
  ],
  resina_cargas: [{ id: 'cg1', data: '2026-11-03' }, { id: 'cg2', data: '2026-08-01' }],
  resina_carga_itens: [{ id: 'it1', carga_id: 'cg1', produtor_id: 'pr1' }, { id: 'it2', carga_id: 'cg2', produtor_id: 'pr1' }],
  resina_produtores: [{ id: 'pr1', nome: 'Carlos' }],
  resina_insumos: [{ id: 'i1', data: '2026-12-02', produtor_id: 'pr1' }],
  resina_movimentos: [],
});
const NOV = { inicio: '2026-11-01', fim: '2026-12-01' };

await teste('separa só os movimentos do período, com todos os cadastros', () => {
  const d = dadosDoPeriodoParaAnexo(base(), NOV);
  assert.deepEqual(d.lancamentos.map((l) => l.id), ['l2', 'l3']);
  assert.deepEqual(d.resina_cargas.map((c) => c.id), ['cg1']);
  assert.deepEqual(d.resina_carga_itens.map((c) => c.id), ['it1']);
  assert.equal(d.contas.length, 2);
  assert.equal(d.resina_produtores.length, 1);
});
await teste('compra com parcela no período vai com todas as parcelas', () => {
  const d = dadosDoPeriodoParaAnexo(base(), NOV);
  assert.deepEqual(d.compras_cartao.map((c) => c.id), ['cp1']);
  assert.deepEqual(d.parcelas.map((p) => p.id), ['p1', 'p2']);
});
await teste('o que está ligado vai junto (gasto no Caixa → insumo da Resina de outro mês)', () => {
  const d = dadosDoPeriodoParaAnexo(base(), NOV);
  assert.deepEqual(d.resina_insumos.map((i) => i.id), ['i1']);
});
await teste('juntar no mesmo sistema: nada muda (já existe tudo)', () => {
  const t = base();
  const r = juntarTabelas(t, dadosDoPeriodoParaAnexo(t, NOV));
  assert.equal(r.total, 0);
  for (const [tabela, linhas] of Object.entries(t)) assert.deepEqual(r.tabelas[tabela], linhas, tabela);
});
await teste('juntar num sistema vazio: entra tudo', () => {
  const d = dadosDoPeriodoParaAnexo(base(), NOV);
  const r = juntarTabelas({}, d);
  assert.equal(r.novos.lancamentos, 2);
  assert.equal(r.novos.parcelas, 2);
  assert.equal(r.novos.contas, 2);
});
await teste('cadastro com o mesmo nome (outro código) não duplica e as ligações apontam para ele', () => {
  const d = dadosDoPeriodoParaAnexo(base(), NOV);
  const atual = { contas: [{ id: 'X', nome: 'nubank' }], lancamentos: [{ id: 'l9', vencimento: '2026-01-01', conta_id: 'X' }] };
  const r = juntarTabelas(atual, d);
  assert.equal(r.tabelas.contas.filter((c) => c.nome.toLowerCase() === 'nubank').length, 1);
  assert.equal(r.tabelas.lancamentos.find((l) => l.id === 'l2').conta_id, 'X');
  assert.equal(r.tabelas.lancamentos.find((l) => l.id === 'l9').conta_id, 'X'); // o que já existia não mudou
});
await teste('não altera nem apaga o que já existe', () => {
  const atual = { lancamentos: [{ id: 'l2', vencimento: '2026-11-05', valor: 999 }, { id: 'l7', vencimento: '2026-11-07', valor: 1 }] };
  const r = juntarTabelas(atual, dadosDoPeriodoParaAnexo(base(), NOV));
  assert.equal(r.tabelas.lancamentos.find((l) => l.id === 'l2').valor, 999);
  assert.ok(r.tabelas.lancamentos.find((l) => l.id === 'l7'));
});
await teste('os dados escondidos no PDF voltam iguais', async () => {
  const texto = JSON.stringify({ app: 'caixa-familia', tabelas: dadosDoPeriodoParaAnexo(base(), NOV), acento: 'Espécie ção' });
  const c = await comprimir(texto);
  const o = objetosDoAnexo(c, 'teste');
  const pdf = `%PDF-1.4\n1 0 obj\n${o.arquivo}\nendobj\n%%EOF\n`;
  const bytes = Uint8Array.from(pdf, (ch) => ch.charCodeAt(0) & 0xff);
  assert.equal(await lerAnexoDoPdf(bytes), texto);
});
await teste('PDF sem dados: null', async () => {
  assert.equal(await lerAnexoDoPdf(Uint8Array.from('%PDF-1.4\n%%EOF', (ch) => ch.charCodeAt(0))), null);
});

console.log(falhas ? `\n${falhas} teste(s) falharam` : '\nTodos os testes passaram');
if (falhas) process.exit(1);
