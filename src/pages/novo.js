// Novo lançamento: saída, entrada ou compra no cartão
import { brl, esc, hojeISO, lerValor, somarMeses, nomeMes, parseISO, dataCompleta, VALOR_MAXIMO, valorMaximoTexto } from '../lib/format.js';
import { store, cartoesAtivos, buscar } from '../lib/store.js';
import { criarLancamentos, excluirLancamentos, criarCompra, excluirCompra, pessoaPorNome, procurarParecido } from '../lib/api.js';
import { autor, nomeCategoria } from '../lib/store.js';
import { desfazendo } from '../components/lancamento.js';
import { faturaDe, vencimentoFatura, dividirParcelas } from '../lib/faturas.js';
import { icone, toast, mascaraDinheiro, erroNoCampo, limparErros, dialogo } from '../lib/ui.js';
import { campoValor, campoDescricao, campoCategoria, camposCaixa, lerCamposCaixa } from '../components/form-lancamento.js';

let ultimoModo = 'saida';

export default {
  titulo: 'Novo lançamento',
  usaMes: false,
  ajuda: `
    <p><strong>1.</strong> Escolha o tipo: <strong>Saída</strong> (pagou ou vai pagar algo), <strong>Entrada</strong> (recebeu dinheiro) ou <strong>Cartão</strong> (compra no crédito).</p>
    <p><strong>2.</strong> Digite o valor só com números: 4590 vira R$ 45,90.</p>
    <p><strong>3.</strong> Preencha descrição e categoria. A categoria é o que alimenta o gráfico do Início.</p>
    <p><strong>Contas fixas</strong> (aluguel, salário de funcionário, internet): use "Repetir todo mês" para não precisar lançar de novo.</p>
    <p><strong>Compras parceladas</strong>: digite o valor <em>total</em> e escolha o número de parcelas. O sistema mostra em qual fatura cada uma vai cair.</p>`,

  async render(el, ctx) {
    const cartoes = cartoesAtivos();
    el.innerHTML = `
    <form class="mx-auto grid max-w-2xl gap-5 animate-entrar" novalidate>
      <fieldset>
        <legend class="rotulo mb-2">O que você quer lançar?</legend>
        <div class="grid grid-cols-3 gap-2">
          ${[['saida', 'saida', 'Saída', 'Paguei ou vou pagar'], ['entrada', 'entrada', 'Entrada', 'Recebi dinheiro'], ['cartao', 'cartao', 'Cartão', 'Comprei no crédito']]
            .map(([v, ic, t, sub]) => `<label class="opcao-modo">
              <input type="radio" name="modo" value="${v}" class="sr-only" ${v === ultimoModo ? 'checked' : ''}>
              ${icone(ic, 'size-6')}<span>${t}</span><span class="text-xs font-normal text-stone-600 dark:text-stone-400">${sub}</span>
            </label>`).join('')}
        </div>
      </fieldset>

      <div class="card grid gap-4">
        ${campoValor(null)}
        ${campoDescricao('', 'Ex.: Conta de luz')}
        ${campoCategoria(null)}

        <div data-secao="caixa" class="grid gap-4">
          ${camposCaixa({})}
          <div data-campo>
            <label class="rotulo" for="f-repetir">Repetir todo mês?</label>
            <select id="f-repetir" name="repetir" class="campo">
              <option value="1">Não, só esta vez</option>
              ${[2, 3, 4, 6, 12, 24].map((n) => `<option value="${n}">Sim, por ${n} meses</option>`).join('')}
            </select>
            <p class="dica">Para contas fixas como aluguel, internet ou salário de funcionário. Só a primeira fica marcada como paga.</p>
          </div>
        </div>

        <div data-secao="cartao" class="grid gap-4" hidden>
          ${cartoes.length ? `
          <div class="grid gap-4 sm:grid-cols-2">
            <div data-campo><label class="rotulo" for="f-cartao">Cartão</label>
              <select id="f-cartao" name="cartao_id" class="campo">${cartoes.map((c) => `<option value="${c.id}">${esc(c.nome)}</option>`).join('')}</select></div>
            <div data-campo><label class="rotulo" for="f-data">Data da compra</label>
              <input id="f-data" name="data_compra" type="date" class="campo" value="${hojeISO()}"></div>
          </div>
          <div class="grid gap-4 sm:grid-cols-2">
            <div data-campo><label class="rotulo" for="f-parcelas">Parcelas</label>
              <select id="f-parcelas" name="parcelas" class="campo">${Array.from({ length: 24 }, (_, i) => `<option value="${i + 1}">${i ? `${i + 1}x` : 'À vista (1x)'}</option>`).join('')}</select></div>
            <div data-campo><label class="rotulo" for="f-sub">Subcategoria <span class="font-normal text-stone-600 dark:text-stone-400">(opcional)</span></label>
              <input id="f-sub" name="subcategoria" class="campo" maxlength="60" placeholder="Ex.: Eletrodoméstico"></div>
          </div>
          <div class="rounded-xl bg-stone-100 p-4 text-sm dark:bg-stone-800" aria-live="polite" data-previa></div>`
          : '<p class="rounded-xl bg-amber-50 p-4 text-sm text-amber-900 dark:bg-amber-900/40 dark:text-amber-100">Nenhum cartão cadastrado. Cadastre em <a class="font-semibold underline" href="#ajustes">Ajustes</a>.</p>'}
        </div>
      </div>

      <div class="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <a href="#inicio" class="btn-neutro">Cancelar</a>
        <button type="submit" class="btn-primario sm:min-w-48">${icone('check')} Salvar</button>
      </div>
    </form>`;

    const form = el.querySelector('form');
    mascaraDinheiro(form.valor);

    const modo = () => form.modo.value;
    const trocarModo = () => {
      ultimoModo = modo();
      el.querySelector('[data-secao="caixa"]').hidden = modo() === 'cartao';
      el.querySelector('[data-secao="cartao"]').hidden = modo() !== 'cartao';
      form.descricao.placeholder = { saida: 'Ex.: Conta de luz', entrada: 'Ex.: Venda de bezerros', cartao: 'Ex.: Supermercado' }[modo()];
      const textoPago = el.querySelector('[data-texto-pago]');
      if (textoPago) textoPago.textContent = modo() === 'entrada' ? 'Já foi recebido' : 'Já foi pago';
      limparErros(form);
      atualizarPrevia();
    };

    const atualizarPrevia = () => {
      const area = el.querySelector('[data-previa]');
      if (!area || modo() !== 'cartao') return;
      const cartao = buscar('cartoes', form.cartao_id.value);
      const n = Number(form.parcelas.value);
      const total = lerValor(form.valor.value) || 0;
      const data = form.data_compra.value || hojeISO();
      const primeira = faturaDe(cartao, data, 0);
      const ultima = faturaDe(cartao, data, n - 1);
      const valores = dividirParcelas(total, n);
      // atualiza os textos das opções de parcelas com o valor de cada uma
      [...form.parcelas.options].forEach((o, i) => {
        o.textContent = i ? `${i + 1}x${total ? ` de ${brl(total / (i + 1))}` : ''}` : `À vista (1x)${total ? ` · ${brl(total)}` : ''}`;
      });
      area.innerHTML = `
        <p class="flex items-start gap-2"><span class="mt-0.5 shrink-0 text-brand-700 dark:text-brand-400">${icone('calendario')}</span>
        <span>A ${n > 1 ? '1ª parcela' : 'compra'} entra na fatura de <strong>${nomeMes(parseISO(primeira))}</strong>, que vence em <strong>${dataCompleta(vencimentoFatura(cartao, primeira))}</strong>.
        ${n > 1 ? `<br>${n} parcelas de <strong>${brl(valores[0])}</strong>, até <strong>${nomeMes(parseISO(ultima))}</strong>.` : ''}</span></p>
        <p class="mt-2 text-stone-600 dark:text-stone-400">${esc(cartao.nome)} fecha todo dia ${cartao.dia_fechamento}. Compras a partir desse dia vão para a fatura seguinte.</p>`;
    };

    form.addEventListener('change', (e) => (e.target.name === 'modo' ? trocarModo() : atualizarPrevia()));
    form.addEventListener('input', (e) => e.target.name === 'valor' && atualizarPrevia());
    trocarModo();

    form.onsubmit = async (e) => {
      e.preventDefault();
      limparErros(form);
      const botao = form.querySelector('[type=submit]');
      try {
        if (modo() === 'cartao') {
          const salvo = await salvarCompra(form, botao);
          if (!salvo) return;
          toast(salvo.mensagem, { acao: desfazendo(() => excluirCompra(salvo.id)) });
        } else {
          const salvo = await salvarCaixa(form, botao, modo());
          if (!salvo) return;
          toast(salvo.mensagem, { acao: desfazendo(() => excluirLancamentos(salvo.ids)) });
        }
        // limpa para lançar o próximo, mantendo tipo, conta e cartão escolhidos
        form.valor.value = '';
        form.descricao.value = '';
        form.pessoa.value = '';
        if (form.repetir) form.repetir.value = '1';
        if (form.parcelas) form.parcelas.value = '1';
        if (form.subcategoria) form.subcategoria.value = '';
        atualizarPrevia();
        form.valor.focus();
      } catch (err) {
        toast(err.message, { tipo: 'erro' });
      } finally {
        botao.disabled = false;
      }
    };
  },
};

async function salvarCaixa(form, botao, tipo) {
  const dados = lerCamposCaixa(form, tipo);
  if (!dados) return null;
  if (!(await podeSalvarMesmoParecido({ tipo, valor: dados.valor, data: dados.vencimento, categoria_id: dados.categoria_id, descricao: dados.descricao }))) return null;
  botao.disabled = true;
  const { pessoaNome, ...base } = dados;
  base.pessoa_id = await pessoaPorNome(pessoaNome);
  const vezes = Number(form.repetir.value);
  const grupo = vezes > 1 ? crypto.randomUUID() : null;
  const linhas = Array.from({ length: vezes }, (_, i) => ({
    ...base,
    vencimento: somarMeses(base.vencimento, i),
    pago: i === 0 && base.pago,
    data_pagamento: i === 0 && base.pago ? hojeISO() : null,
    parcela: vezes > 1 ? `${i + 1}/${vezes}` : null,
    grupo,
  }));
  const salvos = await criarLancamentos(linhas);
  return {
    ids: salvos.map((s) => s.id),
    mensagem: vezes > 1 ? `“${base.descricao}” lançado para os próximos ${vezes} meses` : `“${base.descricao}” salvo`,
  };
}

async function salvarCompra(form, botao) {
  const total = lerValor(form.valor.value);
  const descricao = form.descricao.value.trim();
  const categoria_id = form.categoria_id.value || null;
  let ok = true;
  if (!(total > 0)) { erroNoCampo(form, 'valor', 'Digite o valor total da compra.'); ok = false; }
  else if (total > VALOR_MAXIMO) { erroNoCampo(form, 'valor', `O valor máximo é ${valorMaximoTexto()}.`); ok = false; }
  if (!descricao) { erroNoCampo(form, 'descricao', 'Escreva o que foi comprado.'); ok = false; }
  if (!categoria_id) { erroNoCampo(form, 'categoria_id', 'Escolha uma categoria.'); ok = false; }
  if (!form.data_compra.value) { erroNoCampo(form, 'data_compra', 'Escolha a data da compra.'); ok = false; }
  if (!ok) { form.querySelector('[aria-invalid]').focus(); return null; }
  if (!(await podeSalvarMesmoParecido({ tipo: 'cartao', valor: total, data: form.data_compra.value, categoria_id, descricao }))) return null;

  botao.disabled = true;
  const cartao = buscar('cartoes', form.cartao_id.value);
  const n = Number(form.parcelas.value);
  const compra = await criarCompra(
    { cartao_id: cartao.id, data_compra: form.data_compra.value, valor_total: total, qtd_parcelas: n, descricao, categoria_id, subcategoria: form.subcategoria.value.trim() || null },
    dividirParcelas(total, n).map((valor, i) => ({ numero: i + 1, valor, fatura_mes: faturaDe(cartao, form.data_compra.value, i) })),
  );
  return { id: compra.id, mensagem: n > 1 ? `${n} parcelas lançadas no ${cartao.nome}` : `Compra lançada no ${cartao.nome}` };
}

/**
 * Se a outra pessoa (ou você, há poucos minutos) já lançou algo igual, pergunta antes de salvar.
 * Retorna true para salvar, false para não salvar.
 */
async function podeSalvarMesmoParecido(dados) {
  const igual = await procurarParecido(dados);
  if (!igual) return true;
  const quem = autor(igual.criado_por);
  const ehOutro = quem && !quem.souEu;
  const minutos = Math.max(1, Math.round((Date.now() - new Date(igual.criado_em)) / 60000));
  const horario = new Date(igual.criado_em).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  const oQue = dados.tipo === 'entrada' ? 'uma entrada semelhante a esta' : 'um gasto semelhante a este';
  const titulo = ehOutro ? `${quem.nome} lançou ${oQue}` : `Você já lançou ${oQue}`;
  const onde = igual.origem === 'cartao' ? `no ${esc(buscar('cartoes', igual.cartao_id)?.nome || 'cartão')}` : `em ${esc(buscar('contas', igual.conta_id)?.nome || 'conta')}`;
  return new Promise((resolver) => {
    const d = dialogo({
      titulo: ehOutro ? 'Gasto parecido já lançado' : 'Lançamento repetido?',
      largura: 'max-w-md',
      corpo: `
        <p class="text-stone-700 dark:text-stone-300"><strong>${esc(titulo)}</strong>${ehOutro ? '' : ` há ${minutos} min`}. Deseja continuar mesmo assim?</p>
        <div class="mt-4 flex items-center gap-3 rounded-xl border border-stone-200 p-3 dark:border-stone-700">
          <span class="min-w-0 flex-1"><span class="block truncate font-semibold">${esc(igual.descricao)}</span>
          <span class="block text-sm text-stone-600 dark:text-stone-400">${esc(nomeCategoria(igual.categoria_id))} · ${onde} · ${ehOutro ? `lançado por ${esc(quem.nome)} ` : ''}às ${horario}</span></span>
          <span class="font-semibold tabular-nums">${brl(igual.valorTotal)}</span>
        </div>
        <div class="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <button type="button" class="btn-neutro" data-r="sim">Lançar mesmo assim</button>
          <button type="button" class="btn-primario" data-r="nao">Não lançar</button>
        </div>`,
    });
    let resposta = false;
    d.addEventListener('click', (e) => {
      const b = e.target.closest('[data-r]');
      if (b) { resposta = b.dataset.r === 'sim'; d.close(); }
    });
    d.addEventListener('close', () => {
      if (!resposta) toast('Não foi lançado. Nada mudou.');
      resolver(resposta);
    });
    d.querySelector('[data-r="nao"]').focus();
  });
}
