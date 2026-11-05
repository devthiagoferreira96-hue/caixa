// Ponto de partida do sistema: verifica o login, a família e abre as telas
import './style.css';
import { supabase } from './lib/supabase.js';
import { store } from './lib/store.js';
import { minhaFamilia, carregarCadastros } from './lib/api.js';
import { aplicarPreferencias } from './lib/preferencias.js';
import { esc } from './lib/format.js';
import { telaEntrar } from './pages/entrar.js';
import { telaFamilia } from './pages/familia.js';
import { iniciarApp } from './router.js';

aplicarPreferencias();

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
    store.familia = await minhaFamilia();
    if (!store.familia) {
      telaFamilia(async (familia) => {
        store.familia = familia;
        await abrirSistema();
      });
      return;
    }
    await abrirSistema();
  } catch (e) {
    usuarioCarregado = null;
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

supabase.auth.getSession().then(({ data }) => aoMudarSessao(data.session));
supabase.auth.onAuthStateChange((evento, sessao) => {
  // setTimeout evita travar o Supabase ao fazer consultas dentro deste aviso
  if (evento === 'SIGNED_IN' || evento === 'SIGNED_OUT') setTimeout(() => aoMudarSessao(sessao), 0);
});
