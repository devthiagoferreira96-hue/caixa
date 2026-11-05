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

/** Tipos de categoria: em que tipo de lançamento ela pode ser usada */
export const TIPOS_CATEGORIA = [['saida', 'Saída'], ['entrada', 'Entrada'], ['ambos', 'Os dois']];
export const tipoCategoria = (c) => c?.tipo || 'saida';
/** A categoria serve para esse tipo de lançamento? (tipo: 'saida' | 'entrada' | 'cartao') */
export const categoriaServe = (c, tipo) => {
  const t = tipoCategoria(c);
  return t === 'ambos' || t === (tipo === 'entrada' ? 'entrada' : 'saida');
};

/**
 * Grupos de categorias que são "outro negócio" e ficam fora do Resumo da casa,
 * cada um com o seu próprio quadro no Início.
 */
export const GRUPOS_SEPARADOS = ['Fazenda', 'Empresa'];
/** Área de uma categoria: 'Casa', 'Fazenda' ou 'Empresa' */
export const areaDaCategoria = (id) => {
  const g = buscar('categorias', id)?.grupo;
  return GRUPOS_SEPARADOS.includes(g) ? g : 'Casa';
};

/**
 * Categorias agrupadas: { Casa: [...], Fazenda: [...] } na ordem em que os grupos aparecem.
 * Com `tipo`, mostra só as que servem para aquele tipo de lançamento (e sempre a `manter`).
 */
export function categoriasPorGrupo(tipo, manter) {
  const grupos = {};
  const lista = tipo ? store.categorias.filter((c) => categoriaServe(c, tipo) || c.id === manter) : store.categorias;
  for (const c of [...lista].sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'))) {
    (grupos[c.grupo || 'Outros'] ||= []).push(c);
  }
  const ordem = ['Casa', 'Fazenda', 'Empresa', 'Serviços', 'Financeiro'];
  return Object.fromEntries(
    Object.entries(grupos).sort(([a], [b]) => (ordem.indexOf(a) + 1 || 99) - (ordem.indexOf(b) + 1 || 99)),
  );
}
