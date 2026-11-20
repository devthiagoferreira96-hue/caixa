// Estado compartilhado entre as telas (dados que mudam pouco ficam em memória)
import { inicioMes } from './format.js';

export const store = {
  usuario: null, // nome de quem usa o sistema
  contas: [],
  cartoes: [],
  categorias: [],
  pessoas: [],
  // módulo Resina
  resina_fazendas: [],
  resina_produtores: [],
  resina_motoristas: [],
  resina_caminhoes: [],
  resina_precos: [],
  resina_produtos: [], // insumos usados para coletar a resina
  resina_titulares: [], // contas da proprietária (CNPJ e CPF) para a conta corrente
  mes: inicioMes(new Date()), // mês escolhido no topo da tela
};

export const buscar = (lista, id) => store[lista].find((x) => x.id === id);
export const contasAtivas = () => store.contas.filter((c) => c.ativa !== false);
export const cartoesAtivos = () => store.cartoes.filter((c) => c.ativo !== false);

/**
 * A conta entra no "Saldo total" do Início? A escolha fica guardada na conta (no_saldo).
 * Conta sem escolha (dados antigos) segue o "Em uso": em uso entra, fora de uso não.
 */
export const contaNoSaldo = (c) => (typeof c.no_saldo === 'boolean' ? c.no_saldo : c.ativa !== false);

/**
 * Separa as contas do Início: as que somam no saldo e as "outras" (fora do saldo, mostradas à parte).
 * Conta fora de uso e sem dinheiro não aparece nas outras (só ocuparia espaço).
 */
export function dividirContasDoSaldo(contas, saldos) {
  const valor = (c) => saldos.get(c.id) || 0;
  const noSaldo = contas.filter(contaNoSaldo);
  const outras = contas.filter((c) => !contaNoSaldo(c) && (c.ativa !== false || Math.abs(valor(c)) > 0.004));
  const somar = (lista) => Math.round(lista.reduce((s, c) => s + valor(c), 0) * 100) / 100;
  return { noSaldo, outras, total: somar(noSaldo), totalOutras: somar(outras) };
}

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
