// Estado compartilhado entre as telas (dados que mudam pouco ficam em memória)
import { inicioMes } from './format.js';

export const store = {
  user: null,
  familia: null,
  contas: [],
  cartoes: [],
  categorias: [],
  pessoas: [],
  membros: [], // pessoas da família que usam o sistema (você e sua esposa)
  mes: inicioMes(new Date()), // mês escolhido no topo da tela
};

export const buscar = (lista, id) => store[lista].find((x) => x.id === id);
export const contasAtivas = () => store.contas.filter((c) => c.ativa !== false);
export const cartoesAtivos = () => store.cartoes.filter((c) => c.ativo !== false);

// ---------- Quem lançou: nome, iniciais e cor de cada pessoa da família
const CORES = [
  'bg-teal-100 text-teal-900 dark:bg-teal-900 dark:text-teal-100',
  'bg-pink-100 text-pink-900 dark:bg-pink-900 dark:text-pink-100',
  'bg-violet-100 text-violet-900 dark:bg-violet-900 dark:text-violet-100',
  'bg-amber-100 text-amber-900 dark:bg-amber-900 dark:text-amber-100',
];

/** { nome, iniciais, cor, souEu } de quem lançou, ou null se não souber */
export function autor(userId) {
  if (!userId) return null;
  const i = store.membros.findIndex((m) => m.user_id === userId);
  if (i < 0) return null;
  const nome = store.membros[i].nome || 'Alguém';
  // iniciais: 1ª letra; se outra pessoa começar com a mesma letra, usa a 1ª letra diferente
  // (Thiago e Thays viram "Ti" e "Ta")
  let iniciais = nome[0].toUpperCase();
  const outros = store.membros.filter((m) => m.user_id !== userId).map((m) => (m.nome || '').toLowerCase());
  if (outros.some((o) => o[0] === nome[0].toLowerCase())) {
    const n = nome.toLowerCase();
    const pos = [...n].findIndex((ch, k) => k > 0 && outros.every((o) => o[k] !== ch));
    iniciais += pos > 0 ? n[pos] : (n[1] || '');
  }
  return { nome, iniciais, cor: CORES[i % CORES.length], souEu: userId === store.user?.id };
}

export const nomeCategoria = (id) => buscar('categorias', id)?.nome ?? 'Sem categoria';

/** Categorias agrupadas: { Casa: [...], Fazenda: [...] } na ordem em que os grupos aparecem */
export function categoriasPorGrupo() {
  const grupos = {};
  for (const c of [...store.categorias].sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'))) {
    (grupos[c.grupo || 'Outros'] ||= []).push(c);
  }
  const ordem = ['Casa', 'Fazenda', 'Empresa', 'Serviços', 'Financeiro'];
  return Object.fromEntries(
    Object.entries(grupos).sort(([a], [b]) => (ordem.indexOf(a) + 1 || 99) - (ordem.indexOf(b) + 1 || 99)),
  );
}
