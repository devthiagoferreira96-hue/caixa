// Testes das regras de negócio (faturas, parcelas, datas, valores e somas).
// Rode com: npm test
import { faturaDe, vencimentoFatura, dividirParcelas, parcelasDaCompra } from '../src/lib/faturas.js';
import { somarMeses, lerValor, valorParaCampo, brl, esc, diasAte, quandoVence, somarDias, nomeMes } from '../src/lib/format.js';
import { PALETAS, calcularTema, contraste, oklch, hexDe, coresDasPreferencias } from '../src/lib/temas.js';
import { calcularCarga, diferencaDePeso, precoNaData, proximoNumero, codigoCarga, resumoDasCargas, linhasContaCorrente, extratoContaCorrente, comparativoInsumos, totalDoInsumo, pctDoProdutor, parteDoProdutor, divisaoDaEntrega, divisaoPorConta, creditosDoCaixa, aReceberPorConta } from '../src/modulos/resina/calculos.js';
import { numeroBR, dataDaCelula, lerPlanilhaConta, entenderLinha, produtorDaLinha, produtoParecido, montarImportacao } from '../src/modulos/resina/importar-conta.js';
import { proximasDatas, completarLancamentos, completarAssinaturas, limiteRecorrencia, mesesEntre, SEMANAL, mudancasNaSequencia } from '../src/lib/recorrencia.js';
import { gastosPorCategoria, itensDaCategoria, saidasReais, totalDoCartao, resumoPorArea, entradasPorCategoria, situacaoFatura, dividirAjustes, saldoAoFimDoDia, faturasAPagar, entradas, transferenciasDeFora } from '../src/lib/calculos.js';
let ok=0, falhas=[];
const t=(nome, obtido, esperado)=>{ const a=JSON.stringify(obtido), b=JSON.stringify(esperado); a===b?ok++:falhas.push(`${nome}: obtido ${a}, esperado ${b}`); };
const MP={dia_fechamento:3,dia_vencimento:10}, VIRA={dia_fechamento:25,dia_vencimento:5}, F31={dia_fechamento:31,dia_vencimento:10}, IGUAL={dia_fechamento:10,dia_vencimento:10};
t('antes do fechamento',faturaDe(MP,'2026-11-02'),'2026-11-01');
t('no dia do fechamento',faturaDe(MP,'2026-11-03'),'2026-12-01');
t('depois do fechamento',faturaDe(MP,'2026-11-04'),'2026-12-01');
t('virada de ano',faturaDe(MP,'2026-12-20'),'2027-01-01');
t('parcela 10 vira ano',faturaDe(MP,'2026-11-04',9),'2027-09-01');
t('vence mes seguinte, antes fech',faturaDe(VIRA,'2026-11-20'),'2026-12-01');
t('vence mes seguinte, depois fech',faturaDe(VIRA,'2026-11-26'),'2027-01-01');
t('fecha 31 em mes de 30 dias (30/11 = fechamento)',faturaDe(F31,'2026-11-30'),'2027-01-01');
t('fecha 31, 29/11 antes',faturaDe(F31,'2026-11-29'),'2026-12-01');
t('fecha 31, 31/12 = fechamento',faturaDe(F31,'2026-12-31'),'2027-02-01');
t('fecha 31, 28/02 = fechamento',faturaDe(F31,'2027-02-28'),'2027-04-01');
t('fecha 30, 28/02/2028 bissexto antes',faturaDe({dia_fechamento:30,dia_vencimento:10},'2028-02-28'),'2028-03-01');
t('fech = venc',faturaDe(IGUAL,'2026-11-09'),'2026-12-01');
t('venc dia 31 em fev',vencimentoFatura({dia_vencimento:31},'2027-02-01'),'2027-02-28');
t('venc dia 31 em fev bissexto',vencimentoFatura({dia_vencimento:31},'2028-02-01'),'2028-02-29');
for (const [tot,n] of [[100,3],[1200,6],[0.1,3],[99999999.99,48],[159.9,2],[0.05,4]]) {
  const p=dividirParcelas(tot,n); t(`soma parcelas ${tot}/${n}`, Math.round(p.reduce((a,b)=>a+b,0)*100)/100, tot); t(`qtd parcelas ${tot}/${n}`,p.length,n);
  t(`sem parcela negativa ${tot}/${n}`, p.every(v=>v>=0), true);
}
t('31/jan + 1 mes',somarMeses('2026-01-31',1),'2026-02-28');
t('31/jan + 2 meses (sem acumular)',somarMeses('2026-01-31',2),'2026-03-31');
t('dez + 1',somarMeses('2026-12-15',1),'2027-01-15');
t('lerValor br',lerValor('1.234,56'),1234.56);
t('lerValor ponto',lerValor('1234.56'),1234.56);
t('lerValor vazio',Number.isNaN(lerValor('')),true);
t('lerValor R$',lerValor('R$ 12,90'),12.9);
t('valorParaCampo 0',valorParaCampo(0),'');
t('esc xss',esc('<img src=x onerror="a">'),'&lt;img src=x onerror=&quot;a&quot;&gt;');
t('quandoVence hoje',quandoVence(somarDias(0)),'vence hoje');
t('quandoVence -3',quandoVence(somarDias(-3)),'venceu há 3 dias');
// calculos
const ls=[{tipo:'saida',valor:100,categoria_id:1},{tipo:'saida',valor:50,categoria_id:2,fatura_cartao_id:9},{tipo:'entrada',valor:999,categoria_id:1},{tipo:'saida',valor:'20.50',categoria_id:null}];
const ps=[{valor:30,numero:1,compra:{categoria_id:1,cartao_id:7,data_compra:'2026-11-01',descricao:'x',qtd_parcelas:2}}];
const g=gastosPorCategoria(ls,ps);
t('gasto cat1 (caixa+cartao, sem entrada)',g.get(1),130);
t('pagamento fatura nao conta',g.get(2),undefined);
t('sem categoria',g.get(null),20.5);
t('itens cat1',itensDaCategoria(1,ls,ps).length,2);
t('total cartao',totalDoCartao(ps,7),30);
// resultado por área (casa x fazenda)
const area=(id)=>id===1?'Fazenda':'Casa';
const ar=resumoPorArea(ls,ps,area,['Casa','Fazenda','Empresa']);
t('fazenda entradas',ar.Fazenda.entradas,999);
t('fazenda gastos (caixa+cartão)',ar.Fazenda.gastos,130);
t('fazenda resultado',ar.Fazenda.resultado,869);
t('casa gastos (sem pagamento de fatura)',ar.Casa.gastos,20.5);
t('empresa vazia',ar.Empresa.movimentos,0);
t('soma das áreas = geral',ar.Casa.resultado+ar.Fazenda.resultado+ar.Empresa.resultado,999-130-20.5);
t('entradas por categoria',entradasPorCategoria(ls).get(1),999);
// temas de cores
t('contraste preto/branco',Math.round(contraste('#000000','#FFFFFF')),21);
t('volta da conversão de cor',hexDe(...oklch('#123A63')),'#123a63');
for (const [id,pal] of Object.entries(PALETAS)) {
  const {variaveis}=calcularTema(pal.cores);
  t(`${id}: botão legível`,contraste(variaveis['--color-brand-600'],'#FFFFFF')>=4.5,true);
  t(`${id}: texto legível no quadro`,contraste(variaveis['--color-texto'],pal.cores.cartao)>=4.5,true);
  t(`${id}: texto de apoio legível no quadro`,contraste(variaveis['--color-stone-600'],pal.cores.cartao)>=4.5,true);
  t(`${id}: saída legível no quadro`,contraste(variaveis['--color-saida'],pal.cores.cartao)>=4.5,true);
}
t('verde: sem avisos',calcularTema(PALETAS.verde.cores).avisos.length,0);
t('navy: mantém as cores pedidas',calcularTema(PALETAS.navy.cores).variaveis['--color-brand-600'],'#123A63');
t('cobre: avisa que escureceu o botão',calcularTema(PALETAS.cobre.cores).avisos.length,1);
const ruim=calcularTema({principal:'#FFFF00',destaque:'#FFFF00',fundo:'#FFFFFF',cartao:'#FFFFFF',texto:'#FFFFFF'});
t('cores ruins: texto ajustado',contraste(ruim.variaveis['--color-texto'],'#FFFFFF')>=4.5,true);
t('cores ruins: avisos',ruim.avisos.length,3);
t('preferência inválida volta ao padrão',coresDasPreferencias({paleta:'personalizada',cores:{principal:'azul'}}),PALETAS.verde.cores);

// módulo Resina: carga, kg por Tbs, kg digitado, arrendamento e diferença de peso
{
  const carga = { preco_kg: 5.1, peso_fazenda: 3130, peso_chegada: 3085, peso_base: 'chegada' };
  const itens = [{ produtor_id: 'a', tbs: 12, arrendamento: 45 }, { produtor_id: 'b', tbs: 9, arrendamento: 40 }];
  const r = calcularCarga(carga, itens);
  t('resina: peso que vale (chegada)', r.peso, 3085);
  t('resina: soma dos kg = peso', Math.round(r.totais.kg * 100) / 100, 3085);
  t('resina: kg do produtor pelos Tbs', Math.round(r.itens[0].kg * 100) / 100, Math.round(3085 * 12 / 21 * 100) / 100);
  t('resina: valor = kg × preço', r.itens[0].valor, Math.round(3085 * 12 / 21 * 5.1 * 100) / 100);
  t('resina: arrendamento 45%', r.itens[0].arrendamento, Math.round(r.itens[0].valor * 0.45 * 100) / 100);
  t('resina: produtor + arrendamento = valor', Math.round((r.itens[0].produtor + r.itens[0].arrendamento) * 100) / 100, r.itens[0].valor);
  t('resina: total = soma das partes', Math.round((r.totais.produtor + r.totais.arrendamento) * 100) / 100, r.totais.valor);
  t('resina: diferença em kg', r.diferenca.kg, -45);
  t('resina: diferença em reais', r.diferenca.valor, 229.5);
  t('resina: diferença em %', Math.round(r.diferenca.pct * 100) / 100, -1.44);
  t('resina: peso da fazenda quando marcado', calcularCarga({ ...carga, peso_base: 'fazenda' }, itens).peso, 3130);
  t('resina: sem avisos', r.avisos, []);
  // kg digitado à mão: o resto do peso vai para os outros
  const m = calcularCarga(carga, [{ ...itens[0], kg_manual: 2000 }, itens[1]]);
  t('resina: kg manual fica', m.itens[0].kg, 2000);
  t('resina: resto para os outros', m.itens[1].kg, 1085);
  t('resina: manual marcado', m.itens[0].manual, true);
  t('resina: manual passa do peso', calcularCarga(carga, [{ ...itens[0], kg_manual: 4000 }, itens[1]]).avisos[0].tipo, 'manual-passa');
  t('resina: todos manuais com soma diferente', calcularCarga(carga, [{ ...itens[0], kg_manual: 1000 }, { ...itens[1], kg_manual: 1000 }]).avisos[0].tipo, 'soma-diferente');
  t('resina: todos manuais batendo', calcularCarga(carga, [{ ...itens[0], kg_manual: 2000 }, { ...itens[1], kg_manual: 1085 }]).avisos, []);
  t('resina: sem peso', calcularCarga({ preco_kg: 5, peso_base: 'chegada' }, itens).avisos[0].tipo, 'sem-peso');
  t('resina: sem peso, kg zerado', calcularCarga({ preco_kg: 5, peso_base: 'chegada' }, itens).totais.kg, 0);
  t('resina: um peso só, sem diferença', diferencaDePeso({ peso_fazenda: 100, peso_chegada: null }), null);
  t('resina: sem itens', calcularCarga(carga, []).totais, { tbs: 0, kg: 0, valor: 0, arrendamento: 0, produtor: 0 });
  t('resina: 0% e 100% de arrendamento', calcularCarga(carga, [{ produtor_id: 'a', tbs: 1, arrendamento: 0 }, { produtor_id: 'b', tbs: 1, arrendamento: 100 }]).itens.map((i) => i.produtor === i.valor ? 'tudo' : i.produtor === 0 ? 'nada' : 'parte'), ['tudo', 'nada']);
  // preço do kg por data e número das cargas
  const precos = [{ inicio: '2026-01-01', valor_kg: 4.8 }, { inicio: '2026-09-15', valor_kg: 5.1 }];
  t('resina: preço antes de mudar', precoNaData(precos, '2026-09-14').valor_kg, 4.8);
  t('resina: preço no dia que muda', precoNaData(precos, '2026-09-15').valor_kg, 5.1);
  t('resina: sem preço antes do primeiro', precoNaData(precos, '2025-12-31'), null);
  const cargas = [{ data: '2026-03-01', numero: 7 }, { data: '2025-12-30', numero: 40 }];
  t('resina: próximo número do ano', proximoNumero(cargas, '2026-11-11'), 8);
  t('resina: ano novo começa do 1', proximoNumero(cargas, '2027-01-02'), 1);
  t('resina: código da carga', codigoCarga({ data: '2026-11-11', numero: 43 }), 'C-2026-0043');
  // resumo do mês por produtor
  const res = resumoDasCargas([{ id: 1, ...carga }, { id: 2, ...carga, peso_fazenda: null }], new Map([[1, itens], [2, [itens[0]]]]));
  t('resina: total de Tbs no mês', res.total.tbs, 33);
  t('resina: Tbs do produtor no mês', res.produtores.find((p) => p.produtor_id === 'a').tbs, 24);
  t('resina: cargas do produtor', res.produtores.find((p) => p.produtor_id === 'b').cargas, 1);
  t('resina: só conta diferença onde tem as duas pesagens', res.total.comDiferenca, 1);
}

// módulo Resina: conta corrente do arrendamento (uma linha por produtor; débito = a receber)
{
  const c1 = { id: 'c1', numero: 1, data: '2026-10-20', titular_id: 'cnpj', preco_kg: 5, peso_chegada: 2000, peso_base: 'chegada', nota: '123', destino: 'Usina X' };
  const c2 = { id: 'c2', numero: 2, data: '2026-11-05', titular_id: 'cnpj', preco_kg: 5, peso_chegada: 1000, peso_base: 'chegada' };
  const c3 = { id: 'c3', numero: 3, data: '2026-11-06', titular_id: 'cpf', preco_kg: 5, peso_chegada: 1000, peso_base: 'chegada' };
  const itens = new Map([
    ['c1', [{ produtor_id: 'a', tbs: 6, arrendamento: 40 }, { produtor_id: 'b', tbs: 4, arrendamento: 50 }]],
    ['c2', [{ produtor_id: 'a', tbs: 5, arrendamento: 40 }]],
    ['c3', [{ produtor_id: 'b', tbs: 5, arrendamento: 50 }]],
  ]);
  const movs = [
    { id: 'm1', titular_id: 'cnpj', tipo: 'credito', data: '2026-11-05', valor: 1500, criado_em: '2026-11-05T10:00' },
    { id: 'm2', titular_id: 'cpf', tipo: 'credito', data: '2026-11-10', valor: 99, criado_em: '2026-11-10T10:00' },
  ];
  const linhas = linhasContaCorrente([c2, c1, c3], itens, movs, 'cnpj');
  t('conta: uma linha por produtor e só da conta', linhas.length, 4);
  t('conta: em ordem de data (carga antes do lançamento no mesmo dia)', linhas.map((l) => l.carga_id || l.movimento.id), ['c1', 'c1', 'c2', 'm1']);
  const a1 = linhas[0];
  t('conta: kg do produtor', a1.kg, 1200);
  t('conta: média kg por tambor', a1.media, 200);
  t('conta: % arrendo é a porcentagem', a1.pct, 40);
  t('conta: débito = kg × R$ do kg × %', a1.debito, 6 * 1000 * 0.4);
  t('conta: nota e destino da carga', [a1.nota, a1.destino], ['123', 'Usina X']);
  const ext = extratoContaCorrente(linhas, '2026-11-01', '2026-12-01');
  t('conta: saldo anterior (só outubro, a receber)', ext.saldoAnterior, -(2400 + 2000));
  t('conta: débitos do mês', ext.debito, 2000);
  t('conta: créditos do mês', ext.credito, 1500);
  t('conta: saldo linha a linha', ext.linhas.map((l) => l.saldo), [-6400, -4900]);
  t('conta: saldo final', ext.saldoFinal, -4900);
  t('conta: saldo final = anterior + créditos − débitos', ext.saldoFinal, ext.saldoAnterior + ext.credito - ext.debito);
  const soA = extratoContaCorrente(linhas, '2026-11-01', '2026-12-01', 'a');
  t('conta: filtro por produtor', [soA.saldoAnterior, soA.debito, soA.credito], [-2400, 2000, 0]);
  t('conta: CPF separado do CNPJ', extratoContaCorrente(linhasContaCorrente([c1, c2, c3], itens, movs, 'cpf'), '2026-11-01', '2026-12-01').saldoFinal, -2500 + 99);
  t('conta: mês sem movimento mantém o saldo', extratoContaCorrente(linhas, '2026-12-01', '2027-01-01').saldoFinal, -4900);
}

// módulo Resina: insumos × produção (quem gasta mais insumo por kg de resina)
{
  t('insumo: total = quantidade × unitário', totalDoInsumo({ quantidade: 3, valor_unitario: 12.5 }), 37.5);
  t('insumo: total digitado vale', totalDoInsumo({ quantidade: 3, valor_unitario: 3.3333, valor_total: 10 }), 10);
  const produtores = [
    { produtor_id: 'a', cargas: 2, tbs: 20, kg: 4000, valor: 20000, arrendamento: 8000, produtor: 12000 },
    { produtor_id: 'b', cargas: 1, tbs: 10, kg: 1000, valor: 5000, arrendamento: 2500, produtor: 2500 },
  ];
  const insumos = [
    { produtor_id: 'a', produto_id: 'pasta', quantidade: 20, valor_unitario: 50 },  // 1000
    { produtor_id: 'b', produto_id: 'pasta', quantidade: 10, valor_unitario: 50 },  // 500
    { produtor_id: 'b', produto_id: 'saco', quantidade: 100, valor_unitario: 5 },   // 500
    { produtor_id: 'c', produto_id: 'saco', quantidade: 10, valor_unitario: 5 },    // 50, sem resina
  ];
  const c = comparativoInsumos(produtores, insumos);
  const L = (id) => c.linhas.find((l) => l.produtor_id === id);
  t('comp: gasto por produtor', [L('a').gasto, L('b').gasto, L('c').gasto], [1000, 1000, 50]);
  t('comp: insumo por kg', [L('a').custoPorKg, L('b').custoPorKg], [0.25, 1]);
  t('comp: média ponderada (só de quem entregou)', c.total.custoPorKg, 2000 / 5000);
  t('comp: b muito acima da média', [L('b').alerta, Math.round(L('b').vsMedia * 100)], ['acima', 150]);
  t('comp: a abaixo da média, sem alerta', L('a').alerta, null);
  t('comp: usou insumo sem entregar resina', L('c').alerta, 'sem-producao');
  t('comp: insumo em % do valor', L('b').pctDoValor, 20);
  t('comp: parte do produtor − insumos', [L('a').liquidoProdutor, L('b').liquidoProdutor, L('c').liquidoProdutor], [11000, 1500, -50]);
  t('comp: consumo por produto', [L('b').porProduto.get('pasta').quantidade, L('b').porProduto.get('saco').gasto], [10, 500]);
  t('comp: quem entregou mais vem primeiro', c.linhas.map((l) => l.produtor_id), ['a', 'b', 'c']);
  t('comp: sem insumos não dá alerta', comparativoInsumos(produtores, []).linhas.map((l) => l.alerta), [null, null]);
}

// módulo Resina: insumos entram na conta corrente como débito do produtor
{
  const ins = [{ id: 'i1', data: '2026-11-05', produtor_id: 'a', produto_id: 'pasta', titular_id: 'cnpj', quantidade: 10, valor_unitario: 12, valor_total: 120, criado_em: '1' },
    { id: 'i2', data: '2026-11-05', produtor_id: 'a', produto_id: 'pasta', titular_id: 'cpf', quantidade: 1, valor_unitario: 5, criado_em: '2' }];
  const ls = linhasContaCorrente([], new Map(), [], 'cnpj', ins);
  t('conta: insumo vira débito na conta dele', ls.map((l) => [l.tipo, l.debito, l.credito]), [['insumo', 120, 0]]);
  t('conta: insumo de outra conta fica de fora', linhasContaCorrente([], new Map(), [], 'cpf', ins).map((l) => l.debito), [5]);
  t('conta: saldo com insumo', extratoContaCorrente(ls, '2026-11-01', '2026-12-01').saldoFinal, -120);

  // parte do produtor: só o % dele entra como débito; o comparativo guarda o gasto cheio e o descontado
  const meio = [{ ...ins[0], pct_produtor: 50 }, { ...ins[0], id: 'i3', pct_produtor: 0, criado_em: '3' }];
  t('insumo: sem o campo, 100% do produtor', [pctDoProdutor(ins[0]), parteDoProdutor(ins[0])], [100, 120]);
  t('insumo: 50% do produtor', parteDoProdutor(meio[0]), 60);
  t('conta: só a parte do produtor vira débito (0% fica de fora)', linhasContaCorrente([], new Map(), [], 'cnpj', meio).map((l) => [l.debito, l.total, l.pct_produtor]), [[60, 120, 50]]);
  // "a receber" do Caixa: só o que já foi recebido vira crédito na conta corrente
  const cx = [
    { id: 'l1', tipo: 'entrada', valor: 60, pago: true, data_pagamento: '2026-11-20', vencimento: '2026-11-05', resina_receber_id: 'e1', resina_titular_id: 'cnpj', resina_produtor_id: 'a' },
    { id: 'l2', tipo: 'entrada', valor: 60, pago: false, vencimento: '2026-11-05', resina_receber_id: 'e2', resina_titular_id: 'cnpj' },
    { id: 'l3', tipo: 'entrada', valor: 99, pago: true, vencimento: '2026-11-05' },
  ];
  const cred = creditosDoCaixa(cx);
  t('caixa: só o a receber já recebido vira crédito', cred.map((m) => [m.tipo, m.valor, m.data, m.titular_id, m.produtor_id]), [['credito', 60, '2026-11-20', 'cnpj', 'a']]);
  t('caixa: recebido no Caixa zera o falta receber', aReceberPorConta([], new Map(), cred, meio, ['cnpj'], '2027-01-01')[0].aReceber, 0);
  t('conta: a receber com 50%', aReceberPorConta([], new Map(), [], meio, ['cnpj'], '2027-01-01')[0].aReceber, 60);
  // uma nota com vários produtores: cada produto tem o seu produtor e a sua %
  const nota = [
    { id: 'n1', entrega_id: 'e9', data: '2026-11-08', produtor_id: 'a', produto_id: 'arame', titular_id: 'cnpj', quantidade: 1, valor_unitario: 100, valor_total: 100, pct_produtor: 50, criado_em: '4' },
    { id: 'n2', entrega_id: 'e9', data: '2026-11-08', produtor_id: 'b', produto_id: 'pasta', titular_id: 'cnpj', quantidade: 1, valor_unitario: 300, valor_total: 300, pct_produtor: 30, criado_em: '5' },
    { id: 'n3', entrega_id: 'e9', data: '2026-11-08', produtor_id: 'a', produto_id: 'pasta', titular_id: 'cnpj', quantidade: 1, valor_unitario: 10, valor_total: 10, pct_produtor: 100, criado_em: '6' },
  ];
  t('nota com 2 produtores: divisão por produtor', divisaoDaEntrega(nota).map((d) => [d.produtor_id, d.total, d.parte, d.itens.length]), [['a', 110, 60, 2], ['b', 300, 90, 1]]);
  t('nota com 2 produtores: cada um com o seu débito na conta', linhasContaCorrente([], new Map(), [], 'cnpj', nota).map((l) => [l.produtor_id, l.debito]), [['a', 50], ['b', 90], ['a', 10]]);
  t('nota com 2 produtores: comparativo com o valor cheio de cada um', comparativoInsumos([], nota).linhas.map((l) => [l.produtor_id, l.gasto, l.descontado]).sort(), [['a', 110, 60], ['b', 300, 90]]);
  const cm = comparativoInsumos([{ produtor_id: 'a', cargas: 1, tbs: 1, kg: 100, valor: 500, arrendamento: 200, produtor: 300 }], meio);
  t('comp: gasto cheio, desconto só da parte dele', [cm.linhas[0].gasto, cm.linhas[0].descontado, cm.linhas[0].liquidoProdutor], [240, 60, 240]);
}

// módulo Resina: importar a planilha "Conta corrente arrendo"
{
  t('import: número brasileiro', [numeroBR('11.480'), numeroBR('3803,5'), numeroBR('R$ 4,60'), numeroBR('-1.234,56'), numeroBR(''), numeroBR(7)], [11480, 3803.5, 4.6, -1234.56, null, 7]);
  t('import: datas', [dataDaCelula(46049), dataDaCelula('27/01/26'), dataDaCelula('2026-01-27'), dataDaCelula('31/02/2026'), dataDaCelula('')], ['2026-01-27', '2026-01-27', '2026-01-27', null, null]);
  const cab = ['DATA', 'DESCRIÇÃO', 'NOTA', 'DESTINO CARGA', 'TAMBORES', '% ARRENDO', 'QUANTIDADE', 'UNI.', 'MÉDIA', 'R$ UNITARIO', 'CRÉDITO', 'DÉBITO', 'SALDO'];
  const abas = [{ nome: 'P', linhas: [['CONTA CORRENTE'], cab,
    [46049, '125 KG PASTA', 'NF 150 - VENC. 26/02', null, null, null, null, null, null, null, null, -500, 0],
    [46051, 'CARGA 57 TBS = 11.480 KG X R$ 4,60 X 55%', 'P.R. RENATO', null, 57],
    [46056, 'PIX VIA IN RESINAS', null, null, null, null, null, null, null, null, 2000],
    [46120, 'CARGA 62 TBS = 12.580 KG - SENDO 32 CARLOS E 30 NOSSO'],
    [46120, 'CARGA 32 TBS X 202,90 MEDIA X R$ 4,50 X 100% (NF 4,40 RECEBIDO A 4,50)', 'P.R. RENATO', null, 32],
    [46120, 'CARGA 30 TBS X 202,90 MEDIA X R$ 4,50 X 55%', 'P.R. RENATO', null, 30],
    [46250, '1 MIL SAQUINHOS SEM CONFECÇÃO'], [46250, '6,3KG ARAME'], [46250, '50% MÃO DE OBRA SAQUINHOS - PARTE MARIA'],
    [46260, '2 KG ARAME - BEATRIZ PAGOU - 50% PARTE MARIA', null, null, null, null, null, null, null, null, null, -80],
    [46315, 'CARGA 21 TBS X 202,08 MÉDIA X R$ 7,20 X 55%', null, null, 20],
    [null, 'TOTAL'],
  ] }];
  const lidas = lerPlanilhaConta(abas);
  t('import: acha a aba e as linhas', [lidas.length, lidas[0].linhas.length], [1, 11]);
  const L = lidas[0].linhas.map(entenderLinha);
  t('import: tipos', L.map((l) => l.tipo), ['insumo', 'carga', 'movimento', 'anotacao', 'carga', 'carga', 'insumo', 'insumo', 'movimento', 'insumo', 'carga']);
  t('import: insumo com valor do débito', [L[0].quantidade, L[0].unidade, L[0].produto, L[0].valor, L[0].unitario, L[0].nota], [125, 'kg', 'PASTA', 500, 4, 'NF 150 - VENC. 26/02']);
  t('import: carga com kg total', [L[1].tbs, L[1].kg, L[1].preco, L[1].pct], [57, 11480, 4.6, 55]);
  t('import: carga com média', [L[4].kg, L[4].pct, L[4].preco], [6492.8, 100, 4.5]);
  t('import: PIX com crédito na coluna', [L[2].tipoMov, L[2].valor], ['credito', 2000]);
  t('import: "1 MIL" e "6,3KG"', [L[6].quantidade, L[6].unidade, L[6].produto, L[7].quantidade, L[7].produto], [1000, 'un', 'SAQUINHOS SEM CONFECÇÃO', 6.3, 'ARAME']);
  t('import: "50% mão de obra" é lançamento', [L[8].tipo, L[8].tipoMov], ['movimento', '']);
  t('import: observação depois do traço', [L[9].produto, L[9].obs, L[9].valor], ['ARAME', 'BEATRIZ PAGOU - 50% PARTE MARIA', 80]);
  t('import: tambores diferentes viram aviso', [L[10].tbs, L[10].avisos.length], [20, 1]);
  const prods = [{ id: 'j', nome: 'Carlos' }, { id: 'n', nome: 'Nosso' }, { id: 'a', nome: 'Beatriz Souza' }];
  t('import: acha o produtor no texto', [produtorDaLinha(L[3], prods), produtorDaLinha(L[9], prods), produtorDaLinha(L[1], prods)], [null, 'a', null]);
  t('import: produto parecido do cadastro', [produtoParecido('PASTA', [{ id: 'x', nome: 'Pasta' }])?.id, produtoParecido('Sacos', [{ id: 's', nome: 'saco' }])?.id, produtoParecido('Arame', [])], ['x', 's', null]);

  const porLinha = Object.fromEntries(L.map((l) => [l.n, { produtor_id: l.tipo === 'movimento' ? null : 'n' }]));
  porLinha[L[4].n].produtor_id = 'j';
  const vazio = { cargas: [], itensPorCarga: new Map(), insumos: [], movimentos: [], produtos: [{ id: 'px', nome: 'Pasta', unidade: 'kg' }] };
  const p = montarImportacao(L, { titular_id: 'cnpj', porLinha, produtos: {} }, vazio);
  t('import: junta as linhas da mesma carga', p.cargas.map((c) => c.itens.map((i) => `${i.produtor_id}${i.tbs}@${i.arrendamento}`).join('+')), ['n57@55', 'j32@100+n30@55', 'n20@55']);
  t('import: peso da carga juntada', p.cargas[1].carga.peso_chegada, 12579.8);
  const conta = calcularCarga(p.cargas[1].carga, p.cargas[1].itens);
  t('import: cada produtor fica com a média dele', conta.itens.map((i) => Math.round(i.kg * 10) / 10), [6492.8, 6087]);
  t('import: insumos com valor entram, sem valor ficam pendentes', [p.insumos.length, p.pendentes.filter((x) => x.falta === 'valor').length], [2, 2]);
  t('import: usa o produto do cadastro e só cria os usados', [p.insumos[0].produto_id, p.produtosNovos.map((x) => x.nome)], ['px', ['Arame']]);
  t('import: PIX sem crédito/débito espera a escolha', p.pendentes.filter((x) => x.falta === 'tipo').length, 1);
  t('import: total', [p.movimentos.length, p.total], [1, 6]);

  // escolher crédito/débito e valor na conferência
  porLinha[L[8].n] = { tipoMov: 'debito', valor: 150 };
  const p2 = montarImportacao(L, { titular_id: 'cnpj', porLinha, produtos: {} }, vazio);
  t('import: escolha da pessoa vale', p2.movimentos.map((m) => [m.tipo, m.valor]), [['credito', 2000], ['debito', 150]]);
  porLinha[L[2].n] = { incluir: false };
  t('import: linha desmarcada fica de fora', montarImportacao(L, { titular_id: 'cnpj', porLinha, produtos: {} }, vazio).puladas.length, 1);

  // importar de novo não duplica
  porLinha[L[2].n] = {};
  const ja = {
    ...vazio,
    cargas: [{ id: 'c', data: '2026-01-29', titular_id: 'cnpj', preco_kg: 4.6 }], itensPorCarga: new Map([['c', [{ tbs: 57, arrendamento: 55 }]]]),
    movimentos: [{ data: '2026-08-16', titular_id: 'cnpj', tipo: 'debito', valor: 150, descricao: '50% MÃO DE OBRA SAQUINHOS - PARTE MARIA' }],
    insumos: [{ data: '2026-01-27', titular_id: 'cnpj', produtor_id: 'n', produto_id: 'px', quantidade: 125 }],
  };
  const p3 = montarImportacao(L, { titular_id: 'cnpj', porLinha, produtos: {} }, ja);
  t('import: não repete o que já está no sistema', [p3.repetidas.length, p3.cargas.length, p3.insumos.length, p3.movimentos.length], [3, 2, 1, 1]);
}

// Caixa: repetição "sempre" (todo mês / todo ano) e assinaturas no cartão
{
  t('rec: meses entre datas', [mesesEntre('2026-01-31', '2026-03-05'), mesesEntre('2026-11-10', '2027-02-01')], [2, 3]);
  t('rec: limite = 12 meses à frente', limiteRecorrencia(new Date(2026, 10, 17)), '2027-12-01');
  t('rec: próximas datas mensais (dia 31)', proximasDatas('2026-01-31', '2026-01-31', '2026-05-01').map((x) => x.data), ['2026-02-28', '2026-03-31', '2026-04-30']);
  t('rec: próximas datas semanais (virando o mês)', proximasDatas('2026-11-24', '2026-11-24', '2026-12-16', SEMANAL).map((x) => x.data), ['2026-12-01', '2026-12-08', '2026-12-15']);
  t('rec: semanal continua de onde parou', proximasDatas('2026-11-03', '2026-11-17', '2026-12-02', SEMANAL).map((x) => [x.indice, x.data]), [[3, '2026-11-24'], [4, '2026-12-01']]);
  {
    const sem = [{ id: 's1', tipo: 'saida', valor: 80, descricao: 'Feira', grupo: 'S', recorrente: true, recorrente_base: '2026-11-07', recorrente_ate: '2026-11-14', recorrente_intervalo: SEMANAL, vencimento: '2026-11-14', competencia: null }];
    t('rec: semanal completa toda semana', completarLancamentos(sem, '2026-12-01').novos.map((n) => n.vencimento), ['2026-11-21', '2026-11-28']);
    t('rec: semanal guarda o passo', completarLancamentos(sem, '2026-11-22').novos[0].recorrente_intervalo, SEMANAL);
  }
  t('rec: próximas datas anuais', proximasDatas('2026-03-10', '2026-03-10', '2029-01-01', 12).map((x) => x.data), ['2027-03-10', '2028-03-10']);
  t('rec: continua de onde parou', proximasDatas('2026-01-05', '2026-03-05', '2026-06-01').map((x) => [x.indice, x.data]), [[3, '2026-04-05'], [4, '2026-05-05']]);
  const base = { tipo: 'saida', valor: 100, descricao: 'Internet', categoria_id: 'c', conta_id: 'k', pessoa_id: null, grupo: 'g', recorrente: true, recorrente_base: '2026-11-10' };
  const ls = [{ ...base, id: '1', vencimento: '2026-11-10', recorrente_ate: '2026-12-10' }, { ...base, id: '2', vencimento: '2026-12-10', recorrente_ate: '2026-12-10' }];
  const r = completarLancamentos(ls, '2027-03-01');
  t('rec: completa os meses que faltam', r.novos.map((n) => n.vencimento), ['2027-01-10', '2027-02-10']);
  t('rec: novos ficam em aberto e no mesmo grupo', [r.novos[0].pago, r.novos[0].grupo, r.novos[0].valor, r.novos[0].recorrente], [false, 'g', 100, true]);
  t('rec: guarda até onde foi', r.atualizar.get('g'), '2027-02-10');
  // mês excluído com "só este" não volta (recorrente_ate já passou dele)
  const semDez = [{ ...ls[0], recorrente_ate: '2027-02-10' }];
  t('rec: mês excluído não volta', completarLancamentos(semDez, '2027-03-01').novos.length, 0);
  t('rec: parada não completa', completarLancamentos(ls.map((l) => ({ ...l, recorrente: false })), '2027-06-01').novos.length, 0);
  const anual = [{ ...base, id: '3', grupo: 'a', vencimento: '2026-03-10', recorrente_base: '2026-03-10', recorrente_ate: '2026-03-10', recorrente_intervalo: 12 }];
  t('rec: anual completa um por ano', completarLancamentos(anual, '2028-06-01').novos.map((n) => n.vencimento), ['2027-03-10', '2028-03-10']);
  const compra = { id: 'x', recorrente: true, valor_total: 39.9, recorrente_base: '2026-11-01', recorrente_ate: '2026-12-01' };
  const ps = new Map([['x', [{ fatura_mes: '2026-11-01' }, { fatura_mes: '2026-12-01' }]]]);
  const a = completarAssinaturas([compra], ps, '2027-03-01');
  t('rec: assinatura completa as faturas', a.novas.map((p) => [p.numero, p.valor, p.fatura_mes]), [[3, 39.9, '2027-01-01'], [4, 39.9, '2027-02-01']]);
  t('rec: assinatura atualiza a compra', a.atualizar.get('x'), { recorrente_ate: '2027-02-01', qtd_parcelas: 4 });
  t('rec: assinatura cancelada não completa', completarAssinaturas([{ ...compra, recorrente: false }], ps, '2027-06-01').novas.length, 0);
}

// Caixa: fatura com adiantamento e reembolso
{
  t('fatura: sem compras', situacaoFatura(0, []).estado, 'sem');
  t('fatura: em aberto', situacaoFatura(500, []).estado, 'aberta');
  const adi = situacaoFatura(500, [{ valor: 200, pago: true, adiantamento: true }]);
  t('fatura: adiantada em parte', [adi.estado, adi.pago, adi.falta], ['parcial', 200, 300]);
  t('fatura: adiantamento + restante = paga', situacaoFatura(500, [{ valor: 200, pago: true }, { valor: 300, pago: true }]).estado, 'paga');
  t('fatura: agendada', situacaoFatura(500, [{ valor: 500, pago: false }]).estado, 'agendada');
  t('fatura: reembolso maior que as compras', situacaoFatura(-40, []).estado, 'credito');
  const parcelas = [{ valor: 300, compra: { cartao_id: 'c', categoria_id: 'm' } }, { valor: -50, compra: { cartao_id: 'c', categoria_id: 'm', tipo: 'estorno' } }];
  t('fatura: reembolso abate o total', totalDoCartao(parcelas, 'c'), 250);
  t('fatura: reembolso abate a categoria', gastosPorCategoria([], parcelas).get('m'), 250);
}
// ---------- Editar "este e os próximos"
{
  const p = (n, extra = {}) => ({ id: `p${n}`, grupo: 'G', parcela: `${n}/4`, descricao: 'Geladeira', valor: 250, categoria_id: 'c1', conta_id: 'a1',
    vencimento: `2026-${String(9 + n).padStart(2, '0')}-10`, pago: n === 1, data_pagamento: n === 1 ? '2026-10-10' : null, competencia: null, ...extra });
  const grupo = [p(1), p(2), p(3), p(4)];
  const ed = { ...p(2), descricao: 'Geladeira nova', valor: 270, vencimento: '2026-11-15', pago: true, data_pagamento: '2026-11-15' };
  const m = mudancasNaSequencia(grupo[1], ed, grupo);
  const de = (id) => m.find((x) => x.id === id)?.valores;
  t('seq: a anterior não muda', de('p1'), undefined);
  t('seq: a editada leva tudo', [de('p2').descricao, de('p2').pago], ['Geladeira nova', true]);
  t('seq: as próximas levam descrição e valor', [de('p3').descricao, de('p4').valor], ['Geladeira nova', 270]);
  t('seq: o dia do vencimento anda junto', [de('p3').vencimento, de('p4').vencimento], ['2026-12-15', '2027-01-15']);
  t('seq: pago não passa para as próximas', 'pago' in de('p3') || 'data_pagamento' in de('p3'), false);
  t('seq: campo que não mudou não é tocado', 'categoria_id' in de('p3'), false);
  const rec = [{ id: 'r1', grupo: 'R', recorrente: true, recorrente_base: '2026-11-05', recorrente_ate: '2026-12-05', recorrente_intervalo: 1, vencimento: '2026-11-05', valor: 100, descricao: 'Net' },
    { id: 'r2', grupo: 'R', recorrente: true, recorrente_intervalo: 1, vencimento: '2026-12-05', valor: 100, descricao: 'Net' }];
  const mr = mudancasNaSequencia(rec[1], { ...rec[1], vencimento: '2026-12-08' }, rec);
  t('seq: na repetição sempre, a data-base segue o novo dia', mr.find((x) => x.id === 'r1').valores, { recorrente_base: '2026-11-08', recorrente_ate: '2026-12-08' });
  const sem = [{ id: 'w1', grupo: 'W', recorrente_intervalo: SEMANAL, vencimento: '2026-11-03', descricao: 'Diarista' }, { id: 'w2', grupo: 'W', recorrente_intervalo: SEMANAL, vencimento: '2026-11-10', descricao: 'Diarista' }];
  t('seq: semanal anda por dias', mudancasNaSequencia(sem[0], { ...sem[0], vencimento: '2026-11-04' }, sem)[1].valores.vencimento, '2026-11-11');
}

// ---------- Pagamento dividido entre contas, desconto/juros e competência na repetição
{
  const soma = (l, c) => Math.round(l.reduce((s, x) => s + Number(x[c] || 0), 0) * 100) / 100;
  const sem = dividirAjustes([{ conta_id: 'a', valor: 60 }, { conta_id: 'b', valor: 40 }], { desconto: null, juros: null });
  t('dividir: sem desconto/juros não marca nada', sem.map((p) => [p.desconto, p.juros, p.valor_original]), [[null, null, null], [null, null, null]]);
  const d = dividirAjustes([{ conta_id: 'a', valor: 60 }, { conta_id: 'b', valor: 30 }], { desconto: 10, juros: null });
  t('dividir: desconto na proporção', d.map((p) => p.desconto), [6.67, 3.33]);
  t('dividir: soma do desconto confere', soma(d, 'desconto'), 10);
  t('dividir: original = parte + desconto − juros', d.map((p) => p.valor_original), [66.67, 33.33]);
  t('dividir: soma dos originais = total original', soma(d, 'valor_original'), 100);
  const j = dividirAjustes([{ conta_id: 'a', valor: 0.1 }, { conta_id: 'b', valor: 0.1 }, { conta_id: 'c', valor: 0.1 }], { desconto: null, juros: 0.1 });
  t('dividir: juros em centavos sem sobrar', soma(j, 'juros'), 0.1);
  t('dividir: parte sem juros fica null', j.map((p) => p.juros), [0.03, 0.03, 0.04]);
  const comp = { tipo: 'saida', valor: 50, descricao: 'Luz', grupo: 'L', recorrente: true, recorrente_base: '2026-11-10', recorrente_ate: '2026-11-10', competencia: '2026-10-01', observacao: 'cód. 123' };
  const rc = completarLancamentos([{ ...comp, id: 'x', vencimento: '2026-11-10' }], '2027-02-01');
  t('rec: competência anda junto', rc.novos.map((n) => n.competencia), ['2026-11-01', '2026-12-01']);
  t('rec: observação acompanha', rc.novos.map((n) => n.observacao), ['cód. 123', 'cód. 123']);
  t('rec: sem competência continua null', completarLancamentos([{ ...comp, competencia: null, id: 'y', vencimento: '2026-11-10' }], '2027-01-01').novos[0].competencia, null);
}

// Ligação Resina → Caixa: arrendamento a receber por conta (Início)
{
  const c = { id: 'c1', data: '2026-11-02', numero: 1, titular_id: 'cnpj', preco_kg: 5, peso_base: 'chegada', peso_chegada: 1000 };
  const itens = new Map([['c1', [{ produtor_id: 'a', tbs: 5, arrendamento: 40 }]]]);
  const movs = [{ id: 'm', data: '2026-11-05', titular_id: 'cnpj', tipo: 'credito', valor: 500, criado_em: '1' }];
  const ins = [{ id: 'i', data: '2026-11-03', titular_id: 'cnpj', produtor_id: 'a', quantidade: 2, valor_unitario: 50, criado_em: '1' }];
  const r = aReceberPorConta([c], itens, movs, ins, ['cnpj', 'cpf'], '2026-11-18');
  t('ligação: a receber = arrendamento + insumos − recebido', r.map((x) => [x.titular_id, x.aReceber]), [['cnpj', 2000 + 100 - 500], ['cpf', 0]]);
  t('ligação: só até a data', aReceberPorConta([c], itens, movs, ins, ['cnpj'], '2026-11-03')[0].aReceber, 2000);
}
// Extrato: saldo das contas no fim de cada dia
{
  const contas = [{ id: 'a', saldo_inicial: 1000 }, { id: 'b', saldo_inicial: 200 }];
  const pagos = [
    { conta_id: 'a', tipo: 'saida', valor: 100, pago: true, vencimento: '2026-11-01', data_pagamento: '2026-11-03' },
    { conta_id: 'b', tipo: 'entrada', valor: 50.1, pago: true, vencimento: '2026-11-03' },
    { conta_id: 'a', tipo: 'saida', valor: 30.2, pago: true, vencimento: '2026-10-20', data_pagamento: '2026-10-20' },
    { conta_id: 'x', tipo: 'saida', valor: 999, pago: true, vencimento: '2026-11-02' },
  ];
  const r = saldoAoFimDoDia(['2026-11-05', '2026-11-02', '2026-11-03'], pagos, contas);
  t('saldo do dia: conta o que foi pago antes do mês e usa a data do pagamento', r.get('2026-11-02'), 1169.8);
  t('saldo do dia: no dia do pagamento', r.get('2026-11-03'), 1119.9);
  t('saldo do dia: dia sem movimento repete o saldo', r.get('2026-11-05'), 1119.9);
  t('saldo do dia: só a conta filtrada', saldoAoFimDoDia(['2026-11-03'], pagos, [contas[1]]).get('2026-11-03'), 250.1);
}
// Cartão: editar a compra refaz as parcelas; Extrato mostra a fatura a pagar no vencimento
{
  const C = { id: 'k', nome: 'Nubank', dia_fechamento: 3, dia_vencimento: 10 };
  t('editar compra: refaz parcelas', parcelasDaCompra(C, { data_compra: '2026-11-04', valor_total: 100, qtd_parcelas: 3 }),
    [{ numero: 1, valor: 33.33, fatura_mes: '2026-12-01' }, { numero: 2, valor: 33.33, fatura_mes: '2027-01-01' }, { numero: 3, valor: 33.34, fatura_mes: '2027-02-01' }]);
  t('editar compra: não traz de volta parcela excluída', parcelasDaCompra(C, { data_compra: '2026-11-04', valor_total: 90, qtd_parcelas: 3 }, new Set([1, 3])).map((p) => p.numero), [1, 3]);
  t('editar reembolso: valor negativo', parcelasDaCompra(C, { data_compra: '2026-11-01', valor_total: 20, qtd_parcelas: 1, tipo: 'estorno' }), [{ numero: 1, valor: -20, fatura_mes: '2026-11-01' }]);
  const C2 = { id: 'j', nome: 'Inter', dia_fechamento: 25, dia_vencimento: 5 };
  const ps = [{ valor: 300, compra: { cartao_id: 'k' } }, { valor: 50.5, compra: { cartao_id: 'k' } }, { valor: 80, compra: { cartao_id: 'j' } }];
  const adi = { fatura_cartao_id: 'k', fatura_mes: '2026-11-01', pago: true, valor: 100, adiantamento: true };
  const f = faturasAPagar([C, C2], ps, [adi], '2026-11-01', vencimentoFatura);
  t('extrato: fatura a pagar no vencimento, sem o adiantamento', f.map((x) => [x.id, x.vencimento, x.valor, x.adiantado, x.total]),
    [['fatura:k', '2026-11-10', 250.5, 100, 350.5], ['fatura:j', '2026-11-05', 80, 0, 80]]);
  t('extrato: fatura paga não aparece', faturasAPagar([C], ps, [{ ...adi, valor: 350.5, adiantamento: false }], '2026-11-01', vencimentoFatura), []);
  t('extrato: fatura agendada não aparece (o agendado já é lançamento)', faturasAPagar([C], ps, [{ ...adi, pago: false, adiantamento: false }], '2026-11-01', vencimentoFatura), []);
  t('extrato: cartão sem compras não aparece', faturasAPagar([{ ...C, id: 'z' }], ps, [], '2026-11-01', vencimentoFatura), []);
}
// ---------- Nota com vários produtores, cada um na sua conta (CNPJ ou CPF)
{
  const nota = [
    { produtor_id: 'a', titular_id: 'ca', valor_total: 825, pct_produtor: 50 },
    { produtor_id: 'b', titular_id: 'cb', valor_total: 200, pct_produtor: 30 },
    { produtor_id: 'a', titular_id: 'ca', valor_total: 100, pct_produtor: 100 },
  ];
  t('nota com 2 contas: cada produtor na sua conta', divisaoPorConta(nota).map((d) => [d.produtor_id, d.titular_id, d.parte]), [['a', 'ca', 512.5], ['b', 'cb', 60]]);
  const lin = (conta) => linhasContaCorrente([], new Map(), [], conta, nota.map((i, n) => ({ ...i, id: `i${n}`, data: '2026-11-13', produto_id: 'p' }))).map((l) => [l.produtor_id, l.debito]);
  t('conta corrente da conta A: só o produtor A', lin('ca'), [['a', 412.5], ['a', 100]]);
  t('conta corrente da conta B: só o produtor B', lin('cb'), [['b', 60]]);
}

// ---------- Transferência entre contas: muda o saldo das contas, mas não é gasto nem entrada
{
  const tr = [
    { id: 's', tipo: 'saida', valor: 200, conta_id: 'cc', transferencia: 'T1', transferencia_conta_id: 'esp', pago: true, vencimento: '2026-11-10', data_pagamento: '2026-11-10', categoria_id: null },
    { id: 'e', tipo: 'entrada', valor: 200, conta_id: 'esp', transferencia: 'T1', transferencia_conta_id: 'cc', pago: true, vencimento: '2026-11-10', data_pagamento: '2026-11-10', categoria_id: null },
  ];
  const outros = [
    { id: 'g', tipo: 'saida', valor: 50, conta_id: 'esp', pago: true, vencimento: '2026-11-11', data_pagamento: '2026-11-11', categoria_id: 'c1' },
    { id: 'v', tipo: 'entrada', valor: 300, conta_id: 'cc', pago: true, vencimento: '2026-11-11', data_pagamento: '2026-11-11', categoria_id: 'c2' },
  ];
  const todos = [...tr, ...outros];
  t('transferência: não é gasto', saidasReais(todos).map((l) => l.id), ['g']);
  t('transferência: não é entrada', entradas(todos).map((l) => l.id), ['v']);
  t('transferência: fora dos gastos por categoria', [...gastosPorCategoria(todos, []).entries()], [['c1', 50]]);
  const area = resumoPorArea(todos, [], () => 'Casa', ['Casa']).Casa;
  t('transferência: fora do resultado do mês', [area.entradas, area.gastos, area.resultado], [300, 50, 250]);
  const contas = [{ id: 'cc', saldo_inicial: 1000 }, { id: 'esp', saldo_inicial: 0 }];
  t('transferência: sai do saldo da conta de origem', saldoAoFimDoDia(['2026-11-10'], todos, [contas[0]]).get('2026-11-10'), 800);
  t('transferência: entra no saldo da conta de destino', saldoAoFimDoDia(['2026-11-10'], todos, [contas[1]]).get('2026-11-10'), 200);
  t('transferência: saldo total não muda', saldoAoFimDoDia(['2026-11-10'], todos, contas).get('2026-11-10'), 1000);
  t('transferência: sem filtro de conta, nenhuma conta nos totais', transferenciasDeFora(todos, []).length, 0);
  t('transferência: filtrando a origem, conta a saída', transferenciasDeFora(todos, ['cc']).map((l) => l.id), ['s']);
  t('transferência: filtrando as duas contas, uma anula a outra', transferenciasDeFora(todos, ['cc', 'esp']).length, 0);
}

console.log(`${ok} passaram, ${falhas.length} falharam`); falhas.forEach(f=>console.log(' FALHA',f));
if (falhas.length) process.exit(1);
