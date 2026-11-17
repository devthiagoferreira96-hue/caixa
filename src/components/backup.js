// Backup e exportação: backup completo (.json, o único que restaura), planilha do Excel e PDF
import { conteudoBackup, lerBackup, restaurarBackup } from '../lib/api.js';
import { local } from '../lib/local-db.js';
import { store } from '../lib/store.js';
import { toast, confirmar, dialogo, icone } from '../lib/ui.js';
import { hojeISO, dataCompleta, esc } from '../lib/format.js';
import { periodos } from '../lib/exportar-dados.js';
import { BASES_RELATORIO } from '../lib/calculos.js';
// importados direto (sem carregar depois) para que o modo offline já tenha tudo guardado
import { gerarExcel } from '../lib/exportar-excel.js';
import { gerarPDF } from '../lib/exportar-pdf.js';
import { dadosDoPeriodoParaAnexo, comprimir } from '../lib/dados-periodo.js';

/**
 * Entrega um arquivo: no celular abre o "Compartilhar" (WhatsApp, Drive, e-mail...);
 * no computador baixa o arquivo. Retorna false se a pessoa cancelou.
 */
export async function entregar(arquivo, titulo) {
  if (navigator.canShare?.({ files: [arquivo] }) && matchMedia('(pointer: coarse)').matches) {
    try {
      await navigator.share({ files: [arquivo], title: titulo });
      return true;
    } catch (e) {
      if (e?.name === 'AbortError') return false; // a pessoa cancelou o compartilhamento
      // se o compartilhar falhar (ex.: tipo de arquivo não aceito), baixa normalmente
    }
  }
  const url = URL.createObjectURL(arquivo);
  const a = Object.assign(document.createElement('a'), { href: url, download: arquivo.name });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
  return true;
}

/** Gera o backup completo (.json). É ele que restaura os dados depois. */
export async function fazerBackup() {
  const nome = `caixa-familia-backup-${hojeISO()}.json`;
  const arquivo = new File([JSON.stringify(conteudoBackup(), null, 1)], nome, { type: 'application/json' });
  try {
    if (!(await entregar(arquivo, 'Backup do Caixa da Família'))) return false;
    await local.marcarBackup();
    toast(`Backup gerado: ${nome}. Guarde o arquivo num lugar seguro (Drive, e-mail ou WhatsApp).`);
    return true;
  } catch {
    toast('Não foi possível gerar o backup. Tente de novo.', { tipo: 'erro' });
    return false;
  }
}

const FORMATOS = {
  excel: {
    extensao: 'xlsx',
    tipo: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    nome: 'Backup em Excel',
    gerar: (p, partes) => gerarExcel(p, partes),
  },
  pdf: {
    extensao: 'pdf',
    tipo: 'application/pdf',
    nome: 'Relatório em PDF',
    gerar: gerarPDF,
  },
};

/** Gera a planilha ou o PDF do período escolhido. `base` = vencimento, competencia ou pagamento (ver BASES_RELATORIO) */
export async function exportar(formato, periodoId, base = 'vencimento', partes = {}, { comDados = false } = {}) {
  const f = FORMATOS[formato];
  const excel = formato === 'excel';
  const p = { ...(periodos().find((x) => x.id === periodoId) || periodos()[0]), base: excel ? 'vencimento' : base };
  const sufixo = (p.id === 'mes' ? p.inicio.slice(0, 7) : p.id === 'ano' ? p.inicio.slice(0, 4) : `completo-${hojeISO()}`)
    + (!excel && base !== 'vencimento' ? `-por-${base}` : '');
  const nome = `caixa-familia-${excel ? 'planilhas-' : ''}${sufixo}.${f.extensao}`;
  try {
    let bytes;
    try {
      // PDF com "Permitir importar de volta": leva os dados do período dentro do arquivo
      const anexo = formato === 'pdf' && comDados ? await comprimir(JSON.stringify({
        app: 'caixa-familia', versao: 1, tipo: 'periodo', periodo: { inicio: p.inicio, fim: p.fim, nome: p.nome },
        exportado_em: new Date().toISOString(), usuario: local.usuario, tabelas: dadosDoPeriodoParaAnexo(local.tabelas(), p),
      })) : null;
      bytes = await f.gerar(p, partes, { anexo });
    } catch (e) {
      if (e.message === 'VAZIO') { toast('Não há nada lançado nesse período para colocar na planilha.', { tipo: 'erro' }); return false; }
      throw e;
    }
    const arquivo = new File([bytes], nome, { type: f.tipo });
    if (!(await entregar(arquivo, `${f.nome} do Caixa da Família`))) return false;
    toast(`${f.nome} gerado: ${nome}`);
    return true;
  } catch (e) {
    console.error(e);
    toast(`Não foi possível gerar o arquivo. Tente de novo.`, { tipo: 'erro' });
    return false;
  }
}

let ultimaEscolha = { formato: 'backup', periodo: 'mes', base: 'vencimento', partes: { caixa: true, producao: true, conta: true }, comDados: false };

/**
 * Janela com as opções: backup completo, planilha do Excel ou PDF (com o período).
 * Retorna uma Promise com true se gerou o backup completo (para atualizar a data do último backup).
 */
export function abrirOpcoesBackup() {
  return new Promise((resolver) => {
    const opcoes = [
      ['backup', 'escudo', 'Backup completo', 'Guarda tudo. É o único arquivo que traz os dados de volta (celular novo, senha esquecida).', 'Recomendado'],
      ['excel', 'planilha', 'Backup em Excel', 'No formato das suas planilhas (NOVO_CAIXA, CONTROLE ANUAL e Conta corrente). Abre no Excel e pode ser importado de volta.'],
      ['pdf', 'documento', 'Relatório em PDF', 'Para ler, imprimir ou mandar para alguém: resumo, categorias e lista de lançamentos. Pode ser importado de volta se você marcar a opção.'],
    ];
    const d = dialogo({
      titulo: 'Backup e exportar',
      corpo: `<form class="grid gap-4" data-form-exportar novalidate>
        <fieldset class="grid gap-2">
          <legend class="rotulo mb-2">O que você quer gerar?</legend>
          ${opcoes.map(([v, ic, t, sub, selo]) => `<label class="opcao-lista">
            <input type="radio" name="formato" value="${v}" class="sr-only" ${v === ultimaEscolha.formato ? 'checked' : ''}>
            <span class="mt-0.5 shrink-0 text-brand-700 dark:text-brand-300">${icone(ic, 'size-6')}</span>
            <span class="grid gap-0.5">
              <span class="flex flex-wrap items-center gap-x-2 font-semibold">${t}${selo ? `<span class="selo selo-ok">${selo}</span>` : ''}</span>
              <span class="text-sm text-stone-600 dark:text-stone-400">${sub}</span>
            </span>
          </label>`).join('')}
        </fieldset>
        <div data-periodo-bloco hidden>
          <label class="rotulo" for="exp-periodo">Período</label>
          <select id="exp-periodo" name="periodo" class="campo">
            ${periodos(store.mes).map((p) => `<option value="${p.id}" ${p.id === ultimaEscolha.periodo ? 'selected' : ''}>${esc(p.nome)}</option>`).join('')}
          </select>
          <fieldset class="mt-4 grid gap-2" data-partes-excel>
            <legend class="rotulo">O que colocar na planilha</legend>
            ${[['caixa', 'Caixa (uma aba por mês, como o NOVO_CAIXA)'], ['producao', 'Produção da resina (CONTROLE ANUAL e SAFRAS)'], ['conta', 'Conta corrente do arrendamento']]
              .map(([v, t]) => `<label class="flex min-h-10 cursor-pointer items-center gap-3 text-sm"><input type="checkbox" class="size-5 accent-brand-600" name="parte_${v}" ${ultimaEscolha.partes[v] ? 'checked' : ''}>${t}</label>`).join('')}
            <p class="dica">Para guardar tudo e poder importar de volta, escolha o período <strong>Tudo o que já foi lançado</strong>.</p>
          </fieldset>
          <div data-base-bloco>
          <label class="rotulo mt-4" for="exp-base">Organizar por</label>
          <select id="exp-base" name="base" class="campo" aria-describedby="exp-base-dica">
            ${Object.entries(BASES_RELATORIO).map(([v, b]) => `<option value="${v}" ${v === ultimaEscolha.base ? 'selected' : ''}>${esc(b.nome)}</option>`).join('')}
          </select>
          <p id="exp-base-dica" class="dica" data-base-dica></p>
          <label class="mt-4 flex cursor-pointer items-start gap-3 rounded-xl border border-stone-200 p-3 dark:border-stone-700">
            <input type="checkbox" name="com_dados" class="mt-0.5 size-5 shrink-0 accent-brand-600" ${ultimaEscolha.comDados ? 'checked' : ''}>
            <span><span class="block font-semibold">Permitir importar este PDF de volta</span>
            <span class="block text-sm text-stone-600 dark:text-stone-400">Guarda dentro do PDF os dados do período, para o sistema trazer de volta sem erro. Deixe desmarcado se for mandar o PDF para outra pessoa: quem tiver o arquivo também leva esses dados.</span></span>
          </label>
          </div>
          <p class="dica mt-2">Planilha e PDF são para consultar. Para guardar e poder restaurar, use o <strong>Backup completo</strong>.</p>
        </div>
        <div class="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <button type="button" class="btn-neutro" data-fechar>Cancelar</button>
          <button type="submit" class="btn-primario" data-gerar>${icone('baixar')} <span data-gerar-texto>Gerar backup</span></button>
        </div>
      </form>`,
    });
    const form = d.querySelector('form');
    const atualizar = () => {
      const formato = form.formato.value;
      d.querySelector('[data-periodo-bloco]').hidden = formato === 'backup';
      d.querySelector('[data-base-dica]').textContent = BASES_RELATORIO[form.base.value].explica;
      d.querySelector('[data-partes-excel]').hidden = formato !== 'excel';
      d.querySelector('[data-base-bloco]').hidden = formato !== 'pdf';
      d.querySelector('[data-gerar-texto]').textContent = { backup: 'Gerar backup', excel: 'Gerar backup em Excel', pdf: 'Gerar PDF' }[formato];
    };
    form.addEventListener('change', atualizar);
    atualizar();
    let gerouBackup = false;
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const botao = d.querySelector('[data-gerar]');
      const partes = { caixa: form.parte_caixa.checked, producao: form.parte_producao.checked, conta: form.parte_conta.checked };
      if (form.formato.value === 'excel' && !Object.values(partes).some(Boolean)) { toast('Marque pelo menos uma parte para colocar na planilha.', { tipo: 'erro' }); return; }
      ultimaEscolha = { formato: form.formato.value, periodo: form.periodo.value, base: form.base.value, partes, comDados: form.com_dados.checked };
      botao.disabled = true;
      botao.setAttribute('aria-busy', 'true');
      const ok = ultimaEscolha.formato === 'backup' ? await fazerBackup() : await exportar(ultimaEscolha.formato, ultimaEscolha.periodo, ultimaEscolha.base, ultimaEscolha.partes, { comDados: ultimaEscolha.comDados });
      botao.disabled = false;
      botao.removeAttribute('aria-busy');
      if (ok) {
        gerouBackup = ultimaEscolha.formato === 'backup';
        d.close();
      }
    });
    d.addEventListener('close', () => resolver(gerouBackup));
  });
}

/** Abre a escolha de arquivo e lê o backup. Retorna os dados do backup ou null. */
export function escolherBackup() {
  return new Promise((resolver) => {
    const input = Object.assign(document.createElement('input'), { type: 'file', accept: '.json,application/json' });
    input.addEventListener('change', async () => {
      const arquivo = input.files?.[0];
      if (!arquivo) return resolver(null);
      try {
        resolver(lerBackup(await arquivo.text()));
      } catch (e) {
        toast(e.message, { tipo: 'erro' });
        resolver(null);
      }
    });
    input.addEventListener('cancel', () => resolver(null));
    input.click();
  });
}

/** Restaura um backup por cima dos dados atuais (com confirmação e Desfazer). `jaLido` = backup já aberto (lerBackup) */
export async function restaurarComConfirmacao(aoTerminar, jaLido = null) {
  const dados = jaLido || await escolherBackup();
  if (!dados) return;
  const qtd = dados.tabelas.lancamentos.length;
  const problemas = [
    dados.corrigidos ? `${dados.corrigidos} ${dados.corrigidos === 1 ? 'informação foi corrigida' : 'informações foram corrigidas'}` : '',
    dados.ignorados ? `${dados.ignorados} ${dados.ignorados === 1 ? 'item danificado ficou de fora' : 'itens danificados ficaram de fora'}` : '',
  ].filter(Boolean).join(' e ');
  const ok = await confirmar(
    `O backup${dados.exportado_em ? ` de ${dataCompleta(dados.exportado_em.slice(0, 10))}` : ''} tem ${qtd} lançamentos. Ele vai SUBSTITUIR todos os dados que estão no sistema agora.${problemas ? ` Atenção: o arquivo tinha problemas (${problemas}).` : ''}`,
    { titulo: 'Restaurar este backup?', botao: 'Restaurar', perigo: true },
  );
  if (!ok) return;
  const desfazer = await restaurarBackup(dados);
  toast('Backup restaurado', {
    acao: { texto: 'Desfazer', fn: async () => { await desfazer(); toast('Dados de antes restaurados'); aoTerminar?.(); } },
  });
  aoTerminar?.();
}
