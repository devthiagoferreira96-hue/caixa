// Ajustes: backup, contas, cartões, categorias, pessoas, aparência, usuário e senha
import { esc, valorParaCampo, lerValor, VALOR_MAXIMO, valorMaximoTexto, dataCompleta } from '../lib/format.js';
import { store, categoriasPorGrupo } from '../lib/store.js';
import { salvarItem, excluirItem } from '../lib/api.js';
import { local } from '../lib/local-db.js';
import { desfazendo } from '../components/lancamento.js';
import { fazerBackup, restaurarComConfirmacao } from '../components/backup.js';
import { icone, toast, confirmar, mascaraDinheiro, dialogo, erroNoCampo, limparErros } from '../lib/ui.js';
import { lerPreferencias, salvarPreferencias } from '../lib/preferencias.js';
import { abrirTour } from '../components/tour.js';

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

const abertas = new Set(['backup']);

export default {
  titulo: 'Ajustes',
  usaMes: false,
  ajuda: `
    <p>Toque no nome de cada seção para abrir.</p>
    <p><strong>Backup</strong>: gera um arquivo com todos os dados. Guarde-o fora do aparelho (Drive, e-mail ou WhatsApp). Se trocar de celular ou esquecer a senha, é ele que traz os dados de volta.</p>
    <p><strong>Contas, Cartões, Categorias e Pessoas</strong>: mude qualquer campo e toque em <strong>Salvar</strong> na mesma linha. Para incluir um item novo, use a última linha de cada lista.</p>
    <p><strong>Aparência</strong>: modo escuro e letras maiores.</p>
    <p><strong>Usuário e senha</strong>: troque seu nome ou sua senha, ou apague tudo deste aparelho.</p>`,

  async render(el, ctx) {
    const pref = lerPreferencias();
    el.innerHTML = `
    <div class="mx-auto grid max-w-3xl gap-3 animate-entrar">
      ${secao('backup', 'Backup dos dados', 'baixar', `
        <p class="text-sm text-stone-700 dark:text-stone-300">Seus dados ficam <strong>só neste aparelho</strong>. Faça um backup de vez em quando e guarde o arquivo fora dele (Drive, e-mail ou WhatsApp).</p>
        <p class="mt-2 text-sm ${!local.ultimoBackup ? 'font-semibold text-amber-800 dark:text-amber-300' : 'text-stone-600 dark:text-stone-400'}">${local.ultimoBackup ? `Último backup: ${dataCompleta(local.ultimoBackup.slice(0, 10))}` : 'Você ainda não fez nenhum backup.'}</p>
        <div class="mt-4 flex flex-col gap-2 sm:flex-row">
          <button type="button" class="btn-primario" data-backup>${icone('baixar')} Fazer backup agora</button>
          <button type="button" class="btn-neutro" data-restaurar>${icone('enviar')} Restaurar um backup</button>
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

      ${secao('conta', 'Usuário e senha', 'cadeado', `
        <form data-meu-nome class="flex flex-col gap-2 sm:flex-row sm:items-end" novalidate>
          <div class="flex-1"><label class="rotulo" for="a-meu-nome">Seu nome</label>
          <input id="a-meu-nome" name="nome" class="campo" maxlength="40" value="${esc(store.usuario)}"></div>
          <button class="btn-sec">Salvar</button>
        </form>
        <div class="mt-4 flex flex-wrap gap-2">
          <button type="button" class="btn-neutro" data-trocar-senha>${icone('cadeado')} Trocar a senha</button>
          <button type="button" class="btn-neutro" data-tour>${icone('ajuda')} Ver a apresentação de novo</button>
        </div>
        <div class="mt-6 rounded-xl border border-red-200 p-4 dark:border-red-900">
          <p class="font-semibold text-red-800 dark:text-red-300">Apagar tudo deste aparelho</p>
          <p class="mt-1 text-sm text-stone-600 dark:text-stone-400">Apaga o usuário e todos os dados. Use para começar do zero (por exemplo, depois de testar com os dados de exemplo).</p>
          <button type="button" class="btn-neutro mt-3 text-red-700 dark:text-red-400" data-apagar-tudo>${icone('lixo')} Apagar tudo</button>
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
        if (form.dataset.meuNome !== undefined) {
          const nome = form.nome.value.trim();
          if (!nome) throw new Error('Escreva seu nome.');
          const antes = store.usuario;
          const trocar = async (n) => {
            await local.alterarConta({ usuario: n });
            store.usuario = n;
            document.querySelectorAll('[data-saudacao]').forEach((p) => (p.textContent = `Olá, ${n}`));
          };
          await trocar(nome);
          toast(`Nome alterado para ${nome}`, { acao: desfazendo(() => trocar(antes), ctx.atualizar) });
          return;
        }
        const tabela = form.dataset.tabela;
        const item = lerLinha(form, LISTAS[tabela]);
        if (!item.nome) throw new Error('Preencha o nome.');
        const salvo = await salvarItem(tabela, item);
        toast(item.id ? `${item.nome} atualizado` : `${item.nome} adicionado`, { acao: desfazendo(salvo.desfazer, ctx.atualizar) });
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
        const item = store[tabela].find((x) => x.id === id);
        const extra = tabela === 'cartoes' ? ' Todas as compras deste cartão também serão apagadas (os pagamentos de fatura continuam no extrato).' : '';
        if (!(await confirmar(`“${item.nome}” será excluído.${extra}`, { botao: 'Excluir', perigo: true }))) return;
        try {
          const desfazer = await excluirItem(tabela, item.id);
          toast(`${item.nome} excluído`, { acao: desfazendo(desfazer, ctx.atualizar) });
          ctx.atualizar();
        } catch (err) { toast(err.message, { tipo: 'erro' }); }
      } else if (e.target.closest('[data-backup]')) {
        if (await fazerBackup()) ctx.atualizar();
      } else if (e.target.closest('[data-restaurar]')) {
        await restaurarComConfirmacao(ctx.atualizar);
      } else if (e.target.closest('[data-tour]')) {
        abrirTour();
      } else if (e.target.closest('[data-trocar-senha]')) {
        trocarSenha();
      } else if (e.target.closest('[data-apagar-tudo]')) {
        apagarTudo();
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
  const item = form.dataset.id ? { id: form.dataset.id } : {};
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

function trocarSenha() {
  const campo = (id, rotulo, auto) => `<div data-campo><label class="rotulo" for="${id}">${rotulo}</label>
    <input id="${id}" name="${id}" type="password" class="campo" autocomplete="${auto}" maxlength="64"></div>`;
  const d = dialogo({
    titulo: 'Trocar a senha',
    largura: 'max-w-sm',
    corpo: `<form class="grid gap-4" novalidate>
      ${campo('atual', 'Senha atual', 'current-password')}
      ${campo('nova', 'Senha nova', 'new-password')}
      ${campo('repetir', 'Repita a senha nova', 'new-password')}
      <button type="submit" class="btn-primario">Trocar a senha</button></form>`,
  });
  const f = d.querySelector('form');
  f.atual.focus();
  f.onsubmit = async (e) => {
    e.preventDefault();
    limparErros(f);
    if (f.nova.value.length < 4) return erroNoCampo(f, 'nova', 'A senha precisa ter pelo menos 4 caracteres.');
    if (f.nova.value !== f.repetir.value) return erroNoCampo(f, 'repetir', 'As duas senhas estão diferentes.');
    const botao = f.querySelector('[type=submit]');
    botao.disabled = true;
    botao.textContent = 'Trocando…';
    try {
      await local.alterarConta({ senhaAtual: f.atual.value, senhaNova: f.nova.value });
      d.close();
      toast('Senha trocada. Use a senha nova da próxima vez que abrir o sistema.');
    } catch (err) {
      erroNoCampo(f, 'atual', err.message);
      botao.disabled = false;
      botao.textContent = 'Trocar a senha';
    }
  };
}

function apagarTudo() {
  const d = dialogo({
    titulo: 'Apagar tudo deste aparelho?',
    largura: 'max-w-sm',
    corpo: `<form class="grid gap-3" novalidate>
      <p class="text-stone-700 dark:text-stone-300">O usuário e <strong>todos os dados</strong> serão apagados para sempre. Se quiser guardar alguma coisa, faça um backup antes.</p>
      <div data-campo><label class="rotulo" for="confirmar-apagar">Para confirmar, digite APAGAR</label>
      <input id="confirmar-apagar" name="texto" class="campo uppercase" autocomplete="off"></div>
      <button type="submit" class="btn-perigo">Apagar tudo</button></form>`,
  });
  const f = d.querySelector('form');
  f.texto.focus();
  f.onsubmit = async (e) => {
    e.preventDefault();
    if (f.texto.value.trim().toUpperCase() !== 'APAGAR') return erroNoCampo(f, 'texto', 'Digite APAGAR para confirmar.');
    await local.apagarTudo();
    location.hash = '';
    location.reload();
  };
}
