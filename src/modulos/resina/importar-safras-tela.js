// Importar a planilha de produção (CONTROLE ANUAL / SAFRAS): conferir produtores e cargas e gravar.
// As regras ficam em importar-safras.js.
import { desfazendo } from '../../components/lancamento.js';
import { esc } from '../../lib/format.js';
import { store } from '../../lib/store.js';
import { dialogo, toast, icone } from '../../lib/ui.js';
import { lerSafras, montarImportacaoSafras, safraDe } from './importar-safras.js';
import { todasAsCargas, gravarImportacaoSafras } from './dados.js';
import { CORES_PRODUTOR } from './tabelas.js';
import { numero, nomeTitular } from './comum.js';

/**
 * Fluxo completo com as abas já lidas do arquivo (lerXlsx).
 * Retorna uma Promise que termina quando a janela fecha (importando ou não).
 */
export async function importarSafras({ arquivo, abas }, aoTerminar) {
  const { blocos, resumos } = lerSafras(abas);
  if (!blocos.length) {
    toast('Essa planilha não tem os blocos de produção (DATA | TBS | PESO - KG).', { tipo: 'erro' });
    return;
  }
  const { cargas, itensPorCarga } = await todasAsCargas();
  const existentes = { produtores: store.resina_produtores, cargas, itensPorCarga, precos: store.resina_precos };
  const titulares = store.resina_titulares.filter((t) => t.ativo !== false);
  const decisoes = { produtores: {}, arrendamento: {}, titular_id: null };
  let plano = montarImportacaoSafras(blocos, decisoes, existentes);
  // começa com o que achou sozinho (produtor com o mesmo nome) e "criar" no resto
  for (const p of plano.produtores) decisoes.produtores[p.chave] = p.existente ? p.existente.id : 'criar';
  const abasUsadas = [...new Set(blocos.map((b) => b.aba))];

  return new Promise((resolver) => {
    const d = dialogo({
      titulo: 'Importar produção da resina',
      largura: 'max-w-3xl',
      corpo: `<form class="grid gap-4" novalidate>
        <p class="text-sm text-stone-700 dark:text-stone-300">Arquivo <strong class="break-all">${esc(arquivo.name)}</strong>:
          ${blocos.length} blocos de produção nas abas ${abasUsadas.map((a) => `<strong>${esc(a)}</strong>`).join(', ')}.
          Cada linha vira um produtor numa carga; as linhas do mesmo dia ficam na mesma carga.</p>
        ${resumos.length ? `<p class="text-sm text-stone-600 dark:text-stone-400">A aba ${resumos.map((a) => `<strong>${esc(a)}</strong>`).join(', ')} é o resumo por mês e não é importada (o sistema calcula sozinho a partir das cargas).</p>` : ''}

        <fieldset class="grid gap-2 rounded-xl border border-stone-200 p-3 dark:border-stone-800">
          <legend class="rotulo px-1">Produtores da planilha</legend>
          <p class="text-sm text-stone-600 dark:text-stone-400">Linhas do bloco "Pedro e Paulo" sem nome ao lado foram divididas meio a meio. Se for o mesmo produtor com outro nome, escolha o do cadastro.</p>
          <div class="grid gap-3" data-produtores>${plano.produtores.map((p, i) => linhaProdutor(p, i, decisoes)).join('')}</div>
        </fieldset>

        <div><label class="rotulo" for="is-conta">Conta da conta corrente (CNPJ ou CPF)</label>
          <select id="is-conta" class="campo" data-conta>
            <option value="">Sem conta (a planilha da conta corrente completa depois)</option>
            ${titulares.map((t) => `<option value="${t.id}">${esc(nomeTitular(t.id))}</option>`).join('')}
          </select>
          <p class="dica">A planilha de produção não diz a conta nem o preço. Ao importar a planilha da conta corrente, as mesmas cargas ganham o preço, a conta e o % de cada uma.</p></div>

        <div class="grid gap-2 rounded-xl bg-stone-100 p-3 text-sm dark:bg-stone-800" aria-live="polite" data-resumo></div>

        <div class="sticky bottom-0 -mx-5 -mb-5 flex flex-wrap items-center gap-2 border-t border-stone-200 bg-cartao px-5 py-3 dark:border-stone-800 dark:bg-stone-900">
          <span class="flex-1"></span>
          <button type="button" class="btn-neutro flex-1 sm:flex-none" data-fechar>Cancelar</button>
          <button type="submit" class="btn-primario flex-[2] sm:flex-none" data-confirmar>${icone('check')} <span data-texto-botao>Importar</span></button>
        </div>
      </form>`,
    });
    const form = d.querySelector('form');

    const atualizar = () => {
      plano = montarImportacaoSafras(blocos, decisoes, existentes);
      // Tbs por produtor e safra: para conferir com os TOTAIS da planilha
      const safras = [...new Set(plano.cargas.map((c) => safraDe(c.carga.data)))].sort();
      const nomeDe = (id) => store.resina_produtores.find((p) => p.id === id)?.nome || plano.produtoresNovos.find((p) => p.id === id)?.nome || '?';
      const soma = new Map();
      for (const c of plano.cargas) for (const i of c.itens) {
        const k = `${i.produtor_id}|${safraDe(c.carga.data)}`;
        soma.set(k, (soma.get(k) || 0) + i.tbs);
      }
      const ids = [...new Set(plano.cargas.flatMap((c) => c.itens.map((i) => i.produtor_id)))];
      d.querySelector('[data-resumo]').innerHTML = `
        <p class="text-base"><strong>Vai importar:</strong> ${plano.cargas.length} ${plano.cargas.length === 1 ? 'carga' : 'cargas'} (${plano.entregas} linhas de produtor)${plano.produtoresNovos.length ? `, criando ${plano.produtoresNovos.length} ${plano.produtoresNovos.length === 1 ? 'produtor' : 'produtores'}` : ''}.</p>
        ${plano.repetidas ? `<p>${plano.repetidas} ${plano.repetidas === 1 ? 'linha já está' : 'linhas já estão'} no sistema (mesmo dia, produtor e Tbs) e não ${plano.repetidas === 1 ? 'será importada' : 'serão importadas'} de novo.</p>` : ''}
        ${plano.duplicadasNoArquivo ? `<p>${plano.duplicadasNoArquivo} ${plano.duplicadasNoArquivo === 1 ? 'linha aparece' : 'linhas aparecem'} em mais de uma aba e ${plano.duplicadasNoArquivo === 1 ? 'entra' : 'entram'} uma vez só.</p>` : ''}
        ${plano.avisos.map((a) => `<p class="text-amber-900 dark:text-amber-200">${icone('alerta', 'mr-1 inline size-4 align-[-3px]')}${esc(a)}</p>`).join('')}
        ${ids.length ? `<div class="overflow-x-auto"><table class="mt-1 w-full text-right tabular-nums">
          <caption class="mb-1 text-left font-semibold">Tbs por safra (agosto a julho), para conferir com os totais da planilha</caption>
          <thead><tr><th class="text-left">Produtor</th>${safras.map((s) => `<th class="px-2">${s.slice(2, 4)}/${s.slice(7, 9)}</th>`).join('')}</tr></thead>
          <tbody>${ids.map((id) => `<tr><td class="text-left">${esc(nomeDe(id))}</td>${safras.map((s) => `<td class="px-2">${soma.has(`${id}|${s}`) ? numero(soma.get(`${id}|${s}`), 1) : '—'}</td>`).join('')}</tr>`).join('')}</tbody>
        </table></div>` : ''}`;
      const botao = d.querySelector('[data-confirmar]');
      botao.disabled = !plano.total;
      d.querySelector('[data-texto-botao]').textContent = plano.total ? `Importar ${plano.total} ${plano.total === 1 ? 'carga' : 'cargas'}` : 'Nada para importar';
    };

    form.addEventListener('change', (e) => {
      const t = e.target;
      if (t.matches('[data-conta]')) decisoes.titular_id = t.value || null;
      else if (t.matches('[data-escolha]')) {
        decisoes.produtores[t.dataset.escolha] = t.value;
        form.querySelector(`[data-pct-bloco="${t.dataset.escolha}"]`).hidden = t.value !== 'criar';
      }
      atualizar();
    });
    form.addEventListener('input', (e) => {
      if (!e.target.matches('[data-pct]')) return;
      const v = Number(String(e.target.value).replace(',', '.'));
      decisoes.arrendamento[e.target.dataset.pct] = v >= 0 && v <= 100 ? v : 0;
      atualizar();
    });
    atualizar();

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      if (!plano?.total) return;
      const botao = d.querySelector('[data-confirmar]');
      botao.disabled = true;
      botao.setAttribute('aria-busy', 'true');
      d.querySelector('[data-texto-botao]').textContent = 'Importando…';
      // cor para os produtores novos (as que ainda não estão em uso primeiro)
      const usadas = new Set(store.resina_produtores.map((p) => p.cor?.toLowerCase()));
      const livres = CORES_PRODUTOR.filter((c) => !usadas.has(c.toLowerCase()));
      plano.produtoresNovos.forEach((p, i) => { p.cor = livres[i] || CORES_PRODUTOR[i % CORES_PRODUTOR.length]; });
      try {
        const desfazer = await gravarImportacaoSafras(plano);
        d.close();
        toast(`Importado: ${plano.cargas.length} ${plano.cargas.length === 1 ? 'carga' : 'cargas'}${plano.produtoresNovos.length ? ` e ${plano.produtoresNovos.length} ${plano.produtoresNovos.length === 1 ? 'produtor' : 'produtores'}` : ''}.`, { acao: desfazendo(desfazer, aoTerminar) });
        aoTerminar?.();
      } catch (err) {
        console.error(err);
        toast('Não foi possível importar. Nada foi alterado.', { tipo: 'erro' });
        botao.disabled = false;
        botao.removeAttribute('aria-busy');
        atualizar();
      }
    });
    d.addEventListener('close', () => resolver());
  });
}

function linhaProdutor(p, i, decisoes) {
  const escolha = decisoes.produtores[p.chave];
  return `<div class="grid gap-2 sm:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)_8rem] sm:items-end">
    <p class="text-sm"><strong>${esc(p.nome)}</strong><br><span class="text-stone-600 dark:text-stone-400">${p.linhas} ${p.linhas === 1 ? 'linha' : 'linhas'} · ${numero(p.tbs, 1)} Tbs</span></p>
    <div><label class="rotulo text-xs" for="is-p-${i}">No sistema</label>
      <select id="is-p-${i}" class="campo" data-escolha="${esc(p.chave)}">
        <option value="criar" ${escolha === 'criar' ? 'selected' : ''}>Criar "${esc(p.nome)}"</option>
        ${store.resina_produtores.map((x) => `<option value="${x.id}" ${x.id === escolha ? 'selected' : ''}>${esc(x.nome)}</option>`).join('')}
      </select></div>
    <div data-pct-bloco="${esc(p.chave)}" ${escolha === 'criar' ? '' : 'hidden'}><label class="rotulo text-xs" for="is-pct-${i}">% arrendamento</label>
      <input id="is-pct-${i}" class="campo tabular-nums" type="number" min="0" max="100" step="1" inputmode="decimal" data-pct="${esc(p.chave)}" placeholder="0"></div>
  </div>`;
}
