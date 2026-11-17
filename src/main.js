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
  // contas "sempre" e assinaturas no cartão: completa os próximos meses
  try { await manterRecorrencias(); } catch (e) { console.error(e); }
  iniciarApp();
  protegerDados();
}

/**
 * Pede ao navegador para NÃO apagar sozinho os dados do sistema (ele apaga dados de sites
 * quando o aparelho fica sem espaço). Não impede a pessoa de limpar à mão.
 * Chamado logo depois de entrar com a senha (o navegador aceita melhor depois de uma ação da pessoa).
 */
async function protegerDados() {
  try {
    if (!navigator.storage?.persist) return;
    if (await navigator.storage.persisted()) return;
    await navigator.storage.persist();
  } catch { /* navegador sem esse recurso: segue normal */ }
}

/** Bloqueia o sistema: grava o que faltar, esquece a chave da memória e volta para a tela de senha */
export async function bloquear() {
  try { await local.gravarAgora(); } catch { /* segue bloqueando */ }
  local.bloquear();
  location.hash = '';
  location.reload();
}

// Pede a senha de novo só depois de 30 minutos sem uso (sem tocar, digitar ou rolar a tela).
// O tempo com o app em segundo plano também conta (no celular, "fechar" o app muitas vezes só o deixa em segundo plano).
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
