// Ponto de partida: primeiro acesso (criar usuário) ou tela de senha, depois abre o sistema
import './style.css';
import { store } from './lib/store.js';
import { carregarCadastros, manterRecorrencias } from './lib/api.js';
import { local } from './lib/local-db.js';
import { aplicarPreferencias } from './lib/preferencias.js';
import { telaPrimeiroAcesso, telaSenha } from './pages/acesso.js';
import { iniciarApp, redesenharSeSeguro } from './router.js';
import { toast } from './lib/ui.js';

aplicarPreferencias();

// App instalável e que abre sem internet (só na versão publicada, não no "npm run dev")
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => navigator.serviceWorker.register('./sw.js').catch(() => {}));
}

async function iniciar() {
  const usuario = await local.usuarioCadastrado();
  if (usuario) telaSenha(usuario, abrirSistema);
  else telaPrimeiroAcesso(abrirSistema);
}

async function abrirSistema() {
  store.usuario = local.usuario;
  await carregarCadastros();
  
  try { await manterRecorrencias(); } catch (e) { console.error(e); }
  iniciarApp();
  protegerDados();
}


async function protegerDados() {
  try {
    if (!navigator.storage?.persist) return;
    if (await navigator.storage.persisted()) return;
    await navigator.storage.persist();
  } catch { }
}

export async function bloquear() {
  try { await local.gravarAgora(); } catch {  }
  local.bloquear();
  location.hash = '';
  location.reload();
}

const BLOQUEAR_APOS_MS = 30 * 60_000;
let ultimoUso = Date.now();
const usou = () => { ultimoUso = Date.now(); };
for (const ev of ['pointerdown', 'keydown', 'wheel', 'touchstart', 'scroll']) window.addEventListener(ev, usou, { passive: true, capture: true });
const conferirInatividade = () => {
  if (store.usuario && Date.now() - ultimoUso > BLOQUEAR_APOS_MS) bloquear();
};
setInterval(conferirInatividade, 30_000);
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') conferirInatividade();
});
window.addEventListener('caixa:bloquear', bloquear);

window.addEventListener('caixa:dados-externos', async () => {
  if (!store.usuario) return;
  await carregarCadastros();
  redesenharSeSeguro();
});

document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && store.usuario) local.recarregar();
});

window.addEventListener('caixa:erro-gravar', () => {
  toast('Não foi possível salvar neste aparelho. Verifique se há espaço livre e faça um backup agora.', { tipo: 'erro' });
});

iniciar();
