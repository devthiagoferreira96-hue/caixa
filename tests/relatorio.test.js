// Testes das bases do relatório (vencimento, competência, pagamento). Rodar: node tests/relatorio.test.js
import assert from 'node:assert/strict';
import { dataDeReferencia, mesDeReferencia, BASES_RELATORIO, dataNoExtrato } from '../src/lib/calculos.js';

let falhas = 0;
const teste = (nome, fn) => {
  try { fn(); console.log(`ok   ${nome}`); } catch (e) { falhas++; console.log(`FALHOU ${nome}\n     ${e.message}`); }
};

// luz de outubro, vence 10/11, paga 02/12
const luz = { vencimento: '2026-11-10', competencia: '2026-10-01', pago: true, data_pagamento: '2026-12-02' };
const aberto = { vencimento: '2026-11-20', competencia: null, pago: false, data_pagamento: null };
const antigo = { vencimento: '2026-11-05', pago: true }; // lançado antes dos campos novos

teste('vencimento é o padrão', () => {
  assert.equal(dataDeReferencia(luz), '2026-11-10');
  assert.equal(mesDeReferencia(luz, 'vencimento'), '2026-11');
});
teste('competência usa o mês a que se refere', () => {
  assert.equal(dataDeReferencia(luz, 'competencia'), '2026-10-01');
  assert.equal(mesDeReferencia(luz, 'competencia'), '2026-10');
});
teste('sem competência, vale o vencimento', () => {
  assert.equal(mesDeReferencia(aberto, 'competencia'), '2026-11');
  assert.equal(mesDeReferencia(antigo, 'competencia'), '2026-11');
});
teste('pagamento usa a data em que foi pago', () => assert.equal(mesDeReferencia(luz, 'pagamento'), '2026-12'));
teste('pagamento: em aberto fica de fora', () => {
  assert.equal(dataDeReferencia(aberto, 'pagamento'), null);
  assert.equal(mesDeReferencia(aberto, 'pagamento'), null);
});
teste('pagamento: pago sem data usa o vencimento (lançamentos antigos)', () => assert.equal(mesDeReferencia(antigo, 'pagamento'), '2026-11'));
teste('competência guardada com dia diferente de 01 continua no mês certo', () =>
  assert.equal(dataDeReferencia({ ...luz, competencia: '2026-10-15' }, 'competencia'), '2026-10-01'));
teste('as três bases têm nome e explicação', () =>
  assert.deepEqual(Object.keys(BASES_RELATORIO), ['vencimento', 'competencia', 'pagamento']));

teste('extrato: parcela de dezembro paga em novembro aparece em novembro', () =>
  assert.equal(dataNoExtrato({ vencimento: '2026-12-10', pago: true, data_pagamento: '2026-11-15' }), '2026-11-15'));
teste('extrato: em aberto fica no vencimento', () => assert.equal(dataNoExtrato(aberto), '2026-11-20'));
teste('extrato: pago sem data de pagamento fica no vencimento', () =>
  assert.equal(dataNoExtrato({ vencimento: '2026-12-10', pago: true, data_pagamento: null }), '2026-12-10'));

console.log(falhas ? `\n${falhas} teste(s) falharam` : '\nTodos os testes passaram');
process.exit(falhas ? 1 : 0);
