// Ajustes: backup, contas, cartões, categorias, pessoas, aparência, usuário e senha
import { esc, dataCompleta } from '../lib/format.js';
import { store, categoriasPorGrupo, TIPOS_CATEGORIA } from '../lib/store.js';
import { salvarItem, excluirItem } from '../lib/api.js';
import { local } from '../lib/local-db.js';
import { desfazendo } from '../components/lancamento.js';
import { abrirOpcoesBackup, restaurarComConfirmacao } from '../components/backup.js';
import { importarQualquerPlanilha } from '../components/importar.js';
import { icone, toast, confirmar, mascaraDinheiro, dialogo, erroNoCampo, limparErros, semRepetir } from '../lib/ui.js';
import { htmlAparencia, ligarAparencia } from '../components/aparencia.js';
import { chave } from '../lib/importar-planilha.js';
import { abrirTour } from '../components/tour.js';
import { mostrarCodigoRecuperacao } from '../components/recuperacao.js';
import { resinaAtiva } from '../modulos/resina/dados.js';
import { salvarPreferencias } from '../lib/preferencias.js';
import { secao as secaoBase, linha, lerLinha as lerLinhaGenerica } from '../components/lista-editavel.js';

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
    explicacao: 'O <strong>tipo</strong> diz se a categoria é de saída, de entrada ou dos dois (como Empréstimos); no lançamento só aparecem as do tipo certo. O <strong>grupo</strong> separa Casa, Fazenda, Empresa etc.: os grupos <strong>Fazenda</strong> e <strong>Empresa</strong> ficam fora do Resumo da casa e ganham um quadro próprio no Início. Marque <strong>No gráfico</strong> para a categoria aparecer no gráfico do Início.',
    novo: { nome: '', grupo: 'Casa', tipo: 'saida', no_grafico: true },
    campos: [
      { nome: 'nome', rotulo: 'Nome', tipo: 'texto', largura: 'sm:col-span-4' },
      { nome: 'grupo', rotulo: 'Grupo', tipo: 'grupo', largura: 'sm:col-span-3' },
      { nome: 'tipo', rotulo: 'Tipo', tipo: 'opcoes', opcoes: TIPOS_CATEGORIA, largura: 'sm:col-span-3' },
      { nome: 'no_grafico', rotulo: 'No gráfico', tipo: 'marcar', largura: 'sm:col-span-2' },
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
const secao = (id, titulo, ic, conteudo) => secaoBase(id, titulo, ic, conteudo, abertas.has(id));
const NOME_ITEM = { contas: 'uma conta chamada', cartoes: 'um cartão chamado', categorias: 'uma categoria chamada', pessoas: 'uma pessoa chamada' };

export default {
  titulo: 'Ajustes',
  usaMes: false,
  ajuda: `
    <p>Toque no nome de cada seção para abrir.</p>
    <p><strong>Backup e exportar</strong>: escolha entre o <strong>backup completo</strong> (guarda tudo e é o único que restaura os dados), um <strong>backup em Excel</strong> (no formato das suas planilhas: NOVO_CAIXA, CONTROLE ANUAL e Conta corrente, e dá para importar de volta) ou um <strong>relatório em PDF</strong> do mês, do ano ou de tudo.</p>
    <p><strong>Contas, Cartões, Categorias e Pessoas</strong>: mude qualquer campo e toque em <strong>Salvar</strong> na mesma linha. Para incluir um item novo, use a última linha de cada lista.</p>
    <p><strong>Aparência</strong>: modo claro ou escuro, temas de cores prontos, suas próprias cores e letras maiores.</p>
    <p><strong>Usuário e senha</strong>: troque seu nome ou sua senha, gere um novo código de recuperação ou apague tudo deste aparelho.</p>`,

  async render(el, ctx) {
    el.innerHTML = `
    <div class="mx-auto grid max-w-3xl gap-3 animate-entrar">
      ${secao('backup', 'Backup, importar e exportar', 'baixar', `
        <p class="text-sm text-stone-700 dark:text-stone-300">Seus dados ficam <strong>só neste aparelho</strong>. Faça um backup de vez em quando e guarde o arquivo fora dele (Drive, e-mail ou WhatsApp). Aqui também dá para gerar uma <strong>planilha do Excel</strong> ou um <strong>relatório em PDF</strong>.</p>
        <p class="mt-2 text-sm ${!local.ultimoBackup ? 'font-semibold text-amber-800 dark:text-amber-300' : 'text-stone-600 dark:text-stone-400'}">${local.ultimoBackup ? `Último backup: ${dataCompleta(local.ultimoBackup.slice(0, 10))}` : 'Você ainda não fez nenhum backup.'}</p>
        <div class="mt-4 flex flex-col gap-2 sm:flex-row">
          <button type="button" class="btn-primario" data-backup>${icone('baixar')} Backup, Excel ou PDF</button>
          <button type="button" class="btn-neutro" data-restaurar>${icone('enviar')} Restaurar um backup</button>
        </div>
        <div class="mt-4 rounded-xl border border-stone-200 p-3 dark:border-stone-700">
          <p class="font-semibold">Já usa as planilhas no Excel?</p>
          <p class="mt-1 text-sm text-stone-600 dark:text-stone-400">Traga o caixa (NOVO_CAIXA, uma aba por mês), a produção da resina (CONTROLE ANUAL / SAFRAS), a conta corrente do arrendamento ou o backup em Excel gerado aqui. O sistema reconhece cada aba e mostra tudo para você conferir antes de gravar. Nada é apagado, e o que já estiver no sistema não é duplicado.</p>
          <button type="button" class="btn-sec mt-3" data-importar>${icone('planilha')} Importar planilha do Excel</button>
        </div>`)}

      ${Object.entries(LISTAS).map(([tabela, def]) => secao(tabela, def.titulo, def.icone, `
        <p class="mb-4 text-sm text-stone-600 dark:text-stone-400">${def.explicacao}</p>
        ${tabela === 'categorias' ? listaCategorias(def) : `<ul class="grid gap-3">${store[tabela].map((item) => linha(tabela, def, item)).join('')}</ul>`}
        <h3 class="mt-5 mb-2 text-sm font-semibold">Adicionar</h3>
        <ul>${linha(tabela, def, def.novo)}</ul>
        ${def.dicaExcluir ? `<p class="dica mt-3">${def.dicaExcluir}</p>` : ''}`)).join('')}

      ${secao('modulos', 'Módulos', 'tambor', `
        <p class="mb-3 text-sm text-stone-600 dark:text-stone-400">Partes extras do sistema. Ligar ou desligar não apaga nada: os dados continuam guardados.</p>
        <label class="flex cursor-pointer items-start gap-3 rounded-xl border border-stone-200 p-3 dark:border-stone-700">
          <input type="checkbox" class="mt-0.5 size-5 accent-brand-600" data-modulo-resina ${resinaAtiva() ? 'checked' : ''}>
          <span><span class="block font-semibold">Resina: produção e cargas</span>
          <span class="text-sm text-stone-600 dark:text-stone-400">Cadastro de produtores, motoristas e caminhões, registro das cargas (com a carreta animada) e a produção do mês. Aparece um seletor no topo do menu para trocar entre o Caixa e a Resina. As contas da resina ficam separadas das da casa.</span></span>
        </label>`)}

      ${secao('aparencia', 'Aparência', 'paleta', htmlAparencia())}

      ${secao('conta', 'Usuário e senha', 'cadeado', `
        <form data-meu-nome class="flex flex-col gap-2 sm:flex-row sm:items-end" novalidate>
          <div class="flex-1"><label class="rotulo" for="a-meu-nome">Seu nome</label>
          <input id="a-meu-nome" name="nome" class="campo" maxlength="40" value="${esc(store.usuario)}"></div>
          <button class="btn-sec">Salvar</button>
        </form>
        <div class="mt-4 flex flex-wrap gap-2">
          <button type="button" class="btn-neutro" data-trocar-senha>${icone('cadeado')} Trocar a senha</button>
          <button type="button" class="btn-neutro" data-novo-codigo>${icone('repetir')} Novo código de recuperação</button>
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

    el.onsubmit = semRepetir(async (e) => {
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
        // não deixa ter dois itens com o mesmo nome (sem diferenciar maiúscula ou acento)
        const igual = store[tabela].find((x) => x.id !== item.id && chave(x.nome) === chave(item.nome));
        if (igual) throw new Error(`Já existe ${NOME_ITEM[tabela]} "${igual.nome}". Use outro nome.`);
        const salvo = await salvarItem(tabela, item);
        toast(item.id ? `${item.nome} atualizado` : `${item.nome} adicionado`, { acao: desfazendo(salvo.desfazer, ctx.atualizar) });
        ctx.atualizar();
      } catch (err) {
        toast(err.message, { tipo: 'erro' });
      } finally {
        botao && (botao.disabled = false);
      }
    });

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
        if (await abrirOpcoesBackup()) ctx.atualizar();
      } else if (e.target.closest('[data-importar]')) {
        await importarQualquerPlanilha(ctx.atualizar);
      } else if (e.target.closest('[data-restaurar]')) {
        await restaurarComConfirmacao(ctx.atualizar);
      } else if (e.target.closest('[data-tour]')) {
        abrirTour();
      } else if (e.target.closest('[data-trocar-senha]')) {
        trocarSenha();
      } else if (e.target.closest('[data-novo-codigo]')) {
        novoCodigo();
      } else if (e.target.closest('[data-apagar-tudo]')) {
        apagarTudo();
      }
    };

    el.querySelector('[data-modulo-resina]').addEventListener('change', (e) => {
      salvarPreferencias({ resina: e.target.checked });
      window.dispatchEvent(new Event('caixa:remontar'));
      toast(e.target.checked ? 'Módulo Resina ligado. Use o seletor no topo do menu para trocar.' : 'Módulo Resina desligado. Os dados dele continuam guardados.');
    });

    ligarAparencia(el, ctx.atualizar);
  },
};

function listaCategorias(def) {
  const grupos = [...new Set(store.categorias.map((c) => c.grupo))];
  return `<datalist id="grupos-lista">${grupos.map((g) => `<option value="${esc(g)}"></option>`).join('')}</datalist>` + Object.entries(categoriasPorGrupo()).map(([grupo, cats]) => `
    <h3 class="mt-4 mb-2 text-sm font-semibold text-stone-600 dark:text-stone-400 first:mt-0 dark:text-stone-400">${esc(grupo)}</h3>
    <ul class="grid gap-3">${cats.map((c) => linha('categorias', def, c)).join('')}</ul>`).join('');
}

function lerLinha(form, def) {
  const item = lerLinhaGenerica(form, def);
  if (form.dataset.tabela === 'categorias' && item.id) {
    // não deixa mudar o tipo se já há lançamentos do outro tipo nessa categoria
    const { lancamentos, compras_cartao: compras } = local.tabelas();
    const usadaEm = (t) => lancamentos.some((l) => l.categoria_id === item.id && l.tipo === t && !l.fatura_cartao_id)
      || (t === 'saida' && compras.some((c) => c.categoria_id === item.id));
    if (item.tipo === 'entrada' && usadaEm('saida')) throw new Error(`"${item.nome}" já tem gastos lançados. Para usar também em entradas, escolha o tipo "Os dois".`);
    if (item.tipo === 'saida' && usadaEm('entrada')) throw new Error(`"${item.nome}" já tem entradas lançadas. Para usar também em gastos, escolha o tipo "Os dois".`);
  }
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
  f.onsubmit = semRepetir(async (e) => {
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
  });
}

/** Gera um código de recuperação novo (por exemplo, se perdeu o antigo ou alguém o viu) */
function novoCodigo() {
  const d = dialogo({
    titulo: 'Novo código de recuperação',
    largura: 'max-w-sm',
    corpo: `<form class="grid gap-4" novalidate>
      <p class="text-stone-700 dark:text-stone-300">O código atual vai <strong>parar de funcionar</strong> e você vai receber um novo para guardar.</p>
      <div data-campo><label class="rotulo" for="senha-codigo">Digite sua senha para confirmar</label>
      <input id="senha-codigo" name="senha" type="password" class="campo" autocomplete="current-password" maxlength="64"></div>
      <button type="submit" class="btn-primario">Gerar código novo</button></form>`,
  });
  const f = d.querySelector('form');
  f.senha.focus();
  f.onsubmit = semRepetir(async (e) => {
    e.preventDefault();
    limparErros(f);
    const botao = f.querySelector('[type=submit]');
    botao.disabled = true;
    botao.textContent = 'Gerando…';
    try {
      const codigo = await local.novoCodigo(f.senha.value);
      d.close();
      await mostrarCodigoRecuperacao(codigo, { motivo: 'novo' });
    } catch (err) {
      erroNoCampo(f, 'senha', err.message);
      botao.disabled = false;
      botao.textContent = 'Gerar código novo';
    }
  });
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
  f.onsubmit = semRepetir(async (e) => {
    e.preventDefault();
    if (f.texto.value.trim().toUpperCase() !== 'APAGAR') return erroNoCampo(f, 'texto', 'Digite APAGAR para confirmar.');
    await local.apagarTudo();
    location.hash = '';
    location.reload();
  });
}
