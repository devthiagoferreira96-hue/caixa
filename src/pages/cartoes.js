// Cartões: fatura do mês de cada cartão, compras, pagamento da fatura e próximos meses
import { brl, brlCurto, esc, mesISO, nomeMes, nomeMesCurto, inicioMes, diaMes, dataCompleta, hojeISO } from '../lib/format.js';
import { store, cartoesAtivos, contasAtivas, nomeCategoria, buscar } from '../lib/store.js';
import { parcelasEntre, pagamentosDeFatura, excluirCompra, excluirParcelas, criarLancamentos, excluirLancamentos, atualizarLancamento } from '../lib/api.js';
import { vencimentoFatura } from '../lib/faturas.js';
import { totalDoCartao, situacaoFatura } from '../lib/calculos.js';
import { prepararNovo } from './novo.js';
import { icone, toast, dialogo, confirmar, estadoVazio, semRepetir } from '../lib/ui.js';
import { opcoesConta } from '../components/form-lancamento.js';
import { desfazendo } from '../components/lancamento.js';

export default {
  titulo: 'Cartões',
  usaMes: true,
  ajuda: `
    <p>Cada cartão mostra a <strong>fatura do mês escolhido no topo</strong>: todas as compras e parcelas que vão ser cobradas.</p>
    <p>Quando pagar a fatura, toque em <strong>Pagar fatura</strong> e escolha de qual conta saiu o dinheiro. O valor é descontado do saldo dessa conta.</p>
    <p>Em <strong>Próximas faturas</strong> você vê quanto já está comprometido nos próximos meses por causa das parcelas.</p>
    <p>Pagou parte da fatura antes, ou recebeu um estorno? Toque em <strong>Reembolso ou adiantamento</strong>. O adiantamento sai da conta e abate o que falta pagar; o reembolso abate o total da fatura.</p>
    <p>Toque na lixeira de uma compra parcelada ou de uma assinatura para escolher: <strong>só esta parcela</strong>, <strong>esta e as próximas</strong> (cancela a assinatura) ou <strong>a compra inteira</strong>.</p>`,

  async render(el, ctx) {
    const cartoes = cartoesAtivos();
    if (!cartoes.length) {
      el.innerHTML = `<div class="card">${estadoVazio('Nenhum cartão cadastrado', 'Cadastre os cartões de crédito da família em Ajustes, com o dia de fechamento e de vencimento.', '<a href="#ajustes" class="btn-primario">Ir para Ajustes</a>')}</div>`;
      return;
    }
    const [parcelas, pagamentos] = await Promise.all([
      parcelasEntre(mesISO(store.mes), mesISO(store.mes, 4)),
      pagamentosDeFatura(),
    ]);
    if (!ctx.aindaAtual()) return;

    const mesAtual = mesISO(store.mes);
    const doMes = parcelas.filter((p) => p.fatura_mes === mesAtual);
    const proximos = [1, 2, 3].map((n) => inicioMes(store.mes, n));
    // pagamentos da fatura (inteiro ou adiantamentos) e os só agendados (lançados, mas ainda não pagos — ex.: importados da planilha)
    const pagamentosDo = (id) => pagamentos.filter((p) => p.fatura_cartao_id === id);
    const linhaPagamento = (p) => `<li class="flex items-center justify-between gap-2"><span>${icone('check', 'size-4 inline -mt-0.5')} ${p.adiantamento ? `Adiantado ${brl(p.valor)} em` : `Paga em`} ${dataCompleta(p.data_pagamento || p.vencimento)}${p.adiantamento ? '' : ` (${brl(p.valor)})`}</span>
      <button type="button" class="cursor-pointer font-semibold underline" data-desfazer="${p.id}" aria-label="Desfazer o pagamento de ${brl(p.valor)}">Desfazer</button></li>`;

    el.innerHTML = `
    <div class="grid items-start gap-4 md:grid-cols-2 xl:grid-cols-3 animate-entrar">
      ${cartoes.map((c) => {
        const itens = doMes.filter((p) => p.compra.cartao_id === c.id);
        const total = totalDoCartao(doMes, c.id);
        const sit = situacaoFatura(total, pagamentosDo(c.id));
        const pagos = pagamentosDo(c.id).filter((p) => p.pago);
        const agendado = sit.estado === 'agendada' && sit.agendado;
        const venc = vencimentoFatura(c, mesAtual);
        const futuros = proximos.map((m) => ({ m, v: totalDoCartao(parcelas.filter((p) => p.fatura_mes === mesISO(m)), c.id) }));
        const maior = Math.max(1, total, ...futuros.map((f) => f.v));
        return `
        <section class="card" aria-labelledby="cartao-${c.id}">
          <div class="flex items-start justify-between gap-2">
            <div class="min-w-0"><h2 id="cartao-${c.id}" class="font-bold">${esc(c.nome)}</h2>
            <p class="text-sm text-stone-600 dark:text-stone-400">Fecha dia ${c.dia_fechamento} · vence ${dataCompleta(venc)}</p></div>
            <span class="selo shrink-0 ${{ sem: 'selo-neutro', credito: 'selo-ok', paga: 'selo-ok' }[sit.estado] || 'selo-aberto'}">${{ sem: 'Sem compras', credito: 'Crédito', paga: 'Paga', agendada: 'Agendada', parcial: 'Adiantada em parte', aberta: 'Em aberto' }[sit.estado]}</span>
          </div>
          <p class="mt-3 text-2xl font-bold tabular-nums sm:text-3xl">${brl(total)}</p>
          <p class="text-sm text-stone-600 dark:text-stone-400">${itens.length} ${itens.length === 1 ? 'item' : 'itens'} na fatura de ${esc(nomeMes(store.mes).toLowerCase())}</p>
          <button type="button" class="btn-neutro mt-2 min-h-9 px-3 py-1.5 text-sm" data-recebimento="${c.id}">${icone('entrada', 'size-4')} Reembolso ou adiantamento</button>

          ${itens.length ? `<ul class="mt-3">${itens.map((p) => `
            <li class="flex items-center gap-2 border-t border-stone-100 py-2.5 dark:border-stone-800">
              <div class="min-w-0 flex-1">
                <p class="line-clamp-2 font-medium">${esc(p.compra.descricao)}${seloDaParcela(p)}</p>
                <p class="line-clamp-2 text-sm text-stone-600 dark:text-stone-400">${diaMes(p.compra.data_compra)} · ${esc(nomeCategoria(p.compra.categoria_id))}${p.compra.subcategoria ? ` / ${esc(p.compra.subcategoria)}` : ''}${p.compra.pessoa_id && buscar('pessoas', p.compra.pessoa_id) ? ` · ${esc(buscar('pessoas', p.compra.pessoa_id).nome)}` : ''}</p>
              </div>
              <div class="flex shrink-0 flex-col items-end">
                <span class="text-sm font-semibold tabular-nums sm:text-base ${p.valor < 0 ? 'valor-entrada' : ''}">${p.valor < 0 ? `+ ${brl(-p.valor)}` : brl(p.valor)}</span>
                <span class="flex items-center gap-0.5">
                  <button type="button" class="btn-icone size-9 text-stone-500 hover:text-red-700 dark:text-stone-400" data-excluir-parcela="${p.id}"
                    aria-label="Excluir ${p.compra.tipo === 'estorno' ? 'o reembolso' : 'a compra'} ${esc(p.compra.descricao)}" title="Excluir">${icone('lixo', 'size-4')}</button></span>
              </div>
            </li>`).join('')}</ul>` : ''}

          ${sit.estado === 'credito' ? `<p class="mt-4 rounded-xl bg-brand-50 p-3 text-sm dark:bg-brand-950">Os reembolsos passaram das compras: sobra um crédito de <strong>${brl(-total)}</strong> nesta fatura.</p>`
          : sit.estado === 'sem' ? ''
          : sit.estado === 'paga' ? `<ul class="mt-4 grid gap-1 rounded-xl bg-brand-50 p-3 text-sm dark:bg-brand-950">${pagos.map(linhaPagamento).join('')}</ul>`
          : sit.estado === 'parcial' ? `<div class="mt-4 grid gap-2 rounded-xl bg-stone-100 p-3 text-sm dark:bg-stone-800">
              <ul class="grid gap-1">${pagos.map(linhaPagamento).join('')}</ul>
              <p>Falta pagar <strong class="tabular-nums">${brl(sit.falta)}</strong> de ${brl(total)}.</p>
              <button type="button" class="btn-primario w-full" data-pagar-fatura="${c.id}">Pagar o restante de ${brl(sit.falta)}</button></div>`
          : (agendado
              ? `<div class="mt-4 grid gap-2 rounded-xl bg-amber-50 p-3 text-sm text-amber-900 dark:bg-amber-900/30 dark:text-amber-100" data-agendado>
                  <span>${icone('calendario', 'size-4 inline -mt-0.5')} Pagamento agendado para ${dataCompleta(agendado.vencimento)}${Math.abs(Number(agendado.valor) - sit.falta) > 0.005 ? ` (${brl(agendado.valor)})` : ''}, ainda não pago.</span>
                  <button type="button" class="btn-primario w-full" data-pagar-fatura="${c.id}" data-lancamento="${agendado.id}">Marcar como paga</button></div>`
              : `<button type="button" class="btn-primario mt-4 w-full" data-pagar-fatura="${c.id}">Pagar fatura de ${brl(total)}</button>`)}

          <div class="mt-5">
            <h3 class="mb-2 text-sm font-semibold text-stone-600 dark:text-stone-400">Próximas faturas</h3>
            <ul class="grid grid-cols-3 gap-2 text-center">${futuros.map(({ m, v }) => `
              <li class="rounded-xl bg-stone-100 p-2 dark:bg-stone-800">
                <span class="block text-xs text-stone-600 dark:text-stone-400">${nomeMesCurto(m)}</span>
                <span class="mx-auto my-1 block h-1.5 rounded-full bg-stone-200 dark:bg-stone-700" aria-hidden="true"><span class="block h-full rounded-full bg-destaque" style="width:${(v / maior) * 100}%"></span></span>
                <span class="block text-xs font-semibold tabular-nums sm:text-sm" title="${brl(v)}">${brlCurto(v)}</span>
              </li>`).join('')}</ul>
          </div>
        </section>`;
      }).join('')}
    </div>`;

    el.onclick = async (e) => {
      const receber = e.target.closest('[data-recebimento]');
      if (receber) {
        prepararNovo({ noCartao: 'adiantamento', cartaoId: receber.dataset.recebimento });
        location.hash = '#novo';
        return;
      }
      const excluir = e.target.closest('[data-excluir-parcela]');
      if (excluir) {
        const p = parcelas.find((x) => x.id === excluir.dataset.excluirParcela);
        await excluirComEscolha(p, ctx);
        return;
      }
      const desfazer = e.target.closest('[data-desfazer]');
      if (desfazer) {
        if (!(await confirmar('A fatura volta a ficar em aberto e o valor volta para o saldo da conta.', { titulo: 'Desfazer pagamento?', botao: 'Desfazer pagamento' }))) return;
        const voltar = await excluirLancamentos([desfazer.dataset.desfazer]);
        toast('Pagamento desfeito', { acao: desfazendo(voltar, ctx.atualizar) });
        ctx.atualizar();
        return;
      }
      const pagar = e.target.closest('[data-pagar-fatura]');
      if (pagar) {
        const cartao = cartoes.find((c) => c.id === pagar.dataset.pagarFatura);
        const agendado = pagamentos.find((p) => p.id === pagar.dataset.lancamento);
        const sit = situacaoFatura(totalDoCartao(doMes, cartao.id), pagamentosDo(cartao.id));
        pagarFatura(cartao, sit.falta, mesAtual, ctx, agendado, sit.pago > 0);
      }
    };
  },
};

/** Paga a fatura. Se já existe um pagamento agendado (não pago), ele é marcado como pago em vez de criar outro. */
function pagarFatura(cartao, total, mes, ctx, agendado, restante = false) {
  const venc = vencimentoFatura(cartao, mes);
  const sugestao = venc < hojeISO() ? venc : hojeISO();
  const d = dialogo({
    titulo: `Pagar fatura ${cartao.nome}`,
    largura: 'max-w-md',
    corpo: `
      <form class="grid gap-4" novalidate>
        <p class="text-3xl font-bold tabular-nums">${brl(total)}</p>
        <div data-campo><label class="rotulo" for="p-conta">Pagou com qual conta?</label>
          <select id="p-conta" name="conta" class="campo">${opcoesConta(agendado?.conta_id || contasAtivas()[0]?.id)}</select>
          <p class="dica">O valor será descontado do saldo desta conta.</p></div>
        <div data-campo><label class="rotulo" for="p-data">Data do pagamento</label>
          <input id="p-data" name="data" type="date" class="campo" value="${sugestao}"></div>
        <button type="submit" class="btn-primario">${icone('check')} Confirmar pagamento</button>
      </form>`,
  });
  const form = d.querySelector('form');
  form.onsubmit = semRepetir(async (e) => {
    e.preventDefault();
    form.querySelector('[type=submit]').disabled = true;
    try {
      const data = form.data.value || hojeISO();
      let desfazer;
      if (agendado) {
        const r = await atualizarLancamento(agendado.id, {
          valor: Math.round(total * 100) / 100, pago: true, data_pagamento: data, vencimento: data, conta_id: form.conta.value,
        });
        desfazer = r.desfazer;
      } else {
        const [pagamento] = await criarLancamentos([{
          tipo: 'saida', valor: Math.round(total * 100) / 100,
          descricao: `${restante ? 'Restante da fatura' : 'Fatura'} ${cartao.nome} (${nomeMes(store.mes).toLowerCase()})`,
          vencimento: data, pago: true, data_pagamento: data,
          conta_id: form.conta.value, categoria_id: null, fatura_cartao_id: cartao.id, fatura_mes: mes,
        }]);
        desfazer = () => excluirLancamentos([pagamento.id]);
      }
      d.close();
      toast(`Fatura do ${cartao.nome} paga`, { acao: desfazendo(desfazer, ctx.atualizar) });
      ctx.atualizar();
    } catch (err) {
      toast(err.message, { tipo: 'erro' });
      form.querySelector('[type=submit]').disabled = false;
    }
  });
}

/** "3/10", "mensal", "anual" ou "reembolso" ao lado da descrição */
function seloDaParcela(p) {
  const c = p.compra;
  if (c.tipo === 'estorno') return ' <span class="selo selo-ok">Reembolso</span>';
  if (c.resina_entrega_id) return ` <span class="selo selo-neutro">Resina</span>${c.qtd_parcelas > 1 ? ` <span class="selo selo-neutro">${p.numero}/${c.qtd_parcelas}</span>` : ''}`;
  if (c.recorrente || c.recorrente_base) return ` <span class="selo selo-neutro">${Number(c.recorrente_intervalo) === 12 ? 'Anual' : 'Mensal'}${c.recorrente ? '' : ' · cancelada'}</span>`;
  return c.qtd_parcelas > 1 ? ` <span class="selo selo-neutro">${p.numero}/${c.qtd_parcelas}</span>` : '';
}

/**
 * Excluir no cartão: compra à vista ou reembolso sai inteiro; parcelada ou assinatura pergunta
 * se é só esta parcela, esta e as próximas (na assinatura, cancela) ou a compra inteira.
 */
async function excluirComEscolha(p, ctx) {
  const c = p.compra;
  const varias = c.qtd_parcelas > 1 || c.recorrente || c.recorrente_base;
  let escolha = 'tudo';
  if (!varias) {
    const oQue = c.tipo === 'estorno' ? `O reembolso “${c.descricao}”` : `A compra “${c.descricao}”`;
    if (!(await confirmar(`${oQue} será excluído${c.tipo === 'estorno' ? '' : 'a'}.`, { botao: 'Excluir', perigo: true }))) return;
  } else {
    const assinatura = c.recorrente || c.recorrente_base;
    escolha = await new Promise((resolver) => {
      const j = dialogo({
        titulo: assinatura ? 'Assinatura no cartão' : 'Compra parcelada',
        largura: 'max-w-sm',
        corpo: `<p class="text-stone-600 dark:text-stone-300">“${esc(c.descricao)}”: o que você quer excluir?</p>
          <div class="mt-5 grid gap-2">
            <button class="btn-neutro" data-r="uma">Só esta ${assinatura ? 'cobrança' : 'parcela'} (${esc(nomeMes(new Date(p.fatura_mes + 'T12:00')).toLowerCase())})</button>
            <button class="btn-perigo" data-r="proximas">${assinatura ? 'Esta e as próximas (cancelar a assinatura)' : 'Esta e as próximas parcelas'}</button>
            <button class="btn-neutro text-red-700 dark:text-red-400" data-r="tudo">${assinatura ? 'A assinatura inteira (inclusive meses passados)' : 'A compra inteira (todas as parcelas)'}</button>
            <button class="btn-sec" data-r="">Cancelar</button>
          </div>`,
      });
      let r = '';
      j.addEventListener('click', (ev) => { const b = ev.target.closest('[data-r]'); if (b) { r = b.dataset.r; j.close(); } });
      j.addEventListener('close', () => resolver(r));
    });
    if (!escolha) return;
  }
  try {
    const desfazer = escolha === 'tudo' ? await excluirCompra(c.id)
      : await excluirParcelas(c.id, escolha === 'uma' ? { parcelaId: p.id } : { aPartirDe: p.fatura_mes });
    const texto = escolha === 'tudo' ? `“${c.descricao}” excluíd${c.tipo === 'estorno' ? 'o' : 'a'}`
      : escolha === 'uma' ? `Parcela de “${c.descricao}” excluída`
      : c.recorrente ? `Assinatura “${c.descricao}” cancelada a partir de ${nomeMes(new Date(p.fatura_mes + 'T12:00')).toLowerCase()}`
      : `Parcelas de “${c.descricao}” excluídas a partir de ${nomeMes(new Date(p.fatura_mes + 'T12:00')).toLowerCase()}`;
    toast(texto, { acao: desfazendo(desfazer, ctx.atualizar) });
    ctx.atualizar();
  } catch (err) { toast(err.message, { tipo: 'erro' }); }
}
