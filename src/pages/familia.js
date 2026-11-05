// Depois do primeiro login: criar a família (1ª pessoa) ou entrar com o código de convite (2ª pessoa)
import { criarFamilia, entrarFamilia, auth } from '../lib/api.js';
import { icone, erroNoCampo, limparErros } from '../lib/ui.js';

export function telaFamilia(aoConcluir) {
  const app = document.getElementById('app');
  document.title = 'Sua família · Caixa da Família';
  app.innerHTML = `
  <main class="grid min-h-dvh place-items-center p-4">
    <div class="w-full max-w-2xl animate-entrar">
      <h1 class="text-center text-2xl font-bold">Falta só um passo</h1>
      <p class="mx-auto mt-1 max-w-md text-center text-stone-600 dark:text-stone-400">Os dados ficam guardados numa "família". Quem estiver na mesma família vê e lança as mesmas coisas.</p>
      <div class="mt-6 grid gap-4 md:grid-cols-2">
        <form class="card grid content-start gap-3" data-form="criar" novalidate>
          <span class="flex size-11 items-center justify-center rounded-xl bg-brand-50 text-brand-700 dark:bg-brand-950 dark:text-brand-300">${icone('casa', 'size-6')}</span>
          <h2 class="text-lg font-bold">Sou o primeiro a usar</h2>
          <p class="text-sm text-stone-600 dark:text-stone-400">Cria a família já com as contas, cartões e categorias da planilha. Você pode mudar tudo depois.</p>
          <div data-campo><label class="rotulo" for="nome-familia">Nome da família</label>
          <input id="nome-familia" name="nome" class="campo" placeholder="Ex.: Família Ferreira" maxlength="60"></div>
          <button type="submit" class="btn-primario">Criar nossa família</button>
        </form>
        <form class="card grid content-start gap-3" data-form="entrar" novalidate>
          <span class="flex size-11 items-center justify-center rounded-xl bg-brand-50 text-brand-700 dark:bg-brand-950 dark:text-brand-300">${icone('pessoas', 'size-6')}</span>
          <h2 class="text-lg font-bold">Recebi um convite</h2>
          <p class="text-sm text-stone-600 dark:text-stone-400">Peça para quem criou a família abrir <strong>Ajustes</strong> e te passar o código de 6 letras e números.</p>
          <div data-campo><label class="rotulo" for="codigo">Código de convite</label>
          <input id="codigo" name="codigo" class="campo text-center font-mono text-lg tracking-[0.3em] uppercase" maxlength="6" autocomplete="off" placeholder="ABC123"></div>
          <button type="submit" class="btn-sec">Entrar na família</button>
        </form>
      </div>
      <p class="mt-6 text-center"><button type="button" data-sair class="cursor-pointer p-2 text-sm text-stone-600 underline dark:text-stone-400">Sair e entrar com outro e-mail</button></p>
    </div>
  </main>`;

  app.querySelector('[data-sair]').onclick = () => auth.sair();
  app.querySelectorAll('form').forEach((form) => {
    form.onsubmit = async (e) => {
      e.preventDefault();
      limparErros(form);
      const criando = form.dataset.form === 'criar';
      if (!criando && form.codigo.value.trim().length !== 6) {
        erroNoCampo(form, 'codigo', 'O código tem 6 letras e números.');
        return form.codigo.focus();
      }
      const botao = form.querySelector('[type=submit]');
      botao.disabled = true;
      try {
        const familia = criando ? await criarFamilia(form.nome.value) : await entrarFamilia(form.codigo.value);
        aoConcluir(familia);
      } catch (err) {
        erroNoCampo(form, criando ? 'nome' : 'codigo', err.message);
        botao.disabled = false;
      }
    };
  });
}
