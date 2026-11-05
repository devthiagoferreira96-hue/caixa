// =====================================================================
// CÓPIA LOCAL DOS DADOS
// Todas as telas leem daqui, por isso o sistema funciona sem internet.
// A cópia fica salva no aparelho (IndexedDB) e é atualizada pelo sync.js
// sempre que há conexão.
// =====================================================================
import { criarConsultas, tabelasVazias } from './consulta-local.js';
import * as armazenamento from './armazenamento.js';

const banco = { tabelas: tabelasVazias(), familiaId: null, aoMudar: () => agendarGravacao() };
let chave = null;
let timer = null;

function agendarGravacao() {
  clearTimeout(timer);
  timer = setTimeout(gravarAgora, 150);
}
function gravarAgora() {
  if (!chave) return Promise.resolve();
  return armazenamento
    .gravar(chave, { tabelas: banco.tabelas, familia: local.familia, ultimaAtualizacao: local.ultimaAtualizacao })
    .catch((e) => console.warn('Não foi possível salvar a cópia local', e));
}

export const local = {
  familia: null,
  usuarioId: null,
  ultimaAtualizacao: null,
  from: criarConsultas(banco),

  /** Abre a cópia deste usuário. Retorna true se já existia uma cópia com dados. */
  async abrir(userId) {
    chave = `dados:${userId}`;
    this.usuarioId = userId;
    const salvo = await armazenamento.ler(chave).catch(() => null);
    banco.tabelas = { ...tabelasVazias(), ...(salvo?.tabelas || {}) };
    this.familia = salvo?.familia || null;
    this.ultimaAtualizacao = salvo?.ultimaAtualizacao || null;
    banco.familiaId = this.familia?.id || null;
    return Boolean(this.familia && this.ultimaAtualizacao);
  },

  definirFamilia(familia) {
    this.familia = familia;
    banco.familiaId = familia.id;
    agendarGravacao();
  },

  /** Troca toda a cópia pelos dados que vieram do Supabase */
  substituir(tabelas) {
    banco.tabelas = { ...tabelasVazias(), ...tabelas };
    this.ultimaAtualizacao = new Date().toISOString();
    return gravarAgora();
  },

  gravarAgora,
  tabelas: () => banco.tabelas,
};
