// Testes da fórmula no campo de valor. Rodar: node tests/formula.test.js
import assert from 'node:assert/strict';
import { calcularFormula, tentarFormula, ehFormula } from '../src/lib/formula.js';
import { lerValor } from '../src/lib/format.js';

let falhas = 0;
const teste = (nome, fn) => {
  try { fn(); console.log(`ok   ${nome}`); } catch (e) { falhas++; console.log(`FALHOU ${nome}\n     ${e.message}`); }
};

teste('3 saques com tarifa de 4,50', () => assert.equal(calcularFormula('=3*4,50'), 13.5));
teste('conta sem o "=" na frente', () => {
  assert.equal(calcularFormula('3*4,50'), 13.5);
  assert.equal(calcularFormula('3x4,50+2'), 15.5);
});
teste('x, X e × como multiplicação', () => {
  assert.equal(calcularFormula('=3x4,50'), 13.5);
  assert.equal(calcularFormula('=3 X 4,50'), 13.5);
  assert.equal(calcularFormula('=3×4,50'), 13.5);
});
teste('precedência e parênteses', () => {
  assert.equal(calcularFormula('=2+3*4'), 14);
  assert.equal(calcularFormula('=(2+3)*4'), 20);
  assert.equal(calcularFormula('=100-10/4'), 97.5);
  assert.equal(calcularFormula('=100÷4'), 25);
});
teste('números no formato brasileiro', () => {
  assert.equal(calcularFormula('=1.234,56+0,44'), 1235);
  assert.equal(calcularFormula('=1.500*2'), 3000);
  assert.equal(calcularFormula('=4.5*2'), 9);
});
teste('sinal negativo', () => assert.equal(calcularFormula('=-2+10'), 8));
teste('arredonda em centavos', () => assert.equal(calcularFormula('=10/3'), 3.33));
teste('erros com mensagem', () => {
  assert.match(tentarFormula('=3*').erro, /incompleta/);
  assert.match(tentarFormula('=').erro, /Digite a conta/);
  assert.match(tentarFormula('3*').erro, /incompleta/);
  assert.match(tentarFormula('=3/0').erro, /zero/);
  assert.match(tentarFormula('=(3+2').erro, /parêntese/);
  assert.match(tentarFormula('=3 4').erro, /Falta um sinal/);
  assert.match(tentarFormula('=3a').erro, /não aceito/);
  assert.match(tentarFormula('=2,,5').erro, /Número inválido/);
});
teste('ehFormula', () => {
  assert.equal(ehFormula('=1+1'), true);
  assert.equal(ehFormula('  =1'), true);
  assert.equal(ehFormula('3*4,50'), true);
  assert.equal(ehFormula('3x4,50'), true);
  assert.equal(ehFormula('12,50'), false);
  assert.equal(ehFormula('1.234,56'), false);
  assert.equal(ehFormula('R$ 12,50'), false);
  assert.equal(ehFormula(null), false);
});
teste('lerValor entende fórmula e continua igual para números', () => {
  assert.equal(lerValor('=3*4,50'), 13.5);
  assert.equal(lerValor('3*4,50'), 13.5);
  assert.ok(Number.isNaN(lerValor('=3*')));
  assert.equal(lerValor('1.234,56'), 1234.56);
  assert.equal(lerValor('R$ 12,50'), 12.5);
});

console.log(falhas ? `\n${falhas} teste(s) falharam` : '\nTodos os testes passaram');
process.exit(falhas ? 1 : 0);
