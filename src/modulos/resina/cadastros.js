// Cadastros da resina: produtores, motoristas, caminhões, preço do kg e fazenda
import { store } from '../../lib/store.js';
import { salvarItem, excluirItem } from '../../lib/api.js';
import { dataCompleta, brl } from '../../lib/format.js';
import { desfazendo } from '../../components/lancamento.js';
import { secao, linha, lerLinha } from '../../components/lista-editavel.js';
import { chave } from '../../lib/importar-planilha.js';
import { toast, confirmar, mascaraDinheiro, semRepetir } from '../../lib/ui.js';
import { CORES_PRODUTOR, CAPACIDADE_MAXIMA, CAPACIDADE_PADRAO, UNIDADES } from './tabelas.js';
import { seDesligado } from './comum.js';

/** Próxima cor sugerida: a primeira da lista que ainda não está em uso */
export const proximaCor = () =>
  CORES_PRODUTOR.find((c) => !store.resina_produtores.some((p) => p.cor?.toLowerCase() === c.toLowerCase()))
  || CORES_PRODUTOR[store.resina_produtores.length % CORES_PRODUTOR.length];

export const LISTAS_RESINA = {
  resina_produtores: {
    titulo: 'Produtores', icone: 'pessoas', artigo: 'um produtor chamado',
    explicacao: 'Quem produz a resina. A <strong>cor</strong> pinta os tambores do produtor na carreta. O <strong>arrendamento</strong> é a porcentagem que costuma ficar com o proprietário; em cada carga dá para mudar.',
    novo: () => ({ nome: '', cor: proximaCor(), arrendamento: 0, ativo: true }),
    campos: [
      { nome: 'nome', rotulo: 'Nome', tipo: 'texto', largura: 'sm:col-span-5' },
      { nome: 'cor', rotulo: 'Cor', tipo: 'cor', largura: 'sm:col-span-2' },
      { nome: 'arrendamento', rotulo: 'Arrendamento', tipo: 'porcentagem', largura: 'sm:col-span-3' },
      { nome: 'ativo', rotulo: 'Em uso', tipo: 'marcar', largura: 'sm:col-span-2' },
    ],
    dicaExcluir: 'Quem já tem cargas não pode ser excluído: desmarque "Em uso" para sumir das listas.',
  },
  resina_produtos: {
    titulo: 'Produtos (insumos)', icone: 'insumo', artigo: 'um produto chamado',
    explicacao: 'O que é usado para coletar a resina (estimulante, sacos, estrias, ferramentas...). O <strong>valor unitário</strong> é sugerido ao lançar os insumos de um produtor, e dá para mudar em cada lançamento.',
    novo: () => ({ nome: '', unidade: 'un', valor_unitario: 0, ativo: true }),
    campos: [
      { nome: 'nome', rotulo: 'Produto', tipo: 'texto', max: 60, placeholder: 'Ex.: Pasta estimulante', largura: 'sm:col-span-4' },
      { nome: 'unidade', rotulo: 'Unidade', tipo: 'opcoes', opcoes: UNIDADES, padrao: 'un', largura: 'sm:col-span-3' },
      { nome: 'valor_unitario', rotulo: 'Valor unitário (R$)', tipo: 'preco', opcional: true, largura: 'sm:col-span-3' },
      { nome: 'ativo', rotulo: 'Em uso', tipo: 'marcar', largura: 'sm:col-span-2' },
    ],
    dicaExcluir: 'Produtos já lançados para algum produtor não podem ser excluídos: desmarque "Em uso".',
  },
  resina_motoristas: {
    titulo: 'Motoristas', icone: 'pessoas', artigo: 'um motorista chamado',
    explicacao: 'Quem leva as cargas.',
    novo: () => ({ nome: '', telefone: '', ativo: true }),
    campos: [
      { nome: 'nome', rotulo: 'Nome', tipo: 'texto', largura: 'sm:col-span-6' },
      { nome: 'telefone', rotulo: 'Telefone', tipo: 'texto', max: 30, placeholder: '(00) 00000-0000', largura: 'sm:col-span-4' },
      { nome: 'ativo', rotulo: 'Em uso', tipo: 'marcar', largura: 'sm:col-span-2' },
    ],
  },
  resina_caminhoes: {
    titulo: 'Caminhões', icone: 'caminhao', artigo: 'um caminhão com a placa',
    explicacao: `A <strong>capacidade</strong> é quantos Tbs (tambores) cabem na carroceria. Ela define o tamanho da carreta desenhada na tela da carga (até ${CAPACIDADE_MAXIMA}).`,
    novo: () => ({ nome: '', descricao: '', capacidade: CAPACIDADE_PADRAO, ativo: true }),
    campos: [
      { nome: 'nome', rotulo: 'Placa', tipo: 'texto', max: 10, maiusculas: true, placeholder: 'ABC-1D23', largura: 'sm:col-span-3' },
      { nome: 'descricao', rotulo: 'Modelo ou apelido', tipo: 'texto', max: 60, largura: 'sm:col-span-4' },
      { nome: 'capacidade', rotulo: 'Cabem (Tbs)', tipo: 'inteiro', min: 1, max: CAPACIDADE_MAXIMA, largura: 'sm:col-span-3' },
      { nome: 'ativo', rotulo: 'Em uso', tipo: 'marcar', largura: 'sm:col-span-2' },
    ],
  },
  resina_precos: {
    titulo: 'Preço do kg da resina', icone: 'dinheiro', campoNome: 'inicio',
    explicacao: 'Cadastre o preço sempre que ele mudar. A carga usa o preço que vale na data dela (dá para mudar na própria carga). O histórico fica guardado.',
    novo: () => ({ inicio: '', valor_kg: 0 }),
    campos: [
      { nome: 'inicio', rotulo: 'Vale a partir de', tipo: 'data', largura: 'sm:col-span-6' },
      { nome: 'valor_kg', rotulo: 'Preço do kg (R$)', tipo: 'preco', largura: 'sm:col-span-6' },
    ],
  },
  resina_fazendas: {
    titulo: 'Fazenda', icone: 'arvore', artigo: 'uma fazenda chamada',
    explicacao: 'De onde a resina sai. Com mais de uma fazenda, a carga pergunta de qual é.',
    novo: () => ({ nome: '', proprietario: '' }),
    campos: [
      { nome: 'nome', rotulo: 'Nome', tipo: 'texto', largura: 'sm:col-span-6' },
      { nome: 'proprietario', rotulo: 'Proprietário', tipo: 'texto', largura: 'sm:col-span-6' },
    ],
  },
  resina_titulares: {
    titulo: 'Contas da conta corrente (CNPJ e CPF)', icone: 'carteira', artigo: 'uma conta chamada',
    explicacao: 'Em nome de quem saem as cargas: o <strong>CNPJ</strong> da empresa e o <strong>CPF</strong> da proprietária, cada um com a sua conta corrente. Cada carga escolhe uma delas.',
    novo: () => ({ nome: '', documento: '', ativo: true }),
    campos: [
      { nome: 'nome', rotulo: 'Nome', tipo: 'texto', max: 60, placeholder: 'Ex.: Empresa (CNPJ)', largura: 'sm:col-span-5' },
      { nome: 'documento', rotulo: 'CNPJ ou CPF', tipo: 'texto', max: 20, placeholder: '00.000.000/0000-00', largura: 'sm:col-span-5' },
      { nome: 'ativo', rotulo: 'Em uso', tipo: 'marcar', largura: 'sm:col-span-2' },
    ],
    dicaExcluir: 'Contas que já têm cargas ou lançamentos não podem ser excluídas: desmarque "Em uso".',
  },
};

const abertas = new Set(['resina_produtores']);
const nomeDoItem = (tabela, item) => (tabela === 'resina_precos' ? `Preço de ${dataCompleta(item.inicio)}` : item.nome);

export default {
  titulo: 'Cadastros',
  usaMes: false,
  ajuda: `
    <p>Toque no nome de cada seção para abrir.</p>
    <p><strong>Produtores</strong>: nome, a <strong>cor</strong> dos tambores dele na carreta e o <strong>arrendamento</strong> que costuma valer (em cada carga dá para mudar).</p>
    <p><strong>Produtos (insumos)</strong>: o que é usado para coletar a resina, com a unidade e o valor unitário que costuma ter.</p>
    <p><strong>Caminhões</strong>: a placa e <strong>quantos Tbs cabem</strong>. A carreta da tela da carga é desenhada desse tamanho.</p>
    <p><strong>Preço do kg</strong>: cadastre sempre que o preço mudar. Cada carga pega o preço da data dela.</p>
    <p>Itens já usados em cargas não podem ser excluídos: desmarque <strong>Em uso</strong> para que sumam das listas.</p>`,

  async render(el, ctx) {
    if (seDesligado(el)) return;
    el.innerHTML = `<div class="mx-auto grid max-w-3xl gap-3 animate-entrar">
      ${Object.entries(LISTAS_RESINA).map(([tabela, def]) => {
        const itens = tabela === 'resina_precos' ? [...store[tabela]].reverse() : store[tabela];
        return secao(tabela, def.titulo, def.icone, `
          <p class="mb-4 text-sm text-stone-600 dark:text-stone-400">${def.explicacao}</p>
          ${itens.length ? `<ul class="grid gap-3">${itens.map((item) => linha(tabela, def, item)).join('')}</ul>` : ''}
          <h3 class="${itens.length ? 'mt-5' : ''} mb-2 text-sm font-semibold">Adicionar</h3>
          <ul>${linha(tabela, def, def.novo())}</ul>
          ${def.dicaExcluir ? `<p class="dica mt-3">${def.dicaExcluir}</p>` : ''}`, abertas.has(tabela));
      }).join('')}
    </div>`;

    el.querySelectorAll('[data-dinheiro]').forEach(mascaraDinheiro);
    el.querySelectorAll('details').forEach((d) => d.addEventListener('toggle', () => (d.open ? abertas.add(d.dataset.secao) : abertas.delete(d.dataset.secao))));

    el.onsubmit = semRepetir(async (e) => {
      e.preventDefault();
      const form = e.target;
      const tabela = form.dataset.tabela;
      const def = LISTAS_RESINA[tabela];
      const botao = form.querySelector('button[type=submit]');
      botao && (botao.disabled = true);
      try {
        const item = lerLinha(form, def);
        if (tabela === 'resina_precos') {
          const igual = store.resina_precos.find((x) => x.id !== item.id && x.inicio === item.inicio);
          if (igual) throw new Error(`Já existe um preço a partir de ${dataCompleta(item.inicio)} (${brl(igual.valor_kg)}). Mude o valor nele.`);
        } else {
          if (!item.nome) throw new Error(tabela === 'resina_caminhoes' ? 'Preencha a placa.' : 'Preencha o nome.');
          const igual = store[tabela].find((x) => x.id !== item.id && chave(x.nome) === chave(item.nome));
          if (igual) throw new Error(`Já existe ${def.artigo} "${igual.nome}". Use outro.`);
        }
        const salvo = await salvarItem(tabela, item);
        const nome = nomeDoItem(tabela, item);
        toast(item.id ? `${nome} atualizado` : `${nome} adicionado`, { acao: desfazendo(salvo.desfazer, ctx.atualizar) });
        ctx.atualizar();
      } catch (err) {
        toast(err.message, { tipo: 'erro' });
      } finally {
        botao && (botao.disabled = false);
      }
    });

    el.onclick = async (e) => {
      const excluir = e.target.closest('[data-excluir]');
      if (!excluir) return;
      const [tabela, id] = excluir.dataset.excluir.split(':');
      const item = store[tabela].find((x) => x.id === id);
      const nome = nomeDoItem(tabela, item);
      if (!(await confirmar(`“${nome}” será excluído.`, { botao: 'Excluir', perigo: true }))) return;
      try {
        const desfazer = await excluirItem(tabela, item.id);
        toast(`${nome} excluído`, { acao: desfazendo(desfazer, ctx.atualizar) });
        ctx.atualizar();
      } catch (err) { toast(err.message, { tipo: 'erro' }); }
    };
  },
};
