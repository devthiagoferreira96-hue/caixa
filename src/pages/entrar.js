// Tela de login / criar conta / esqueci a senha
import { auth } from '../lib/api.js';
import { modoDemo } from '../lib/supabase.js';
import { icone, erroNoCampo, limparErros } from '../lib/ui.js';
import { esc } from '../lib/format.js';

export function telaEntrar() {
  let modo = 'entrar'; // entrar | criar | recuperar
  const app = document.getElementById('app');
  document.title = 'Entrar · Caixa da Família';

  const desenhar = (mensagem) => {
    const titulos = { entrar: 'Entrar', criar: 'Criar minha conta', recuperar: 'Recuperar senha' };
    app.innerHTML = `
    <main class="grid min-h-dvh place-items-center p-4">
      <div class="w-full max-w-sm animate-entrar">
        <div class="mb-6 flex flex-col items-center gap-3 text-center">
          <span class="flex size-14 items-center justify-center rounded-2xl bg-brand-600 text-lg font-bold text-white" aria-hidden="true">R$</span>
          <div><h1 class="text-2xl font-bold">Caixa da Família</h1>
          <p class="text-stone-600 dark:text-stone-400">Gastos, contas e cartões da casa num lugar só.</p></div>
        </div>
        <div class="card">
          <h2 class="mb-4 text-lg font-bold">${titulos[modo]}</h2>
          ${mensagem ? `<p class="mb-4 rounded-xl bg-brand-50 p-3 text-sm text-brand-900 dark:bg-brand-950 dark:text-brand-100" role="status">${esc(mensagem)}</p>` : ''}
          <p id="erro-geral" class="erro-campo mb-3 hidden" role="alert"></p>
          <form class="grid gap-4" novalidate>
            <div data-campo>
              <label class="rotulo" for="email">E-mail</label>
              <input id="email" name="email" type="email" class="campo" autocomplete="email" required>
            </div>
            ${modo !== 'recuperar' ? `
            <div data-campo>
              <label class="rotulo" for="senha">Senha</label>
              <div class="relative">
                <input id="senha" name="senha" type="password" class="campo pr-12" minlength="6" required
                  autocomplete="${modo === 'criar' ? 'new-password' : 'current-password'}" ${modo === 'criar' ? 'aria-describedby="dica-senha"' : ''}>
                <button type="button" data-ver-senha class="btn-icone absolute inset-y-0 right-0" aria-label="Mostrar senha" aria-pressed="false">${icone('olho')}</button>
              </div>
              ${modo === 'criar' ? '<p id="dica-senha" class="dica">Pelo menos 6 caracteres.</p>' : ''}
            </div>` : ''}
            <button type="submit" class="btn-primario w-full">${modo === 'entrar' ? 'Entrar' : modo === 'criar' ? 'Criar conta' : 'Enviar link'}</button>
          </form>
          <div class="mt-4 grid gap-1 text-center text-sm">
            ${modo !== 'entrar' ? '<button type="button" data-modo="entrar" class="cursor-pointer p-2 font-semibold text-brand-700 dark:text-brand-400">Já tenho conta: entrar</button>' : ''}
            ${modo !== 'criar' ? '<button type="button" data-modo="criar" class="cursor-pointer p-2 font-semibold text-brand-700 dark:text-brand-400">Primeira vez? Criar conta</button>' : ''}
            ${modo === 'entrar' ? '<button type="button" data-modo="recuperar" class="cursor-pointer p-2 text-stone-600 dark:text-stone-400">Esqueci minha senha</button>' : ''}
          </div>
        </div>
        ${modoDemo ? '<p class="mt-4 text-center text-sm text-stone-500">Modo demonstração: use qualquer e-mail e senha.</p>' : ''}
      </div>
    </main>`;

    const form = app.querySelector('form');
    form.email.focus();
    app.querySelectorAll('[data-modo]').forEach((b) => (b.onclick = () => { modo = b.dataset.modo; desenhar(); }));
    const ver = app.querySelector('[data-ver-senha]');
    if (ver) ver.onclick = () => {
      const visivel = form.senha.type === 'password';
      form.senha.type = visivel ? 'text' : 'password';
      ver.setAttribute('aria-pressed', String(visivel));
      ver.setAttribute('aria-label', visivel ? 'Esconder senha' : 'Mostrar senha');
    };

    form.onsubmit = async (e) => {
      e.preventDefault();
      limparErros(form);
      const erroGeral = app.querySelector('#erro-geral');
      erroGeral.classList.add('hidden');
      const email = form.email.value.trim();
      const senha = form.senha?.value || '';
      let valido = true;
      if (!/^\S+@\S+\.\S+$/.test(email)) { erroNoCampo(form, 'email', 'Digite um e-mail válido.'); valido = false; }
      if (modo !== 'recuperar' && senha.length < 6) { erroNoCampo(form, 'senha', 'A senha precisa ter pelo menos 6 caracteres.'); valido = false; }
      if (!valido) return form.querySelector('[aria-invalid]').focus();

      const botao = form.querySelector('[type=submit]');
      const textoOriginal = botao.textContent;
      botao.disabled = true;
      botao.textContent = 'Aguarde…';
      try {
        if (modo === 'entrar') await auth.entrar(email, senha);
        else if (modo === 'criar') {
          const r = await auth.criarConta(email, senha);
          if (!r.session) { modo = 'entrar'; return desenhar('Conta criada! Enviamos um link para o seu e-mail. Abra o link para confirmar e depois entre aqui.'); }
        } else {
          await auth.recuperarSenha(email);
          modo = 'entrar';
          return desenhar('Se esse e-mail tiver cadastro, você vai receber um link para criar uma senha nova.');
        }
      } catch (err) {
        erroGeral.textContent = err.message;
        erroGeral.classList.remove('hidden');
        botao.disabled = false;
        botao.textContent = textoOriginal;
      }
    };
  };
  desenhar();
}
