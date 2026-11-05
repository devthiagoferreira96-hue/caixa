// Avisos de conexão: sem internet, alterações aguardando envio e
// "Dados registrados offline sendo armazenados".
import { ouvir, estado, sincronizar } from '../lib/sync.js';
import { carregarCadastros } from '../lib/api.js';
import { icone, toast } from '../lib/ui.js';
import { autor } from '../lib/store.js';

const plural = (n, um, varios) => `${n} ${n === 1 ? um : varios}`;

/** Faixa no topo do sistema (dentro do layout) */
export function faixaConexao() {
  return '<div id="faixa-conexao" role="status" aria-live="polite"></div>';
}

function desenharFaixa(evento, info) {
  const el = document.getElementById('faixa-conexao');
  if (!el) return;
  let html = '';
  if (!navigator.onLine) {
    html = `<div class="flex items-center justify-center gap-2 bg-stone-800 px-4 py-2 text-center text-sm text-white dark:bg-stone-200 dark:text-stone-900">
      ${icone('alerta', 'size-4')}<span><strong>Sem internet.</strong> Pode continuar usando normalmente${info.pendentes ? `: ${plural(info.pendentes, 'alteração será salva', 'alterações serão salvas')} quando a conexão voltar` : '; o que você lançar será salvo quando a conexão voltar'}.</span></div>`;
  } else if (info.enviando) {
    html = `<div class="flex items-center justify-center gap-2 bg-brand-700 px-4 py-2 text-center text-sm text-white">
      <span class="size-4 animate-spin rounded-full border-2 border-white/40 border-t-white" aria-hidden="true"></span>
      <span><strong>Dados registrados offline sendo armazenados…</strong>${info.pendentes ? ` Faltam ${info.pendentes}.` : ''}</span></div>`;
  } else if (info.pendentes) {
    html = `<div class="flex flex-wrap items-center justify-center gap-2 bg-amber-100 px-4 py-2 text-center text-sm text-amber-900 dark:bg-amber-900/50 dark:text-amber-100">
      <span>${plural(info.pendentes, 'alteração aguardando envio', 'alterações aguardando envio')}.</span>
      <button type="button" data-enviar-agora class="cursor-pointer font-semibold underline underline-offset-2">Enviar agora</button></div>`;
  }
  if (el.innerHTML !== html) el.innerHTML = html;
  el.querySelector('[data-enviar-agora]')?.addEventListener('click', () => sincronizar());
}

export function iniciarAvisosDeConexao() {
  ouvir(async (evento, info) => {
    desenharFaixa(evento, info);
    if (evento === 'enviando') {
      toast(`Dados registrados offline sendo armazenados (${plural(info.total, 'alteração', 'alterações')})…`);
    }
    if (evento === 'enviado') {
      const certos = info.total - info.falhas.filter((f) => f.op.offline).length;
      if (certos) toast(`Pronto! ${plural(certos, 'alteração feita sem internet foi armazenada', 'alterações feitas sem internet foram armazenadas')}.`);
      if (info.falhas.length) {
        const nomes = info.falhas.map((f) => descrever(f.op)).join(', ');
        toast(`${plural(info.falhas.length, 'alteração não pôde ser salva', 'alterações não puderam ser salvas')} (${nomes}). Os dados foram atualizados com o que está no servidor.`, { tipo: 'erro' });
      }
    }
    if (evento === 'offline') toast('Você está sem internet. Pode continuar usando: tudo será salvo quando a conexão voltar.');
    if (evento === 'dados') {
      await carregarCadastros();
      avisarNovosDeOutros(info.novos || []);
      document.dispatchEvent(new CustomEvent('caixa:dados-atualizados'));
    }
  });
  // redesenha a faixa sempre que o layout é montado
  document.addEventListener('caixa:layout', () => desenharFaixa('layout', estado));
}

/** "Thays lançou 2 itens" (um aviso por pessoa) */
function avisarNovosDeOutros(novos) {
  const porPessoa = new Map();
  novos.forEach((item) => porPessoa.set(item.criado_por, [...(porPessoa.get(item.criado_por) || []), item]));
  for (const [userId, itens] of porPessoa) {
    const nome = autor(userId)?.nome || 'Alguém da família';
    const exemplo = itens.length === 1 ? `: ${itens[0].descricao}` : '';
    const soCartao = itens.every((i) => i.tabela === 'compras_cartao');
    toast(`${nome} lançou ${plural(itens.length, 'item', 'itens')}${exemplo}`, {
      acao: { texto: 'Ver', fn: () => { location.hash = soCartao ? 'cartoes' : 'extrato'; } },
    });
  }
}

function descrever(op) {
  const item = op.linhas?.[0];
  const nome = item?.descricao || item?.nome;
  const acao = { insert: 'novo', update: 'alteração', delete: 'exclusão' }[op.op];
  return nome ? `${acao}: ${nome}` : `${acao} em ${op.tabela}`;
}
