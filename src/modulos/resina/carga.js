// Registrar ou mudar uma carga de resina: dados, pesagem, Tbs de cada produtor e a carreta animada
import { brl, esc, hojeISO, lerValor, valorParaCampo, dataCompleta, parseISO, inicioMes, VALOR_MAXIMO, valorMaximoTexto } from '../../lib/format.js';
import { store } from '../../lib/store.js';
import { salvarItem } from '../../lib/api.js';
import { icone, toast, confirmar, dialogo, mascaraDinheiro, erroNoCampo, limparErros, semRepetir } from '../../lib/ui.js';
import { desfazendo } from '../../components/lancamento.js';
import { lerCarga, ultimaCarga, numeroPara, salvarCarga, excluirCarga, destinosUsados } from './dados.js';
import { calcularCarga, precoNaData, codigoCarga } from './calculos.js';
import { criarCarreta } from './carreta.js';
import { CAPACIDADE_PADRAO } from './tabelas.js';
import { proximaCor } from './cadastros.js';
import { chave } from '../../lib/importar-planilha.js';
import { kg, numero, bolinha, produtor, nomeProdutor, corProdutor, caminhao, quadro, seDesligado, nomeTitular } from './comum.js';

let est = null; // a carga sendo preenchida
let carreta = null;
let seq = 0;
const NOVO = '__novo';

const ativosMais = (lista, atual) => lista.filter((x) => x.ativo !== false || x.id === atual);
const capacidade = () => caminhao(est.caminhao_id)?.capacidade || CAPACIDADE_PADRAO;
const novoItem = (dados = {}) => ({ chave: ++seq, produtor_id: '', tbs: 0, arrendamento: 0, kg_manual: null, ...dados });

export default {
  titulo: 'Carga',
  tituloPara: (id) => (id ? 'Carga' : 'Nova carga'),
  usaMes: false,
  ajuda: `
    <p><strong>1. Dados</strong>: data, motorista, caminhão e o preço do kg. O preço vem do cadastro (o que vale na data da carga), mas dá para mudar.</p>
    <p><strong>Conta, nota e destino</strong>: em qual conta corrente a carga entra (CNPJ ou CPF da proprietária), o número da nota fiscal e para onde a carga foi. O campo de destino sugere os que você já usou.</p>
    <p><strong>2. Pesagem</strong>: preencha o peso da fazenda, o da chegada ou os dois, e marque qual vale para o pagamento. Com os dois, aparece a <strong>diferença</strong> em kg, % e reais.</p>
    <p><strong>3. Produtores</strong>: para cada produtor, informe os <strong>Tbs</strong> (tambores) e a <strong>% de arrendamento</strong> desta carga. Os tambores vão caindo na carreta: a parte de baixo tem a cor do produtor e a de cima, preta, é o arrendamento.</p>
    <p>O <strong>kg</strong> de cada produtor é calculado pelos Tbs. Se souber o kg exato de alguém, digite: ele fica amarelo e o resto do peso é dividido entre os outros. O botão ↺ volta para o cálculo automático.</p>
    <p>A carreta para de andar no botão <strong>Parar</strong>. Se o aparelho pede menos movimento (ou você desligou as animações em Ajustes), ela aparece parada.</p>`,

  async render(el, ctx) {
    carreta?.destruir();
    carreta = null;
    if (seDesligado(el)) return;

    let ultima = null, original = null;
    if (ctx.param) {
      original = await lerCarga(ctx.param);
      if (!ctx.aindaAtual()) return;
      if (!original) {
        el.innerHTML = `<div class="card mx-auto mt-4 max-w-xl"><p class="font-semibold">Carga não encontrada</p>
          <p class="mt-1 text-sm text-stone-600 dark:text-stone-400">Ela pode ter sido excluída.</p><a href="#cargas" class="btn-sec mt-4">Ver as cargas</a></div>`;
        return;
      }
      est = { nota: '', destino: '', titular_id: null, ...original.carga, precoManual: true, itens: original.itens.map((i) => novoItem({ produtor_id: i.produtor_id, tbs: i.tbs, arrendamento: i.arrendamento, kg_manual: i.kg_manual ?? null })) };
    } else {
      ultima = await ultimaCarga();
      if (!ctx.aindaAtual()) return;
      const data = hojeISO();
      const u = ultima?.carga;
      // repete o da última carga; se só existe um cadastrado, já vem escolhido
      const valido = (lista, id) => {
        const ativos = store[lista].filter((x) => x.ativo !== false);
        return ativos.some((x) => x.id === id) ? id : ativos.length === 1 ? ativos[0].id : null;
      };
      est = {
        id: null, numero: await numeroPara(data), data,
        fazenda_id: valido('resina_fazendas', u?.fazenda_id),
        motorista_id: valido('resina_motoristas', u?.motorista_id), caminhao_id: valido('resina_caminhoes', u?.caminhao_id),
        preco_kg: precoNaData(store.resina_precos, data)?.valor_kg || 0, precoManual: false,
        peso_fazenda: null, peso_chegada: null, peso_base: u?.peso_base || 'chegada', obs: '', itens: [],
        titular_id: valido('resina_titulares', u?.titular_id), nota: '', destino: '',
      };
    }
    // fazendas antigas excluídas: lista só as que existem
    if (est.fazenda_id === undefined) est.fazenda_id = null;

    const motoristas = ativosMais(store.resina_motoristas, est.motorista_id);
    const caminhoes = ativosMais(store.resina_caminhoes, est.caminhao_id);
    const semProdutores = !store.resina_produtores.some((p) => p.ativo !== false);
    const titulares = ativosMais(store.resina_titulares, est.titular_id);
    const destinos = await destinosUsados();
    if (!ctx.aindaAtual()) return;

    el.innerHTML = `
    <form class="mx-auto grid max-w-5xl gap-4 animate-entrar" novalidate data-form-carga>
      <section class="card" aria-labelledby="t-dados">
        <div class="mb-4 flex flex-wrap items-center justify-between gap-2">
          <h2 id="t-dados" class="text-lg font-bold">${icone('caminhao', 'mr-1 inline size-5 align-[-3px]')} <span data-codigo>${codigoCarga(est)}</span></h2>
          <span class="selo selo-neutro">${est.id ? `Registrada em ${dataCompleta(est.criado_em?.slice(0, 10) || est.data)}` : 'Número automático'}</span>
        </div>
        <div class="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div data-campo><label class="rotulo" for="c-data">Data da coleta</label><input id="c-data" name="data" type="date" class="campo" value="${est.data}" required></div>
          ${store.resina_fazendas.length ? `<div data-campo><label class="rotulo" for="c-fazenda">Fazenda</label><select id="c-fazenda" name="fazenda_id" class="campo">
            ${store.resina_fazendas.length > 1 ? '<option value="">Escolha…</option>' : ''}${store.resina_fazendas.map((f) => `<option value="${f.id}" ${f.id === est.fazenda_id ? 'selected' : ''}>${esc(f.nome)}</option>`).join('')}</select></div>` : ''}
          <div data-campo><label class="rotulo" for="c-motorista">Motorista</label><select id="c-motorista" name="motorista_id" class="campo">
            <option value="">${motoristas.length ? 'Escolha…' : 'Nenhum cadastrado'}</option>${motoristas.map((m) => `<option value="${m.id}" ${m.id === est.motorista_id ? 'selected' : ''}>${esc(m.nome)}</option>`).join('')}</select></div>
          <div data-campo><label class="rotulo" for="c-caminhao">Caminhão</label><select id="c-caminhao" name="caminhao_id" class="campo">
            <option value="">${caminhoes.length ? 'Escolha…' : 'Nenhum cadastrado'}</option>${caminhoes.map((c) => `<option value="${c.id}" ${c.id === est.caminhao_id ? 'selected' : ''}>${esc(c.nome)}${c.descricao ? ` · ${esc(c.descricao)}` : ''} (${c.capacidade} Tbs)</option>`).join('')}</select></div>
          <div data-campo><label class="rotulo" for="c-preco">Preço do kg (R$)</label><input id="c-preco" name="preco_kg" class="campo tabular-nums" inputmode="numeric" data-dinheiro value="${est.preco_kg ? valorParaCampo(est.preco_kg) : ''}" placeholder="0,00" aria-describedby="c-preco-dica">
            <p id="c-preco-dica" class="dica" data-preco-dica></p></div>
        </div>
        <div class="mt-3 grid gap-3 sm:grid-cols-3">
          <div data-campo><label class="rotulo" for="c-titular">Conta (CNPJ ou CPF)</label><select id="c-titular" name="titular_id" class="campo" aria-describedby="c-titular-dica">
            <option value="">${titulares.length ? 'Escolha…' : 'Nenhuma cadastrada'}</option>${titulares.map((t) => `<option value="${t.id}" ${t.id === est.titular_id ? 'selected' : ''}>${esc(nomeTitular(t.id))}</option>`).join('')}</select>
            <p id="c-titular-dica" class="dica">Em qual conta corrente esta carga entra.</p></div>
          <div data-campo><label class="rotulo" for="c-nota">Nota <span class="font-normal text-stone-600 dark:text-stone-400">(opcional)</span></label><input id="c-nota" name="nota" class="campo" maxlength="80" autocomplete="off" value="${esc(est.nota || '')}" placeholder="Nº da nota fiscal"></div>
          <div data-campo><label class="rotulo" for="c-destino">Destino da carga <span class="font-normal text-stone-600 dark:text-stone-400">(opcional)</span></label><input id="c-destino" name="destino" class="campo" maxlength="80" autocomplete="off" list="c-destinos" value="${esc(est.destino || '')}" placeholder="Para quem ou onde foi">
            <datalist id="c-destinos">${destinos.map((d) => `<option value="${esc(d)}"></option>`).join('')}</datalist></div>
        </div>
        ${!titulares.length ? `<p class="dica mt-3">Para a conta corrente, cadastre o CNPJ e o CPF da proprietária em <a href="#resina-cadastros" class="font-semibold underline">Cadastros</a>.</p>` : ''}
        ${!motoristas.length || !caminhoes.length || !store.resina_precos.length ? `<p class="dica mt-3">Faltam cadastros? Inclua motoristas, caminhões e o preço do kg em <a href="#resina-cadastros" class="font-semibold underline">Cadastros</a>.</p>` : ''}
      </section>

      <section class="card" aria-labelledby="t-peso">
        <h2 id="t-peso" class="card-titulo">${icone('balanca', 'mr-1 inline size-4 align-[-2px]')} Pesagem</h2>
        <fieldset>
          <legend class="dica mt-0 mb-2">Preencha um peso ou os dois, e marque qual vale para o pagamento.</legend>
          <div class="grid gap-3 sm:grid-cols-2">
            ${['fazenda', 'chegada'].map((onde) => `<div class="opcao-peso" data-campo>
              <label class="flex cursor-pointer items-center gap-2 font-semibold"><input type="radio" name="peso_base" value="${onde}" class="size-5 accent-brand-600" ${est.peso_base === onde ? 'checked' : ''}> Pesado na ${onde}</label>
              <label class="sr-only" for="c-peso-${onde}">Peso na ${onde} em kg</label>
              <div class="relative mt-2"><input id="c-peso-${onde}" name="peso_${onde}" type="number" min="0" step="any" inputmode="decimal" class="campo pr-10 tabular-nums" value="${est[`peso_${onde}`] ?? ''}" placeholder="0"><span class="pointer-events-none absolute inset-y-0 right-3 flex items-center text-stone-600 dark:text-stone-400" aria-hidden="true">kg</span></div>
            </div>`).join('')}
          </div>
        </fieldset>
        <div class="mt-3 rounded-xl px-3 py-2 text-sm" data-diferenca aria-live="polite"></div>
      </section>

      <section class="card" aria-labelledby="t-prod">
        <div class="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h2 id="t-prod" class="card-titulo mb-0">${icone('tambor', 'mr-1 inline size-4 align-[-2px]')} Tbs de cada produtor</h2>
          <div class="flex gap-2">
            <button type="button" class="btn-neutro min-h-9 px-3 py-1.5 text-sm" data-movimento>Parar a carreta</button>
            <button type="button" class="btn-neutro min-h-9 px-3 py-1.5 text-sm" data-chegar>${icone('repetir', 'size-4')} Ver chegar de novo</button>
          </div>
        </div>
        <div class="cena-carreta overflow-hidden rounded-xl" data-cena></div>
        <div class="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-stone-600 dark:text-stone-400" data-legenda></div>
        ${semProdutores ? `<p class="mt-4 rounded-xl bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:bg-amber-950/50 dark:text-amber-200">Nenhum produtor cadastrado ainda. Use <strong>Adicionar produtor</strong> e escolha <strong>Cadastrar novo produtor</strong>, ou cadastre todos em <a href="#resina-cadastros" class="font-semibold underline">Cadastros</a>.</p>` : ''}
        <ul class="mt-4 grid gap-3" data-linhas></ul>
        <div class="mt-3 flex flex-wrap gap-2">
          <button type="button" class="btn-sec" data-adicionar>${icone('mais')} Adicionar produtor</button>
          ${ultima?.itens.length && !est.id ? `<button type="button" class="btn-neutro" data-repetir>${icone('repetir')} Repetir produtores da última carga</button>` : ''}
        </div>
        <p class="dica mt-3">O kg sai dos Tbs. Se souber o kg exato de um produtor, digite: o campo fica <span class="rounded bg-amber-100 px-1 text-amber-900 dark:bg-amber-900/60 dark:text-amber-100">amarelo</span> e o resto do peso é dividido entre os outros. ↺ volta ao automático.</p>
      </section>

      <section class="card" aria-labelledby="t-res">
        <h2 id="t-res" class="card-titulo">Resumo da carga</h2>
        <ul class="mb-3 grid gap-2" data-avisos role="status"></ul>
        <div class="grid grid-cols-2 gap-2 sm:grid-cols-3" data-totais></div>
        <div class="mt-4" data-campo><label class="rotulo" for="c-obs">Observação <span class="font-normal text-stone-600 dark:text-stone-400">(opcional)</span></label>
          <textarea id="c-obs" name="obs" rows="2" maxlength="300" class="campo">${esc(est.obs || '')}</textarea></div>
      </section>

      <div class="flex flex-col-reverse gap-2 sm:flex-row sm:items-center">
        ${est.id ? `<button type="button" class="btn-neutro text-red-700 dark:text-red-400" data-excluir-carga>${icone('lixo')} Excluir carga</button>` : ''}
        <span class="flex-1"></span>
        <a href="#cargas" class="btn-neutro">Cancelar</a>
        <button type="submit" class="btn-primario sm:min-w-44">${icone('check')} ${est.id ? 'Salvar mudanças' : 'Salvar carga'}</button>
      </div>
    </form>`;

    const form = el.querySelector('form');
    mascaraDinheiro(form.preco_kg);

    carreta = criarCarreta(el.querySelector('[data-cena]'), {
      capacidade: capacidade(),
      aoMudarMovimento: (andando) => (form.querySelector('[data-movimento]').textContent = andando ? 'Parar a carreta' : 'Andar com a carreta'),
    });
    if (!carreta.andando) form.querySelector('[data-movimento]').hidden = true;

    desenharLinhas(form);
    atualizar(form);
    dicaPreco(form);

    // ---------- eventos
    form.addEventListener('input', (e) => {
      const t = e.target;
      const li = t.closest('[data-item]');
      if (li) {
        const item = est.itens.find((i) => i.chave === +li.dataset.item);
        const campo = t.dataset.campoItem;
        if (campo === 'tbs') item.tbs = Math.max(0, Math.round((Number(String(t.value).replace(',', '.')) || 0) * 2) / 2); // aceita meio tambor (28,5)
        else if (campo === 'arrendamento') item.arrendamento = Math.min(100, Math.max(0, Number(t.value) || 0));
        else if (campo === 'kg_manual') item.kg_manual = t.value === '' ? null : Math.max(0, Number(t.value) || 0);
        t.removeAttribute('aria-invalid');
      } else if (t.name === 'preco_kg') {
        est.preco_kg = lerValor(t.value) || 0;
        est.precoManual = true;
        dicaPreco(form);
      } else if (t.name === 'peso_fazenda' || t.name === 'peso_chegada') {
        est[t.name] = t.value === '' ? null : Math.max(0, Number(t.value) || 0);
        erroNoCampo(form, t.name, '');
      } else if (t.name === 'obs' || t.name === 'nota' || t.name === 'destino') {
        est[t.name] = t.value;
        return;
      }
      atualizar(form);
    });

    form.addEventListener('change', async (e) => {
      const t = e.target;
      if (t.dataset.campoItem === 'produtor_id') {
        const li = t.closest('[data-item]');
        const item = est.itens.find((i) => i.chave === +li.dataset.item);
        if (t.value === NOVO) {
          const novo = await cadastrarProdutor();
          if (novo) { item.produtor_id = novo.id; item.arrendamento = novo.arrendamento; }
          desenharLinhas(form);
          form.querySelector(`[data-item="${item.chave}"] [data-campo-item="${novo ? 'tbs' : 'produtor_id'}"]`)?.focus();
        } else {
          item.produtor_id = t.value;
          const p = produtor(t.value);
          if (p) item.arrendamento = p.arrendamento || 0;
          desenharLinhas(form);
          form.querySelector(`[data-item="${item.chave}"] [data-campo-item="tbs"]`)?.focus();
        }
        atualizar(form);
      } else if (t.name === 'data') {
        if (!/^\d{4}-\d{2}-\d{2}$/.test(t.value)) return;
        const anoMudou = t.value.slice(0, 4) !== est.data.slice(0, 4);
        est.data = t.value;
        if (!est.id || anoMudou) est.numero = await numeroPara(est.data, est.id);
        form.querySelector('[data-codigo]').textContent = codigoCarga(est);
        if (!est.precoManual) usarPrecoCadastrado(form);
        dicaPreco(form);
      } else if (t.name === 'caminhao_id') {
        est.caminhao_id = t.value || null;
        carreta.capacidade(capacidade());
        atualizar(form);
      } else if (t.name === 'motorista_id' || t.name === 'fazenda_id' || t.name === 'titular_id') {
        est[t.name] = t.value || null;
      } else if (t.name === 'peso_base') {
        est.peso_base = t.value;
        atualizar(form);
      }
    });

    form.addEventListener('click', async (e) => {
      const b = e.target.closest('button');
      if (!b) return;
      if (b.dataset.adicionar !== undefined) {
        const item = novoItem();
        est.itens.push(item);
        desenharLinhas(form);
        form.querySelector(`[data-item="${item.chave}"] select`)?.focus();
      } else if (b.dataset.repetir !== undefined) {
        const ja = new Set(est.itens.map((i) => i.produtor_id));
        const novos = ultima.itens.filter((i) => !ja.has(i.produtor_id) && produtor(i.produtor_id)?.ativo !== false)
          .map((i) => novoItem({ produtor_id: i.produtor_id, arrendamento: i.arrendamento }));
        est.itens.push(...novos);
        b.remove();
        desenharLinhas(form);
        atualizar(form);
        if (novos[0]) form.querySelector(`[data-item="${novos[0].chave}"] [data-campo-item="tbs"]`)?.focus();
        toast(novos.length ? `${novos.length} ${novos.length === 1 ? 'produtor incluído' : 'produtores incluídos'}. Agora informe os Tbs.` : 'Os produtores da última carga já estão na lista.');
      } else if (b.dataset.remover !== undefined) {
        const k = +b.closest('[data-item]').dataset.item;
        const i = est.itens.findIndex((x) => x.chave === k);
        est.itens.splice(i, 1);
        desenharLinhas(form);
        atualizar(form);
        (form.querySelectorAll('[data-item] select')[Math.max(0, i - 1)] || form.querySelector('[data-adicionar]')).focus();
      } else if (b.dataset.kgAuto !== undefined) {
        const k = +b.closest('[data-item]').dataset.item;
        est.itens.find((x) => x.chave === k).kg_manual = null;
        atualizar(form);
        b.closest('[data-item]').querySelector('[data-campo-item="kg_manual"]').focus();
      } else if (b.dataset.usarPreco !== undefined) {
        usarPrecoCadastrado(form);
        dicaPreco(form);
      } else if (b.dataset.movimento !== undefined) {
        carreta.alternarMovimento();
      } else if (b.dataset.chegar !== undefined) {
        carreta.chegar();
      } else if (b.dataset.excluirCarga !== undefined) {
        if (!(await confirmar(`A carga ${codigoCarga(est)} será excluída.`, { botao: 'Excluir', perigo: true }))) return;
        try {
          const desfazer = await excluirCarga(est.id);
          toast(`Carga ${codigoCarga(est)} excluída`, { acao: desfazendo(desfazer, ctx.atualizar) });
          ctx.irPara('cargas');
        } catch (err) { toast(err.message, { tipo: 'erro' }); }
      }
    });

    let salvo = false; // depois de salvar, a tela vai embora: ignora cliques que chegarem atrasados
    form.onsubmit = semRepetir(async (e) => {
      e.preventDefault();
      if (salvo) return;
      limparErros(form);
      const botao = form.querySelector('[type=submit]');
      try {
        const pronto = await conferir(form);
        if (!pronto) return;
        botao.disabled = true;
        salvo = true;
        const { precoManual, itens, ...carga } = est;
        const salva = await salvarCarga({ ...carga, obs: (carga.obs || '').trim(), nota: (carga.nota || '').trim(), destino: (carga.destino || '').trim() }, pronto.itens);
        store.mes = inicioMes(parseISO(salva.data));
        toast(`Carga ${codigoCarga(salva)} ${est.id ? 'atualizada' : 'registrada'}`, { acao: desfazendo(salva.desfazer, ctx.atualizar) });
        ctx.irPara('cargas');
      } catch (err) {
        salvo = false;
        toast(err.message, { tipo: 'erro' });
      } finally {
        if (!salvo) botao.disabled = false;
      }
    });
  },
};

// ---------- linhas de produtores
function opcoesProdutor(item) {
  const usados = new Set(est.itens.filter((i) => i !== item).map((i) => i.produtor_id));
  const lista = store.resina_produtores.filter((p) => (p.ativo !== false || p.id === item.produtor_id) && !usados.has(p.id));
  return `<option value="">Escolha…</option>${lista.map((p) => `<option value="${p.id}" ${p.id === item.produtor_id ? 'selected' : ''}>${esc(p.nome)}</option>`).join('')}
    <option value="${NOVO}">+ Cadastrar novo produtor…</option>`;
}

function desenharLinhas(form) {
  const ul = form.querySelector('[data-linhas]');
  ul.innerHTML = est.itens.map((item, n) => {
    const k = item.chave;
    const cor = item.produtor_id ? corProdutor(item.produtor_id) : '#D6D3D1';
    return `<li data-item="${k}" class="grid grid-cols-2 items-end gap-2 rounded-xl border border-stone-200 p-3 sm:grid-cols-[minmax(0,2.2fr)_repeat(3,minmax(0,1fr))_auto] dark:border-stone-800">
      <div class="col-span-2 sm:col-span-1"><label class="rotulo text-xs" for="i-prod-${k}">Produtor ${n + 1}</label>
        <div class="flex items-center gap-2">${bolinha(cor, 'size-4')}<select id="i-prod-${k}" class="campo" data-campo-item="produtor_id">${opcoesProdutor(item)}</select></div></div>
      <div><label class="rotulo text-xs" for="i-tbs-${k}">Tbs</label><input id="i-tbs-${k}" type="number" min="0" step="0.5" inputmode="decimal" class="campo tabular-nums" data-campo-item="tbs" value="${item.tbs || ''}" placeholder="0"></div>
      <div><label class="rotulo text-xs" for="i-arr-${k}">Arrendamento</label><div class="relative"><input id="i-arr-${k}" type="number" min="0" max="100" step="0.5" inputmode="decimal" class="campo pr-8 tabular-nums" data-campo-item="arrendamento" value="${item.arrendamento}"><span class="pointer-events-none absolute inset-y-0 right-3 flex items-center text-stone-600 dark:text-stone-400" aria-hidden="true">%</span></div></div>
      <div><label class="rotulo flex items-center justify-between text-xs" for="i-kg-${k}">kg <button type="button" class="cursor-pointer rounded px-1 text-amber-800 hover:bg-amber-100 dark:text-amber-300 dark:hover:bg-amber-900/50" data-kg-auto hidden aria-label="Voltar o kg ao cálculo automático" title="Voltar ao automático">↺</button></label>
        <input id="i-kg-${k}" type="number" min="0" step="any" inputmode="decimal" class="campo tabular-nums" data-campo-item="kg_manual"></div>
      <div class="flex justify-end"><button type="button" class="btn-icone hover:text-red-700" data-remover aria-label="Tirar ${esc(item.produtor_id ? nomeProdutor(item.produtor_id) : `o produtor ${n + 1}`)} da carga" title="Tirar da carga">${icone('x')}</button></div>
      <p class="col-span-2 text-sm tabular-nums text-stone-600 sm:col-span-5 dark:text-stone-400" data-valores></p>
    </li>`;
  }).join('');
}

/** Recalcula tudo e atualiza a tela (sem redesenhar os campos, para não perder o foco) */
function atualizar(form) {
  const validos = est.itens.filter((i) => i.produtor_id);
  const r = calcularCarga(est, validos);
  const porChave = new Map(r.itens.map((l) => [l.chave, l]));

  for (const item of est.itens) {
    const li = form.querySelector(`[data-item="${item.chave}"]`);
    if (!li) continue;
    const l = porChave.get(item.chave);
    const kgCampo = li.querySelector('[data-campo-item="kg_manual"]');
    const manual = item.kg_manual != null;
    kgCampo.classList.toggle('kg-manual', manual);
    li.querySelector('[data-kg-auto]').hidden = !manual;
    if (!manual && document.activeElement !== kgCampo) kgCampo.value = l && item.tbs ? Math.round(l.kg) : '';
    li.querySelector('[data-valores]').innerHTML = l && (l.valor || item.tbs)
      ? `Valor <strong class="text-stone-900 dark:text-stone-100">${brl(l.valor)}</strong> · Produtor <strong class="text-stone-900 dark:text-stone-100">${brl(l.produtor)}</strong> · Arrendamento <strong class="text-stone-900 dark:text-stone-100">${brl(l.arrendamento)}</strong>`
      : '';
  }

  // diferença entre as pesagens
  const dif = form.querySelector('[data-diferenca]');
  const d = r.diferenca;
  dif.className = 'mt-3 rounded-xl px-3 py-2 text-sm ' + (!d ? 'bg-stone-50 text-stone-600 dark:bg-stone-800/60 dark:text-stone-400'
    : Math.abs(d.kg) < 0.5 ? 'bg-brand-50 text-brand-900 dark:bg-brand-950 dark:text-brand-200'
    : d.kg < 0 ? 'bg-amber-50 text-amber-900 dark:bg-amber-950/50 dark:text-amber-200' : 'bg-brand-50 text-brand-900 dark:bg-brand-950 dark:text-brand-200');
  dif.innerHTML = !d ? 'Com os dois pesos preenchidos, aparece aqui a diferença entre a fazenda e a chegada.'
    : Math.abs(d.kg) < 0.5 ? '<strong>Sem diferença:</strong> o peso na chegada é igual ao da fazenda.'
    : `<strong>Diferença: ${d.kg < 0 ? '−' : '+'}${kg(Math.abs(d.kg))} (${d.kg < 0 ? '−' : '+'}${numero(Math.abs(d.pct), 1)}%)</strong> · chegou ${d.kg < 0 ? 'menos' : 'mais'} do que foi pesado na fazenda · equivale a ${brl(d.valor)}`;

  // carreta: um tambor por Tb, na ordem dos produtores
  const fila = [];
  for (const i of validos) for (let k = 0; k < i.tbs; k++) fila.push({ cor: corProdutor(i.produtor_id), arrendamento: i.arrendamento, nome: nomeProdutor(i.produtor_id) });
  carreta?.carregar(fila);
  const cap = capacidade();
  form.querySelector('[data-legenda]').innerHTML = validos.filter((i) => i.tbs).map((i) =>
    `<span class="flex items-center gap-1.5">${bolinha(corProdutor(i.produtor_id))}${esc(nomeProdutor(i.produtor_id))} · ${numero(i.tbs)} Tbs</span>`).join('')
    + `<span class="flex items-center gap-1.5">${bolinha('#000')}Arrendamento (proprietário)</span><span class="ml-auto tabular-nums">${numero(Math.min(r.totais.tbs, cap))} de ${numero(cap)} lugares</span>`;

  // avisos
  const avisos = [];
  if (r.totais.tbs > cap) avisos.push(`A carroceria comporta ${numero(cap)} Tbs. Ficaram ${numero(r.totais.tbs - cap)} Tbs a mais.`);
  for (const a of r.avisos) {
    if (a.tipo === 'sem-peso' && r.totais.tbs) avisos.push(`Informe o peso ${est.peso_base === 'fazenda' ? 'na fazenda' : 'na chegada'} (é o que está marcado para o pagamento).`);
    if (a.tipo === 'manual-passa') avisos.push(`Os kg digitados à mão (${kg(a.manual)}) passam do peso da carga (${kg(a.peso)}).`);
    if (a.tipo === 'soma-diferente') avisos.push(`A soma dos kg (${kg(a.manual)}) não bate com o peso da carga (${kg(a.peso)}): diferença de ${kg(Math.abs(a.peso - a.manual))}.`);
  }
  if (!est.preco_kg && r.totais.tbs) avisos.push('Informe o preço do kg para calcular os valores.');
  form.querySelector('[data-avisos]').innerHTML = avisos.map((a) =>
    `<li class="flex items-start gap-2 rounded-xl bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:bg-amber-950/50 dark:text-amber-200">${icone('alerta', 'mt-0.5 size-4')}<span>${esc(a)}</span></li>`).join('');

  form.querySelector('[data-totais]').innerHTML = [
    ['Tbs', numero(r.totais.tbs)], ['Resina', kg(r.totais.kg)], ['kg por Tb', r.totais.tbs ? numero(r.kgPorTb, 1) : '—'],
    ['Valor da carga', brl(r.totais.valor)], ['Produtores', brl(r.totais.produtor)], ['Arrendamento', brl(r.totais.arrendamento)],
  ].map(([t, v]) => quadro(t, v)).join('');
  return r;
}

// ---------- preço do kg
function usarPrecoCadastrado(form) {
  const p = precoNaData(store.resina_precos, est.data);
  est.preco_kg = p?.valor_kg || 0;
  est.precoManual = false;
  form.preco_kg.value = est.preco_kg ? valorParaCampo(est.preco_kg) : '';
  atualizar(form);
}
function dicaPreco(form) {
  const p = precoNaData(store.resina_precos, est.data);
  const dica = form.querySelector('[data-preco-dica]');
  if (!p) dica.innerHTML = 'Sem preço cadastrado para esta data. <a href="#resina-cadastros" class="font-semibold underline">Cadastrar</a>';
  else if (Math.abs(p.valor_kg - est.preco_kg) < 0.005) dica.textContent = `Preço cadastrado, vale desde ${dataCompleta(p.inicio)}.`;
  else dica.innerHTML = `Diferente do cadastrado (${brl(p.valor_kg)}). <button type="button" class="cursor-pointer font-semibold underline" data-usar-preco>Usar ${brl(p.valor_kg)}</button>`;
}

// ---------- cadastrar produtor sem sair da carga
function cadastrarProdutor() {
  return new Promise((resolver) => {
    let criado = null;
    const d = dialogo({
      titulo: 'Novo produtor',
      largura: 'max-w-sm',
      corpo: `<form class="grid gap-4" novalidate>
        <div data-campo><label class="rotulo" for="np-nome">Nome</label><input id="np-nome" name="nome" class="campo" maxlength="60" autocomplete="off"></div>
        <div class="grid grid-cols-2 gap-3">
          <div data-campo><label class="rotulo" for="np-cor">Cor dos tambores</label><input id="np-cor" name="cor" type="color" class="block h-11 w-full cursor-pointer rounded-xl border border-stone-300 bg-white p-1 dark:border-stone-700 dark:bg-stone-950" value="${proximaCor()}"></div>
          <div data-campo><label class="rotulo" for="np-arr">Arrendamento</label><div class="relative"><input id="np-arr" name="arrendamento" type="number" min="0" max="100" step="0.5" class="campo pr-8" value="0"><span class="pointer-events-none absolute inset-y-0 right-3 flex items-center text-stone-600 dark:text-stone-400" aria-hidden="true">%</span></div></div>
        </div>
        <button type="submit" class="btn-primario">${icone('check')} Cadastrar</button></form>`,
    });
    const f = d.querySelector('form');
    f.nome.focus();
    f.onsubmit = semRepetir(async (e) => {
      e.preventDefault();
      limparErros(f);
      const nome = f.nome.value.trim();
      const arr = Number(f.arrendamento.value);
      if (!nome) return erroNoCampo(f, 'nome', 'Escreva o nome do produtor.');
      const igual = store.resina_produtores.find((p) => chave(p.nome) === chave(nome));
      if (igual) return erroNoCampo(f, 'nome', `Já existe um produtor chamado "${igual.nome}".`);
      if (f.arrendamento.value === '' || !(arr >= 0 && arr <= 100)) return erroNoCampo(f, 'arrendamento', 'Use um número de 0 a 100.');
      criado = await salvarItem('resina_produtores', { nome, cor: f.cor.value, arrendamento: arr, ativo: true });
      toast(`${nome} cadastrado`);
      d.close();
    });
    d.addEventListener('close', () => resolver(criado));
  });
}

/** Confere tudo antes de salvar. Retorna os itens prontos ou null (e mostra o problema). */
async function conferir(form) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(est.data)) { erroNoCampo(form, 'data', 'Escolha a data da coleta.'); form.data.focus(); return null; }
  if (store.resina_fazendas.length > 1 && !est.fazenda_id) { erroNoCampo(form, 'fazenda_id', 'Escolha a fazenda.'); form.fazenda_id.focus(); return null; }
  if (store.resina_titulares.some((t) => t.ativo !== false) && !est.titular_id) { erroNoCampo(form, 'titular_id', 'Escolha em qual conta (CNPJ ou CPF) a carga entra.'); form.titular_id.focus(); return null; }
  if (est.preco_kg > VALOR_MAXIMO) { erroNoCampo(form, 'preco_kg', `O valor máximo é ${valorMaximoTexto()}.`); form.preco_kg.focus(); return null; }
  if (!est.preco_kg) { erroNoCampo(form, 'preco_kg', 'Informe o preço do kg.'); form.preco_kg.focus(); return null; }

  const problemaNaLinha = (item, campo, msg) => {
    const c = form.querySelector(`[data-item="${item.chave}"] [data-campo-item="${campo}"]`);
    c?.setAttribute('aria-invalid', 'true');
    c?.focus();
    toast(msg, { tipo: 'erro' });
    return null;
  };
  if (!est.itens.length) { toast('Adicione pelo menos um produtor com os Tbs dele.', { tipo: 'erro' }); form.querySelector('[data-adicionar]').focus(); return null; }
  for (const [n, item] of est.itens.entries()) {
    if (!item.produtor_id) return problemaNaLinha(item, 'produtor_id', `Escolha o produtor da linha ${n + 1} (ou tire a linha).`);
    if (!item.tbs && item.kg_manual == null) return problemaNaLinha(item, 'tbs', `Informe os Tbs de ${nomeProdutor(item.produtor_id)} (ou tire da carga).`);
  }
  const r = calcularCarga(est, est.itens);
  const base = est.peso_base;
  if (r.avisos.some((a) => a.tipo === 'sem-peso')) {
    erroNoCampo(form, `peso_${base}`, `Informe o peso ${base === 'fazenda' ? 'na fazenda' : 'na chegada'}, ou marque o outro peso para o pagamento.`);
    form[`peso_${base}`].focus();
    return null;
  }
  const passa = r.avisos.find((a) => a.tipo === 'manual-passa');
  if (passa) return problemaNaLinha(est.itens.find((i) => i.kg_manual != null), 'kg_manual', `Os kg digitados à mão (${kg(passa.manual)}) passam do peso da carga (${kg(passa.peso)}).`);

  const perguntas = [];
  const soma = r.avisos.find((a) => a.tipo === 'soma-diferente');
  if (soma) perguntas.push(`A soma dos kg (${kg(soma.manual)}) não bate com o peso da carga (${kg(soma.peso)}).`);
  if (r.totais.tbs > capacidade()) perguntas.push(`A carga tem ${numero(r.totais.tbs)} Tbs, mas o caminhão comporta ${numero(capacidade())}.`);
  if (perguntas.length && !(await confirmar(`${perguntas.join(' ')} Salvar mesmo assim?`, { titulo: 'Conferir antes de salvar', botao: 'Salvar mesmo assim' }))) return null;
  return { itens: est.itens };
}
