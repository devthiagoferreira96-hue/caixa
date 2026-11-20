// Testes de quais contas somam no "Saldo total" do Início. Rodar: node tests/contas-saldo.test.js
import assert from 'node:assert/strict';
import { contaNoSaldo, dividirContasDoSaldo } from '../src/lib/store.js';

let falhas = 0;
const teste = (nome, fn) => {
  try { fn(); console.log(`ok   ${nome}`); } catch (e) { falhas++; console.log(`FALHOU ${nome}\n     ${e.message}`); }
};

const contas = [
  { id: 'bra', nome: 'Bradesco', ativa: true },
  { id: 'ita', nome: 'Itaú', ativa: true },
  { id: 'nu', nome: 'Nubank', ativa: true, no_saldo: false },          // pouco usada: fora do saldo
  { id: 'mp', nome: 'Mercado Pago', ativa: false },                    // fora de uso, ainda com dinheiro
  { id: 'vel', nome: 'Conta antiga', ativa: false },                   // fora de uso e zerada
  { id: 'esp', nome: 'Espécie', ativa: false, no_saldo: true },        // fora de uso, mas escolhida para o saldo
];
const saldos = new Map([['bra', 1000], ['ita', 250.5], ['nu', 80.1], ['mp', -30], ['vel', 0], ['esp', 10]]);

teste('dados antigos (sem escolha) seguem o "Em uso"', () => {
  assert.equal(contaNoSaldo({ ativa: true }), true);
  assert.equal(contaNoSaldo({}), true);
  assert.equal(contaNoSaldo({ ativa: false }), false);
});
teste('a escolha guardada vale mais que o "Em uso"', () => {
  assert.equal(contaNoSaldo({ ativa: true, no_saldo: false }), false);
  assert.equal(contaNoSaldo({ ativa: false, no_saldo: true }), true);
});
teste('saldo soma só as contas escolhidas', () => {
  const r = dividirContasDoSaldo(contas, saldos);
  assert.deepEqual(r.noSaldo.map((c) => c.id), ['bra', 'ita', 'esp']);
  assert.equal(r.total, 1260.5);
});
teste('as outras aparecem à parte, com a soma delas', () => {
  const r = dividirContasDoSaldo(contas, saldos);
  assert.deepEqual(r.outras.map((c) => c.id), ['nu', 'mp']);
  assert.equal(r.totalOutras, 50.1);
});
teste('conta fora de uso e zerada não aparece nas outras', () => {
  assert.ok(!dividirContasDoSaldo(contas, saldos).outras.some((c) => c.id === 'vel'));
});
teste('dá para deixar só as pouco usadas no saldo', () => {
  const invertido = contas.map((c) => ({ ...c, no_saldo: ['nu', 'mp'].includes(c.id) }));
  const r = dividirContasDoSaldo(invertido, saldos);
  assert.deepEqual(r.noSaldo.map((c) => c.id), ['nu', 'mp']);
  assert.equal(r.total, 50.1);
  assert.deepEqual(r.outras.map((c) => c.id), ['bra', 'ita', 'esp']);
});
teste('sem nenhuma conta escolhida o saldo é zero', () => {
  const r = dividirContasDoSaldo(contas.map((c) => ({ ...c, no_saldo: false })), saldos);
  assert.equal(r.noSaldo.length, 0);
  assert.equal(r.total, 0);
});
teste('conta sem lançamento conta como zero', () => {
  assert.equal(dividirContasDoSaldo([{ id: 'x', nome: 'X' }], new Map()).total, 0);
});

if (falhas) { console.log(`\n${falhas} teste(s) falharam`); process.exit(1); }
console.log('\nTodos os testes passaram');
