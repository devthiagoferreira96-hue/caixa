// Estado compartilhado entre as telas (dados que mudam pouco ficam em memória)
import { inicioMes } from './format.js';

export const store = {
  usuario: null, // nome de quem usa o sistema
  contas: [],
  cartoes: [],
  categorias: [],
  pessoas: [],
  mes: inicioMes(new Date()), // mês escolhido no topo da tela
};

export const buscar = (lista, id) => store[lista].find((x) => x.id === id);
export const contasAtivas = () => store.contas.filter((c) => c.ativa !== false);
export const cartoesAtivos = () => store.cartoes.filter((c) => c.ativo !== false);

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
