// Ajustes: família e convite, contas, cartões, categorias, pessoas, aparência e sair
import { esc, valorParaCampo, lerValor, VALOR_MAXIMO, valorMaximoTexto } from '../lib/format.js';
import { store, categoriasPorGrupo } from '../lib/store.js';
import { salvarItem, excluirItem, renomearFamilia, auth } from '../lib/api.js';
import { icone, toast, confirmar, mascaraDinheiro } from '../lib/ui.js';
import { lerPreferencias, salvarPreferencias } from '../lib/preferencias.js';
import { abrirTour } from '../components/tour.js';
import { modoDemo } from '../lib/supabase.js';

// Definição de cada lista editável: quais campos aparecem e como são lidos
const LISTAS = {
  contas: {
    titulo: 'Contas', icone: 'carteira',
    explicacao: 'Onde o dinheiro fica: dinheiro em espécie, bancos, carteiras digitais. O <strong>saldo inicial</strong> é quanto a conta tinha quando vocês começaram a usar o sistema.',
    novo: { nome: '', saldo_inicial: 0, ativa: true },
    campos: [
      { nome: 'nome', rotulo: 'Nome', tipo: 'texto', largura: 'sm:col-span-5' },
      { nome: 'saldo_inicial', rotulo: 'Saldo inicial (R$)', tipo: 'dinheiro', largura: 'sm:col-span-4' },
      { nome: 'ativa', rotulo: 'Em uso', tipo: 'marcar', largura: 'sm:col-span-3' },
    ],
    dicaExcluir: 'Se a conta já tem lançamentos, desmarque "Em uso" em vez de excluir.',
  },
  cartoes: {
    titulo: 'Cartões de crédito', icone: 'cartao',
    explicacao: 'O <strong>dia de fechamento</strong> decide em qual fatura cada compra cai. Confira no aplicativo do banco.',
    novo: { nome: '', dia_fechamento: 1, dia_vencimento: 10, ativo: true },
    campos: [
      { nome: 'nome', rotulo: 'Nome', tipo: 'texto', largura: 'sm:col-span-4' },
      { nome: 'dia_fechamento', rotulo: 'Dia que fecha', tipo: 'dia', largura: 'sm:col-span-3' },
      { nome: 'dia_vencimento', rotulo: 'Dia que vence', tipo: 'dia', largura: 'sm:col-span-3' },
      { nome: 'ativo', rotulo: 'Em uso', tipo: 'marcar', largura: 'sm:col-span-2' },
    ],
    dicaExcluir: 'Excluir um cartão apaga também todas as compras dele. Os pagamentos de fatura já feitos continuam no extrato.',
  },
  categorias: {
    titulo: 'Categorias', icone: 'etiqueta',
    explicacao: 'Organizam os gastos. Marque <strong>No gráfico</strong> para a categoria aparecer no gráfico do Início. O <strong>grupo</strong> separa Casa, Fazenda, Empresa etc. no Relatório.',
    novo: { nome: '', grupo: 'Casa', no_grafico: true },
    campos: [
      { nome: 'nome', rotulo: 'Nome', tipo: 'texto', largura: 'sm:col-span-5' },
      { nome: 'grupo', rotulo: 'Grupo', tipo: 'grupo', largura: 'sm:col-span-4' },
      { nome: 'no_grafico', rotulo: 'No gráfico', tipo: 'marcar', largura: 'sm:col-span-3' },
    ],
    dicaExcluir: 'Categorias já usadas não podem ser excluídas; renomeie se precisar.',
  },
  pessoas: {
    titulo: 'Pessoas', icone: 'pessoas',
    explicacao: 'Funcionários, prestadores de serviço e pessoas da família. Usadas no campo "Pessoa" dos lançamentos e no relatório de pagamentos.',
    novo: { nome: '', tipo: 'Funcionário' },
    campos: [
      { nome: 'nome', rotulo: 'Nome', tipo: 'texto', largura: 'sm:col-span-6' },
      { nome: 'tipo', rotulo: 'Tipo', tipo: 'opcoes', opcoes: ['Família', 'Funcionário', 'Prestador', 'Outro'], largura: 'sm:col-span-6' },
    ],
  },
};

const abertas = new Set(['familia']);

export default {
  titulo: 'Ajustes',
  usaMes: false,
  ajuda: `
    <p>Toque no nome de cada seção para abrir.</p>
    <p><strong>Família</strong>: o código de convite para a outra pessoa entrar.</p>
    <p><strong>Contas, Cartões, Categorias e Pessoas</strong>: mude qualquer campo e toque em <strong>Salvar</strong> na mesma linha. Para incluir um item novo, use a última linha de cada lista.</p>
    <p><strong>Aparência</strong>: modo escuro e letras maiores, só neste aparelho.</p>`,

  async render(el, ctx) {
    const pref = lerPreferencias();
    el.innerHTML = `
    <div class="mx-auto grid max-w-3xl gap-3 animate-entrar">
      ${secao('familia', 'Família e convite', 'casa', `
        <form data-familia class="flex flex-col gap-2 sm:flex-row sm:items-end">
          <div class="flex-1"><label class="rotulo" for="a-familia">Nome da família</label>
          <input id="a-familia" name="nome" class="campo" value="${esc(store.familia.nome)}" maxlength="60"></div>
          <button class="btn-sec">Salvar</button>
        </form>
        <div class="mt-5 rounded-xl bg-brand-50 p-4 dark:bg-brand-950">
          <p class="font-semibold">Como colocar outra pessoa no sistema</p>
          <ol class="mt-2 grid list-decimal gap-1 pl-5 text-sm text-stone-700 dark:text-stone-300">
            <li>A pessoa abre o sistema e toca em <strong>Criar conta</strong>, com o e-mail dela.</li>
            <li>Na tela seguinte, escolhe <strong>Recebi um convite</strong>.</li>
            <li>Digita este código:</li>
          </ol>
          <div class="mt-3 flex items-center gap-2">
            <output class="rounded-xl bg-white px-4 py-2 font-mono text-2xl font-bold tracking-[0.3em] dark:bg-stone-900" aria-label="Código de convite">${esc(store.familia.codigo_convite)}</output>
            <button type="button" class="btn-neutro" data-copiar>${icone('copiar')} Copiar</button>
          </div>
        </div>`)}

      ${Object.entries(LISTAS).map(([tabela, def]) => secao(tabela, def.titulo, def.icone, `
        <p class="mb-4 text-sm text-stone-600 dark:text-stone-400">${def.explicacao}</p>
        ${tabela === 'categorias' ? listaCategorias(def) : `<ul class="grid gap-3">${store[tabela].map((item) => linha(tabela, def, item)).join('')}</ul>`}
        <h3 class="mt-5 mb-2 text-sm font-semibold">Adicionar</h3>
        <ul>${linha(tabela, def, def.novo)}</ul>
        ${def.dicaExcluir ? `<p class="dica mt-3">${def.dicaExcluir}</p>` : ''}`)).join('')}

      ${secao('aparencia', 'Aparência', 'paleta', `
        <fieldset><legend class="rotulo">Tema</legend>
          <div class="grid grid-cols-3 gap-2">
            ${[['auto', 'Automático'], ['claro', 'Claro'], ['escuro', 'Escuro']].map(([v, t]) => `
              <label class="opcao-modo"><input type="radio" name="tema" value="${v}" class="sr-only" ${pref.tema === v ? 'checked' : ''}>${t}</label>`).join('')}
          </div></fieldset>
        <label class="mt-4 flex cursor-pointer items-center justify-between gap-3 rounded-xl border border-stone-200 p-3 dark:border-stone-700">
          <span><span class="block font-semibold">Letras maiores</span><span class="text-sm text-stone-600 dark:text-stone-400">Aumenta o tamanho de todo o texto.</span></span>
          <input type="checkbox" data-texto-grande class="size-6 accent-brand-600" ${pref.textoGrande ? 'checked' : ''}>
        </label>`)}

      ${secao('conta', 'Minha conta', 'sair', `
        <p class="text-sm text-stone-600 dark:text-stone-400">Conectado como <strong>${esc(store.user.email)}</strong>${modoDemo ? ' (demonstração)' : ''}.</p>
        <div class="mt-4 flex flex-wrap gap-2">
          <button type="button" class="btn-neutro" data-tour>${icone('ajuda')} Ver a apresentação de novo</button>
          <button type="button" class="btn-neutro text-red-700 dark:text-red-400" data-sair>${icone('sair')} Sair</button>
        </div>`)}
    </div>`;

    el.querySelectorAll('[data-dinheiro]').forEach(mascaraDinheiro);
    el.querySelectorAll('details').forEach((d) => d.addEventListener('toggle', () => (d.open ? abertas.add(d.dataset.secao) : abertas.delete(d.dataset.secao))));

    el.onsubmit = async (e) => {
      e.preventDefault();
      const form = e.target;
      const botao = form.querySelector('button[type=submit], button:not([type])');
      botao && (botao.disabled = true);
      try {
        if (form.dataset.familia !== undefined) {
          if (!form.nome.value.trim()) throw new Error('Escreva um nome para a família.');
          store.familia = await renomearFamilia(form.nome.value.trim());
          toast('Nome da família salvo');
          return;
        }
        const tabela = form.dataset.tabela;
        const item = lerLinha(form, LISTAS[tabela]);
        if (!item.nome) throw new Error('Preencha o nome.');
        await salvarItem(tabela, item);
        toast(item.id ? `${item.nome} atualizado` : `${item.nome} adicionado`);
        ctx.atualizar();
      } catch (err) {
        toast(err.message, { tipo: 'erro' });
      } finally {
        botao && (botao.disabled = false);
      }
    };

    el.onclick = async (e) => {
      const excluir = e.target.closest('[data-excluir]');
      if (excluir) {
        const [tabela, id] = excluir.dataset.excluir.split(':');
        const item = store[tabela].find((x) => x.id === Number(id));
        const extra = tabela === 'cartoes' ? ' Todas as compras deste cartão também serão apagadas (os pagamentos de fatura continuam no extrato).' : '';
        if (!(await confirmar(`“${item.nome}” será excluído.${extra}`, { botao: 'Excluir', perigo: true }))) return;
        try { await excluirItem(tabela, item.id); toast(`${item.nome} excluído`); ctx.atualizar(); } catch (err) { toast(err.message, { tipo: 'erro' }); }
      } else if (e.target.closest('[data-copiar]')) {
        try { await navigator.clipboard.writeText(store.familia.codigo_convite); toast('Código copiado'); } catch { toast('Não deu para copiar. Anote o código mostrado na tela.', { tipo: 'erro' }); }
      } else if (e.target.closest('[data-tour]')) {
        abrirTour();
      } else if (e.target.closest('[data-sair]')) {
        if (await confirmar('Você vai precisar do e-mail e da senha para entrar de novo.', { titulo: 'Sair do sistema?', botao: 'Sair' })) auth.sair();
      }
    };

    el.onchange = (e) => {
      if (e.target.name === 'tema') salvarPreferencias({ tema: e.target.value });
      if (e.target.matches('[data-texto-grande]')) salvarPreferencias({ textoGrande: e.target.checked });
    };
  },
};

const secao = (id, titulo, ic, conteudo) => `
  <details class="card group p-0 sm:p-0" data-secao="${id}" ${abertas.has(id) ? 'open' : ''}>
    <summary class="flex min-h-14 cursor-pointer list-none items-center gap-3 rounded-2xl px-4 py-3 font-semibold sm:px-5 [&::-webkit-details-marker]:hidden">
      <span class="flex size-9 items-center justify-center rounded-lg bg-stone-100 text-stone-600 dark:bg-stone-800 dark:text-stone-300">${icone(ic)}</span>
      <span class="flex-1">${titulo}</span>
      <span class="text-stone-400 transition group-open:rotate-90">${icone('direita')}</span>
    </summary>
    <div class="border-t border-stone-100 px-4 pt-4 pb-5 sm:px-5 dark:border-stone-800">${conteudo}</div>
  </details>`;

function listaCategorias(def) {
  const grupos = [...new Set(store.categorias.map((c) => c.grupo))];
  return `<datalist id="grupos-lista">${grupos.map((g) => `<option value="${esc(g)}"></option>`).join('')}</datalist>` + Object.entries(categoriasPorGrupo()).map(([grupo, cats]) => `
    <h3 class="mt-4 mb-2 text-sm font-semibold text-stone-600 dark:text-stone-400 first:mt-0 dark:text-stone-400">${esc(grupo)}</h3>
    <ul class="grid gap-3">${cats.map((c) => linha('categorias', def, c)).join('')}</ul>`).join('');
}

/** Uma linha editável (um pequeno formulário) */
function linha(tabela, def, item) {
  const novo = !item.id;
  const sufixo = `${tabela}-${item.id || 'novo'}`;
  return `<li><form data-tabela="${tabela}" data-id="${item.id || ''}" class="grid grid-cols-2 items-end gap-2 rounded-xl ${novo ? 'border-2 border-dashed border-stone-300 p-3 dark:border-stone-700' : 'bg-stone-50 p-3 dark:bg-stone-800/50'} sm:grid-cols-12" novalidate>
    <div class="col-span-2 grid grid-cols-2 gap-2 sm:col-span-9 sm:grid-cols-12">
    ${def.campos.map((c) => {
      const id = `${c.nome}-${sufixo}`;
      const valor = item[c.nome];
      const rotulo = `<label class="rotulo text-xs" for="${id}">${c.rotulo}</label>`;
      let campo;
      if (c.tipo === 'marcar') {
        return `<label class="col-span-1 flex min-h-11 cursor-pointer items-center gap-2 self-end text-sm font-medium ${c.largura}" for="${id}">
          <input id="${id}" type="checkbox" name="${c.nome}" class="size-5 accent-brand-600" ${valor ? 'checked' : ''}>${c.rotulo}</label>`;
      }
      if (c.tipo === 'dinheiro') campo = `<input id="${id}" name="${c.nome}" class="campo tabular-nums" inputmode="numeric" data-dinheiro value="${valorParaCampo(Math.abs(valor))}" placeholder="0,00">
        <label class="mt-1 flex items-center gap-1.5 text-xs"><input type="checkbox" name="${c.nome}_negativo" class="accent-red-700" ${valor < 0 ? 'checked' : ''}> negativo</label>`;
      else if (c.tipo === 'dia') campo = `<input id="${id}" name="${c.nome}" type="number" min="1" max="31" class="campo" value="${valor}">`;
      else if (c.tipo === 'opcoes') campo = `<select id="${id}" name="${c.nome}" class="campo">${c.opcoes.map((o) => `<option ${o === valor ? 'selected' : ''}>${o}</option>`).join('')}</select>`;
      else if (c.tipo === 'grupo') campo = `<input id="${id}" name="${c.nome}" class="campo" list="grupos-lista" value="${esc(valor)}">`;
      else campo = `<input id="${id}" name="${c.nome}" class="campo" maxlength="60" value="${esc(valor)}" ${novo ? 'placeholder="Nome do novo item"' : ''}>`;
      return `<div class="${c.nome === 'nome' ? 'col-span-2' : 'col-span-1'} ${c.largura}">${rotulo}${campo}</div>`;
    }).join('')}
    </div>
    <div class="col-span-2 flex gap-2 sm:col-span-3 sm:justify-end">
      <button type="submit" class="${novo ? 'btn-primario' : 'btn-sec'} flex-1 sm:flex-none">${novo ? `${icone('mais')} Adicionar` : 'Salvar'}</button>
      ${novo ? '' : `<button type="button" class="btn-icone text-stone-600 dark:text-stone-400 hover:text-red-700" data-excluir="${tabela}:${item.id}" aria-label="Excluir ${esc(item.nome)}" title="Excluir">${icone('lixo')}</button>`}
    </div>
  </form></li>`;
}

function lerLinha(form, def) {
  const item = form.dataset.id ? { id: Number(form.dataset.id) } : {};
  for (const c of def.campos) {
    const campo = form.elements[c.nome];
    if (c.tipo === 'marcar') item[c.nome] = campo.checked;
    else if (c.tipo === 'dinheiro') {
      const v = lerValor(campo.value) || 0;
      if (v > VALOR_MAXIMO) throw new Error(`O valor máximo é ${valorMaximoTexto()}.`);
      item[c.nome] = v * (form.elements[`${c.nome}_negativo`].checked ? -1 : 1);
    }
    else if (c.tipo === 'dia') {
      const n = Number(campo.value);
      if (!(n >= 1 && n <= 31)) throw new Error('O dia precisa ser um número de 1 a 31.');
      item[c.nome] = n;
    } else item[c.nome] = campo.value.trim();
  }
  if ('grupo' in item && !item.grupo) item.grupo = 'Outros';
  return item;
}
