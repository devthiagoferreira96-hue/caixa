// Testes da importação da planilha de produção (CONTROLE ANUAL / SAFRAS). Rodar: node tests/safras.test.js
import assert from 'node:assert/strict';
import { webcrypto } from 'node:crypto';
if (!globalThis.crypto) globalThis.crypto = webcrypto;
import { lerSafras, entregasDosBlocos, montarImportacaoSafras, chaveProdutor, nomeProdutor, safraDe, dataCelula, numeroCelula } from '../src/modulos/resina/importar-safras.js';

let falhas = 0;
const teste = (nome, fn) => {
  try { fn(); console.log(`ok   ${nome}`); } catch (e) { falhas++; console.log(`FALHOU ${nome}\n     ${e.message}`); }
};

// datas do Excel: 45898 = 29/08/2025; 45922 = 22/09/2025; 44774 = 01/08/2022; 46041 = 19/01/2026
const linhas = [];
const por = (r, c, v) => { (linhas[r] ||= [])[c] = v; };
// faixa 1: MARCOS (safras 22/23 em A e 25/26 em E)
por(0, 0, 'PRODUÇÃO SAFRA AGO/22 - AGO/23'); por(0, 4, 'PRODUÇÃO SAFRA AGO/25 - AGO/26');
por(2, 0, 'MARCOS'); por(2, 4, 'MARCOS');
['DATA', 'TBS', 'PESO - KG'].forEach((t, i) => { por(3, i, t); por(3, 4 + i, t); });
por(4, 0, 44774); por(4, 1, 40); por(4, 2, 8296);
por(4, 4, 45898); por(4, 5, 19); por(4, 6, 3765);
por(5, 4, 45922); por(5, 5, 30); por(5, 6, 6020);
por(7, 0, 'TOTAL'); por(7, 1, 40); por(7, 4, 'TOTAL');
// faixa 2: PEDRO E PAULO (nome individual na 4ª coluna)
por(10, 0, 'PRODUÇÃO SAFRA AGO/22 - AGO/23');
por(12, 0, 'PEDRO E PAULO');
['DATA', 'TBS', 'PESO - KG'].forEach((t, i) => por(13, i, t));
por(14, 0, 44774); por(14, 1, 18.5); por(14, 2, 3837); por(14, 3, 'PEDRO');
por(15, 0, 44774); por(15, 1, 18.5); por(15, 2, 3837); por(15, 3, 'PAULO');
por(16, 0, 46041); por(16, 1, 107); por(16, 2, 21161); por(16, 3, 'ACORDO LUCAS');
por(17, 0, 45898); por(17, 1, 53); por(17, 2, 11100);
por(19, 0, 'TOTAL');
// faixa 3: BEATRIZ - RENATO, sem nomes ao lado
por(22, 0, 'BEATRIZ - RENATO');
['DATA', 'TBS', 'PESO - KG'].forEach((t, i) => por(23, i, t));
por(24, 0, 45898); por(24, 1, 19); por(24, 2, 3765);
por(25, 0, 'TOTAL');

const abas = [
  { nome: 'SAFRAS (2)', linhas },
  { nome: 'SAFRAS', linhas: linhas.slice(0, 8) }, // cópia de parte da outra aba (como na planilha real)
  { nome: 'Planilha1', linhas: [['CONTROLE DE CARGA ANUAL'], [], ['JANEIRO', 2023, 2024]] },
];

teste('números e datas da planilha', () => {
  assert.equal(numeroCelula('5.190'), 5190);
  assert.equal(numeroCelula('3803,5'), 3803.5);
  assert.equal(numeroCelula(28.5), 28.5);
  assert.equal(dataCelula(45898), '2025-08-29');
  assert.equal(dataCelula('12/08/24'), '2024-08-12');
});
teste('safra vai de agosto a julho', () => {
  assert.equal(safraDe('2025-08-01'), '2025/2026');
  assert.equal(safraDe('2026-07-31'), '2025/2026');
});
const lido = lerSafras(abas);
teste('acha os blocos lado a lado e um embaixo do outro', () => {
  assert.deepEqual(lido.blocos.map((b) => [b.aba, b.produtor, b.safra, b.linhas.length]), [
    ['SAFRAS (2)', 'MARCOS', '2022/2023', 1], ['SAFRAS (2)', 'MARCOS', '2025/2026', 2],
    ['SAFRAS (2)', 'PEDRO E PAULO', '2022/2023', 4], ['SAFRAS (2)', 'BEATRIZ - RENATO', null, 1],
    ['SAFRAS', 'MARCOS', '2022/2023', 1], ['SAFRAS', 'MARCOS', '2025/2026', 2],
  ]);
});
teste('reconhece a aba de resumo anual (não importa)', () => assert.deepEqual(lido.resumos, ['Planilha1']));
teste('nomes de produtor', () => {
  assert.equal(chaveProdutor('BEATRIZ - RENATO'), chaveProdutor('Beatriz e Renato'));
  assert.equal(nomeProdutor('BEATRIZ - RENATO'), 'Beatriz - Renato');
  assert.equal(nomeProdutor('PEDRO E PAULO'), 'Pedro e Paulo');
});
const entregas = entregasDosBlocos(lido.blocos);
teste('linha com nome vai para quem está escrito', () => {
  const dia = entregas.filter((e) => e.data === '2022-08-01' && e.chave !== 'MARCOS');
  assert.deepEqual(dia.map((e) => [e.produtor, e.tbs, e.kg]), [['PEDRO', 18.5, 3837], ['PAULO', 18.5, 3837]]);
});
teste('linha sem nome no bloco de dois: meio a meio (Tbs com meio tambor)', () => {
  const dia = entregas.filter((e) => e.data === '2025-08-29' && /PEDRO|PAULO/.test(e.chave));
  assert.deepEqual(dia.map((e) => [e.produtor, e.tbs, e.kg]), [['PEDRO', 26.5, 5550], ['PAULO', 26.5, 5550]]);
});
teste('anotação no lugar do nome também divide e vira observação', () => {
  const dia = entregas.filter((e) => e.data === dataCelula(46041));
  assert.deepEqual(dia.map((e) => [e.produtor, e.tbs, e.kg, e.obs]), [['PEDRO', 53.5, 10580.5, 'ACORDO LUCAS'], ['PAULO', 53.5, 10580.5, 'ACORDO LUCAS']]);
});
teste('bloco "BEATRIZ - RENATO" sem nomes ao lado é um produtor só', () =>
  assert.deepEqual(entregas.filter((e) => e.chave === chaveProdutor('Beatriz e Renato')).map((e) => e.produtor), ['BEATRIZ - RENATO']));

const vazio = { produtores: [], cargas: [], itensPorCarga: new Map(), precos: [{ inicio: '2025-01-01', valor_kg: 4.6 }] };
const plano = montarImportacaoSafras(lido.blocos, {}, vazio);
teste('cria os produtores da planilha', () =>
  assert.deepEqual(plano.produtoresNovos.map((p) => p.nome).sort(), ['Beatriz - Renato', 'Marcos', 'Paulo', 'Pedro']));
teste('linhas repetidas entre as abas entram uma vez só', () => assert.equal(plano.duplicadasNoArquivo, 3));
teste('uma carga por dia, com todos os produtores do dia', () => {
  const c = plano.cargas.find((x) => x.carga.data === '2025-08-29');
  assert.equal(c.itens.length, 4); // Marcos, Pedro, Paulo, Beatriz - Renato
  assert.equal(c.carga.peso_chegada, 3765 + 11100 + 3765);
  assert.equal(c.itens.reduce((s, i) => s + i.tbs, 0), 19 + 53 + 19);
  assert.ok(c.itens.every((i) => i.kg_manual > 0), 'kg de cada produtor guardado');
});
teste('carga de um produtor só não precisa de kg manual', () => {
  const c = plano.cargas.find((x) => x.carga.data === '2025-09-22');
  assert.deepEqual([c.itens.length, c.itens[0].kg_manual, c.carga.peso_chegada], [1, null, 6020]);
});
teste('preço do kg vem da tabela de preços da data', () => {
  assert.equal(plano.cargas.find((x) => x.carga.data === '2025-08-29').carga.preco_kg, 4.6);
  assert.equal(plano.cargas.find((x) => x.carga.data === '2022-08-01').carga.preco_kg, 0);
});
teste('produtor que já existe é usado (mesmo escrito diferente)', () => {
  const beatriz = { id: 'p-adr', nome: 'Beatriz e Renato', arrendamento: 55 };
  const p = montarImportacaoSafras(lido.blocos, {}, { ...vazio, produtores: [beatriz] });
  assert.ok(!p.produtoresNovos.some((x) => /beatriz/i.test(x.nome)));
  const item = p.cargas.flatMap((c) => c.itens).find((i) => i.produtor_id === 'p-adr');
  assert.equal(item.arrendamento, 55);
});
teste('importar de novo não duplica (mesmo dia, produtor e Tbs)', () => {
  const produtores = plano.produtoresNovos;
  const cargas = plano.cargas.map((c, i) => ({ id: `c${i}`, ...c.carga }));
  const itensPorCarga = new Map(plano.cargas.map((c, i) => [`c${i}`, c.itens]));
  const de = montarImportacaoSafras(lido.blocos, {}, { ...vazio, produtores, cargas, itensPorCarga });
  assert.deepEqual([de.total, de.produtoresNovos.length, de.repetidas], [0, 0, plano.entregas]);
});

console.log(falhas ? `\n${falhas} teste(s) falharam` : '\nTodos os testes passaram');
process.exit(falhas ? 1 : 0);
