// =====================================================================
// COFRE: senha e criptografia dos dados no aparelho.
// A senha nunca é guardada. Dela é gerada uma chave (PBKDF2), e com essa
// chave os dados são cifrados (AES-GCM, padrão usado por bancos).
// Sem a senha certa, os dados guardados no aparelho são ilegíveis.
// Tudo usa o Web Crypto, que já vem no navegador (não precisa instalar nada).
// =====================================================================
const texto = new TextEncoder();
const deTexto = new TextDecoder();
const ITERACOES = 310_000; // recomendação da OWASP para PBKDF2-SHA256

export const novoSal = () => crypto.getRandomValues(new Uint8Array(16));

/** Gera a chave de criptografia a partir da senha (leva ~0,3 s de propósito: dificulta adivinhar) */
export async function chaveDaSenha(senha, sal) {
  const base = await crypto.subtle.importKey('raw', texto.encode(senha), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt: sal, iterations: ITERACOES, hash: 'SHA-256' },
    base,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
}

/** Cifra qualquer objeto. Retorna { iv, dados } (pode ser guardado no IndexedDB) */
export async function cifrar(chave, objeto) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const dados = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, chave, texto.encode(JSON.stringify(objeto)));
  return { iv, dados };
}

/** Decifra. Se a senha (chave) estiver errada, lança erro. */
export async function decifrar(chave, { iv, dados }) {
  const aberto = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, chave, dados);
  return JSON.parse(deTexto.decode(aberto));
}
