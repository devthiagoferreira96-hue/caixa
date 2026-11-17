// Novo lançamento: saída, entrada ou cartão (compra, assinatura, reembolso/estorno ou adiantamento da fatura)
import { brl, esc, hojeISO, lerValor, somarMeses, nomeMes, parseISO, dataCompleta, VALOR_MAXIMO, valorMaximoTexto } from '../lib/format.js';
import { store, cartoesAtivos, contasAtivas, buscar } from '../lib/store.js';
import { criarLancamentos, excluirLancamentos, criarCompra, excluirCompra, pessoaPorNome, procurarParecido } from '../lib/api.js';
import { nomeCategoria } from '../lib/store.js';
import { desfazendo } from '../components/lancamento.js';
import { faturaDe, vencimentoFatura, dividirParcelas } from '../lib/faturas.js';
import { proximasDatas, limiteRecorrencia, HORIZONTE_MESES } from '../lib/recorrencia.js';
import { icone, toast, mascaraDinheiro, erroNoCampo, limparErros, dialogo, semRepetir } from '../lib/ui.js';
import {
  campoValor, campoDescricao, campoCategoria, camposCaixa, lerCamposCaixa, ligarCamposCaixa, atualizarCategorias, erroDeTipo, opcoesConta,
  campoDividir, ligarDividir, lerDivisao,
} from '../components/form-lancamento.js';
import { dividirAjustes } from '../lib/calculos.js';

let ultimoModo = 'saida';
let ultimoNoCartao = 'compra';
let ultimoCartao = null;

/** Abre o Novo lançamento já no cartão (usado pelo botão da tela Cartões) */
export function prepararNovo({ noCartao = 'compra', cartaoId = null } = {}) {
  ultimoModo = 'cartao';
  ultimoNoCartao = noCartao;
  if (cartaoId) ultimoCartao = cartaoId;
}

const MAX_MESES = 120;
const MAX_ANOS = 30;
const NO_CARTAO = [
  ['compra', 'Compra', 'À vista, parcelada ou assinatura'],
  ['estorno', 'Reembolso', 'Estorno ou devolução'],
  ['adiantamento', 'Adiantar', 'Paguei parte da fatura'],
];

export default {
  titulo: 'Novo lançamento',
  usaMes: false,
  ajuda: `
    <p><strong>1.</strong> Escolha o tipo: <strong>Saída</strong> (pagou ou vai pagar algo), <strong>Entrada</strong> (recebeu dinheiro) ou <strong>Cartão</strong>.</p>
    <p><strong>2.</strong> Digite o valor só com números: 4590 vira R$ 45,90.</p>
    <p><strong>3.</strong> Preencha descrição e categoria. A categoria é o que alimenta o gráfico do Início.</p>
    <p><strong>Contas</strong>: no valor dá para digitar uma conta, como <strong>3*4,50</strong> (3 tarifas de R$ 4,50). Quando sair do campo, ele mostra o resultado.</p>
    <p><strong>Mais detalhes</strong>: competência (o mês a que a conta se refere), desconto, juros ou multa e uma observação. Com desconto ou juros, digite no Valor o valor original: o sistema calcula o valor final.</p>
    <p><strong>Pagou com mais de uma conta?</strong> Marque "Paguei com mais de uma conta" e diga quanto saiu de cada uma (ex.: parte em dinheiro, parte no Pix).</p>
    <p><strong>Contas fixas</strong> (aluguel, salário de funcionário, internet): em "Repetir todo mês", escolha <strong>por alguns meses</strong> e digite quantos, ou <strong>sempre</strong>. No "sempre", o sistema mantém os próximos ${HORIZONTE_MESES} meses lançados e vai completando sozinho. Para parar, exclua um mês e escolha <strong>Este e os próximos</strong>.</p>
    <p><strong>Cartão</strong>: em <strong>Compra</strong>, digite o valor <em>total</em> e escolha as parcelas (o sistema mostra em qual fatura cada uma cai) ou <strong>Assinatura</strong>, que cobra o mesmo valor todo mês até você cancelar.</p>
    <p><strong>Reembolso</strong>: estorno ou devolução que o cartão creditou. Abate o valor da fatura.</p>
    <p><strong>Adiantamento</strong>: quando você paga parte da fatura antes. Sai da conta escolhida e abate o que falta pagar da fatura.</p>`,

  async render(el, ctx) {
    const cartoes = cartoesAtivos();
    if (!cartoes.some((c) => c.id === ultimoCartao)) ultimoCartao = cartoes[0]?.id ?? null;
    el.innerHTML = `
    <form class="mx-auto grid max-w-2xl gap-5 animate-entrar" novalidate>
      <fieldset>
        <legend class="rotulo mb-2">O que você quer lançar?</legend>
        <div class="grid grid-cols-3 gap-2">
          ${[['saida', 'saida', 'Saída', 'Paguei ou vou pagar'], ['entrada', 'entrada', 'Entrada', 'Recebi dinheiro'], ['cartao', 'cartao', 'Cartão', 'Compra, reembolso…']]
            .map(([v, ic, t, sub]) => `<label class="opcao-modo">
              <input type="radio" name="modo" value="${v}" class="sr-only" ${v === ultimoModo ? 'checked' : ''}>
              ${icone(ic, 'size-6')}<span>${t}</span><span class="text-xs font-normal text-stone-600 dark:text-stone-400">${sub}</span>
            </label>`).join('')}
        </div>
      </fieldset>

      ${cartoes.length ? `<fieldset data-secao="no-cartao" hidden>
        <legend class="rotulo mb-2">O que aconteceu no cartão?</legend>
        <div class="grid grid-cols-3 gap-2">${NO_CARTAO.map(([v, t, sub]) => `<label class="opcao-modo py-2">
          <input type="radio" name="no_cartao" value="${v}" class="sr-only" ${v === ultimoNoCartao ? 'checked' : ''}>
          <span>${t}</span><span class="text-xs font-normal text-stone-600 dark:text-stone-400">${sub}</span></label>`).join('')}</div>
      </fieldset>` : ''}

      <div class="card grid gap-4">
        ${campoValor(null)}
        <div data-so-descricao>${campoDescricao('', 'Ex.: Conta de luz')}</div>
        <div data-so-categoria>${campoCategoria(null, ultimoModo === 'cartao' ? 'cartao' : ultimoModo)}</div>

        <div data-secao="caixa" class="grid gap-4">
          ${camposCaixa({})}
          ${campoDividir()}
          <div data-campo>
            <label class="rotulo" for="f-repetir">Repetir todo mês?</label>
            <select id="f-repetir" name="repetir" class="campo" aria-describedby="dica-repetir">
              <option value="1">Não, só esta vez</option>
              <option value="meses">Todo mês, por alguns meses</option>
              <option value="sempre">Todo mês, sempre (até eu parar)</option>
              <option value="anos">Todo ano, por alguns anos</option>
              <option value="anual">Todo ano, sempre (até eu parar)</option>
            </select>
            <div class="mt-2 flex flex-wrap items-center gap-2" data-meses hidden>
              <label for="f-meses" class="text-sm font-semibold" data-rotulo-meses>Quantos meses?</label>
              <input id="f-meses" name="meses" type="number" min="2" max="${MAX_MESES}" step="1" inputmode="numeric" class="campo w-28 tabular-nums" value="12">
              <span class="text-sm text-stone-600 dark:text-stone-400" data-ate-quando></span>
            </div>
            <p id="dica-repetir" class="dica" data-dica-repetir></p>
          </div>
        </div>

        <div data-secao="cartao" class="grid gap-4" hidden>
          ${cartoes.length ? `
          <div class="grid gap-4 sm:grid-cols-2">
            <div data-campo><label class="rotulo" for="f-cartao">Cartão</label>
              <select id="f-cartao" name="cartao_id" class="campo">${cartoes.map((c) => `<option value="${c.id}" ${c.id === ultimoCartao ? 'selected' : ''}>${esc(c.nome)}</option>`).join('')}</select></div>
            <div data-campo><label class="rotulo" for="f-data" data-rotulo-data>Data da compra</label>
              <input id="f-data" name="data_compra" type="date" class="campo" value="${hojeISO()}"></div>
          </div>
          <div class="grid gap-4 sm:grid-cols-2" data-so-compra>
            <div data-campo><label class="rotulo" for="f-parcelas">Parcelas</label>
              <select id="f-parcelas" name="parcelas" class="campo">${Array.from({ length: 24 }, (_, i) => `<option value="${i + 1}">${i ? `${i + 1}x` : 'À vista (1x)'}</option>`).join('')}
                <option value="outro">Outra quantidade…</option>
                <option value="sempre">Assinatura (todo mês)</option>
                <option value="anual">Assinatura anual (todo ano)</option></select>
              <input id="f-parcelas-outra" name="parcelas_outra" type="number" inputmode="numeric" min="2" max="${MAX_PARCELAS}" step="1" class="campo mt-2" placeholder="Quantas parcelas? Ex.: 36" aria-label="Quantidade de parcelas" hidden></div>
            <div data-campo><label class="rotulo" for="f-sub">Subcategoria <span class="font-normal text-stone-600 dark:text-stone-400">(opcional)</span></label>
              <input id="f-sub" name="subcategoria" class="campo" maxlength="60" placeholder="Ex.: Eletrodoméstico"></div>
          </div>
          <div data-so-compra>
            <label class="rotulo" for="f-pessoa-cartao">Pessoa <span class="font-normal text-stone-600 dark:text-stone-400">(opcional)</span></label>
            <input id="f-pessoa-cartao" name="pessoa_cartao" class="campo" list="lista-pessoas-cartao" autocomplete="off" placeholder="Quem comprou ou para quem foi" value="">
            <datalist id="lista-pessoas-cartao">${store.pessoas.map((p) => `<option value="${esc(p.nome)}"></option>`).join('')}</datalist>
            <p class="dica">Escreva um nome novo e ele é cadastrado automaticamente.</p>
          </div>
          <div class="grid gap-4 sm:grid-cols-2" data-so-adiantamento hidden>
            <div data-campo><label class="rotulo" for="f-conta-adi">Pagou com qual conta?</label>
              <select id="f-conta-adi" name="conta_adiantamento" class="campo">${opcoesConta(contasAtivas()[0]?.id)}</select>
              <p class="dica">O valor sai do saldo desta conta.</p></div>
            <div data-campo><label class="rotulo" for="f-fatura">Abate qual fatura?</label>
              <select id="f-fatura" name="fatura_mes" class="campo"></select></div>
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
    const atualizarCaixa = ligarCamposCaixa(form);
    // pagamento dividido em várias contas não se repete (cada mês seria um pagamento diferente)
    const divisao = ligarDividir(form, (ligado) => {
      form.repetir.disabled = ligado;
      if (ligado) form.repetir.value = '1';
      atualizarRepetir();
    });

    const modo = () => form.modo.value;
    const noCartao = () => (modo() === 'cartao' && form.no_cartao ? form.no_cartao.value : null);
    const mostrar = (sel, sim) => el.querySelectorAll(sel).forEach((x) => (x.hidden = !sim));

    const trocarModo = () => {
      ultimoModo = modo();
      if (form.no_cartao) ultimoNoCartao = form.no_cartao.value;
      const oque = noCartao();
      mostrar('[data-secao="caixa"]', modo() !== 'cartao');
      mostrar('[data-secao="cartao"]', modo() === 'cartao');
      mostrar('[data-secao="no-cartao"]', modo() === 'cartao');
      mostrar('[data-so-compra]', !oque || oque === 'compra');
      mostrar('[data-so-adiantamento]', oque === 'adiantamento');
      mostrar('[data-so-categoria]', oque !== 'adiantamento');
      form.descricao.placeholder = oque === 'estorno' ? 'Ex.: Estorno da compra da loja X'
        : oque === 'adiantamento' ? 'Adiantamento da fatura'
        : { saida: 'Ex.: Conta de luz', entrada: 'Ex.: Venda de bezerros', cartao: 'Ex.: Supermercado' }[modo()];
      const rotuloData = el.querySelector('[data-rotulo-data]');
      if (rotuloData) rotuloData.textContent = oque === 'estorno' ? 'Data do reembolso' : oque === 'adiantamento' ? 'Data do pagamento' : 'Data da compra';
      const dicaCat = el.querySelector('[data-dica-categoria]');
      const textoPago = el.querySelector('[data-texto-pago]');
      if (textoPago) textoPago.textContent = modo() === 'entrada' ? 'Já foi recebido' : 'Já foi pago';
      const rotuloPagamento = el.querySelector('[data-rotulo-pagamento]');
      if (rotuloPagamento) rotuloPagamento.textContent = modo() === 'entrada' ? 'Data do recebimento' : 'Data do pagamento';
      divisao.atualizarTexto(modo());
      limparErros(form);
      atualizarCategorias(form, modo() === 'cartao' ? 'cartao' : modo());
      if (dicaCat && oque === 'estorno') dicaCat.textContent = 'A categoria da compra que foi devolvida: o valor é descontado dela.';
      atualizarRepetir();
      atualizarPrevia();
    };

    const atualizarRepetir = () => {
      const r = form.repetir.value;
      const anos = r === 'anos';
      mostrar('[data-meses]', r === 'meses' || anos);
      el.querySelector('[data-rotulo-meses]').textContent = anos ? 'Quantos anos?' : 'Quantos meses?';
      form.meses.max = anos ? MAX_ANOS : MAX_MESES;
      const n = Math.trunc(Number(form.meses.value));
      const venc = form.vencimento.value || hojeISO();
      el.querySelector('[data-ate-quando]').textContent = n >= 2 && n <= (anos ? MAX_ANOS : MAX_MESES)
        ? `até ${nomeMes(parseISO(somarMeses(venc, (n - 1) * (anos ? 12 : 1)))).toLowerCase()}` : '';
      el.querySelector('[data-dica-repetir]').textContent = form.dividir?.checked
        ? 'Um pagamento dividido em várias contas é lançado uma vez só.'
        : r === 'sempre'
        ? `Lança todo mês até você parar. O sistema mantém os próximos ${HORIZONTE_MESES} meses lançados e completa sozinho. Para parar, exclua um mês e escolha "Este e os próximos".`
        : r === 'anual' ? 'Lança uma vez por ano, na mesma data, até você parar (IPVA, seguro, anuidade). O próximo ano já fica lançado.'
        : r === 'meses' ? `Digite de 2 a ${MAX_MESES} meses. Só a primeira fica marcada como paga.`
        : anos ? `Digite de 2 a ${MAX_ANOS} anos. Lança uma vez por ano, na mesma data.`
        : 'Para contas fixas como aluguel, internet ou salário de funcionário.';
    };

    const atualizarPrevia = () => {
      const area = el.querySelector('[data-previa]');
      if (!area || modo() !== 'cartao') return;
      const cartao = buscar('cartoes', form.cartao_id.value);
      const total = lerValor(form.valor.value) || 0;
      const data = form.data_compra.value || hojeISO();
      const oque = noCartao();
      if (oque === 'adiantamento') {
        const escolhida = form.fatura_mes.value;
        form.fatura_mes.innerHTML = [0, 1, 2].map((i) => {
          const f = faturaDe(cartao, data, i);
          return `<option value="${f}" ${f === escolhida ? 'selected' : ''}>${nomeMes(parseISO(f))} (vence ${dataCompleta(vencimentoFatura(cartao, f))})</option>`;
        }).join('');
        if (!form.fatura_mes.value) form.fatura_mes.selectedIndex = 0;
        area.innerHTML = `<p class="flex items-start gap-2"><span class="mt-0.5 shrink-0 text-brand-700 dark:text-brand-400">${icone('calendario')}</span>
          <span>${total ? `<strong>${brl(total)}</strong> saem` : 'O valor sai'} da conta escolhida e abatem a fatura de <strong>${nomeMes(parseISO(form.fatura_mes.value))}</strong> do ${esc(cartao.nome)}. Na tela Cartões aparece quanto já foi adiantado e quanto falta pagar.</span></p>`;
        return;
      }
      const primeira = faturaDe(cartao, data, 0);
      if (oque === 'estorno') {
        area.innerHTML = `<p class="flex items-start gap-2"><span class="mt-0.5 shrink-0 text-brand-700 dark:text-brand-400">${icone('calendario')}</span>
          <span>O reembolso${total ? ` de <strong>${brl(total)}</strong>` : ''} abate a fatura de <strong>${nomeMes(parseISO(primeira))}</strong>, que vence em <strong>${dataCompleta(vencimentoFatura(cartao, primeira))}</strong>.</span></p>`;
        return;
      }
      const anual = form.parcelas.value === 'anual';
      const sempre = form.parcelas.value === 'sempre' || anual;
      const n = sempre ? 1 : (qtdParcelas(form) || 1);
      const ultima = faturaDe(cartao, data, n - 1);
      const valores = dividirParcelas(total, n);
      [...form.parcelas.options].forEach((o, i) => {
        if (o.value === 'outro') { o.textContent = n > 24 ? `${n}x${total ? ` de ${brl(total / n)}` : ''}` : 'Outra quantidade…'; return; }
        if (o.value === 'sempre') { o.textContent = `Assinatura (todo mês)${total ? ` · ${brl(total)} por mês` : ''}`; return; }
        if (o.value === 'anual') { o.textContent = `Assinatura anual (todo ano)${total ? ` · ${brl(total)} por ano` : ''}`; return; }
        o.textContent = i ? `${i + 1}x${total ? ` de ${brl(total / (i + 1))}` : ''}` : `À vista (1x)${total ? ` · ${brl(total)}` : ''}`;
      });
      area.innerHTML = `
        <p class="flex items-start gap-2"><span class="mt-0.5 shrink-0 text-brand-700 dark:text-brand-400">${icone('calendario')}</span>
        <span>${sempre ? 'A 1ª cobrança' : `A ${n > 1 ? '1ª parcela' : 'compra'}`} entra na fatura de <strong>${nomeMes(parseISO(primeira))}</strong>, que vence em <strong>${dataCompleta(vencimentoFatura(cartao, primeira))}</strong>.
        ${sempre ? `<br>Depois, ${total ? `<strong>${brl(total)}</strong>` : 'o mesmo valor'} ${anual ? 'uma vez por ano, na fatura do mesmo mês' : 'em todas as faturas'}, até você cancelar (na tela Cartões, exclua uma cobrança e escolha "Esta e as próximas").` : ''}
        ${!sempre && n > 1 ? `<br>${n} parcelas de <strong>${brl(valores[0])}</strong>, até <strong>${nomeMes(parseISO(ultima))}</strong>.` : ''}</span></p>
        <p class="mt-2 text-stone-600 dark:text-stone-400">${esc(cartao.nome)} fecha todo dia ${cartao.dia_fechamento}. Compras a partir desse dia vão para a fatura seguinte.</p>`;
    };

    form.addEventListener('change', (e) => {
      if (e.target.name === 'modo' || e.target.name === 'no_cartao') trocarModo();
      else if (e.target.name === 'repetir' || e.target.name === 'vencimento') atualizarRepetir();
      else {
        if (e.target.name === 'cartao_id') ultimoCartao = e.target.value;
        if (e.target.name === 'parcelas') {
          // "Outra quantidade…": abre o campo para digitar quantas parcelas quiser
          form.parcelas_outra.hidden = form.parcelas.value !== 'outro';
          if (!form.parcelas_outra.hidden) form.parcelas_outra.focus();
        }
        atualizarPrevia();
      }
    });
    form.addEventListener('input', (e) => {
      if (e.target.name === 'parcelas_outra') erroNoCampo(form, 'parcelas_outra', '');
      if (e.target.name === 'valor' || e.target.name === 'parcelas_outra') atualizarPrevia();
      if (e.target.name === 'meses') atualizarRepetir();
    });
    trocarModo();

    form.onsubmit = semRepetir(async (e) => {
      e.preventDefault();
      limparErros(form);
      const botao = form.querySelector('[type=submit]');
      try {
        let salvo;
        if (noCartao() === 'adiantamento') {
          salvo = await salvarAdiantamento(form, botao);
          if (salvo) toast(salvo.mensagem, { acao: desfazendo(() => excluirLancamentos(salvo.ids)) });
        } else if (modo() === 'cartao') {
          salvo = await salvarCompra(form, botao, noCartao() === 'estorno');
          if (salvo) toast(salvo.mensagem, { acao: desfazendo(() => excluirCompra(salvo.id)) });
        } else {
          salvo = await salvarCaixa(form, botao, modo(), divisao);
          if (salvo) toast(salvo.mensagem, { acao: desfazendo(() => excluirLancamentos(salvo.ids)) });
        }
        if (!salvo) return;
        // limpa para lançar o próximo, mantendo tipo, conta e cartão escolhidos
        form.valor.value = '';
        form.descricao.value = '';
        form.pessoa.value = '';
        if (form.pessoa_cartao) form.pessoa_cartao.value = '';
        form.repetir.value = '1';
        if (form.parcelas) { form.parcelas.value = '1'; form.parcelas_outra.value = ''; form.parcelas_outra.hidden = true; }
        if (form.subcategoria) form.subcategoria.value = '';
        for (const campo of ['desconto', 'juros', 'observacao', 'competencia']) if (form[campo]) form[campo].value = '';
        divisao.limpar();
        atualizarCaixa();
        atualizarRepetir();
        atualizarPrevia();
        form.valor.focus();
      } catch (err) {
        toast(err.message, { tipo: 'erro' });
      } finally {
        botao.disabled = false;
      }
    });
  },
};

/**
 * Quantas vezes lançar e de quantos em quantos meses: 1, o número digitado (meses ou anos),
 * ou "sempre" (todo mês ou todo ano, até o limite de meses à frente).
 */
function vezesDoRepetir(form, vencimento) {
  const r = form.repetir.value;
  if (r === 'sempre' || r === 'anual') {
    const passo = r === 'anual' ? 12 : 1;
    return { vezes: proximasDatas(vencimento, vencimento, limiteRecorrencia(), passo).length + 1, sempre: true, passo };
  }
  if (r !== 'meses' && r !== 'anos') return { vezes: 1, sempre: false, passo: 1 };
  const anos = r === 'anos';
  const max = anos ? MAX_ANOS : MAX_MESES;
  const n = Number(form.meses.value);
  if (!Number.isInteger(n) || n < 2 || n > max) {
    erroNoCampo(form, 'meses', `Digite um número de ${anos ? 'anos' : 'meses'} entre 2 e ${max}.`);
    form.meses.focus();
    return null;
  }
  return { vezes: n, sempre: false, passo: anos ? 12 : 1 };
}

async function salvarCaixa(form, botao, tipo, divisao) {
  const dados = lerCamposCaixa(form, tipo);
  if (!dados) return null;
  const partes = divisao.ligado() ? lerDivisao(form, dados.valor) : null;
  if (divisao.ligado() && !partes) return null;
  const rep = partes ? { vezes: 1, sempre: false, passo: 1 } : vezesDoRepetir(form, dados.vencimento);
  if (!rep) return null;
  if (!(await podeSalvarMesmoParecido({ tipo, valor: dados.valor, data: dados.vencimento, categoria_id: dados.categoria_id, descricao: dados.descricao }))) return null;
  botao.disabled = true;
  const { pessoaNome, ...base } = dados;
  base.pessoa_id = await pessoaPorNome(pessoaNome);
  if (partes) {
    // um lançamento por conta, ligados pelo mesmo `divisao` (desconto e juros divididos na proporção)
    const divisaoId = crypto.randomUUID();
    const salvos = await criarLancamentos(dividirAjustes(partes, base).map((p) => ({ ...base, ...p, divisao: divisaoId, parcela: null, grupo: null })));
    return {
      ids: salvos.map((s) => s.id),
      mensagem: `“${base.descricao}” salvo em ${partes.length} contas (${brl(base.valor)})`,
    };
  }
  const { vezes, sempre, passo } = rep;
  const grupo = vezes > 1 || sempre ? crypto.randomUUID() : null;
  const ultimaData = somarMeses(base.vencimento, (vezes - 1) * passo);
  // desconto e juros valem só para o primeiro mês: os próximos ficam com o valor original
  const semAjuste = { valor: base.valor_original ?? base.valor, valor_original: null, desconto: null, juros: null };
  const linhas = Array.from({ length: vezes }, (_, i) => ({
    ...base,
    ...(i > 0 ? semAjuste : {}),
    vencimento: somarMeses(base.vencimento, i * passo),
    competencia: base.competencia ? somarMeses(base.competencia, i * passo) : null,
    pago: i === 0 && base.pago,
    data_pagamento: i === 0 && base.pago ? base.data_pagamento : null,
    parcela: vezes > 1 && !sempre ? `${i + 1}/${vezes}` : null,
    grupo,
    ...(sempre ? { recorrente: true, recorrente_base: base.vencimento, recorrente_ate: ultimaData, recorrente_intervalo: passo } : {}),
  }));
  const salvos = await criarLancamentos(linhas);
  return {
    ids: salvos.map((s) => s.id),
    mensagem: sempre ? `“${base.descricao}” lançado todo ${passo === 12 ? 'ano' : 'mês'} (até você parar)`
      : vezes > 1 ? `“${base.descricao}” lançado para os próximos ${vezes} ${passo === 12 ? 'anos' : 'meses'}` : `“${base.descricao}” salvo`,
  };
}

// parcelas: 1x a 24x na lista; em "Outra quantidade…" o usuário digita quantas quiser (até 420 = 35 anos)
const MAX_PARCELAS = 420;
/** Quantidade de parcelas escolhida (ou null se o número digitado não vale) */
function qtdParcelas(form) {
  if (form.parcelas.value !== 'outro') return Number(form.parcelas.value);
  const n = Number(form.parcelas_outra.value);
  return Number.isInteger(n) && n >= 1 && n <= MAX_PARCELAS ? n : null;
}

async function salvarCompra(form, botao, estorno) {
  const total = lerValor(form.valor.value);
  const descricao = form.descricao.value.trim();
  const categoria_id = form.categoria_id.value || null;
  let ok = true;
  if (!(total > 0)) { erroNoCampo(form, 'valor', estorno ? 'Digite o valor do reembolso.' : 'Digite o valor total da compra.'); ok = false; }
  else if (total > VALOR_MAXIMO) { erroNoCampo(form, 'valor', `O valor máximo é ${valorMaximoTexto()}.`); ok = false; }
  if (!descricao) { erroNoCampo(form, 'descricao', estorno ? 'Escreva o que foi reembolsado.' : 'Escreva o que foi comprado.'); ok = false; }
  if (!categoria_id) { erroNoCampo(form, 'categoria_id', 'Escolha uma categoria.'); ok = false; }
  else if (erroDeTipo(categoria_id, 'cartao')) { erroNoCampo(form, 'categoria_id', erroDeTipo(categoria_id, 'cartao')); ok = false; }
  if (!form.data_compra.value) { erroNoCampo(form, 'data_compra', 'Escolha a data.'); ok = false; }
  if (!estorno && form.parcelas.value === 'outro' && !qtdParcelas(form)) { erroNoCampo(form, 'parcelas_outra', `Digite quantas parcelas (de 2 a ${MAX_PARCELAS}).`); ok = false; }
  if (!ok) { form.querySelector('[aria-invalid]').focus(); return null; }
  if (!estorno && !(await podeSalvarMesmoParecido({ tipo: 'cartao', valor: total, data: form.data_compra.value, categoria_id, descricao }))) return null;

  botao.disabled = true;
  const cartao = buscar('cartoes', form.cartao_id.value);
  const data = form.data_compra.value;
  const pessoa_id = !estorno ? await pessoaPorNome(form.pessoa_cartao?.value || '') : null;
  const base = { cartao_id: cartao.id, data_compra: data, valor_total: total, descricao, categoria_id, pessoa_id };

  if (estorno) {
    const compra = await criarCompra({ ...base, qtd_parcelas: 1, tipo: 'estorno', subcategoria: null },
      [{ numero: 1, valor: -total, fatura_mes: faturaDe(cartao, data, 0) }]);
    return { id: compra.id, mensagem: `Reembolso de ${brl(total)} lançado no ${cartao.nome}` };
  }
  const subcategoria = form.subcategoria.value.trim() || null;
  if (form.parcelas.value === 'sempre' || form.parcelas.value === 'anual') {
    // assinatura: o mesmo valor todo mês (ou todo ano), até o limite de meses à frente (o resto vem sozinho)
    const passo = form.parcelas.value === 'anual' ? 12 : 1;
    const primeira = faturaDe(cartao, data, 0);
    const meses = [{ indice: 0, data: primeira }, ...proximasDatas(primeira, primeira, limiteRecorrencia(), passo)];
    const compra = await criarCompra(
      { ...base, qtd_parcelas: meses.length, subcategoria, recorrente: true, recorrente_intervalo: passo, recorrente_base: primeira, recorrente_ate: meses[meses.length - 1].data },
      meses.map((m) => ({ numero: m.indice + 1, valor: total, fatura_mes: m.data })),
    );
    return { id: compra.id, mensagem: `Assinatura “${descricao}” lançada no ${cartao.nome}: ${brl(total)} todo ${passo === 12 ? 'ano' : 'mês'}` };
  }
  const n = qtdParcelas(form);
  const compra = await criarCompra(
    { ...base, qtd_parcelas: n, subcategoria },
    dividirParcelas(total, n).map((valor, i) => ({ numero: i + 1, valor, fatura_mes: faturaDe(cartao, data, i) })),
  );
  return { id: compra.id, mensagem: n > 1 ? `${n} parcelas lançadas no ${cartao.nome}` : `Compra lançada no ${cartao.nome}` };
}

/** Pagamento de parte da fatura antes do vencimento: sai da conta e abate a fatura escolhida */
async function salvarAdiantamento(form, botao) {
  const total = lerValor(form.valor.value);
  let ok = true;
  if (!(total > 0)) { erroNoCampo(form, 'valor', 'Digite quanto foi adiantado.'); ok = false; }
  else if (total > VALOR_MAXIMO) { erroNoCampo(form, 'valor', `O valor máximo é ${valorMaximoTexto()}.`); ok = false; }
  if (!form.conta_adiantamento.value) { erroNoCampo(form, 'conta_adiantamento', 'Escolha a conta.'); ok = false; }
  if (!form.data_compra.value) { erroNoCampo(form, 'data_compra', 'Escolha a data.'); ok = false; }
  if (!ok) { form.querySelector('[aria-invalid]').focus(); return null; }
  botao.disabled = true;
  const cartao = buscar('cartoes', form.cartao_id.value);
  const mes = form.fatura_mes.value;
  const data = form.data_compra.value;
  const descricao = form.descricao.value.trim() || `Adiantamento fatura ${cartao.nome} (${nomeMes(parseISO(mes)).toLowerCase()})`;
  const salvos = await criarLancamentos([{
    tipo: 'saida', valor: total, descricao, vencimento: data, pago: true, data_pagamento: data,
    conta_id: form.conta_adiantamento.value, categoria_id: null, fatura_cartao_id: cartao.id, fatura_mes: mes, adiantamento: true,
  }]);
  return { ids: salvos.map((s) => s.id), mensagem: `Adiantamento de ${brl(total)} na fatura de ${nomeMes(parseISO(mes)).toLowerCase()} do ${cartao.nome}` };
}

/**
 * Se já existe um lançamento igual (mesmo valor, mesmo dia e mesma categoria ou descrição parecida),
 * pergunta antes de salvar. Retorna true para salvar, false para não salvar.
 */
async function podeSalvarMesmoParecido(dados) {
  const igual = await procurarParecido(dados);
  if (!igual) return true;
  const horario = igual.criado_em ? ` às ${new Date(igual.criado_em).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}` : '';
  const oQue = dados.tipo === 'entrada' ? 'uma entrada semelhante a esta' : 'um gasto semelhante a este';
  const onde = igual.origem === 'cartao' ? `no ${esc(buscar('cartoes', igual.cartao_id)?.nome || 'cartão')}` : `em ${esc(buscar('contas', igual.conta_id)?.nome || 'conta')}`;
  return new Promise((resolver) => {
    const d = dialogo({
      titulo: 'Lançamento repetido?',
      largura: 'max-w-md',
      corpo: `
        <p class="text-stone-700 dark:text-stone-300"><strong>Você já lançou ${oQue}.</strong> Deseja continuar mesmo assim?</p>
        <div class="mt-4 flex items-center gap-3 rounded-xl border border-stone-200 p-3 dark:border-stone-700">
          <span class="min-w-0 flex-1"><span class="block font-semibold">${esc(igual.descricao)}</span>
          <span class="block text-sm text-stone-600 dark:text-stone-400">${esc(nomeCategoria(igual.categoria_id))} · ${onde}${igual.criado_em ? ` · lançado${horario}` : ''}</span></span>
          <span class="shrink-0 font-semibold tabular-nums">${brl(igual.valorTotal)}</span>
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
