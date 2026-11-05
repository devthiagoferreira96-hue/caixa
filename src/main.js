// Ponto de partida do sistema: verifica o login, abre a cópia local e sincroniza
import './style.css';
import { supabase } from './lib/supabase.js';
import { store } from './lib/store.js';
import { minhaFamilia, carregarCadastros } from './lib/api.js';
import { local } from './lib/local-db.js';
import { abrirFila, sincronizar, baixarTudo } from './lib/sync.js';
import { aplicarPreferencias } from './lib/preferencias.js';
import { esc } from './lib/format.js';
import { icone } from './lib/ui.js';
import { telaEntrar } from './pages/entrar.js';
import { telaFamilia } from './pages/familia.js';
import { iniciarApp } from './router.js';
import { iniciarAvisosDeConexao } from './components/conexao.js';

aplicarPreferencias();
iniciarAvisosDeConexao();

// App instalável e que abre sem internet (só na versão publicada, não no "npm run dev")
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => navigator.serviceWorker.register('./sw.js').catch(() => {}));
}

let usuarioCarregado = null;

async function aoMudarSessao(sessao) {
  if (!sessao) {
    usuarioCarregado = null;
    window.onhashchange = null;
    store.user = store.familia = null;
    telaEntrar();
    return;
  }
  if (usuarioCarregado === sessao.user.id) return; // já está aberto
  usuarioCarregado = sessao.user.id;
  store.user = sessao.user;
  telaCarregando();
  try {
    const temCopia = await local.abrir(store.user.id);
    await abrirFila(store.user.id);

    if (temCopia) {
      // Abre na hora com os dados do aparelho (funciona sem internet) e sincroniza em seguida
      store.familia = local.familia;
      await abrirSistema();
      sincronizar();
      return;
    }

    // Primeiro acesso neste aparelho: precisa de internet para baixar os dados
    if (!navigator.onLine) return telaPrecisaDeInternet();
    store.familia = await minhaFamilia();
    if (!store.familia) {
      telaFamilia(async (familia) => {
        store.familia = familia;
        await baixarTudo();
        await abrirSistema();
      });
      return;
    }
    await baixarTudo();
    await abrirSistema();
  } catch (e) {
    usuarioCarregado = null;
    if (!navigator.onLine) return telaPrecisaDeInternet();
    document.getElementById('app').innerHTML = `
      <div class="grid min-h-dvh place-items-center p-6"><div class="card max-w-md text-center" role="alert">
        <p class="font-semibold">Não foi possível abrir o sistema.</p>
        <p class="mt-1 text-sm text-stone-600 dark:text-stone-400">${esc(e.message)}</p>
        <button type="button" class="btn-primario mt-4" onclick="location.reload()">Tentar de novo</button>
      </div></div>`;
  }
}

async function abrirSistema() {
  await carregarCadastros();
  iniciarApp();
}

function telaCarregando() {
  document.getElementById('app').innerHTML = `
    <div class="grid min-h-dvh place-items-center" role="status">
      <div class="flex flex-col items-center gap-3 text-stone-600 dark:text-stone-400">
        <span class="flex size-12 animate-pulse items-center justify-center rounded-2xl bg-brand-600 font-bold text-white" aria-hidden="true">R$</span>
        Abrindo o caixa…
      </div>
    </div>`;
}

function telaPrecisaDeInternet() {
  usuarioCarregado = null;
  document.getElementById('app').innerHTML = `
    <div class="grid min-h-dvh place-items-center p-6"><div class="card max-w-md text-center" role="alert">
      <span class="mx-auto mb-3 flex size-12 items-center justify-center rounded-2xl bg-amber-100 text-amber-800 dark:bg-amber-900/50 dark:text-amber-200">${icone('alerta', 'size-6')}</span>
      <p class="font-semibold">Conecte à internet no primeiro acesso</p>
      <p class="mt-1 text-sm text-stone-600 dark:text-stone-400">Na primeira vez em cada aparelho, o sistema precisa de internet para baixar os dados da família. Depois disso, ele funciona mesmo sem conexão.</p>
      <p class="mt-3 text-sm text-stone-600 dark:text-stone-400">Assim que a internet voltar, esta tela continua sozinha.</p>
    </div></div>`;
  window.addEventListener('online', () => supabase.auth.getSession().then(({ data }) => aoMudarSessao(data.session)), { once: true });
}

supabase.auth.getSession().then(({ data }) => aoMudarSessao(data.session));
supabase.auth.onAuthStateChange((evento, sessao) => {
  // setTimeout evita travar o Supabase ao fazer consultas dentro deste aviso
  if (evento === 'SIGNED_IN' || evento === 'SIGNED_OUT') setTimeout(() => aoMudarSessao(sessao), 0);
});
