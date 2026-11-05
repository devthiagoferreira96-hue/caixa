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
  ['etiqueta', 'Categorias de entrada e de saída', `
    <p>Cada categoria tem um <strong>tipo</strong>: <strong>Saída</strong> (gastos), <strong>Entrada</strong> (como Venda e Rendimentos Bancários) ou <strong>Os dois</strong> (como Empréstimos e Ajuste Caixa, que podem entrar ou sair).</p>
    <p>Ao lançar, só aparecem as categorias do tipo escolhido. Para mudar o tipo de uma categoria, vá em <a href="#ajustes" class="font-semibold underline">Ajustes > Categorias</a>.</p>`],
  ['relatorio', 'Casa e Fazenda separadas no Início', `
    <p>O <strong>Resumo da casa</strong> não conta as categorias dos grupos <strong>Fazenda</strong> e <strong>Empresa</strong>. Assim dá para ver quanto a casa gastou de verdade.</p>
    <p>A Fazenda tem um quadro próprio: <strong>vendas menos despesas</strong>, dizendo se o mês deu lucro ou prejuízo, e as despesas por categoria. A Empresa ganha um quadro igual quando tiver lançamentos.</p>
    <p>O <strong>resultado geral</strong>, somando tudo, aparece embaixo do Resumo da casa. Para uma categoria entrar ou sair da Fazenda, mude o <strong>grupo</strong> dela em Ajustes > Categorias.</p>`],
  ['relatorio', 'Gráficos e relatório', `
    <p>O gráfico do Início mostra as categorias da casa. Em Ajustes > Categorias, a opção <strong>No gráfico</strong> escolhe quais aparecem.</p>
    <p>O <a href="#relatorio" class="font-semibold underline">Relatório</a> mostra todas as categorias, separadas por grupo, os últimos 6 meses e os pagamentos por pessoa.</p>`],
  ['cadeado', 'Senha e bloqueio', `
    <p>Sempre que o sistema é aberto, ele pede a sua senha. Se o app ficar mais de 1 minuto em segundo plano, a senha é pedida de novo. Para bloquear na hora, toque no <strong>cadeado</strong>.</p>
    <p>A senha também protege os dados guardados no aparelho: sem ela, ninguém consegue lê-los. Para trocar, vá em <a href="#ajustes" class="font-semibold underline">Ajustes > Usuário e senha</a>.</p>`],
  ['repetir', 'Esqueci a senha: código de recuperação', `
    <p>Ao criar o acesso, o sistema mostra um <strong>código de recuperação</strong> (16 letras e números). Mande para o seu WhatsApp ou anote num papel.</p>
    <p>Se esquecer a senha, na tela de senha toque em <strong>Esqueci minha senha</strong>, digite o código e crie uma senha nova. <strong>Nenhum dado se perde.</strong> Depois disso o sistema mostra um código novo para guardar (o usado deixa de valer).</p>
    <p>Perdeu o código? Em <a href="#ajustes" class="font-semibold underline">Ajustes > Usuário e senha</a>, toque em <strong>Novo código de recuperação</strong> (precisa da senha).</p>
    <p>Sem a senha e sem o código, não há como abrir os dados: só um backup os traz de volta.</p>`],
  ['baixar', 'Backup: não perca seus dados', `
    <p>O sistema funciona 100% sem internet e guarda tudo <strong>só neste aparelho</strong>. Se o celular for perdido, trocado ou formatado, os dados vão junto, a não ser que você tenha um backup.</p>
    <p>Em <a href="#ajustes" class="font-semibold underline">Ajustes > Backup e exportar</a>, toque em <strong>Backup, Excel ou PDF</strong>, escolha <strong>Backup completo</strong> e toque em <strong>Gerar backup</strong>. No celular, escolha onde guardar (Drive, e-mail ou WhatsApp). O Início lembra você quando passar de 30 dias sem backup.</p>
    <p>Para trazer os dados de volta (no mesmo ou em outro aparelho), use <strong>Restaurar um backup</strong>.</p>`],
  ['planilha', 'Planilha do Excel e relatório em PDF', `
    <p>Na mesma tela do backup dá para gerar:</p>
    <ul class="list-disc pl-5">
      <li><strong>Planilha do Excel</strong>: abas de Resumo, Lançamentos, Cartões e Gastos por categoria, com filtros e totais. Abre no Excel e no Google Planilhas.</li>
      <li><strong>Relatório em PDF</strong>: resumo do período, gastos por categoria com barrinhas, saldo das contas e a lista de lançamentos e compras no cartão. Bom para imprimir ou mandar para o contador.</li>
    </ul>
    <p>Escolha o período: o mês aberto na tela, o ano inteiro ou tudo.</p>
    <p><strong>Atenção:</strong> planilha e PDF são só para consultar. Para guardar os dados e poder restaurar depois, use o <strong>Backup completo</strong>.</p>`],
  ['alerta', 'Gasto lançado duas vezes', `
    <p>Se você for lançar um gasto com o <strong>mesmo valor, no mesmo dia</strong> e com a mesma categoria ou descrição parecida de algo que já está lançado, o sistema pergunta antes: <em>"Você já lançou um gasto semelhante a este. Deseja continuar mesmo assim?"</em></p>
    <p><strong>Não lançar</strong> cancela sem mudar nada. <strong>Lançar mesmo assim</strong> salva normalmente.</p>`],
  ['check', 'Desfazer', `
    <p>Depois de lançar, editar, marcar como pago, excluir, pagar fatura, restaurar backup ou mudar algo em Ajustes, aparece um aviso embaixo da tela com o botão <strong>Desfazer</strong>. Ele volta tudo como estava, inclusive as parcelas de uma compra excluída.</p>`],
  ['celular', 'Colocar na tela do celular', `
    <p><strong>Android (Chrome):</strong> abra o sistema, toque nos três pontinhos ⋮ e em <strong>Adicionar à tela inicial</strong>.</p>
    <p><strong>iPhone (Safari):</strong> toque no botão de compartilhar e em <strong>Adicionar à Tela de Início</strong>.</p>
    <p>Ele vai abrir como um aplicativo, sem a barra do navegador, e funciona mesmo sem internet.</p>`],
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
