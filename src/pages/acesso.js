// Telas de acesso: criar o usuário (primeiro acesso) e pedir a senha ao abrir o sistema
import { local } from '../lib/local-db.js';
import { dadosIniciais } from '../lib/exemplo.js';
import { escolherBackup } from '../components/backup.js';
import { mostrarCodigoRecuperacao } from '../components/recuperacao.js';
import { codigoValido } from '../lib/cofre.js';
import { icone, erroNoCampo, limparErros, dialogo, toast, semRepetir } from '../lib/ui.js';
import { esc } from '../lib/format.js';

const app = () => document.getElementById('app');
const marca = (subtitulo) => `
  <div class="mb-6 flex flex-col items-center gap-3 text-center">
    <span class="flex size-14 items-center justify-center rounded-2xl bg-brand-600 text-lg font-bold text-white" aria-hidden="true">R$</span>
    <div><h1 class="text-2xl font-bold">Caixa da Família</h1>
    <p class="text-stone-600 dark:text-stone-400">${subtitulo}</p></div>
  </div>`;

const campoSenha = (id, rotulo, autocomplete, dica = '') => `
  <div data-campo>
    <label class="rotulo" for="${id}">${rotulo}</label>
    <div class="relative">
      <input id="${id}" name="${id}" type="password" class="campo pr-12" autocomplete="${autocomplete}" maxlength="64" ${dica ? `aria-describedby="dica-${id}"` : ''}>
      <button type="button" data-ver="${id}" class="btn-icone absolute inset-y-0 right-0" aria-label="Mostrar senha" aria-pressed="false">${icone('olho')}</button>
    </div>
    ${dica ? `<p id="dica-${id}" class="dica">${dica}</p>` : ''}
  </div>`;

function ligarMostrarSenha(raiz) {
  raiz.querySelectorAll('[data-ver]').forEach((b) => (b.onclick = () => {
    const campo = raiz.querySelector(`#${b.dataset.ver}`);
    const ver = campo.type === 'password';
    campo.type = ver ? 'text' : 'password';
    b.setAttribute('aria-pressed', String(ver));
    b.setAttribute('aria-label', ver ? 'Esconder senha' : 'Mostrar senha');
  }));
}

// ---------- Primeiro acesso: criar usuário e senha
export function telaPrimeiroAcesso(aoEntrar, restaurando = null) {
  document.title = 'Começar · Caixa da Família';
  app().innerHTML = `
  <main class="grid min-h-dvh place-items-center p-4">
    <div class="w-full max-w-sm animate-entrar">
      ${marca(restaurando ? 'Crie um usuário para abrir o backup.' : 'Vamos criar o seu acesso.')}
      <form class="card grid gap-4" novalidate>
        ${restaurando ? `<p class="rounded-xl bg-brand-50 p-3 text-sm text-brand-900 dark:bg-brand-950 dark:text-brand-100">Backup de ${esc(restaurando.usuario || 'usuário')} com ${restaurando.tabelas.lancamentos?.length || 0} lançamentos pronto para restaurar.</p>` : ''}
        <div data-campo>
          <label class="rotulo" for="usuario">Seu nome</label>
          <input id="usuario" name="usuario" class="campo" maxlength="40" autocomplete="username" value="${esc(restaurando?.usuario || '')}" placeholder="Ex.: Thiago">
        </div>
        ${campoSenha('senha', 'Crie uma senha', 'new-password', 'Pelo menos 4 caracteres. Ela é pedida toda vez que o sistema for aberto.')}
        ${campoSenha('confirmar', 'Repita a senha', 'new-password')}
        ${restaurando ? '' : `
        <label class="flex cursor-pointer items-start gap-3 rounded-xl border border-stone-200 p-3 dark:border-stone-700">
          <input type="checkbox" name="exemplo" class="mt-0.5 size-5 accent-brand-600">
          <span><span class="block font-semibold">Começar com dados de exemplo</span>
          <span class="block text-sm text-stone-600 dark:text-stone-400">Para conhecer o sistema. Depois dá para apagar tudo em Ajustes.</span></span>
        </label>`}
        <div class="rounded-xl bg-amber-50 p-3 text-sm text-amber-900 dark:bg-amber-900/40 dark:text-amber-100" role="note">
          <strong>Guarde bem a senha.</strong> Ela protege os dados deste aparelho. Na próxima tela você recebe um <strong>código de recuperação</strong>: com ele dá para criar uma senha nova se esquecer.
        </div>
        <button type="submit" class="btn-primario">${restaurando ? 'Criar e restaurar' : 'Criar e entrar'}</button>
      </form>
      ${restaurando ? '' : `<p class="mt-4 text-center"><button type="button" data-restaurar class="cursor-pointer p-2 text-sm font-semibold text-brand-700 underline underline-offset-2 dark:text-brand-400">Já tenho um arquivo de backup</button></p>`}
    </div>
  </main>`;

  const form = app().querySelector('form');
  ligarMostrarSenha(form);
  form.usuario.focus();
  app().querySelector('[data-restaurar]')?.addEventListener('click', async () => {
    const dados = await escolherBackup();
    if (dados) telaPrimeiroAcesso(aoEntrar, dados);
  });

  form.onsubmit = semRepetir(async (e) => {
    e.preventDefault();
    limparErros(form);
    const usuario = form.usuario.value.trim();
    const senha = form.senha.value;
    let ok = true;
    if (!usuario) { erroNoCampo(form, 'usuario', 'Escreva seu nome.'); ok = false; }
    if (senha.length < 4) { erroNoCampo(form, 'senha', 'A senha precisa ter pelo menos 4 caracteres.'); ok = false; }
    else if (form.confirmar.value !== senha) { erroNoCampo(form, 'confirmar', 'As duas senhas estão diferentes.'); ok = false; }
    if (!ok) return form.querySelector('[aria-invalid]').focus();

    const botao = form.querySelector('[type=submit]');
    botao.disabled = true;
    botao.textContent = 'Preparando…';
    const tabelas = restaurando ? restaurando.tabelas : dadosIniciais({ comExemplo: form.exemplo?.checked });
    const codigo = await local.criarConta(usuario, senha, tabelas);
    await mostrarCodigoRecuperacao(codigo, { motivo: 'criado' });
    if (restaurando) toast('Backup restaurado');
    await aoEntrar();
  });
}

// ---------- Ao abrir o sistema: pedir a senha
export function telaSenha(usuario, aoEntrar) {
  document.title = 'Entrar · Caixa da Família';
  let erros = 0;
  app().innerHTML = `
  <main class="grid min-h-dvh place-items-center p-4">
    <div class="w-full max-w-sm animate-entrar">
      ${marca(`Olá, ${esc(usuario)}! Digite sua senha para entrar.`)}
      <form class="card grid gap-4" novalidate>
        <input type="text" name="usuario" value="${esc(usuario)}" autocomplete="username" class="hidden" aria-label="Usuário" aria-hidden="true" tabindex="-1">
        ${campoSenha('senha', 'Senha', 'current-password')}
        <p id="erro-senha-geral" class="erro-campo -mt-2 hidden" role="alert"></p>
        <button type="submit" class="btn-primario">Entrar</button>
      </form>
      <p class="mt-4 text-center"><button type="button" data-esqueci class="cursor-pointer p-2 text-sm text-stone-600 underline underline-offset-2 dark:text-stone-400">Esqueci minha senha</button></p>
    </div>
  </main>`;

  const form = app().querySelector('form');
  const erro = app().querySelector('#erro-senha-geral');
  ligarMostrarSenha(form);
  form.senha.focus();
  app().querySelector('[data-esqueci]').onclick = () => esqueciSenha(aoEntrar);

  form.onsubmit = semRepetir(async (e) => {
    e.preventDefault();
    const botao = form.querySelector('[type=submit]');
    if (!form.senha.value) { erro.textContent = 'Digite sua senha.'; erro.classList.remove('hidden'); return form.senha.focus(); }
    botao.disabled = true;
    botao.textContent = 'Abrindo…';
    const r = await local.desbloquear(form.senha.value);
    if (r.ok) {
      if (r.codigoNovo) await mostrarCodigoRecuperacao(r.codigoNovo, { motivo: 'atualizacao' });
      return aoEntrar();
    }
    erros++;
    // depois de 5 erros, espera um pouco a cada tentativa (dificulta quem tenta adivinhar)
    const espera = erros >= 5 ? 30 : 0;
    erro.textContent = espera ? `Senha incorreta. Aguarde ${espera} segundos para tentar de novo.` : 'Senha incorreta. Tente de novo.';
    erro.classList.remove('hidden');
    form.senha.value = '';
    form.senha.setAttribute('aria-invalid', 'true');
    setTimeout(() => { botao.disabled = false; botao.textContent = 'Entrar'; form.senha.focus(); }, espera * 1000);
  });
}

function esqueciSenha(aoEntrar) {
  let erros = 0;
  const d = dialogo({
    titulo: 'Esqueci minha senha',
    largura: 'max-w-md',
    corpo: `
      <form class="grid gap-4" novalidate>
        <p class="text-stone-700 dark:text-stone-300">Digite o <strong>código de recuperação</strong> que você guardou (no WhatsApp ou no papel) e crie uma senha nova. Seus dados continuam todos aqui.</p>
        <div data-campo><label class="rotulo" for="codigo">Código de recuperação</label>
          <input id="codigo" name="codigo" class="campo text-center font-mono text-lg tracking-wider uppercase" autocomplete="off" autocapitalize="characters" spellcheck="false" maxlength="24" placeholder="XXXX-XXXX-XXXX-XXXX" aria-describedby="dica-codigo">
          <p id="dica-codigo" class="dica">16 letras e números. Pode digitar com ou sem os tracinhos.</p></div>
        ${campoSenha('nova', 'Senha nova', 'new-password', 'Pelo menos 4 caracteres.')}
        ${campoSenha('repetir', 'Repita a senha nova', 'new-password')}
        <button type="submit" class="btn-primario">Criar senha nova</button>
        <button type="button" class="cursor-pointer p-2 text-sm text-stone-600 underline underline-offset-2 dark:text-stone-400" data-sem-codigo>Não tenho o código</button>
      </form>`,
  });
  const f = d.querySelector('form');
  ligarMostrarSenha(f);
  f.codigo.focus();
  f.onsubmit = semRepetir(async (e) => {
    e.preventDefault();
    limparErros(f);
    let ok = true;
    if (!codigoValido(f.codigo.value)) { erroNoCampo(f, 'codigo', 'Confira o código: são 16 letras e números.'); ok = false; }
    if (f.nova.value.length < 4) { erroNoCampo(f, 'nova', 'A senha precisa ter pelo menos 4 caracteres.'); ok = false; }
    else if (f.nova.value !== f.repetir.value) { erroNoCampo(f, 'repetir', 'As duas senhas estão diferentes.'); ok = false; }
    if (!ok) return f.querySelector('[aria-invalid]').focus();
    const botao = f.querySelector('[type=submit]');
    botao.disabled = true;
    botao.textContent = 'Conferindo…';
    const codigoNovo = await local.recuperarComCodigo(f.codigo.value, f.nova.value);
    if (codigoNovo) {
      d.close();
      await mostrarCodigoRecuperacao(codigoNovo, { motivo: 'recuperado' });
      toast('Senha nova criada. Use-a da próxima vez que abrir o sistema.');
      return aoEntrar();
    }
    erros++;
    const espera = erros >= 5 ? 30 : 0;
    erroNoCampo(f, 'codigo', espera ? `Código incorreto. Aguarde ${espera} segundos para tentar de novo.` : 'Código incorreto. Confira as letras e números.');
    setTimeout(() => { botao.disabled = false; botao.textContent = 'Criar senha nova'; }, espera * 1000);
  });
  f.querySelector('[data-sem-codigo]').onclick = () => { d.close(); semCodigo(aoEntrar); };
}

/** Sem senha e sem código: a única saída é apagar e começar de novo (podendo restaurar um backup) */
function semCodigo(aoEntrar) {
  const d = dialogo({
    titulo: 'Sem a senha e sem o código',
    largura: 'max-w-md',
    corpo: `
      <div class="grid gap-3 text-stone-700 dark:text-stone-300">
        <p>Para proteger seus dados, eles ficam <strong>trancados</strong>. Sem a senha e sem o código de recuperação, não é possível abrir os dados guardados neste aparelho.</p>
        <p>Se você tiver um <strong>arquivo de backup</strong>, pode apagar este acesso, criar um novo e restaurar os dados dele.</p>
      </div>
      <div class="mt-5 grid gap-2">
        <button type="button" class="btn-primario" data-voltar>Voltar e tentar o código de novo</button>
        <button type="button" class="btn-neutro text-red-700 dark:text-red-400" data-zerar>Apagar este acesso e começar do zero</button>
      </div>`,
  });
  d.querySelector('[data-voltar]').onclick = () => { d.close(); esqueciSenha(aoEntrar); };
  d.querySelector('[data-zerar]').onclick = () => {
    d.close();
    const c = dialogo({
      titulo: 'Apagar tudo deste aparelho?',
      largura: 'max-w-sm',
      corpo: `
        <form class="grid gap-3" novalidate>
          <p class="text-stone-700 dark:text-stone-300">Os dados que estão neste aparelho serão <strong>apagados para sempre</strong>. Depois você cria um acesso novo e pode restaurar um backup.</p>
          <div data-campo><label class="rotulo" for="confirmar-apagar">Para confirmar, digite APAGAR</label>
          <input id="confirmar-apagar" name="texto" class="campo uppercase" autocomplete="off"></div>
          <button type="submit" class="btn-perigo">Apagar e começar do zero</button>
        </form>`,
    });
    const f = c.querySelector('form');
    f.texto.focus();
    f.onsubmit = semRepetir(async (e) => {
      e.preventDefault();
      if (f.texto.value.trim().toUpperCase() !== 'APAGAR') return erroNoCampo(f, 'texto', 'Digite APAGAR para confirmar.');
      await local.apagarTudo();
      c.close();
      telaPrimeiroAcesso(aoEntrar);
    });
  };
}
