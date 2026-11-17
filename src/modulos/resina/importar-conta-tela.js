// Importar a planilha "Conta corrente arrendo": escolher o arquivo, conferir linha a linha e gravar.
// A leitura e as regras ficam em importar-conta.js.
import { lerXlsx } from '../../lib/ler-xlsx.js';
import { escolherArquivo, ERROS } from '../../components/importar.js';
import { desfazendo } from '../../components/lancamento.js';
import { brl, esc, dataCompleta, lerValor, valorParaCampo, VALOR_MAXIMO } from '../../lib/format.js';
import { store } from '../../lib/store.js';
import { dialogo, toast, icone, mascaraDinheiro } from '../../lib/ui.js';
import { lerPlanilhaConta, entenderLinha, produtorDaLinha, produtoParecido, montarImportacao, chave, nomeBonito } from './importar-conta.js';
import { todasAsCargas, insumosEntre, lerMovimentos, gravarImportacaoConta } from './dados.js';
import { salvarItem } from '../../lib/api.js';
import { contaDoTitulo } from './planilhas-resina.js';
import { calcularCarga } from './calculos.js';
import { numero, pct, nomeTitular } from './comum.js';

const TIPO = {
  carga: ['Carga', 'bg-brand-100 text-brand-900 dark:bg-brand-900/50 dark:text-brand-100'],
  insumo: ['Insumo', 'bg-sky-100 text-sky-900 dark:bg-sky-900/50 dark:text-sky-100'],
  movimento: ['Lançamento', 'bg-stone-200 text-stone-800 dark:bg-stone-700 dark:text-stone-100'],
  anotacao: ['Não importa', 'bg-stone-100 text-stone-600 dark:bg-stone-800 dark:text-stone-300'],
};
const FALTA = {
  produtor: 'Escolha o produtor',
  valor: 'Falta o valor',
  tipo: 'Escolha crédito ou débito',
  data: 'Data que não deu para ler',
};

/**
 * Fluxo completo. `aoTerminar` é chamado depois de importar (e depois de desfazer).
 * `lido` = arquivo já aberto pela importação geral ({arquivo, abas, aba}: `aba` limita a uma aba só).
 * Retorna uma Promise que termina quando a janela fecha.
 */
export async function importarConta(contaAtual, aoTerminar, lido = null) {
  const arquivo = lido?.arquivo || await escolherArquivo();
  if (!arquivo) return;
  let abas, abasBrutas;
  try {
    abasBrutas = lido?.abas || await lerXlsx(arquivo);
    if (lido?.aba) abasBrutas = abasBrutas.filter((a) => a.nome === lido.aba);
    abas = lerPlanilhaConta(abasBrutas);
  } catch (e) {
    if (!ERROS[e.message]) console.error(e);
    toast(ERROS[e.message] || 'Não consegui ler essa planilha. Confira se é o arquivo certo (.xlsx).', { tipo: 'erro' });
    return;
  }
  if (!abas.length) {
    toast('Essa planilha não está no modelo da conta corrente. Ela precisa ter as colunas DATA, DESCRIÇÃO e CRÉDITO ou DÉBITO.', { tipo: 'erro' });
    return;
  }
  const linhas = abas.flatMap((a) => a.linhas).map(entenderLinha);
  if (!linhas.length) { toast('A planilha está no modelo, mas não tem nenhuma linha preenchida.', { tipo: 'erro' }); return; }

  const [{ cargas, itensPorCarga }, insumos, movimentos] = await Promise.all([todasAsCargas(), insumosEntre('0000-01-01', '9999-12-31'), lerMovimentos()]);
  const existentes = { cargas, itensPorCarga, insumos, movimentos, produtos: store.resina_produtos };
  const produtores = store.resina_produtores.filter((p) => p.ativo !== false);
  const titulares = store.resina_titulares.filter((t) => t.ativo !== false);
  // conta escrita no título ou no nome da aba ("CONTA CORRENTE - Maria CNPJ", exportada pelo sistema)
  const primeiraAba = abasBrutas.find((a) => a.nome === abas[0].aba);
  const sugerida = contaDoTitulo(primeiraAba?.linhas?.[0]?.find((c) => typeof c === 'string')) || contaDoTitulo(abas[0].aba);
  const nomeSugerido = sugerida.replace(/\s*·.*$/, '').trim();
  const pelaPlanilha = nomeSugerido ? titulares.find((t) => chave(t.nome) === chave(nomeSugerido)) : null;
  const nomeNovo = nomeSugerido || 'Conta principal';

  // decisões: começam com o que deu para descobrir sozinho
  const decisoes = {
    titular_id: pelaPlanilha?.id || (titulares.some((t) => t.id === contaAtual) ? contaAtual : titulares[0]?.id) || 'criar',
    porLinha: {}, produtos: {},
  };
  if (nomeSugerido && !pelaPlanilha) decisoes.titular_id = 'criar';
  let padrao = '';
  const segue = new Set(); // linhas que acompanham o "produtor de todas as linhas"
  for (const l of linhas) {
    const achado = produtorDaLinha(l, produtores);
    decisoes.porLinha[l.n] = { produtor_id: achado || null };
    if (!achado && l.tipo !== 'movimento') segue.add(l.n);
  }
  const nomesProdutos = [...new Map(linhas.filter((l) => l.tipo === 'insumo').map((l) => [chave(l.produto), l])).values()];
  for (const l of nomesProdutos) decisoes.produtos[chave(l.produto)] = produtoParecido(l.produto, store.resina_produtos)?.id || 'criar';

  const opcoesProdutor = (sel, vazio) => `<option value="">${vazio}</option>${produtores.map((p) => `<option value="${p.id}" ${p.id === sel ? 'selected' : ''}>${esc(p.nome)}</option>`).join('')}`;
  const contagem = (tipo) => linhas.filter((l) => l.tipo === tipo).length;

  const d = dialogo({
    titulo: 'Importar conta corrente',
    largura: 'max-w-5xl',
    corpo: `<form class="grid gap-4" novalidate>
      <p class="text-sm text-stone-700 dark:text-stone-300">Arquivo <strong class="break-all">${esc(arquivo.name)}</strong>: ${linhas.length} linhas
        (${contagem('carga')} de carga, ${contagem('insumo')} de insumo, ${contagem('movimento')} de PIX e outros lançamentos${contagem('anotacao') ? `, ${contagem('anotacao')} só de anotação` : ''}).
        Confira como cada linha foi entendida antes de importar.</p>
      <div class="grid gap-3 sm:grid-cols-2">
        <div><label class="rotulo" for="ic-conta">Conta (CNPJ ou CPF)</label>
          <select id="ic-conta" class="campo" data-conta>${titulares.map((t) => `<option value="${t.id}" ${t.id === decisoes.titular_id ? 'selected' : ''}>${esc(nomeTitular(t.id))}</option>`).join('')}
            <option value="criar" ${decisoes.titular_id === 'criar' ? 'selected' : ''}>Criar a conta "${esc(nomeNovo)}"</option></select></div>
        <div><label class="rotulo" for="ic-padrao">Produtor das cargas e insumos</label>
          <select id="ic-padrao" class="campo" data-padrao>${opcoesProdutor('', 'Escolher linha a linha')}</select>
          <p class="dica">Vale para as linhas em que o nome do produtor não aparece. Dá para trocar em cada linha.</p></div>
      </div>
      ${!produtores.length ? `<p class="rounded-xl bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:bg-amber-950/50 dark:text-amber-200">${icone('alerta', 'mr-1 inline size-4 align-[-2px]')}Não há produtores cadastrados. Cadastre os produtores em <strong>Cadastros</strong> antes de importar as cargas e os insumos.</p>` : ''}

      ${nomesProdutos.length ? `<fieldset class="grid gap-2 rounded-xl border border-stone-200 p-3 dark:border-stone-800">
        <legend class="rotulo px-1">Produtos (insumos) da planilha</legend>
        <p class="text-sm text-stone-600 dark:text-stone-400">Os que não existem no cadastro serão criados. Se for o mesmo produto com outro nome, escolha o do cadastro.</p>
        <div class="grid gap-2 sm:grid-cols-2">${nomesProdutos.map((l, i) => `<div class="grid grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)] items-center gap-2">
          <label for="ic-prod-${i}" class="truncate text-sm font-semibold" title="${esc(l.produto)}">${esc(l.produto)}</label>
          <select id="ic-prod-${i}" class="campo" data-produto="${esc(chave(l.produto))}">
            <option value="criar">Criar "${esc(nomeBonito(l.produto))}" (${esc(l.unidade)})</option>
            ${store.resina_produtos.map((p) => `<option value="${p.id}" ${decisoes.produtos[chave(l.produto)] === p.id ? 'selected' : ''}>${esc(p.nome)} (${esc(p.unidade)})</option>`).join('')}
          </select></div>`).join('')}</div>
      </fieldset>` : ''}

      <div class="grid gap-1 rounded-xl bg-stone-100 p-3 text-sm dark:bg-stone-800" aria-live="polite" data-resumo></div>

      <fieldset class="grid gap-2"><legend class="rotulo mb-1">Linhas da planilha</legend>
        <ul class="grid gap-2" data-linhas>${linhas.map((l) => linhaHTML(l, decisoes.porLinha[l.n], opcoesProdutor)).join('')}</ul>
      </fieldset>

      <div class="sticky bottom-0 -mx-5 -mb-5 flex flex-wrap items-center gap-2 border-t border-stone-200 bg-cartao px-5 py-3 dark:border-stone-800 dark:bg-stone-900">
        <p class="w-full text-sm sm:w-auto sm:flex-1" data-resumo-curto></p>
        <button type="button" class="btn-neutro flex-1 sm:flex-none" data-fechar>Cancelar</button>
        <button type="submit" class="btn-primario flex-[2] sm:flex-none" data-confirmar>${icone('check')} <span data-texto-botao>Importar</span></button>
      </div>
    </form>`,
  });
  const form = d.querySelector('form');
  form.querySelectorAll('[data-valor]').forEach(mascaraDinheiro);
  let plano;

  const atualizar = () => {
    plano = montarImportacao(linhas, decisoes, existentes);
    const pendente = new Map(plano.pendentes.map((p) => [p.linha.n, p.falta]));
    const repetida = new Set(plano.repetidas.map((l) => l.n));
    const completa = new Set(plano.completar.map((c) => c.linha));
    const pulada = new Set(plano.puladas.map((l) => l.n));
    for (const l of linhas) {
      const el = form.querySelector(`[data-situacao="${l.n}"]`);
      if (!el) continue;
      const [txt, cls] = l.tipo === 'anotacao' ? ['Não importa', 'text-stone-600 dark:text-stone-400']
        : pulada.has(l.n) ? ['Fica de fora', 'text-stone-600 dark:text-stone-400']
        : repetida.has(l.n) ? ['Já está no sistema', 'text-stone-600 dark:text-stone-400']
        : completa.has(l.n) ? ['Completa a carga que já existe', 'font-semibold text-brand-800 dark:text-brand-300']
        : pendente.has(l.n) ? [FALTA[pendente.get(l.n)], 'font-semibold text-amber-800 dark:text-amber-300']
        : ['Pronta', 'font-semibold text-brand-800 dark:text-brand-300'];
      el.className = `text-sm ${cls}`;
      el.innerHTML = `${pendente.has(l.n) && !pulada.has(l.n) ? icone('alerta', 'mr-1 inline size-4 align-[-3px]') : txt === 'Pronta' ? icone('check', 'mr-1 inline size-4 align-[-3px]') : ''}${txt}`;
      form.querySelector(`[data-linha="${l.n}"]`)?.classList.toggle('opacity-60', l.tipo === 'anotacao' || pulada.has(l.n) || repetida.has(l.n));
      const conta = form.querySelector(`[data-conta-carga="${l.n}"]`);
      if (conta) conta.innerHTML = contaDaCarga(l, decisoes.porLinha[l.n]);
    }
    const kgs = plano.cargas.reduce((s, c) => s + c.itens.length, 0);
    const faltam = plano.pendentes.length;
    d.querySelector('[data-resumo]').innerHTML = `
      <p class="text-base"><strong>Vai importar:</strong> ${plano.cargas.length} ${plano.cargas.length === 1 ? 'carga' : 'cargas'}${kgs > plano.cargas.length ? ` (${kgs} linhas de produtor)` : ''}${plano.completar.length ? `, completar ${plano.completar.length} ${plano.completar.length === 1 ? 'carga que já existe' : 'linhas de cargas que já existem'} (preço, conta e %)` : ''},
        ${plano.insumos.length} ${plano.insumos.length === 1 ? 'insumo' : 'insumos'} e ${plano.movimentos.length} ${plano.movimentos.length === 1 ? 'lançamento' : 'lançamentos'}${plano.produtosNovos.length ? `, criando ${plano.produtosNovos.length} ${plano.produtosNovos.length === 1 ? 'produto' : 'produtos'}` : ''}.</p>
      ${faltam ? `<p class="font-semibold text-amber-900 dark:text-amber-200">${icone('alerta', 'mr-1 inline size-4 align-[-3px]')}${faltam === 1 ? '1 linha fica de fora até ser completada' : `${faltam} linhas ficam de fora até serem completadas`} (veja o que falta em cada linha).</p>` : ''}
      ${plano.repetidas.length ? `<p>${plano.repetidas.length} ${plano.repetidas.length === 1 ? 'linha já está' : 'linhas já estão'} no sistema e não ${plano.repetidas.length === 1 ? 'será importada' : 'serão importadas'} de novo.</p>` : ''}
      ${plano.avisos.length ? `<details><summary class="cursor-pointer font-semibold text-amber-900 dark:text-amber-200">${plano.avisos.length} ${plano.avisos.length === 1 ? 'aviso' : 'avisos'} para conferir</summary>
        <ul class="mt-1 grid list-disc gap-0.5 pl-5">${plano.avisos.map((a) => `<li>${esc(a)}</li>`).join('')}</ul></details>` : ''}`;
    d.querySelector('[data-resumo-curto]').innerHTML = `${plano.total} ${plano.total === 1 ? 'item pronto' : 'itens prontos'}${faltam ? ` · <span class="font-semibold text-amber-800 dark:text-amber-300">${faltam} ${faltam === 1 ? 'incompleta' : 'incompletas'}</span>` : ''}`;
    const botao = d.querySelector('[data-confirmar]');
    botao.disabled = !plano.total || !decisoes.titular_id;
    d.querySelector('[data-texto-botao]').textContent = plano.total ? `Importar ${plano.total} ${plano.total === 1 ? 'item' : 'itens'}` : 'Nada para importar';
  };

  form.addEventListener('change', (e) => {
    const t = e.target;
    const li = t.closest('[data-linha]');
    if (t.matches('[data-conta]')) decisoes.titular_id = t.value;
    else if (t.matches('[data-padrao]')) {
      padrao = t.value;
      for (const n of segue) {
        decisoes.porLinha[n].produtor_id = padrao || null;
        const sel = form.querySelector(`[data-linha="${n}"] [data-produtor]`);
        if (sel) sel.value = padrao;
      }
    } else if (t.matches('[data-produto]')) decisoes.produtos[t.dataset.produto] = t.value;
    else if (li) {
      const dl = decisoes.porLinha[li.dataset.linha];
      if (t.matches('[data-produtor]')) { dl.produtor_id = t.value || null; segue.delete(+li.dataset.linha); }
      else if (t.matches('[data-tipo]')) dl.tipoMov = t.value;
      else if (t.matches('[data-incluir]')) dl.incluir = t.checked;
    }
    atualizar();
  });
  form.addEventListener('input', (e) => {
    if (!e.target.matches('[data-valor]')) return;
    const dl = decisoes.porLinha[e.target.closest('[data-linha]').dataset.linha];
    const v = lerValor(e.target.value);
    dl.valor = v > 0 && v <= VALOR_MAXIMO ? v : 0;
    atualizar();
  });
  atualizar();

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!plano?.total || !decisoes.titular_id) return;
    const botao = d.querySelector('[data-confirmar]');
    botao.disabled = true;
    botao.setAttribute('aria-busy', 'true');
    d.querySelector('[data-texto-botao]').textContent = 'Importando…';
    try {
      if (decisoes.titular_id === 'criar') {
        // conta nova (ex.: restaurando o backup em Excel num aparelho novo)
        const nova = await salvarItem('resina_titulares', { nome: nomeNovo.slice(0, 60), documento: '', ativo: true });
        decisoes.titular_id = nova.id;
        plano = montarImportacao(linhas, decisoes, existentes);
      }
      const desfazer = await gravarImportacaoConta(plano);
      d.close();
      const qtd = (n, um, varios) => `${n} ${n === 1 ? um : varios}`;
      toast(`Importado: ${qtd(plano.cargas.length, 'carga', 'cargas')}${plano.completar.length ? ` (e ${qtd(plano.completar.length, 'carga completada', 'cargas completadas')})` : ''}, ${qtd(plano.insumos.length, 'insumo', 'insumos')} e ${qtd(plano.movimentos.length, 'lançamento', 'lançamentos')}.`, { acao: desfazendo(desfazer, aoTerminar) });
      aoTerminar?.();
    } catch (err) {
      console.error(err);
      toast('Não foi possível importar. Nada foi alterado.', { tipo: 'erro' });
      botao.disabled = false;
      botao.removeAttribute('aria-busy');
      atualizar();
    }
  });
  return new Promise((resolver) => d.addEventListener('close', () => resolver()));
}

/** Como o sistema entendeu a linha, em palavras */
function entendido(l) {
  if (l.tipo === 'carga') return `${numero(l.tbs)} Tbs · ${numero(l.kg, 2)} kg${l.media ? ` (média ${numero(l.media, 2)})` : ''} · ${brl(l.preco)}/kg · ${pct(l.pct)}`;
  if (l.tipo === 'insumo') return `${numero(l.quantidade, 3)} ${l.unidade} de ${l.produto}${l.valor ? ` · ${brl(l.valor)}` : ''}${l.obs ? ` · ${l.obs}` : ''}`;
  if (l.tipo === 'movimento') return l.valor ? `${l.tipoMov === 'credito' ? 'Crédito' : l.tipoMov === 'debito' ? 'Débito' : 'Valor'} de ${brl(l.valor)}` : 'Sem valor na planilha';
  return `Fica só como anotação: ${l.motivo}.`;
}

/** Débito que a carga vai gerar (arrendamento) e a comparação com o valor da planilha */
function contaDaCarga(l, dl) {
  if (l.tipo !== 'carga') return '';
  const r = calcularCarga({ preco_kg: l.preco, peso_base: 'chegada', peso_chegada: l.kg }, [{ produtor_id: dl.produtor_id, tbs: l.tbs, arrendamento: l.pct }]);
  const dif = l.valorPlanilha != null && Math.abs(l.valorPlanilha - r.totais.arrendamento) > 0.05;
  return `Valor ${brl(r.totais.valor)} · débito (arrendamento) <strong>${brl(r.totais.arrendamento)}</strong>${dif ? ` <span class="font-semibold text-amber-800 dark:text-amber-300">· na planilha: ${brl(l.valorPlanilha)}</span>` : ''}`;
}

function linhaHTML(l, dl, opcoesProdutor) {
  const [rotulo, cor] = TIPO[l.tipo];
  const id = `ic-${l.n}`;
  const comProdutor = l.tipo !== 'anotacao';
  const precisaValor = (l.tipo === 'insumo' || l.tipo === 'movimento') && !l.valor;
  return `<li class="grid gap-2 rounded-xl border border-stone-200 p-3 transition-opacity dark:border-stone-800" data-linha="${l.n}">
    <div class="flex flex-wrap items-center gap-x-3 gap-y-1">
      ${l.tipo === 'anotacao' ? '' : `<label class="flex cursor-pointer items-center gap-2 text-sm"><input type="checkbox" class="size-5 accent-brand-600" data-incluir checked aria-label="Importar a linha ${l.n}"></label>`}
      <span class="text-xs tabular-nums text-stone-600 dark:text-stone-400">Linha ${l.n}</span>
      <span class="text-sm font-semibold tabular-nums">${l.data ? dataCompleta(l.data) : `<span class="text-amber-800 dark:text-amber-300">${esc(String(l.dataOriginal ?? 'sem data'))}</span>`}</span>
      <span class="rounded-full px-2 py-0.5 text-xs font-semibold ${cor}">${rotulo}</span>
      <span class="flex-1"></span>
      <span data-situacao="${l.n}" class="text-sm"></span>
    </div>
    <p class="break-words font-medium">${esc(l.descricao)}${l.nota ? ` <span class="text-sm font-normal text-stone-600 dark:text-stone-400">· Nota: ${esc(l.nota)}</span>` : ''}${l.destino ? ` <span class="text-sm font-normal text-stone-600 dark:text-stone-400">· Destino: ${esc(l.destino)}</span>` : ''}</p>
    <p class="text-sm tabular-nums text-stone-700 dark:text-stone-300">${esc(entendido(l))}</p>
    ${l.tipo === 'carga' ? `<p class="text-sm tabular-nums text-stone-700 dark:text-stone-300" data-conta-carga="${l.n}"></p>` : ''}
    ${comProdutor ? `<div class="grid gap-2 sm:grid-cols-3">
      <div><label class="rotulo text-xs" for="${id}-p">Produtor${l.tipo === 'movimento' ? ' (opcional)' : ''}</label>
        <select id="${id}-p" class="campo" data-produtor>${opcoesProdutor(dl.produtor_id, l.tipo === 'movimento' ? 'Nenhum (a conta toda)' : 'Escolha…')}</select></div>
      ${l.tipo === 'movimento' ? `<div><label class="rotulo text-xs" for="${id}-t">Crédito ou débito</label>
        <select id="${id}-t" class="campo" data-tipo>
          <option value="" ${l.tipoMov ? '' : 'selected'}>Escolha…</option>
          <option value="credito" ${l.tipoMov === 'credito' ? 'selected' : ''}>Crédito (recebido)</option>
          <option value="debito" ${l.tipoMov === 'debito' ? 'selected' : ''}>Débito (a receber)</option>
        </select></div>` : ''}
      ${precisaValor || l.tipo === 'movimento' ? `<div><label class="rotulo text-xs" for="${id}-v">Valor (R$)</label>
        <input id="${id}-v" class="campo tabular-nums" inputmode="numeric" data-dinheiro data-valor value="${l.valor ? valorParaCampo(l.valor) : ''}" placeholder="0,00"></div>` : ''}
    </div>` : ''}
  </li>`;
}
