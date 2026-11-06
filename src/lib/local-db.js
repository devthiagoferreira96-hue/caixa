// =====================================================================
// DADOS NO APARELHO
// Tudo fica guardado no próprio celular/computador (IndexedDB), cifrado.
// Não existe servidor: o sistema funciona 100% offline.
//
// No aparelho ficam duas coisas:
//   "conta" -> nome do usuário e as duas "fechaduras" da chave dos dados
//              (uma abre com a senha, a outra com o código de recuperação)
//   "dados" -> todas as tabelas, cifradas com a chave dos dados
// Veja cofre.js para entender a criptografia.
// =====================================================================
import { criarConsultas, tabelasVazias, TABELAS } from './consulta-local.js';
import {
  chaveDoSegredo, novoSal, cifrar, decifrar, novaChaveDosDados, usarChave, trancar, destrancar,
  gerarCodigoRecuperacao, normalizarCodigo,
} from './cofre.js';
import * as armazenamento from './armazenamento.js';

const banco = { tabelas: tabelasVazias(), aoMudar: () => agendarGravacao() };
let chave = null;        // chave dos dados pronta para uso (só na memória, enquanto desbloqueado)
let bytesDaChave = null; // os mesmos bytes, para criar fechaduras novas (troca de senha/código)
let timer = null;
let gravando = Promise.resolve();

const VERIFICADOR_V1 = 'caixa-ok'; // usado só para abrir dados da versão anterior

// Várias abas/janelas abertas (ou o app instalado + o navegador): cada uma guarda os dados na
// memória e grava tudo de uma vez. Sem combinar, a última a gravar apagaria o que a outra fez.
// Por isso, quem grava avisa as outras, e elas recarregam os dados antes de continuar.
const ESTA_ABA = crypto.randomUUID();
const canal = typeof BroadcastChannel === 'function' ? new BroadcastChannel('caixa-familia') : null;
if (canal) {
  canal.onmessage = (e) => {
    if (e.data?.de === ESTA_ABA) return;
    if (e.data?.tipo === 'mudou') recarregar();
    if (e.data?.tipo === 'apagado') location.reload();
  };
}

/** Lê de novo os dados gravados (quando outra aba mudou alguma coisa) */
async function recarregar() {
  if (!chave) return;
  await gravando;
  if (timer) await gravarAgora(); // algo desta aba ainda não gravado vai primeiro
  try {
    const salvo = await armazenamento.ler('dados');
    if (marcaDe(salvo) === marcaAtual) return; // nada mudou
    await carregarDados();
    window.dispatchEvent(new Event('caixa:dados-externos'));
  } catch (e) {
    console.error('Não foi possível recarregar os dados', e);
  }
}

function agendarGravacao() {
  clearTimeout(timer);
  timer = setTimeout(gravarAgora, 150);
}

/** Cifra e grava tudo no aparelho (as gravações acontecem uma de cada vez, na ordem) */
function gravarAgora() {
  clearTimeout(timer);
  timer = null;
  if (!chave) return gravando;
  const instantaneo = { tabelas: banco.tabelas, ultimoBackup: local.ultimoBackup };
  gravando = gravando
    .then(async () => {
      const cifrado = await cifrar(chave, instantaneo);
      await armazenamento.gravar('dados', cifrado);
      marcaAtual = marcaDe(cifrado);
      canal?.postMessage({ tipo: 'mudou', de: ESTA_ABA });
    })
    .catch((e) => {
      console.error('Não foi possível salvar no aparelho', e);
      window.dispatchEvent(new CustomEvent('caixa:erro-gravar', { detail: e }));
    });
  return gravando;
}

/** Fechadura nova: { sal, chave } a partir de um segredo (senha ou código) */
async function fechadura(segredo) {
  const sal = novoSal();
  return { sal, chave: await trancar(await chaveDoSegredo(segredo, sal), bytesDaChave) };
}

/** Tenta abrir uma fechadura com um segredo. Retorna os bytes da chave dos dados ou null. */
async function abrirFechadura(f, segredo) {
  try {
    return await destrancar(await chaveDoSegredo(segredo, f.sal), f.chave);
  } catch {
    return null; // senha/código errado
  }
}

// marca da última versão lida/gravada (o iv da cifra muda a cada gravação)
let marcaAtual = null;
const marcaDe = (salvo) => (salvo?.iv ? Array.from(salvo.iv).join(',') : null);

async function carregarDados() {
  const salvo = await armazenamento.ler('dados');
  marcaAtual = marcaDe(salvo);
  const dados = salvo ? await decifrar(chave, salvo) : {};
  banco.tabelas = { ...tabelasVazias(), ...(dados.tabelas || {}) };
  local.ultimoBackup = dados.ultimoBackup || null;
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

  /** Primeiro acesso: cria o usuário e grava os dados iniciais. Retorna o código de recuperação. */
  async criarConta(usuario, senha, tabelasIniciais) {
    bytesDaChave = novaChaveDosDados();
    chave = await usarChave(bytesDaChave);
    const codigo = gerarCodigoRecuperacao();
    this.usuario = usuario;
    this.ultimoBackup = null;
    banco.tabelas = { ...tabelasVazias(), ...tabelasIniciais };
    await armazenamento.gravarJuntos({
      conta: {
        versao: 2,
        usuario,
        senha: await fechadura(senha),
        recuperacao: await fechadura(normalizarCodigo(codigo)),
        criada_em: new Date().toISOString(),
      },
      dados: await cifrar(chave, { tabelas: banco.tabelas, ultimoBackup: null }),
    });
    pedirArmazenamentoPersistente();
    return codigo;
  },

  /**
   * Abre os dados com a senha.
   * Retorna { ok: false } se a senha estiver errada, ou { ok: true, codigoNovo? }.
   * `codigoNovo` vem quando os dados eram da versão anterior (sem código) e acabaram de ganhar um.
   */
  async desbloquear(senha) {
    const conta = await armazenamento.ler('conta');
    if (!conta.versao) return migrarVersaoAnterior(conta, senha);
    const bytes = await abrirFechadura(conta.senha, senha);
    if (!bytes) return { ok: false };
    await entrarComChave(conta, bytes);
    return { ok: true };
  },

  /**
   * Esqueci a senha: abre com o código de recuperação e cria uma senha nova.
   * Também gera um código novo (o antigo pode ter sido visto). Retorna o código novo ou null.
   */
  async recuperarComCodigo(codigo, senhaNova) {
    const conta = await armazenamento.ler('conta');
    if (!conta.versao) return null; // versão anterior não tinha código
    const bytes = await abrirFechadura(conta.recuperacao, normalizarCodigo(codigo));
    if (!bytes) return null;
    await entrarComChave(conta, bytes);
    const novo = gerarCodigoRecuperacao();
    conta.senha = await fechadura(senhaNova);
    conta.recuperacao = await fechadura(normalizarCodigo(novo));
    await armazenamento.gravar('conta', conta);
    return novo;
  },

  /** Confere a senha atual (sem mudar nada) */
  async senhaConfere(senha) {
    const conta = await armazenamento.ler('conta');
    return Boolean(await abrirFechadura(conta.senha, senha));
  },

  /** Troca o nome e/ou a senha. A chave dos dados é a mesma: só a fechadura da senha muda. */
  async alterarConta({ usuario, senhaAtual, senhaNova }) {
    const conta = await armazenamento.ler('conta');
    if (senhaNova) {
      if (!(await abrirFechadura(conta.senha, senhaAtual))) throw new Error('A senha atual está incorreta.');
      conta.senha = await fechadura(senhaNova);
    }
    if (usuario) conta.usuario = usuario;
    await armazenamento.gravar('conta', conta);
    this.usuario = conta.usuario;
  },

  /** Gera um código de recuperação novo (o antigo deixa de funcionar). Exige a senha atual. */
  async novoCodigo(senhaAtual) {
    const conta = await armazenamento.ler('conta');
    if (!(await abrirFechadura(conta.senha, senhaAtual))) throw new Error('A senha está incorreta.');
    const codigo = gerarCodigoRecuperacao();
    conta.recuperacao = await fechadura(normalizarCodigo(codigo));
    await armazenamento.gravar('conta', conta);
    return codigo;
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
    bytesDaChave = null;
    banco.tabelas = tabelasVazias();
  },

  /** Apaga usuário e dados deste aparelho */
  async apagarTudo() {
    this.bloquear();
    await armazenamento.apagar('dados');
    await armazenamento.apagar('conta');
    canal?.postMessage({ tipo: 'apagado', de: ESTA_ABA });
  },

  recarregar,

  gravarAgora,
  TABELAS,
};

async function entrarComChave(conta, bytes) {
  bytesDaChave = bytes;
  chave = await usarChave(bytes);
  await carregarDados();
  local.usuario = conta.usuario;
  pedirArmazenamentoPersistente();
}

/**
 * Dados criados pela versão anterior (a senha cifrava os dados direto, sem código de recuperação).
 * Abre com a senha, cria a chave dos dados e as duas fechaduras, e cifra tudo de novo.
 */
async function migrarVersaoAnterior(conta, senha) {
  const antiga = await chaveDoSegredo(senha, conta.sal);
  try {
    if ((await decifrar(antiga, conta.verificador)) !== VERIFICADOR_V1) return { ok: false };
  } catch {
    return { ok: false };
  }
  const salvo = await armazenamento.ler('dados');
  const dados = salvo ? await decifrar(antiga, salvo) : {};
  bytesDaChave = novaChaveDosDados();
  chave = await usarChave(bytesDaChave);
  const codigo = gerarCodigoRecuperacao();
  const nova = {
    versao: 2,
    usuario: conta.usuario,
    senha: await fechadura(senha),
    recuperacao: await fechadura(normalizarCodigo(codigo)),
    criada_em: conta.criada_em,
  };
  banco.tabelas = { ...tabelasVazias(), ...(dados.tabelas || {}) };
  local.ultimoBackup = dados.ultimoBackup || null;
  local.usuario = conta.usuario;
  // dados (cifrados com a chave nova) e conta nova gravados juntos: ou tudo, ou nada
  await armazenamento.gravarJuntos({
    dados: await cifrar(chave, { tabelas: banco.tabelas, ultimoBackup: local.ultimoBackup }),
    conta: nova,
  });
  pedirArmazenamentoPersistente();
  return { ok: true, codigoNovo: codigo };
}

// Pede ao navegador para não apagar os dados do site quando faltar espaço
function pedirArmazenamentoPersistente() {
  navigator.storage?.persist?.().catch(() => {});
}
