// Testes da separação por conta dentro de cada dia do Extrato. Rodar: node tests/extrato-contas.test.js
import assert from 'node:assert/strict';
import { agruparPorConta } from '../src/lib/calculos.js';

let falhas = 0;
const teste = (nome, fn) => {
  try { fn(); console.log(`ok   ${nome}`); } catch (e) { falhas++; console.log(`FALHOU ${nome}\n     ${e.message}`); }
};

const contas = [{ id: 'din', nome: 'Dinheiro' }, { id: 'nu', nome: 'Nubank' }, { id: 'pou', nome: 'Poupança' }];
const ids = (grupos) => grupos.map((g) => [g.conta_id, g.itens.map((l) => l.id)]);

teste('lançamentos misturados ficam juntos por conta, na ordem das contas', () => {
  const itens = [
    { id: 1, conta_id: 'nu' }, { id: 2, conta_id: 'din' }, { id: 3, conta_id: 'nu' }, { id: 4, conta_id: 'din' },
  ];
  assert.deepEqual(ids(agruparPorConta(itens, contas)), [['din', [2, 4]], ['nu', [1, 3]]]);
});
teste('cada ponta da transferência fica na conta dela', () => {
  const itens = [
    { id: 's', conta_id: 'din', tipo: 'saida', transferencia: 't1', transferencia_conta_id: 'nu' },
    { id: 'e', conta_id: 'nu', tipo: 'entrada', transferencia: 't1', transferencia_conta_id: 'din' },
    { id: 'x', conta_id: 'nu', tipo: 'saida' },
  ];
  assert.deepEqual(ids(agruparPorConta(itens, contas)), [['din', ['s']], ['nu', ['e', 'x']]]);
});
teste('fatura do cartão (sem conta) vai por último', () => {
  const itens = [{ id: 'f', conta_id: null, virtual: 'fatura' }, { id: 1, conta_id: 'pou' }, { id: 2, conta_id: 'din' }];
  assert.deepEqual(ids(agruparPorConta(itens, contas)), [['din', [2]], ['pou', [1]], [null, ['f']]]);
});
teste('conta que não está na lista (excluída) vem depois das conhecidas', () => {
  const itens = [{ id: 1, conta_id: 'sumiu' }, { id: 2, conta_id: 'nu' }];
  assert.deepEqual(ids(agruparPorConta(itens, contas)), [['nu', [2]], ['sumiu', [1]]]);
});
teste('dia vazio não tem grupos', () => assert.deepEqual(agruparPorConta([], contas), []));

if (falhas) { console.log(`\n${falhas} teste(s) falharam`); process.exit(1); }
console.log('\nTodos os testes passaram');
