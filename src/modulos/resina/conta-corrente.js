// Conta corrente do arrendamento: uma conta para o CNPJ e outra para o CPF da proprietária.
// Débito = arrendamento de cada produtor em cada carga e os insumos descontados dele (o que ela tem para receber).
// Crédito = o que já foi recebido (lançado aqui). Saldo negativo = ainda falta receber.
import { brl, esc, dataCompleta, nomeMes, mesISO, hojeISO, lerValor, valorParaCampo, VALOR_MAXIMO, valorMaximoTexto } from '../../lib/format.js';
import { store } from '../../lib/store.js';
import { icone, estadoVazio, toast, confirmar, dialogo, mascaraDinheiro, erroNoCampo, limparErros, semRepetir } from '../../lib/ui.js';
import { desfazendo } from '../../components/lancamento.js';
import { entregar } from '../../components/backup.js';
import { todasAsCargas, lerMovimentos, movimentosComCaixa, salvarMovimento, excluirMovimento, insumosEntre } from './dados.js';
import { nomeProduto, quantidade, abrirEntrega } from './insumos.js';
import { importarQualquerPlanilha } from '../../components/importar.js';
import { camposRecebimento, ligarRecebimento, lerRecebimento, gravarRecebimento, desligar, lerLigacao, idsLigados } from './ligacao-caixa.js';

let ligados = { movimentos: new Set(), entregas: new Set() }; // o que já foi lançado no Caixa
import { linhasContaCorrente, extratoContaCorrente } from './calculos.js';
import { gerarExcelConta, descricaoDaLinha } from './exportar-conta.js';
import { gerarPdfConta } from './exportar-conta-pdf.js';
import { TIPOS_MOVIMENTO } from './tabelas.js';
import { numero, pct, quadro, bolinha, nomeProdutor, corProdutor, titular, nomeTitular, seDesligado } from './comum.js';

const SEM_CONTA = 'sem';
const filtro = { conta: null, produtor: '' }; // continua escolhido ao trocar de mês

/** Saldo em palavras: negativo = falta receber */
const situacao = (v) => (v < -0.004 ? 'Falta receber' : v > 0.004 ? 'Recebido a mais' : 'Em dia');
const corSaldo = (v) => (v < -0.004 ? 'text-amber-800 dark:text-amber-300' : 'text-brand-800 dark:text-brand-300');

export default {
  titulo: 'Conta corrente',
  usaMes: true,
  ajuda: `
    <p>A conta corrente do <strong>arrendamento</strong>, no mesmo formato da planilha da empresa. Existe uma conta para cada cadastro em <em>Cadastros &gt; Contas</em> (o CNPJ e o CPF da proprietária).</p>
    <p><strong>Débito</strong>: cada produtor de cada carga vira uma linha, e o débito é o arrendamento dele, ou seja, o que a proprietária tem para receber. Dos <strong>insumos</strong>, entra como débito só a parte cobrada do produtor (o % escolhido na entrega, por exemplo 50%). O resto fica com a proprietária.</p>
    <p><strong>Crédito</strong>: o que ela já recebeu. A parte do produtor nos insumos vira um "a receber" no Caixa: quando ele pagar, marque como recebido no <strong>Extrato</strong> e o crédito aparece aqui sozinho. Outros recebimentos, lance em <strong>Lançar recebimento</strong>. Ali também dá para lançar um valor a receber que não veio de carga.</p>
    <p><strong>Ligado ao Caixa</strong>: o recebimento pode entrar também como <strong>entrada</strong> numa conta do Caixa da Família (marque "Lançar também como entrada no Caixa"). Mudar ou excluir aqui muda ou exclui lá. As linhas lançadas no Caixa mostram "no Caixa".</p>
    <p><strong>Saldo</strong>: vem desde a primeira carga. Negativo quer dizer que ainda falta receber.</p>
    <p><strong>UNI.</strong> é o valor de um tambor (média de kg por tambor × preço do kg). Assim, débito = tambores × UNI. × % do arrendamento.</p>
    <p><strong>Exportar Excel</strong> gera a planilha do mês com as mesmas colunas da planilha da empresa, com o saldo em fórmula. <strong>Exportar PDF</strong> gera o mesmo movimento em PDF, com o resumo do mês em cima, bom para imprimir ou mandar para o produtor. Os dois respeitam a conta e o produtor escolhidos.</p>
    <p><strong>Importar planilha</strong> lê a planilha "Conta corrente arrendo" da empresa. Antes de gravar, mostra como cada linha foi entendida (carga, insumo ou PIX/lançamento) para você conferir e corrigir.</p>`,

  async render(el, ctx) {
    if (seDesligado(el)) return;
    const [{ cargas, itensPorCarga }, movimentos, insumos] = await Promise.all([todasAsCargas(), movimentosComCaixa(), insumosEntre('0000-01-01', '9999-12-31')]);
    if (!ctx.aindaAtual()) return;

    // contas que aparecem: as em uso, as que já têm dados e "Sem conta" se houver cargas sem conta
    const usadas = new Set([...cargas, ...movimentos, ...insumos].map((x) => x.titular_id));
    const contas = store.resina_titulares.filter((t) => t.ativo !== false || usadas.has(t.id)).map((t) => t.id);
    if (cargas.some((c) => !c.titular_id) || insumos.some((i) => !i.titular_id)) contas.push(SEM_CONTA);

    let aviso = '';
    if (!store.resina_titulares.length) {
      aviso = `<div class="card mx-auto w-full max-w-xl">${estadoVazio('Cadastre as contas da proprietária',
        'A conta corrente é separada por conta: uma para o CNPJ da empresa e outra para o CPF dela. Cadastre as duas e escolha a conta em cada carga.',
        `<a href="#resina-cadastros" class="btn-primario">${icone('cadastros')} Abrir os cadastros</a>`)}
        ${cargas.length ? '<p class="dica mt-3 text-center">As cargas já registradas aparecem como "Sem conta" até você escolher a conta nelas.</p>' : ''}</div>`;
      if (!cargas.length && !insumos.length) { el.innerHTML = `<div class="animate-entrar">${aviso}</div>`; return; }
    }
    if (!contas.includes(filtro.conta)) filtro.conta = contas[0] ?? null;
    if (filtro.produtor && !store.resina_produtores.some((p) => p.id === filtro.produtor)) filtro.produtor = '';

    const titularId = filtro.conta === SEM_CONTA ? null : filtro.conta;
    ligados = idsLigados();
    const todas = linhasContaCorrente(cargas, itensPorCarga, movimentos, titularId, insumos);
    const ext = extratoContaCorrente(todas, mesISO(store.mes), mesISO(store.mes, 1), filtro.produtor || null);
    const produtoresDaConta = [...new Set(todas.map((l) => l.produtor_id).filter(Boolean))]
      .sort((a, b) => nomeProdutor(a).localeCompare(nomeProdutor(b), 'pt-BR'));
    const nomeConta = (id) => (id === SEM_CONTA ? 'Sem conta' : titular(id)?.nome ?? 'Conta excluída');
    const mes = nomeMes(store.mes).toLowerCase();

    el.innerHTML = `<div class="grid gap-4 animate-entrar">
      ${aviso}
      <section class="card grid gap-3" aria-label="Escolher conta e produtor">
        <div class="flex flex-wrap items-end gap-3">
          ${contas.length > 1 ? `<div role="group" aria-label="Conta" class="flex flex-wrap gap-2">${contas.map((id) =>
            `<button type="button" class="${id === filtro.conta ? 'btn-primario' : 'btn-neutro'} min-h-10 px-4 py-2" data-conta="${id}" aria-pressed="${id === filtro.conta}">${esc(nomeConta(id))}</button>`).join('')}</div>`
          : `<p class="font-semibold">${esc(filtro.conta ? nomeConta(filtro.conta) : '')}</p>`}
          <div class="w-full sm:w-64"><label class="rotulo text-xs" for="cc-produtor">Produtor</label>
            <select id="cc-produtor" class="campo" data-produtor><option value="">Todos os produtores</option>${produtoresDaConta.map((id) =>
              `<option value="${id}" ${id === filtro.produtor ? 'selected' : ''}>${esc(nomeProdutor(id))}</option>`).join('')}</select></div>
          <span class="flex-1"></span>
          <div class="flex flex-wrap gap-2">
            ${filtro.conta && filtro.conta !== SEM_CONTA ? `<button type="button" class="btn-primario" data-lancar>${icone('mais')} Lançar recebimento</button>` : ''}
            <button type="button" class="btn-sec" data-exportar ${filtro.conta ? '' : 'disabled'}>${icone('planilha')} Exportar Excel</button>
            <button type="button" class="btn-sec" data-exportar-pdf ${filtro.conta ? '' : 'disabled'}>${icone('documento')} Exportar PDF</button>
            <button type="button" class="btn-neutro" data-importar>${icone('enviar')} Importar planilha</button>
          </div>
        </div>
        ${titularId && titular(titularId)?.documento ? `<p class="text-sm text-stone-600 dark:text-stone-400">${esc(nomeTitular(titularId))}</p>` : ''}
        ${filtro.conta === SEM_CONTA ? '<p class="rounded-xl bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:bg-amber-950/50 dark:text-amber-200">Estas cargas e insumos ainda não têm conta. Abra cada um e escolha a conta (CNPJ ou CPF).</p>' : ''}
      </section>

      <div class="grid grid-cols-2 gap-2 lg:grid-cols-4">
        ${quadro('Saldo anterior', `<span class="${corSaldo(ext.saldoAnterior)}">${brl(Math.abs(ext.saldoAnterior))}</span>`, `<p class="text-xs text-stone-600 dark:text-stone-400">${situacao(ext.saldoAnterior)}</p>`)}
        ${quadro(`Débitos de ${esc(mes.split(' ')[0])}`, brl(ext.debito), '<p class="text-xs text-stone-600 dark:text-stone-400">Arrendamento e insumos</p>')}
        ${quadro(`Créditos de ${esc(mes.split(' ')[0])}`, brl(ext.credito), '<p class="text-xs text-stone-600 dark:text-stone-400">Recebido</p>')}
        ${quadro('Saldo no fim do mês', `<span class="${corSaldo(ext.saldoFinal)}">${brl(Math.abs(ext.saldoFinal))}</span>`, `<p class="text-xs font-semibold ${corSaldo(ext.saldoFinal)}">${situacao(ext.saldoFinal)}</p>`)}
      </div>

      <section class="card p-0" aria-labelledby="t-extrato">
        <h2 id="t-extrato" class="card-titulo px-4 pt-4">Movimento de ${esc(mes)} <span class="text-sm font-normal text-stone-600 dark:text-stone-400">· valores em R$</span></h2>
        ${ext.linhas.length ? `
        <div class="hidden overflow-x-auto md:block">
          <table class="w-full min-w-[52rem] text-sm tabular-nums">
            <thead class="border-y border-stone-200 bg-stone-50 text-left text-xs uppercase text-stone-600 dark:border-stone-800 dark:bg-stone-800/50 dark:text-stone-400">
              <tr>${['Data', 'Descrição', 'Nota', 'Destino', 'Tbs', '% arr.', 'Quant.', 'Média', 'R$ unit.', 'Crédito', 'Débito', 'Saldo'].map((c, i) =>
                `<th scope="col" class="px-1.5 py-2 font-semibold ${i >= 4 ? 'text-right' : ''}">${c}</th>`).join('')}</tr>
            </thead>
            <tbody class="divide-y divide-stone-100 dark:divide-stone-800">
              <tr class="bg-stone-50/60 dark:bg-stone-800/30"><td class="px-1.5 py-2">${dataCompleta(mesISO(store.mes))}</td><td class="px-1.5 py-2 font-semibold" colspan="10">Saldo anterior</td><td class="whitespace-nowrap px-1.5 py-2 text-right font-semibold ${corSaldo(ext.saldoAnterior)}">${moeda(ext.saldoAnterior)}</td></tr>
              ${ext.linhas.map((l, i) => linhaTabela(l, i)).join('')}
            </tbody>
            <tfoot class="border-t-2 border-stone-200 font-semibold dark:border-stone-700">
              <tr><td class="px-1.5 py-2" colspan="9">Total do mês</td><td class="whitespace-nowrap px-1.5 py-2 text-right">${moeda(ext.credito)}</td><td class="whitespace-nowrap px-1.5 py-2 text-right">${moeda(ext.debito)}</td><td class="whitespace-nowrap px-1.5 py-2 text-right ${corSaldo(ext.saldoFinal)}">${moeda(ext.saldoFinal)}</td></tr>
            </tfoot>
          </table>
        </div>
        <ul class="grid gap-2 px-4 pb-4 md:hidden">${ext.linhas.map((l, i) => linhaCartao(l, i)).join('')}</ul>`
        : `<div class="px-4 pb-4">${estadoVazio('Nada nesta conta em ' + mes, 'As cargas desta conta, os insumos e os recebimentos lançados aparecem aqui.', filtro.conta && filtro.conta !== SEM_CONTA ? '<a href="#carga" class="btn-sec">Registrar carga</a>' : '')}</div>`}
      </section>
    </div>`;

    // ---------- eventos
    el.onchange = (e) => {
      if (e.target.matches('[data-produtor]')) { filtro.produtor = e.target.value; ctx.atualizar(); }
    };
    el.onclick = async (e) => {
      const b = e.target.closest('button');
      if (!b) return;
      if (b.dataset.conta) {
        filtro.conta = b.dataset.conta;
        filtro.produtor = '';
        await ctx.atualizar();
        document.querySelector(`[data-conta="${filtro.conta}"]`)?.focus();
      } else if (b.dataset.lancar !== undefined) {
        editarMovimento({ titular_id: titularId }, ctx);
      } else if (b.dataset.movimento) {
        editarMovimento(movimentos.find((m) => m.id === b.dataset.movimento), ctx);
      } else if (b.dataset.entrega) {
        abrirEntrega(insumos, b.dataset.entrega, ctx);
      } else if (b.dataset.importar !== undefined) {
        importarQualquerPlanilha(ctx.atualizar, { contaAtual: titularId });
      } else if (b.dataset.exportar !== undefined) {
        const conta = filtro.conta === SEM_CONTA ? 'Sem conta' : nomeTitular(titularId);
        const periodo = `${nomeMes(store.mes)}${filtro.produtor ? ` · ${nomeProdutor(filtro.produtor)}` : ''}`;
        try {
          const bytes = gerarExcelConta({ conta, periodo, inicio: mesISO(store.mes), extrato: ext, nomeProdutor, textoInsumo });
          const nome = `conta-corrente-${nomeConta(filtro.conta)}-${mesISO(store.mes).slice(0, 7)}.xlsx`.replace(/[\\/:*?"<>|\s]+/g, '-');
          const arquivo = new File([bytes], nome, { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
          if (await entregar(arquivo, 'Conta corrente')) toast(`Planilha gerada: ${nome}`);
        } catch { toast('Não foi possível gerar a planilha. Tente de novo.', { tipo: 'erro' }); }
      } else if (b.dataset.exportarPdf !== undefined) {
        const conta = filtro.conta === SEM_CONTA ? 'Sem conta' : nomeTitular(titularId);
        const produtor = filtro.produtor ? nomeProdutor(filtro.produtor) : '';
        try {
          const bytes = gerarPdfConta({ conta, periodo: nomeMes(store.mes), produtor, inicio: mesISO(store.mes), extrato: ext, nomeProdutor, textoInsumo });
          const nome = `conta-corrente-${nomeConta(filtro.conta)}${produtor ? `-${produtor}` : ''}-${mesISO(store.mes).slice(0, 7)}.pdf`.replace(/[\\/:*?"<>|\s]+/g, '-');
          const arquivo = new File([bytes], nome, { type: 'application/pdf' });
          if (await entregar(arquivo, 'Conta corrente')) toast(`PDF gerado: ${nome}`);
        } catch { toast('Não foi possível gerar o PDF. Tente de novo.', { tipo: 'erro' }); }
      }
    };
  },
};

// ---------- linhas do extrato
/** Valor sem o "R$" (a tabela avisa que os valores são em reais, como na planilha) */
const moeda = (v) => (v || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const valorOuTraco = (v, f = moeda) => (v ? f(v) : '<span class="text-stone-400">—</span>');

/** "125 kg Pasta" */
const textoInsumo = (l) => `${quantidade(l.quantidade, l.produto_id)} ${nomeProduto(l.produto_id)}`;

function descricaoHTML(l) {
  const texto = esc(descricaoDaLinha(l, nomeProdutor, textoInsumo));
  const cor = l.produtor_id ? bolinha(corProdutor(l.produtor_id)) : '';
  const noCaixa = (sim) => (sim ? '<span class="selo selo-neutro shrink-0">no Caixa</span>' : '');
  if (l.tipo === 'insumo') return `<button type="button" class="flex cursor-pointer items-center gap-2 text-left font-medium underline-offset-2 hover:underline" data-entrega="${esc(l.insumo.entrega_id || l.insumo.id)}" aria-label="Mudar a entrega de insumos ${texto}">${cor}<span>${texto}</span>${noCaixa(ligados.entregas.has(l.insumo.entrega_id))}${icone('editar', 'size-4 shrink-0 text-stone-500')}</button>`;
  if (l.tipo === 'carga') return `<a href="#carga/${l.carga_id}" class="flex items-center gap-2 font-medium underline-offset-2 hover:underline">${cor}<span>${texto}</span></a>`;
  if (l.movimento.caixa_id) return `<a href="#extrato" class="flex items-center gap-2 font-medium underline-offset-2 hover:underline" title="Recebido no Extrato do Caixa: para mudar, abra o lançamento lá">${cor}<span>${texto}</span>${noCaixa(true)}</a>`;
  return `<button type="button" class="flex cursor-pointer items-center gap-2 text-left font-medium underline-offset-2 hover:underline" data-movimento="${l.movimento.id}" aria-label="Mudar o lançamento ${texto}">${cor}<span>${texto}</span>${noCaixa(ligados.movimentos.has(l.movimento.id))}${icone('editar', 'size-4 shrink-0 text-stone-500')}</button>`;
}

function linhaTabela(l) {
  const c = l.tipo === 'carga';
  const ins = l.tipo === 'insumo';
  const td = 'whitespace-nowrap px-1.5 py-2 text-right';
  return `<tr class="align-top">
    <td class="whitespace-nowrap px-1.5 py-2">${dataCompleta(l.data)}</td>
    <td class="min-w-40 px-1.5 py-2">${descricaoHTML(l)}${ins && l.pct_produtor < 100 ? `<span class="mt-0.5 block text-xs text-stone-600 dark:text-stone-400">${numero(l.pct_produtor, 2)}% de ${brl(l.total)} cobrado do produtor</span>` : ''}</td>
    <td class="min-w-28 px-1.5 py-2">${esc(l.nota || '')}</td>
    <td class="px-1.5 py-2">${esc(l.destino || '')}</td>
    <td class="${td}">${c ? numero(l.tbs) : ''}</td>
    <td class="${td}">${c ? pct(l.pct) : ''}</td>
    <td class="${td}">${c ? numero(l.kg, 2) : ins ? numero(l.quantidade, 3) : ''}</td>
    <td class="${td}">${c && l.media != null ? numero(l.media, 2) : ''}</td>
    <td class="${td}">${c ? moeda(l.preco) : ins ? moeda(l.valor_unitario) : ''}</td>
    <td class="${td} text-brand-800 dark:text-brand-300">${valorOuTraco(l.credito)}</td>
    <td class="${td} text-amber-800 dark:text-amber-300">${valorOuTraco(l.debito)}</td>
    <td class="${td} font-semibold ${corSaldo(l.saldo)}">${moeda(l.saldo)}</td>
  </tr>`;
}

function linhaCartao(l) {
  const c = l.tipo === 'carga';
  return `<li class="rounded-xl border border-stone-200 p-3 text-sm dark:border-stone-800">
    <div class="flex items-start justify-between gap-3">
      <div class="min-w-0">${descricaoHTML(l)}
        <p class="mt-0.5 text-stone-600 dark:text-stone-400">${[dataCompleta(l.data), l.nota ? `Nota ${l.nota}` : '', l.destino].filter(Boolean).map(esc).join(' · ')}</p>
        ${l.tipo === 'insumo' ? `<p class="mt-0.5 tabular-nums text-stone-600 dark:text-stone-400">Insumo · ${l.pct_produtor < 100 ? `${numero(l.pct_produtor, 2)}% de ${brl(l.total)} cobrado do produtor` : 'descontado do produtor'} · ${brl(l.valor_unitario)} cada</p>` : ''}
        ${c ? `<p class="mt-0.5 tabular-nums text-stone-600 dark:text-stone-400">${numero(l.tbs)} Tbs · ${pct(l.pct)} · ${numero(l.kg, 2)} kg${l.media != null ? ` · média ${numero(l.media, 2)}` : ''} · ${brl(l.preco)}/kg</p>` : ''}
      </div>
      <p class="shrink-0 text-right tabular-nums">
        ${l.credito ? `<span class="block font-semibold text-brand-800 dark:text-brand-300">+${brl(l.credito)}</span>` : ''}
        ${l.debito ? `<span class="block font-semibold text-amber-800 dark:text-amber-300">−${brl(l.debito)}</span>` : ''}
        <span class="block text-xs ${corSaldo(l.saldo)}">Saldo ${brl(l.saldo)}</span>
      </p>
    </div>
  </li>`;
}

// ---------- lançar ou mudar um recebimento / valor a receber
async function editarMovimento(mov, ctx) {
  const novo = !mov.id;
  const noCaixa = novo ? null : (await lerLigacao('resina_movimento_id', mov.id)).lancamentos[0] || null;
  const m = { tipo: 'credito', data: hojeISO(), valor: 0, descricao: '', nota: '', produtor_id: null, ...mov };
  const titulares = store.resina_titulares.filter((t) => t.ativo !== false || t.id === m.titular_id);
  const produtores = store.resina_produtores.filter((p) => p.ativo !== false || p.id === m.produtor_id);
  const d = dialogo({
    titulo: novo ? 'Lançar na conta corrente' : 'Mudar lançamento',
    corpo: `<form class="grid gap-4" novalidate>
      <fieldset><legend class="rotulo">O que é</legend>
        <div class="grid gap-2 sm:grid-cols-2">${TIPOS_MOVIMENTO.map(([v, t]) => `<label class="flex min-h-11 cursor-pointer items-center gap-2 rounded-xl border border-stone-200 px-3 dark:border-stone-700">
          <input type="radio" name="tipo" value="${v}" class="size-5 accent-brand-600" ${m.tipo === v ? 'checked' : ''}> ${t}</label>`).join('')}</div></fieldset>
      <div class="grid gap-3 sm:grid-cols-2">
        <div data-campo><label class="rotulo" for="mv-conta">Conta</label><select id="mv-conta" name="titular_id" class="campo">${titulares.map((t) =>
          `<option value="${t.id}" ${t.id === m.titular_id ? 'selected' : ''}>${esc(nomeTitular(t.id))}</option>`).join('')}</select></div>
        <div data-campo><label class="rotulo" for="mv-data">Data</label><input id="mv-data" name="data" type="date" class="campo" value="${m.data}"></div>
        <div data-campo><label class="rotulo" for="mv-valor">Valor (R$)</label><input id="mv-valor" name="valor" class="campo tabular-nums" inputmode="numeric" data-dinheiro value="${m.valor ? valorParaCampo(m.valor) : ''}" placeholder="0,00"></div>
        <div data-campo><label class="rotulo" for="mv-nota">Nota <span class="font-normal text-stone-600 dark:text-stone-400">(opcional)</span></label><input id="mv-nota" name="nota" class="campo" maxlength="80" value="${esc(m.nota || '')}"></div>
      </div>
      <div data-campo><label class="rotulo" for="mv-desc">Descrição</label><input id="mv-desc" name="descricao" class="campo" maxlength="120" value="${esc(m.descricao || '')}" placeholder="Ex.: PIX recebido, depósito"></div>
      <div data-campo><label class="rotulo" for="mv-prod">Produtor <span class="font-normal text-stone-600 dark:text-stone-400">(opcional)</span></label><select id="mv-prod" name="produtor_id" class="campo">
        <option value="">Nenhum (vale para a conta toda)</option>${produtores.map((p) => `<option value="${p.id}" ${p.id === m.produtor_id ? 'selected' : ''}>${esc(p.nome)}</option>`).join('')}</select></div>
      ${camposRecebimento(noCaixa, novo)}
      <div class="flex flex-col-reverse gap-2 sm:flex-row sm:items-center">
        ${novo ? '' : `<button type="button" class="btn-neutro text-red-700 dark:text-red-400" data-excluir-mov>${icone('lixo')} Excluir</button>`}
        <span class="flex-1"></span>
        <button type="submit" class="btn-primario">${icone('check')} ${novo ? 'Lançar' : 'Salvar'}</button>
      </div>
    </form>`,
  });
  const f = d.querySelector('form');
  mascaraDinheiro(f.valor);
  ligarRecebimento(f);
  f.valor.focus();

  f.querySelector('[data-excluir-mov]')?.addEventListener('click', async () => {
    d.close();
    if (!(await confirmar(`O lançamento de ${brl(m.valor)} em ${dataCompleta(m.data)} será excluído.${noCaixa ? ' A entrada ligada a ele no Caixa também.' : ''}`, { botao: 'Excluir', perigo: true }))) return;
    try {
      const voltarCaixa = await desligar('resina_movimento_id', m.id);
      const voltarMov = await excluirMovimento(m.id);
      const desfazer = async () => { await voltarMov(); await voltarCaixa(); };
      toast(noCaixa ? 'Lançamento excluído (e a entrada no Caixa)' : 'Lançamento excluído', { acao: desfazendo(desfazer, ctx.atualizar) });
      ctx.atualizar();
    } catch (err) { toast(err.message, { tipo: 'erro' }); }
  });

  f.onsubmit = semRepetir(async (e) => {
    e.preventDefault();
    limparErros(f);
    const valor = lerValor(f.valor.value) || 0;
    if (!f.titular_id.value) return erroNoCampo(f, 'titular_id', 'Escolha a conta.');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(f.data.value)) return erroNoCampo(f, 'data', 'Escolha a data.');
    if (!(valor > 0)) return erroNoCampo(f, 'valor', 'Informe o valor.');
    if (valor > VALOR_MAXIMO) return erroNoCampo(f, 'valor', `O valor máximo é ${valorMaximoTexto()}.`);
    const caixa = lerRecebimento(f, erroNoCampo);
    if (!caixa) return;
    try {
      const salvo = await salvarMovimento({
        ...(novo ? {} : { id: m.id }),
        titular_id: f.titular_id.value, tipo: f.tipo.value === 'debito' ? 'debito' : 'credito', data: f.data.value, valor,
        descricao: f.descricao.value.trim(), nota: f.nota.value.trim(), produtor_id: f.produtor_id.value || null,
      });
      const texto = `Resina · ${salvo.descricao || 'Recebimento'}${salvo.produtor_id ? ` · ${nomeProdutor(salvo.produtor_id)}` : ''} (${titular(salvo.titular_id)?.nome || 'conta'})`;
      const voltarCaixa = await gravarRecebimento(salvo, caixa, texto);
      const desfazer = async () => { await voltarCaixa(); await salvo.desfazer(); };
      d.close();
      filtro.conta = salvo.titular_id;
      const noCaixaAgora = !caixa.semCaixa;
      toast(`${novo ? `Lançado: ${brl(valor)}` : 'Lançamento atualizado'}${noCaixaAgora ? ' (também no Caixa)' : ''}`, { acao: desfazendo(desfazer, ctx.atualizar) });
      ctx.atualizar();
    } catch (err) { toast(err.message, { tipo: 'erro' }); }
  });
}
