// Ponto de partida: primeiro acesso (criar usuário) ou tela de senha, depois abre o sistema
import './style.css';
import { store } from './lib/store.js';
import { carregarCadastros } from './lib/api.js';
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
  iniciarApp();
}

/** Bloqueia o sistema: esquece a chave da memória e volta para a tela de senha */
export function bloquear() {
  local.bloquear();
  location.hash = '';
  location.reload();
}

// Pede a senha de novo quando o app fica em segundo plano por mais de 1 minuto
// (no celular, "fechar" o app muitas vezes só o deixa em segundo plano)
const BLOQUEAR_APOS_MS = 60_000;
let saiuEm = null;
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') saiuEm = Date.now();
  else if (saiuEm && store.usuario && Date.now() - saiuEm > BLOQUEAR_APOS_MS) bloquear();
});
window.addEventListener('caixa:bloquear', bloquear);

// Outra aba/janela mudou os dados: atualiza esta também
window.addEventListener('caixa:dados-externos', async () => {
  if (!store.usuario) return;
  await carregarCadastros();
  redesenharSeSeguro();
});
// Ao voltar para esta aba, confere se algo mudou (para navegadores sem aviso entre abas)
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && store.usuario) local.recarregar();
});
// Se o aparelho não deixar gravar (sem espaço, modo privado...), avisa em vez de perder em silêncio
window.addEventListener('caixa:erro-gravar', () => {
  toast('Não foi possível salvar neste aparelho. Verifique se há espaço livre e faça um backup agora.', { tipo: 'erro' });
});

iniciar();
