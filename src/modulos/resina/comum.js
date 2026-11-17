// Pedaços usados por várias telas do módulo Resina
import { esc } from '../../lib/format.js';
import { store } from '../../lib/store.js';
import { icone } from '../../lib/ui.js';
import { resinaAtiva } from './dados.js';

export const kg = (v) => `${Math.round(v || 0).toLocaleString('pt-BR')} kg`;
export const numero = (v, casas = 0) => (v || 0).toLocaleString('pt-BR', { maximumFractionDigits: casas });
export const pct = (v) => `${(v || 0).toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%`;

export const produtor = (id) => store.resina_produtores.find((p) => p.id === id);
export const nomeProdutor = (id) => produtor(id)?.nome ?? 'Produtor excluído';
export const corProdutor = (id) => produtor(id)?.cor ?? '#9CA3AF';
export const motorista = (id) => store.resina_motoristas.find((m) => m.id === id);
export const caminhao = (id) => store.resina_caminhoes.find((c) => c.id === id);
export const fazenda = (id) => store.resina_fazendas.find((f) => f.id === id);
export const titular = (id) => store.resina_titulares.find((t) => t.id === id);
/** Nome da conta com o documento: "Empresa · 00.000.000/0000-00" */
export const nomeTitular = (id) => {
  const t = titular(id);
  if (!t) return id ? 'Conta excluída' : 'Sem conta';
  return t.documento ? `${t.nome} · ${t.documento}` : t.nome;
};

/** Bolinha com a cor do produtor (decorativa: o nome sempre aparece ao lado) */
export const bolinha = (cor, classe = 'size-3') =>
  `<span class="inline-block ${classe} shrink-0 rounded-full ring-1 ring-black/10" style="background:${esc(cor)}" aria-hidden="true"></span>`;

/**
 * Quadrinho de número (Tbs, kg, valores).
 * O valor fica sempre numa linha só ("R$" junto do número) e a fonte acompanha a largura
 * da caixa (container query): diminui só o necessário para caber, sem sair da caixa.
 */
export const quadro = (rotulo, valor, extra = '') => {
  const letras = Math.max(4, String(valor).replace(/<[^>]*>/g, '').replace(/&[a-z#0-9]+;/gi, 'x').trim().length);
  return `
  <div class="@container min-w-0 rounded-xl border border-stone-200 p-3 dark:border-stone-800">
    <p class="text-sm text-stone-600 dark:text-stone-400">${rotulo}</p>
    <p class="quadro-valor font-bold whitespace-nowrap tabular-nums" style="--letras:${letras}">${valor}</p>${extra}
  </div>`;
};

/** Tela de aviso quando o módulo está desligado */
export function seDesligado(el) {
  if (resinaAtiva()) return false;
  el.innerHTML = `<div class="card mx-auto mt-4 max-w-xl animate-entrar">
    <p class="font-semibold">O módulo Resina está desligado</p>
    <p class="mt-1 text-sm text-stone-600 dark:text-stone-400">Ele serve para controlar a produção e as cargas de resina. Para usar, ligue em Ajustes &gt; Módulos.</p>
    <a href="#ajustes" class="btn-sec mt-4">${icone('ajustes')} Ir para Ajustes</a></div>`;
  return true;
}

/** Faixa colorida com a parte de cada produtor (proporcional aos Tbs) */
export function faixaProdutores(itens) {
  const total = itens.reduce((s, i) => s + (i.tbs || 0), 0);
  if (!total) return '';
  return `<div class="flex h-2 overflow-hidden rounded-full bg-stone-100 dark:bg-stone-800" aria-hidden="true">${itens.filter((i) => i.tbs).map((i) =>
    `<span style="width:${(i.tbs / total) * 100}%;background:${esc(corProdutor(i.produtor_id))}"></span>`).join('')}</div>`;
}
