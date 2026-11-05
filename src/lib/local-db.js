// =====================================================================
// DADOS NO APARELHO
// Tudo fica guardado no próprio celular/computador (IndexedDB), cifrado com
// a senha do usuário. Não existe servidor: o sistema funciona 100% offline.
//
// No aparelho ficam duas coisas:
//   "conta" -> nome do usuário, o "sal" da senha e um verificador cifrado
//   "dados" -> todas as tabelas, cifradas
// =====================================================================
import { criarConsultas, tabelasVazias, TABELAS } from './consulta-local.js';
import { chaveDaSenha, novoSal, cifrar, decifrar } from './cofre.js';
import * as armazenamento from './armazenamento.js';

const banco = { tabelas: tabelasVazias(), aoMudar: () => agendarGravacao() };
let chave = null; // existe só na memória enquanto o sistema está desbloqueado
let timer = null;
let gravando = Promise.resolve();

const VERIFICADOR = 'caixa-ok';

function agendarGravacao() {
  clearTimeout(timer);
  timer = setTimeout(gravarAgora, 150);
}

/** Cifra e grava tudo no aparelho (as gravações acontecem uma de cada vez, na ordem) */
function gravarAgora() {
  clearTimeout(timer);
  if (!chave) return gravando;
  const instantaneo = { tabelas: banco.tabelas, ultimoBackup: local.ultimoBackup };
  gravando = gravando
    .then(async () => armazenamento.gravar('dados', await cifrar(chave, instantaneo)))
    .catch((e) => console.error('Não foi possível salvar no aparelho', e));
  return gravando;
}

export const local = {
  usuario: null,
  ultimoBackup: null,
  from: criarConsultas(banco),
  tabelas: () => banco.tabelas,

  /** Já existe um usuário criado neste aparelho? Retorna o nome ou null */
  async usuarioCadastrado() {
    const conta = await armazenamento.ler('conta').catch(() => null);
    return conta?.usuario || null;
  },

  /** Primeiro acesso: cria o usuário e grava os dados iniciais */
  async criarConta(usuario, senha, tabelasIniciais) {
    const sal = novoSal();
    chave = await chaveDaSenha(senha, sal);
    await armazenamento.gravar('conta', { usuario, sal, verificador: await cifrar(chave, VERIFICADOR), criada_em: new Date().toISOString() });
    this.usuario = usuario;
    this.ultimoBackup = null;
    banco.tabelas = { ...tabelasVazias(), ...tabelasIniciais };
    await gravarAgora();
    pedirArmazenamentoPersistente();
  },

  /** Abre os dados com a senha. Retorna false se a senha estiver errada. */
  async desbloquear(senha) {
    const conta = await armazenamento.ler('conta');
    const tentativa = await chaveDaSenha(senha, conta.sal);
    try {
      if ((await decifrar(tentativa, conta.verificador)) !== VERIFICADOR) return false;
    } catch {
      return false; // senha errada: a decifragem falha
    }
    chave = tentativa;
    const salvo = await armazenamento.ler('dados');
    const dados = salvo ? await decifrar(chave, salvo) : {};
    banco.tabelas = { ...tabelasVazias(), ...(dados.tabelas || {}) };
    this.usuario = conta.usuario;
    this.ultimoBackup = dados.ultimoBackup || null;
    pedirArmazenamentoPersistente();
    return true;
  },

  /** Troca o nome e/ou a senha (cifra tudo de novo com a senha nova) */
  async alterarConta({ usuario, senhaAtual, senhaNova }) {
    const conta = await armazenamento.ler('conta');
    if (senhaNova) {
      const atual = await chaveDaSenha(senhaAtual, conta.sal);
      try { await decifrar(atual, conta.verificador); } catch { throw new Error('A senha atual está incorreta.'); }
      const sal = novoSal();
      chave = await chaveDaSenha(senhaNova, sal);
      conta.sal = sal;
      conta.verificador = await cifrar(chave, VERIFICADOR);
    }
    if (usuario) conta.usuario = usuario;
    await armazenamento.gravar('conta', conta);
    await gravarAgora();
    this.usuario = conta.usuario;
  },

  /** Troca todos os dados (restaurar backup) */
  async substituir(tabelas) {
    banco.tabelas = { ...tabelasVazias(), ...tabelas };
    await gravarAgora();
  },

  async marcarBackup() {
    this.ultimoBackup = new Date().toISOString();
    await gravarAgora();
  },

  /** Esquece a chave da memória (os dados continuam cifrados no aparelho) */
  bloquear() {
    clearTimeout(timer);
    chave = null;
    banco.tabelas = tabelasVazias();
  },

  /** Apaga usuário e dados deste aparelho */
  async apagarTudo() {
    this.bloquear();
    await armazenamento.apagar('dados');
    await armazenamento.apagar('conta');
  },

  gravarAgora,
  TABELAS,
};

// Pede ao navegador para não apagar os dados do site quando faltar espaço
function pedirArmazenamentoPersistente() {
  navigator.storage?.persist?.().catch(() => {});
}
