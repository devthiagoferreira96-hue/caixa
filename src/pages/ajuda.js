// "Como usar": guia em linguagem simples
import { icone } from '../lib/ui.js';
import { abrirTour } from '../components/tour.js';

const TOPICOS = [
  ['mais', 'Lançar um gasto ou uma entrada', `
    <p>Toque no botão verde <strong>+</strong> (no computador, <strong>Novo lançamento</strong>).</p>
    <ol class="list-decimal pl-5"><li>Escolha <strong>Saída</strong>, <strong>Entrada</strong> ou <strong>Cartão</strong>.</li>
    <li>Digite o valor só com números: <strong>4590</strong> vira <strong>R$ 45,90</strong>.</li>
    <li>Escreva uma descrição curta e escolha a categoria.</li><li>Toque em <strong>Salvar</strong>.</li></ol>
    <p>Se errar, toque em <strong>Desfazer</strong> no aviso que aparece embaixo da tela.</p>`],
  ['check', 'Contas a pagar e o círculo de "pago"', `
    <p>Ao lançar uma conta que ainda vai vencer, desmarque <strong>Já foi pago</strong>. Ela aparece no Início em <strong>Contas a pagar</strong>.</p>
    <p>Quando pagar, toque no <strong>círculo</strong> ao lado dela. Ele fica verde e o saldo da conta é atualizado. É o mesmo que o "OK" da coluna STATUS da planilha.</p>`],
  ['repetir', 'Contas que se repetem todo mês', `
    <p>Aluguel, internet, salário de funcionário: no lançamento, escolha <strong>Repetir todo mês</strong> e por quantos meses.</p>
    <p>Para apagar, abra um deles e toque em <strong>Excluir</strong>: o sistema pergunta se é só aquele mês ou daquele em diante.</p>`],
  ['cartao', 'Compras no cartão e parcelas', `
    <p>Escolha <strong>Cartão</strong>, digite o <strong>valor total</strong> e o número de parcelas. O sistema mostra em qual fatura a compra vai cair e cria todas as parcelas sozinho.</p>
    <p>A fatura é decidida pelo <strong>dia de fechamento</strong> do cartão, que você confere em <a href="#ajustes" class="font-semibold underline">Ajustes</a>.</p>
    <p>Na tela <a href="#cartoes" class="font-semibold underline">Cartões</a>, toque em <strong>Pagar fatura</strong> quando pagar. O valor sai do saldo da conta que você escolher, e as compras não são contadas duas vezes nos gráficos.</p>`],
  ['relatorio', 'Gráficos e relatório', `
    <p>O gráfico do Início mostra as categorias da casa. Em Ajustes > Categorias, a opção <strong>No gráfico</strong> escolhe quais aparecem.</p>
    <p>O <a href="#relatorio" class="font-semibold underline">Relatório</a> mostra todas as categorias, separadas por grupo, os últimos 6 meses e os pagamentos por pessoa.</p>`],
  ['pessoas', 'Usar em duas pessoas', `
    <p>Quem criou a família vê o <strong>código de convite</strong> em <a href="#ajustes" class="font-semibold underline">Ajustes</a>. A outra pessoa cria a conta dela e digita esse código. Daí em diante, os dois veem tudo igual.</p>`],
  ['pessoas', 'Quem lançou cada coisa', `
    <p>A bolinha colorida com as iniciais, ao lado do valor, mostra quem lançou. Passe o mouse ou toque nela para ver o nome. No Extrato, o filtro <strong>Lançado por</strong> mostra só o que uma pessoa lançou.</p>
    <p>Ao abrir um lançamento, o rodapé mostra quem lançou e quem alterou por último, com data e hora.</p>
    <p>Quando a outra pessoa lança algo, aparece um aviso como <strong>"Thays lançou 2 itens"</strong>. Toque em <strong>Ver</strong> para abrir.</p>
    <p>Para mudar o nome que aparece para os outros, vá em <a href="#ajustes" class="font-semibold underline">Ajustes > Minha conta</a>.</p>`],
  ['alerta', 'Gasto lançado duas vezes', `
    <p>Se você for lançar um gasto com o <strong>mesmo valor, no mesmo dia</strong> e com a mesma categoria ou descrição parecida de algo que a outra pessoa já lançou, o sistema pergunta antes: <em>"Thays lançou um gasto semelhante a este, deseja continuar mesmo assim?"</em></p>
    <p><strong>Não lançar</strong> cancela sem mudar nada. <strong>Lançar mesmo assim</strong> salva normalmente. O mesmo aviso aparece se você mesmo repetir um lançamento em poucos minutos.</p>`],
  ['repetir', 'Desfazer', `
    <p>Depois de lançar, editar, marcar como pago, excluir, pagar fatura ou mudar algo em Ajustes, aparece um aviso embaixo da tela com o botão <strong>Desfazer</strong>. Ele volta tudo como estava, inclusive as parcelas de uma compra excluída.</p>`],
  ['celular', 'Colocar na tela do celular', `
    <p><strong>Android (Chrome):</strong> abra o sistema, toque nos três pontinhos ⋮ e em <strong>Adicionar à tela inicial</strong>.</p>
    <p><strong>iPhone (Safari):</strong> toque no botão de compartilhar e em <strong>Adicionar à Tela de Início</strong>.</p>
    <p>Ele vai abrir como um aplicativo, sem a barra do navegador.</p>`],
  ['paleta', 'Letras maiores e modo escuro', `
    <p>Em <a href="#ajustes" class="font-semibold underline">Ajustes > Aparência</a> dá para aumentar o tamanho das letras e escolher o tema claro ou escuro.</p>`],
];

export default {
  titulo: 'Como usar',
  usaMes: false,
  ajuda: '<p>Toque num assunto para ver a explicação. Em qualquer tela, o botão <strong>?</strong> no topo explica aquela tela.</p>',

  async render(el) {
    el.innerHTML = `
    <div class="mx-auto grid max-w-3xl gap-3 animate-entrar">
      <div class="card flex flex-col items-start gap-3 sm:flex-row sm:items-center">
        <p class="flex-1 text-stone-700 dark:text-stone-300">Primeira vez por aqui? Veja a apresentação rápida, com 5 passos.</p>
        <button type="button" class="btn-primario" data-tour>Ver apresentação</button>
      </div>
      ${TOPICOS.map(([ic, titulo, texto], i) => `
      <details class="card group p-0 sm:p-0" ${i === 0 ? 'open' : ''}>
        <summary class="flex min-h-14 cursor-pointer list-none items-center gap-3 rounded-2xl px-4 py-3 font-semibold sm:px-5 [&::-webkit-details-marker]:hidden">
          <span class="flex size-9 items-center justify-center rounded-lg bg-brand-50 text-brand-700 dark:bg-brand-950 dark:text-brand-300">${icone(ic)}</span>
          <span class="flex-1">${titulo}</span>
          <span class="text-stone-400 transition group-open:rotate-90">${icone('direita')}</span>
        </summary>
        <div class="grid gap-2 border-t border-stone-100 px-4 pt-4 pb-5 text-stone-700 sm:px-5 dark:border-stone-800 dark:text-stone-300">${texto}</div>
      </details>`).join('')}
    </div>`;
    el.onclick = (e) => e.target.closest('[data-tour]') && abrirTour();
  },
};
