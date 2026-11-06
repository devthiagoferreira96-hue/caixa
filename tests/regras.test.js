// Testes das regras de negócio (faturas, parcelas, datas, valores e somas).
// Rode com: npm test
import { faturaDe, vencimentoFatura, dividirParcelas } from '../src/lib/faturas.js';
import { somarMeses, lerValor, valorParaCampo, brl, esc, diasAte, quandoVence, somarDias, nomeMes } from '../src/lib/format.js';
import { PALETAS, calcularTema, contraste, oklch, hexDe, coresDasPreferencias } from '../src/lib/temas.js';
import { gastosPorCategoria, itensDaCategoria, saidasReais, totalDoCartao, resumoPorArea, entradasPorCategoria } from '../src/lib/calculos.js';
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
console.log(`${ok} passaram, ${falhas.length} falharam`); falhas.forEach(f=>console.log(' FALHA',f));
if (falhas.length) process.exit(1);
