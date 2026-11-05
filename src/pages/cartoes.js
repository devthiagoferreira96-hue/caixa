// Cartões: fatura do mês de cada cartão, compras, pagamento da fatura e próximos meses
import { brl, esc, mesISO, nomeMes, nomeMesCurto, inicioMes, diaMes, dataCompleta, hojeISO } from '../lib/format.js';
import { store, cartoesAtivos, contasAtivas, nomeCategoria } from '../lib/store.js';
import { parcelasEntre, pagamentosDeFatura, excluirCompra, criarLancamentos, excluirLancamentos } from '../lib/api.js';
import { vencimentoFatura } from '../lib/faturas.js';
import { totalDoCartao } from '../lib/calculos.js';
import { icone, toast, dialogo, confirmar, estadoVazio } from '../lib/ui.js';
import { opcoesConta } from '../components/form-lancamento.js';

export default {
  titulo: 'Cartões',
  usaMes: true,
  ajuda: `
    <p>Cada cartão mostra a <strong>fatura do mês escolhido no topo</strong>: todas as compras e parcelas que vão ser cobradas.</p>
    <p>Quando pagar a fatura, toque em <strong>Pagar fatura</strong> e escolha de qual conta saiu o dinheiro. O valor é descontado do saldo dessa conta.</p>
    <p>Em <strong>Próximas faturas</strong> você vê quanto já está comprometido nos próximos meses por causa das parcelas.</p>
    <p>Lançou uma compra errada? Toque na lixeira ao lado dela para excluir a compra inteira (todas as parcelas).</p>`,

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
    const pagamentoDo = (id) => pagamentos.find((p) => p.fatura_cartao_id === id);

    el.innerHTML = `
    <div class="grid items-start gap-4 md:grid-cols-2 xl:grid-cols-3 animate-entrar">
      ${cartoes.map((c) => {
        const itens = doMes.filter((p) => p.compra.cartao_id === c.id);
        const total = totalDoCartao(doMes, c.id);
        const pago = pagamentoDo(c.id);
        const venc = vencimentoFatura(c, mesAtual);
        const futuros = proximos.map((m) => ({ m, v: totalDoCartao(parcelas.filter((p) => p.fatura_mes === mesISO(m)), c.id) }));
        const maior = Math.max(1, total, ...futuros.map((f) => f.v));
        return `
        <section class="card" aria-labelledby="cartao-${c.id}">
          <div class="flex items-start justify-between gap-2">
            <div><h2 id="cartao-${c.id}" class="font-bold">${esc(c.nome)}</h2>
            <p class="text-sm text-stone-600 dark:text-stone-400">Fecha dia ${c.dia_fechamento} · vence ${dataCompleta(venc)}</p></div>
            <span class="selo ${!total ? 'selo-neutro' : pago ? 'selo-ok' : 'selo-aberto'}">${!total ? 'Sem compras' : pago ? 'Paga' : 'Em aberto'}</span>
          </div>
          <p class="mt-3 text-3xl font-bold tabular-nums">${brl(total)}</p>
          <p class="text-sm text-stone-600 dark:text-stone-400">${itens.length} ${itens.length === 1 ? 'compra' : 'compras'} na fatura de ${esc(nomeMes(store.mes).toLowerCase())}</p>

          ${itens.length ? `<ul class="mt-3">${itens.map((p) => `
            <li class="flex items-center gap-2 border-t border-stone-100 py-2.5 dark:border-stone-800">
              <div class="min-w-0 flex-1">
                <p class="truncate font-medium">${esc(p.compra.descricao)}${p.compra.qtd_parcelas > 1 ? ` <span class="selo selo-neutro">${p.numero}/${p.compra.qtd_parcelas}</span>` : ''}</p>
                <p class="truncate text-sm text-stone-600 dark:text-stone-400">${diaMes(p.compra.data_compra)} · ${esc(nomeCategoria(p.compra.categoria_id))}${p.compra.subcategoria ? ` / ${esc(p.compra.subcategoria)}` : ''}</p>
              </div>
              <span class="font-semibold tabular-nums">${brl(p.valor)}</span>
              <button type="button" class="btn-icone size-9 text-stone-400 hover:text-red-700" data-excluir-compra="${p.compra.id}"
                aria-label="Excluir a compra ${esc(p.compra.descricao)}" title="Excluir compra">${icone('lixo', 'size-4')}</button>
            </li>`).join('')}</ul>` : ''}

          ${total ? (pago
            ? `<div class="mt-4 flex items-center justify-between gap-2 rounded-xl bg-brand-50 p-3 text-sm dark:bg-brand-950">
                <span>${icone('check', 'size-4 inline -mt-0.5')} Paga em ${dataCompleta(pago.data_pagamento || pago.vencimento)}</span>
                <button type="button" class="cursor-pointer font-semibold underline" data-desfazer="${pago.id}">Desfazer</button></div>`
            : `<button type="button" class="btn-primario mt-4 w-full" data-pagar-fatura="${c.id}">Pagar fatura de ${brl(total)}</button>`) : ''}

          <div class="mt-5">
            <h3 class="mb-2 text-sm font-semibold text-stone-600 dark:text-stone-400">Próximas faturas</h3>
            <ul class="grid grid-cols-3 gap-2 text-center">${futuros.map(({ m, v }) => `
              <li class="rounded-xl bg-stone-100 p-2 dark:bg-stone-800">
                <span class="block text-xs text-stone-600 dark:text-stone-400">${nomeMesCurto(m)}</span>
                <span class="mx-auto my-1 block h-1.5 rounded-full bg-stone-200 dark:bg-stone-700" aria-hidden="true"><span class="block h-full rounded-full bg-brand-500" style="width:${(v / maior) * 100}%"></span></span>
                <span class="block text-sm font-semibold tabular-nums">${brl(v)}</span>
              </li>`).join('')}</ul>
          </div>
        </section>`;
      }).join('')}
    </div>`;

    el.onclick = async (e) => {
      const excluir = e.target.closest('[data-excluir-compra]');
      if (excluir) {
        const compra = parcelas.find((p) => p.compra.id === excluir.dataset.excluirCompra).compra;
        const msg = compra.qtd_parcelas > 1
          ? `A compra “${compra.descricao}” e as ${compra.qtd_parcelas} parcelas serão excluídas de todas as faturas.`
          : `A compra “${compra.descricao}” será excluída.`;
        if (!(await confirmar(msg, { botao: 'Excluir compra', perigo: true }))) return;
        try { await excluirCompra(compra.id); toast('Compra excluída'); ctx.atualizar(); } catch (err) { toast(err.message, { tipo: 'erro' }); }
        return;
      }
      const desfazer = e.target.closest('[data-desfazer]');
      if (desfazer) {
        if (!(await confirmar('A fatura volta a ficar em aberto e o valor volta para o saldo da conta.', { titulo: 'Desfazer pagamento?', botao: 'Desfazer pagamento' }))) return;
        await excluirLancamentos([desfazer.dataset.desfazer]);
        toast('Pagamento desfeito');
        ctx.atualizar();
        return;
      }
      const pagar = e.target.closest('[data-pagar-fatura]');
      if (pagar) {
        const cartao = cartoes.find((c) => c.id === pagar.dataset.pagarFatura);
        pagarFatura(cartao, totalDoCartao(doMes, cartao.id), mesAtual, ctx);
      }
    };
  },
};

function pagarFatura(cartao, total, mes, ctx) {
  const venc = vencimentoFatura(cartao, mes);
  const sugestao = venc < hojeISO() ? venc : hojeISO();
  const d = dialogo({
    titulo: `Pagar fatura ${cartao.nome}`,
    largura: 'max-w-md',
    corpo: `
      <form class="grid gap-4" novalidate>
        <p class="text-3xl font-bold tabular-nums">${brl(total)}</p>
        <div data-campo><label class="rotulo" for="p-conta">Pagou com qual conta?</label>
          <select id="p-conta" name="conta" class="campo">${opcoesConta(contasAtivas()[0]?.id)}</select>
          <p class="dica">O valor será descontado do saldo desta conta.</p></div>
        <div data-campo><label class="rotulo" for="p-data">Data do pagamento</label>
          <input id="p-data" name="data" type="date" class="campo" value="${sugestao}"></div>
        <button type="submit" class="btn-primario">${icone('check')} Confirmar pagamento</button>
      </form>`,
  });
  const form = d.querySelector('form');
  form.onsubmit = async (e) => {
    e.preventDefault();
    form.querySelector('[type=submit]').disabled = true;
    try {
      await criarLancamentos([{
        tipo: 'saida', valor: Math.round(total * 100) / 100,
        descricao: `Fatura ${cartao.nome} (${nomeMes(store.mes).toLowerCase()})`,
        vencimento: form.data.value || hojeISO(), pago: true, data_pagamento: form.data.value || hojeISO(),
        conta_id: form.conta.value, categoria_id: null, fatura_cartao_id: cartao.id, fatura_mes: mes,
      }]);
      d.close();
      toast(`Fatura do ${cartao.nome} paga`);
      ctx.atualizar();
    } catch (err) {
      toast(err.message, { tipo: 'erro' });
      form.querySelector('[type=submit]').disabled = false;
    }
  };
}
