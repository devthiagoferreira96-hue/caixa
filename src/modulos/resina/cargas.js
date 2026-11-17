// Lista das cargas do mês
import { brl, esc, dataCompleta, nomeMes } from '../../lib/format.js';
import { store } from '../../lib/store.js';
import { icone, estadoVazio } from '../../lib/ui.js';
import { cargasDoMes } from './dados.js';
import { calcularCarga, codigoCarga, resumoDasCargas } from './calculos.js';
import { kg, numero, quadro, motorista, caminhao, titular, faixaProdutores, seDesligado } from './comum.js';

export default {
  titulo: 'Cargas',
  usaMes: true,
  ajuda: `
    <p>As cargas do mês escolhido no topo, da mais nova para a mais antiga. Toque numa carga para ver, mudar ou excluir.</p>
    <p>A faixa colorida mostra a parte de cada produtor na carga (pela cor dele).</p>
    <p>O selo de <strong>diferença</strong> aparece quando a carga foi pesada na fazenda e na chegada.</p>`,

  async render(el, ctx) {
    if (seDesligado(el)) return;
    const { cargas, itensPorCarga } = await cargasDoMes();
    if (!ctx.aindaAtual()) return;
    const { total } = resumoDasCargas(cargas, itensPorCarga);
    const lista = [...cargas].sort((a, b) => (a.data === b.data ? b.numero - a.numero : a.data < b.data ? 1 : -1));

    el.innerHTML = `<div class="grid gap-4 animate-entrar">
      <div class="flex flex-wrap items-center justify-between gap-2">
        <p class="text-stone-600 dark:text-stone-400">${cargas.length ? `${cargas.length} ${cargas.length === 1 ? 'carga' : 'cargas'} em ${esc(nomeMes(store.mes).toLowerCase())}` : ''}</p>
        <a href="#carga" class="btn-primario">${icone('mais')} Nova carga</a>
      </div>
      ${cargas.length ? `
      <div class="grid grid-cols-2 gap-2 sm:grid-cols-4">
        ${quadro('Tbs', numero(total.tbs))}${quadro('Resina', kg(total.kg))}${quadro('Valor', brl(total.valor))}${quadro('Arrendamento', brl(total.arrendamento))}
      </div>
      <ul class="grid gap-3">${lista.map((c) => {
        const itens = itensPorCarga.get(c.id) || [];
        const r = calcularCarga(c, itens);
        const m = motorista(c.motorista_id), cam = caminhao(c.caminhao_id);
        const dif = r.diferenca;
        return `<li><a href="#carga/${c.id}" class="card block p-4 transition hover:border-brand-300 focus-visible:outline-2 focus-visible:outline-brand-600 dark:hover:border-brand-800">
          <div class="flex flex-wrap items-start justify-between gap-x-3 gap-y-1">
            <div class="min-w-0">
              <p class="font-semibold">${codigoCarga(c)} <span class="font-normal text-stone-600 dark:text-stone-400">· ${dataCompleta(c.data)}</span></p>
              <p class="truncate text-sm text-stone-600 dark:text-stone-400">${[m?.nome, cam ? cam.nome : null, `${itens.length} ${itens.length === 1 ? 'produtor' : 'produtores'}`].filter(Boolean).map(esc).join(' · ')}</p>
            </div>
            <p class="sm:text-right"><span class="block font-bold tabular-nums">${brl(r.totais.valor)}</span><span class="text-sm tabular-nums text-stone-600 dark:text-stone-400">${numero(r.totais.tbs)} Tbs · ${kg(r.totais.kg)}</span></p>
          </div>
          <div class="mt-3">${faixaProdutores(itens)}</div>
          <div class="mt-2 flex flex-wrap gap-2">
            <span class="selo selo-neutro">Arrendamento ${brl(r.totais.arrendamento)}</span>
            ${c.nota ? `<span class="selo selo-neutro">Nota ${esc(c.nota)}</span>` : ''}
            ${c.destino ? `<span class="selo selo-neutro">Destino: ${esc(c.destino)}</span>` : ''}
            ${c.titular_id ? `<span class="selo selo-neutro">${esc(titular(c.titular_id)?.nome ?? 'Conta excluída')}</span>` : ''}
            ${dif ? `<span class="selo ${dif.kg < 0 ? 'selo-aberto' : 'selo-ok'}">Diferença ${dif.kg < 0 ? '−' : '+'}${kg(Math.abs(dif.kg))}</span>` : ''}
            ${r.avisos.length ? '<span class="selo selo-atraso">Conferir pesos</span>' : ''}
          </div>
        </a></li>`;
      }).join('')}</ul>`
      : `<div class="card">${estadoVazio('Nenhuma carga neste mês', 'Registre a primeira carga: a carreta chega vazia e vai sendo carregada conforme você informa os Tbs de cada produtor.', '<a href="#carga" class="btn-primario">Registrar carga</a>')}</div>`}
    </div>`;
  },
};
