// Backup: gera um arquivo com todos os dados e permite restaurar a partir dele
import { conteudoBackup, lerBackup, restaurarBackup } from '../lib/api.js';
import { local } from '../lib/local-db.js';
import { toast, confirmar } from '../lib/ui.js';
import { hojeISO, dataCompleta } from '../lib/format.js';

/**
 * Gera o arquivo de backup. No celular abre o "Compartilhar" (WhatsApp, Drive, e-mail...);
 * no computador baixa o arquivo.
 */
export async function fazerBackup() {
  const nome = `caixa-familia-backup-${hojeISO()}.json`;
  const arquivo = new File([JSON.stringify(conteudoBackup(), null, 1)], nome, { type: 'application/json' });
  try {
    if (navigator.canShare?.({ files: [arquivo] }) && matchMedia('(pointer: coarse)').matches) {
      await navigator.share({ files: [arquivo], title: 'Backup do Caixa da Família' });
    } else {
      const url = URL.createObjectURL(arquivo);
      const a = Object.assign(document.createElement('a'), { href: url, download: nome });
      document.body.append(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 5000);
    }
    await local.marcarBackup();
    toast(`Backup gerado: ${nome}. Guarde o arquivo num lugar seguro (Drive, e-mail ou WhatsApp).`);
    return true;
  } catch (e) {
    if (e?.name === 'AbortError') return false; // a pessoa cancelou o compartilhamento
    toast('Não foi possível gerar o backup. Tente de novo.', { tipo: 'erro' });
    return false;
  }
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

/** Restaura um backup por cima dos dados atuais (com confirmação e Desfazer) */
export async function restaurarComConfirmacao(aoTerminar) {
  const dados = await escolherBackup();
  if (!dados) return;
  const qtd = dados.tabelas.lancamentos?.length || 0;
  const ok = await confirmar(
    `O backup de ${dataCompleta(dados.exportado_em.slice(0, 10))} tem ${qtd} lançamentos. Ele vai SUBSTITUIR todos os dados que estão no sistema agora.`,
    { titulo: 'Restaurar este backup?', botao: 'Restaurar', perigo: true },
  );
  if (!ok) return;
  const desfazer = await restaurarBackup(dados);
  toast('Backup restaurado', {
    acao: { texto: 'Desfazer', fn: async () => { await desfazer(); toast('Dados de antes restaurados'); aoTerminar?.(); } },
  });
  aoTerminar?.();
}
