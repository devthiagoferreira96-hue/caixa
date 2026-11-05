// =====================================================================
// SINCRONIZAÇÃO (fila de alterações)
// Cada alteração feita no sistema é aplicada na cópia local na hora e
// também entra numa fila guardada no aparelho. Quando há internet, a fila é
// enviada ao Supabase, na ordem em que as alterações foram feitas.
// Depois que a fila esvazia, o sistema baixa os dados atualizados (inclusive
// o que a outra pessoa da família lançou).
// =====================================================================
import { supabase } from './supabase.js';
import { local } from './local-db.js';
import { TABELAS } from './consulta-local.js';
import * as armazenamento from './armazenamento.js';

let fila = [];
let chaveFila = null;
let rodando = false;
let rodarDeNovo = false;
const ouvintes = new Set();

export const estado = {
  online: navigator.onLine,
  pendentes: 0,
  enviando: false,
};

/** Recebe avisos: 'fila', 'offline', 'online', 'enviando', 'enviado', 'dados', 'erro' */
export function ouvir(fn) {
  ouvintes.add(fn);
  return () => ouvintes.delete(fn);
}
const avisar = (evento, extra = {}) => ouvintes.forEach((fn) => fn(evento, { ...estado, ...extra }));

export async function abrirFila(userId) {
  chaveFila = `fila:${userId}`;
  fila = (await armazenamento.ler(chaveFila).catch(() => null)) || [];
  estado.pendentes = fila.length;
}

async function salvarFila() {
  estado.pendentes = fila.length;
  await armazenamento.gravar(chaveFila, fila).catch(() => {});
  avisar('fila');
}

/** Coloca uma alteração na fila e tenta enviar */
export async function enfileirar(operacao) {
  // "offline" marca o que ficou esperando sem internet (só esses geram o aviso de armazenamento)
  fila.push({ ...operacao, criada_em: new Date().toISOString(), offline: !navigator.onLine });
  await salvarFila();
  sincronizar();
}

const erroDeRede = (e) => !navigator.onLine || /failed to fetch|networkerror|load failed|network request failed|fetch/i.test(e?.message || '');

async function enviar(op) {
  const tabela = supabase.from(op.tabela);
  let resposta;
  if (op.op === 'insert') {
    // "upsert ignorando repetidos": se a internet cair no meio e reenviar, não duplica
    resposta = await tabela.upsert(op.linhas, { onConflict: 'id', ignoreDuplicates: true });
  } else if (op.op === 'update' && op.onde) {
    let q = tabela.update(op.valores);
    for (const [coluna, valor] of Object.entries(op.onde)) q = q.eq(coluna, valor);
    resposta = await q;
  } else if (op.op === 'update') {
    resposta = await tabela.update(op.valores).in('id', op.ids);
  } else {
    resposta = await tabela.delete().in('id', op.ids);
  }
  if (resposta.error) throw resposta.error;
}

/** Envia a fila e depois baixa os dados novos. Pode ser chamada a qualquer momento. */
export async function sincronizar() {
  if (!chaveFila || !local.familia) return;
  if (rodando) { rodarDeNovo = true; return; }
  if (!navigator.onLine) {
    estado.online = false;
    avisar('sem-rede');
    return;
  }
  rodando = true;
  const total = fila.filter((op) => op.offline).length; // alterações feitas sem internet
  const falhas = [];
  try {
    if (total) { estado.enviando = true; avisar('enviando', { total }); }
    while (fila.length) {
      const op = fila[0];
      try {
        await enviar(op);
      } catch (e) {
        if (erroDeRede(e)) throw e; // sem internet: para e tenta depois, sem perder nada
        console.error('Alteração recusada pelo servidor', op, e);
        falhas.push({ op, erro: e });
      }
      fila.shift();
      await salvarFila();
    }
    if (total) { estado.enviando = false; avisar('enviado', { total, falhas }); }
    else if (falhas.length) avisar('enviado', { total: 0, falhas });
    await baixarTudo();
  } catch (e) {
    estado.enviando = false;
    if (erroDeRede(e) && fila.some((op) => !op.offline)) {
      fila.forEach((op) => (op.offline = true)); // não conseguiu enviar: agora são alterações offline
      await salvarFila();
    }
    if (erroDeRede(e)) { estado.online = navigator.onLine; avisar(navigator.onLine ? 'erro' : 'sem-rede'); }
    else { console.error(e); avisar('erro'); }
  } finally {
    rodando = false;
    if (rodarDeNovo) { rodarDeNovo = false; sincronizar(); }
  }
}

/** Baixa todos os dados da família e troca a cópia local (só quando não há nada na fila) */
export async function baixarTudo() {
  if (fila.length) return;
  const familiaId = local.familia.id;
  const resultados = await Promise.all(TABELAS.map((t) => buscarTabela(t, familiaId)));
  if (fila.length) return; // alguém lançou algo durante o download: baixa de novo depois
  const novos = itensNovosDeOutros(resultados);
  await local.substituir(Object.fromEntries(TABELAS.map((t, i) => [t, resultados[i]])));
  avisar('dados', { novos });
}

/** Lançamentos e compras que não existiam na cópia local e foram feitos por outra pessoa */
function itensNovosDeOutros(resultados) {
  if (!local.ultimaAtualizacao) return []; // primeiro download: não avisa sobre tudo
  const novos = [];
  for (const tabela of ['lancamentos', 'compras_cartao']) {
    const conhecidos = new Set(local.tabelas()[tabela].map((x) => x.id));
    const vindos = resultados[TABELAS.indexOf(tabela)];
    for (const item of vindos) {
      if (!conhecidos.has(item.id) && item.criado_por && item.criado_por !== local.usuarioId) novos.push({ ...item, tabela });
    }
  }
  return novos;
}

async function buscarTabela(tabela, familiaId) {
  const todos = [];
  for (let inicio = 0; ; inicio += 1000) {
    const { data, error } = await supabase.from(tabela).select('*').eq('familia_id', familiaId).range(inicio, inicio + 999);
    if (error) throw error;
    todos.push(...data);
    if (data.length < 1000) break; // o Supabase entrega no máximo 1000 linhas por vez
  }
  return todos;
}

// ---------- Quando a internet volta ou a pessoa volta para o app, sincroniza
window.addEventListener('online', () => { estado.online = true; avisar('online'); sincronizar(); });
window.addEventListener('offline', () => { estado.online = false; avisar('offline'); });
document.addEventListener('visibilitychange', () => document.visibilityState === 'visible' && sincronizar());
setInterval(() => document.visibilityState === 'visible' && sincronizar(), 60_000);
