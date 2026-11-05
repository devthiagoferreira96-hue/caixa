// Apresentação rápida que aparece no primeiro acesso (pode ser revista em "Como usar")
import { dialogo, icone } from '../lib/ui.js';
import { salvarPreferencias } from '../lib/preferencias.js';

const PASSOS = [
  ['casa', 'Bem-vindos ao Caixa da Família', 'Aqui vocês controlam o dinheiro da casa: o que entrou, o que saiu, as contas a pagar e as faturas dos cartões. Tudo que um de vocês lança, o outro vê na hora.'],
  ['mais', 'Lance um gasto em segundos', 'Toque no botão verde <strong>+</strong> (ou <strong>Novo lançamento</strong> no computador). Escolha se foi uma saída, uma entrada ou uma compra no cartão e preencha o valor.'],
  ['check', 'Marque o que já foi pago', 'Contas que ainda vão vencer aparecem com o círculo vazio. Quando pagar, toque no círculo: ele fica verde e o saldo da conta é atualizado.'],
  ['cartao', 'Cartões e parcelas', 'Numa compra parcelada, digite o valor total e o número de parcelas. O sistema coloca cada parcela na fatura certa, de acordo com o dia de fechamento do cartão.'],
  ['ajuda', 'Ficou com dúvida?', 'Toque no <strong>?</strong> no topo de qualquer tela para ver uma explicação dela. Errou alguma coisa? Quase tudo tem o botão <strong>Desfazer</strong>.'],
];

export function abrirTour() {
  let passo = 0;
  const d = dialogo({ titulo: 'Conhecendo o sistema', largura: 'max-w-md', corpo: '<div data-tour></div>' });
  const area = d.querySelector('[data-tour]');
  const desenhar = () => {
    const [ic, titulo, texto] = PASSOS[passo];
    const ultimo = passo === PASSOS.length - 1;
    area.innerHTML = `
      <div class="flex flex-col items-center gap-3 py-2 text-center animate-entrar">
        <span class="flex size-16 items-center justify-center rounded-2xl bg-brand-50 text-brand-700 dark:bg-brand-950 dark:text-brand-300">${icone(ic, 'size-8')}</span>
        <h3 class="text-lg font-bold">${titulo}</h3>
        <p class="text-stone-600 dark:text-stone-300">${texto}</p>
      </div>
      <p class="sr-only" aria-live="polite">Passo ${passo + 1} de ${PASSOS.length}</p>
      <div class="mt-4 flex justify-center gap-1.5" aria-hidden="true">
        ${PASSOS.map((_, i) => `<span class="h-2 rounded-full transition-all ${i === passo ? 'w-6 bg-brand-600' : 'w-2 bg-stone-300 dark:bg-stone-700'}"></span>`).join('')}
      </div>
      <div class="mt-5 flex gap-2">
        ${passo > 0 ? '<button type="button" class="btn-neutro flex-1" data-voltar>Voltar</button>' : '<button type="button" class="btn-neutro flex-1" data-fechar>Pular</button>'}
        <button type="button" class="btn-primario flex-1" data-avancar>${ultimo ? 'Começar a usar' : 'Próximo'}</button>
      </div>`;
    area.querySelector('[data-avancar]').focus();
  };
  area.onclick = (e) => {
    if (e.target.closest('[data-avancar]')) {
      if (passo === PASSOS.length - 1) return d.close();
      passo++;
      desenhar();
    } else if (e.target.closest('[data-voltar]')) {
      passo--;
      desenhar();
    }
  };
  d.addEventListener('close', () => salvarPreferencias({ tourVisto: true }));
  desenhar();
}
