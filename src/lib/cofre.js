// =====================================================================
// COFRE: senha, código de recuperação e criptografia dos dados.
//
// Como funciona (o mesmo esquema de gerenciadores de senha):
//  1. Os dados são cifrados com uma "chave dos dados" aleatória (AES-GCM 256).
//  2. Essa chave fica guardada em duas "fechaduras":
//     - uma que abre com a SENHA;
//     - outra que abre com o CÓDIGO DE RECUPERAÇÃO.
//  3. Esquecer a senha não perde nada: o código abre a segunda fechadura,
//     e com ela uma senha nova é criada.
// Senha e código nunca são guardados; deles são geradas chaves (PBKDF2).
// Tudo usa o Web Crypto, que já vem no navegador (funciona offline).
// =====================================================================
const texto = new TextEncoder();
const deTexto = new TextDecoder();
const ITERACOES = 310_000; // recomendação da OWASP para PBKDF2-SHA256

export const novoSal = () => crypto.getRandomValues(new Uint8Array(16));

/** Gera uma chave a partir de um segredo (senha ou código). Leva ~0,3 s de propósito. */
export async function chaveDoSegredo(segredo, sal) {
  const base = await crypto.subtle.importKey('raw', texto.encode(segredo), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt: sal, iterations: ITERACOES, hash: 'SHA-256' },
    base,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
}
export const chaveDaSenha = chaveDoSegredo; // nome usado pela versão anterior

/** Nova chave dos dados (32 bytes aleatórios) */
export const novaChaveDosDados = () => crypto.getRandomValues(new Uint8Array(32));

/** Transforma os bytes da chave dos dados numa chave usável para cifrar */
export const usarChave = (bytes) => crypto.subtle.importKey('raw', bytes, 'AES-GCM', false, ['encrypt', 'decrypt']);

/** Fecha a chave dos dados numa "fechadura" (cifra os bytes com a chave da senha ou do código) */
export async function trancar(chaveDaFechadura, bytes) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  return { iv, dados: await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, chaveDaFechadura, bytes) };
}

/** Abre a fechadura e devolve os bytes da chave dos dados. Lança erro se a senha/código estiver errado. */
export async function destrancar(chaveDaFechadura, { iv, dados }) {
  return new Uint8Array(await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, chaveDaFechadura, dados));
}

/** Cifra qualquer objeto. Retorna { iv, dados } (pode ser guardado no IndexedDB) */
export async function cifrar(chave, objeto) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const dados = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, chave, texto.encode(JSON.stringify(objeto)));
  return { iv, dados };
}

/** Decifra. Se a chave estiver errada, lança erro. */
export async function decifrar(chave, { iv, dados }) {
  const aberto = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, chave, dados);
  return JSON.parse(deTexto.decode(aberto));
}

// ---------- Código de recuperação: 16 caracteres sem os que confundem (0/O, 1/I/L)
const ALFABETO = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'; // 31 símbolos -> ~79 bits, impossível de adivinhar

export function gerarCodigoRecuperacao() {
  const limite = 256 - (256 % ALFABETO.length); // evita viés
  let codigo = '';
  while (codigo.length < 16) {
    for (const b of crypto.getRandomValues(new Uint8Array(32))) {
      if (b < limite && codigo.length < 16) codigo += ALFABETO[b % ALFABETO.length];
    }
  }
  return codigo.match(/.{4}/g).join('-'); // K7QM-2XPA-9TRW-HF4D
}

/** Aceita o código digitado de qualquer jeito: minúsculas, espaços, com ou sem traços */
export const normalizarCodigo = (digitado) => String(digitado || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
export const codigoValido = (digitado) => {
  const c = normalizarCodigo(digitado);
  return c.length === 16 && [...c].every((ch) => ALFABETO.includes(ch));
};
