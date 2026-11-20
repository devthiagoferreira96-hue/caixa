// Testes da projeção do caixa (saldo previsto do mês). Rodar: node tests/projecao.test.js
import assert from 'node:assert/strict';
import { projecaoDoMes } from '../src/lib/calculos.js';

let falhas = 0;
const teste = (nome, fn) => {
  try { fn(); console.log(`ok   ${nome}`); } catch (e) { falhas++; console.log(`FALHOU ${nome}\n     ${e.message}`); }
};

const hoje = '2026-11-20';
const contas = [{ id: 'din', saldo_inicial: 1000 }, { id: 'nu', saldo_inicial: 500 }];
const pago = (id, conta, tipo, valor, dia, extra = {}) => ({ id, conta_id: conta, tipo, valor, vencimento: dia, data_pagamento: dia, pago: true, ...extra });
const aberto = (id, conta, tipo, valor, dia, extra = {}) => ({ id, conta_id: conta, tipo, valor, vencimento: dia, pago: false, ...extra });

const pagos = [
  pago('p1', 'din', 'entrada', 300, '2026-10-10'),
  pago('p2', 'nu', 'saida', 100, '2026-11-05'),
];
const abertos = [
  aberto('a0', 'din', 'saida', 50, '2026-10-28'),   // atrasado de outubro: vai sair (conta como hoje)
  aberto('a1', 'din', 'saida', 200, '2026-11-25'),
  aberto('a2', 'nu', 'entrada', 1000, '2026-12-05'),
  aberto('a3', 'din', 'saida', 400, '2026-12-15'),
  aberto('a4', 'din', 'saida', 80, '2027-01-10'),
];
const mes = (ini, fim, extra = {}) => projecaoDoMes({ pagos, abertos, contas, inicio: ini, fim, hoje, ...extra });

teste('mês atual: começa com o saldo real do fim do mês anterior', () => {
  const p = mes('2026-11-01', '2026-12-01');
  assert.equal(p.inicial, 1800); // 1000 + 500 + 300
});
teste('mês atual: o fim soma o que falta pagar, inclusive o atrasado', () => {
  const p = mes('2026-11-01', '2026-12-01');
  assert.equal(p.entradas, 0);
  assert.equal(p.saidas, 350); // 100 pago + 50 atrasado + 200 a pagar
  assert.equal(p.final, 1450);
});
teste('mês seguinte começa com o saldo previsto do fim do mês atual', () => {
  const nov = mes('2026-11-01', '2026-12-01');
  const dez = mes('2026-12-01', '2027-01-01');
  assert.equal(dez.inicial, nov.final);
  assert.equal(dez.entradas, 1000);
  assert.equal(dez.saidas, 400);
  assert.equal(dez.final, 2050);
});
teste('e assim por diante (janeiro começa com o fim de dezembro)', () => {
  const jan = mes('2027-01-01', '2027-02-01');
  assert.equal(jan.inicial, 2050);
  assert.equal(jan.final, 1970);
});
teste('saldo previsto dia a dia', () => {
  const p = mes('2026-12-01', '2027-01-01');
  assert.equal(p.previstoAte('2026-12-04'), 1450);
  assert.equal(p.previstoAte('2026-12-05'), 2450);
  assert.equal(p.previstoAte('2026-12-31'), 2050);
});
teste('mês que já passou mostra o real (o atrasado não some do saldo de outubro)', () => {
  const out = mes('2026-10-01', '2026-11-01');
  assert.equal(out.inicial, 1500);
  assert.equal(out.final, 1800);
});
teste('só as contas escolhidas', () => {
  const p = projecaoDoMes({ pagos, abertos, contas: [contas[1]], inicio: '2026-12-01', fim: '2027-01-01', hoje });
  assert.equal(p.inicial, 400);
  assert.equal(p.final, 1400);
});
teste('fatura do cartão a pagar entra quando pedido', () => {
  const faturas = [{ id: 'fatura:k', virtual: 'fatura', tipo: 'saida', valor: 250, vencimento: '2026-12-10', conta_id: null }];
  assert.equal(mes('2026-12-01', '2027-01-01', { faturas }).final, 2050);
  const com = mes('2026-12-01', '2027-01-01', { faturas, comFaturas: true });
  assert.equal(com.saidas, 650);
  assert.equal(com.final, 1800);
});
teste('transferência entre contas escolhidas não muda nada; para uma conta de fora, sai', () => {
  const t = [
    aberto('t1', 'din', 'saida', 300, '2026-12-02', { transferencia: 'x', transferencia_conta_id: 'nu' }),
    aberto('t2', 'nu', 'entrada', 300, '2026-12-02', { transferencia: 'x', transferencia_conta_id: 'din' }),
  ];
  const ambas = projecaoDoMes({ pagos, abertos: [...abertos, ...t], contas, inicio: '2026-12-01', fim: '2027-01-01', hoje });
  assert.equal(ambas.final, 2050);
  assert.equal(ambas.saidas, 400);
  const so = projecaoDoMes({ pagos, abertos: [...abertos, ...t], contas: [contas[0]], inicio: '2026-12-01', fim: '2027-01-01', hoje });
  assert.equal(so.saidas, 700);
});

// Exemplo do pedido: janeiro termina com 5.000; fevereiro recebe 3.000 e gasta 6.500; termina com 1.500, que é o início de março
{
  const hj = '2027-01-10';
  const cs = [{ id: 'c', saldo_inicial: 5000 }];
  const fev = [aberto('r', 'c', 'entrada', 3000, '2027-02-05'), aberto('d', 'c', 'saida', 6500, '2027-02-20')];
  const proj = (ini, fim, abertosX = fev) => projecaoDoMes({ pagos: [], abertos: abertosX, contas: cs, inicio: ini, fim, hoje: hj });
  teste('exemplo do pedido: fevereiro herda os 5.000 de janeiro e termina com 1.500', () => {
    assert.equal(proj('2027-01-01', '2027-02-01').final, 5000);
    const f = proj('2027-02-01', '2027-03-01');
    assert.deepEqual([f.inicial, f.entradas, f.saidas, f.final], [5000, 3000, 6500, 1500]);
    assert.equal(proj('2027-03-01', '2027-04-01').inicial, 1500);
  });
  teste('mudar um mês anterior atualiza os seguintes (sem somar duas vezes)', () => {
    const comMais = [...fev, aberto('j', 'c', 'saida', 1000, '2027-01-25')];
    assert.equal(proj('2027-02-01', '2027-03-01', comMais).inicial, 4000);
    assert.equal(proj('2027-03-01', '2027-04-01', comMais).inicial, 500);
    // abrir o mesmo mês várias vezes dá sempre o mesmo número
    assert.equal(proj('2027-03-01', '2027-04-01').inicial, 1500);
  });
  teste('mês sem lançamentos só repassa o saldo', () => {
    const a = proj('2027-04-01', '2027-05-01');
    assert.deepEqual([a.inicial, a.entradas, a.saidas, a.final], [1500, 0, 0, 1500]);
  });
}

if (falhas) { console.log(`\n${falhas} teste(s) falharam`); process.exit(1); }
console.log('\nTodos os testes passaram');
