// Listas editáveis (usadas em Ajustes e nos Cadastros da resina): cada item é uma linha
// com os campos e os botões Salvar e Excluir; a última linha serve para adicionar.
import { esc, valorParaCampo, lerValor, VALOR_MAXIMO, valorMaximoTexto, dataCompleta } from '../lib/format.js';
import { icone } from '../lib/ui.js';

/** Seção que abre e fecha (o estado aberto é guardado por quem chama) */
export const secao = (id, titulo, ic, conteudo, aberta = false) => `
  <details class="card group p-0 sm:p-0" data-secao="${id}" ${aberta ? 'open' : ''}>
    <summary class="flex min-h-14 cursor-pointer list-none items-center gap-3 rounded-2xl px-4 py-3 font-semibold sm:px-5 [&::-webkit-details-marker]:hidden">
      <span class="flex size-9 items-center justify-center rounded-lg bg-stone-100 text-stone-600 dark:bg-stone-800 dark:text-stone-300">${icone(ic)}</span>
      <span class="flex-1">${titulo}</span>
      <span class="text-stone-400 transition group-open:rotate-90">${icone('direita')}</span>
    </summary>
    <div class="border-t border-stone-100 px-4 pt-4 pb-5 sm:px-5 dark:border-stone-800">${conteudo}</div>
  </details>`;

/**
 * Uma linha editável (um pequeno formulário).
 * Tipos de campo: texto, dinheiro, preco (dinheiro sem negativo), dia, inteiro, porcentagem, data, cor, opcoes, grupo, marcar.
 */
export function linha(tabela, def, item) {
  const novo = !item.id;
  const sufixo = `${tabela}-${item.id || 'novo'}`;
  const nomeItem = def.campoNome === 'inicio' ? (item.inicio ? `o preço de ${dataCompleta(item.inicio)}` : '') : item.nome || '';
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
      else if (c.tipo === 'preco') campo = `<input id="${id}" name="${c.nome}" class="campo tabular-nums" inputmode="numeric" data-dinheiro value="${valor ? valorParaCampo(valor) : ''}" placeholder="0,00">`;
      else if (c.tipo === 'dia') campo = `<input id="${id}" name="${c.nome}" type="number" min="1" max="31" class="campo" value="${valor}">`;
      else if (c.tipo === 'inteiro') campo = `<input id="${id}" name="${c.nome}" type="number" inputmode="numeric" min="${c.min ?? 0}" max="${c.max ?? ''}" step="1" class="campo tabular-nums" value="${valor ?? ''}">`;
      else if (c.tipo === 'porcentagem') campo = `<div class="relative"><input id="${id}" name="${c.nome}" type="number" inputmode="decimal" min="0" max="100" step="0.5" class="campo pr-8 tabular-nums" value="${valor ?? 0}"><span class="pointer-events-none absolute inset-y-0 right-3 flex items-center text-stone-600 dark:text-stone-400" aria-hidden="true">%</span></div>`;
      else if (c.tipo === 'data') campo = `<input id="${id}" name="${c.nome}" type="date" class="campo" value="${esc(valor || '')}">`;
      else if (c.tipo === 'cor') campo = `<input id="${id}" name="${c.nome}" type="color" class="block h-11 w-full min-w-14 cursor-pointer rounded-xl border border-stone-300 bg-white p-1 dark:border-stone-700 dark:bg-stone-950" value="${esc(valor || '#2E9E6B')}">`;
      else if (c.tipo === 'opcoes') campo = `<select id="${id}" name="${c.nome}" class="campo">${c.opcoes.map((o) => {
        const [v, texto] = Array.isArray(o) ? o : [o, o];
        return `<option value="${esc(v)}" ${v === (valor ?? c.padrao ?? '') ? 'selected' : ''}>${esc(texto)}</option>`;
      }).join('')}</select>`;
      else if (c.tipo === 'grupo') campo = `<input id="${id}" name="${c.nome}" class="campo" list="grupos-lista" value="${esc(valor)}">`;
      else campo = `<input id="${id}" name="${c.nome}" class="campo" maxlength="${c.max || 60}" value="${esc(valor ?? '')}" ${c.placeholder ? `placeholder="${esc(c.placeholder)}"` : novo && c.nome === 'nome' ? 'placeholder="Nome do novo item"' : ''} ${c.maiusculas ? 'autocapitalize="characters"' : ''}>`;
      return `<div class="${c.nome === (def.campoNome || 'nome') ? 'col-span-2' : 'col-span-1'} ${c.largura}">${rotulo}${campo}</div>`;
    }).join('')}
    </div>
    <div class="col-span-2 flex gap-2 sm:col-span-3 sm:justify-end">
      <button type="submit" class="${novo ? 'btn-primario' : 'btn-sec'} flex-1 sm:flex-none">${novo ? `${icone('mais')} Adicionar` : 'Salvar'}</button>
      ${novo ? '' : `<button type="button" class="btn-icone text-stone-600 dark:text-stone-400 hover:text-red-700" data-excluir="${tabela}:${item.id}" aria-label="Excluir ${esc(nomeItem || 'item')}" title="Excluir">${icone('lixo')}</button>`}
    </div>
  </form></li>`;
}

/** Lê os campos de uma linha. Lança erro com mensagem clara se algum valor não serve. */
export function lerLinha(form, def) {
  const item = form.dataset.id ? { id: form.dataset.id } : {};
  for (const c of def.campos) {
    const campo = form.elements[c.nome];
    if (c.tipo === 'marcar') item[c.nome] = campo.checked;
    else if (c.tipo === 'dinheiro' || c.tipo === 'preco') {
      const v = lerValor(campo.value) || 0;
      if (v > VALOR_MAXIMO) throw new Error(`O valor máximo é ${valorMaximoTexto()}.`);
      if (c.tipo === 'preco' && !v && !c.opcional) throw new Error(`Preencha ${c.rotulo.toLowerCase()}.`);
      item[c.nome] = c.tipo === 'dinheiro' && form.elements[`${c.nome}_negativo`]?.checked ? -v : v;
    } else if (c.tipo === 'dia') {
      const n = Number(campo.value);
      if (!(n >= 1 && n <= 31)) throw new Error('O dia precisa ser um número de 1 a 31.');
      item[c.nome] = n;
    } else if (c.tipo === 'inteiro') {
      const n = Number(campo.value);
      const min = c.min ?? 0, max = c.max ?? Infinity;
      if (!Number.isInteger(n) || n < min || n > max) throw new Error(`${c.rotulo} precisa ser um número inteiro de ${min} a ${max}.`);
      item[c.nome] = n;
    } else if (c.tipo === 'porcentagem') {
      const n = Number(String(campo.value).replace(',', '.'));
      if (campo.value === '' || !Number.isFinite(n) || n < 0 || n > 100) throw new Error(`${c.rotulo} precisa ser de 0 a 100.`);
      item[c.nome] = n;
    } else if (c.tipo === 'data') {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(campo.value)) throw new Error(`Preencha ${c.rotulo.toLowerCase()}.`);
      item[c.nome] = campo.value;
    } else {
      item[c.nome] = c.maiusculas ? campo.value.trim().toUpperCase() : campo.value.trim();
    }
  }
  if ('grupo' in item && !item.grupo) item.grupo = 'Outros';
  return item;
}
