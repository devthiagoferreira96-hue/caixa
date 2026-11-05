// Mostra o código de recuperação para a pessoa guardar (WhatsApp, compartilhar, copiar ou anotar)
import { dialogo, icone, toast } from '../lib/ui.js';
import { esc } from '../lib/format.js';

/**
 * Mostra o código e só deixa continuar depois que a pessoa confirma que guardou.
 * `motivo` muda o texto de cima (primeiro acesso, código novo, depois de recuperar...).
 */
export function mostrarCodigoRecuperacao(codigo, { motivo = 'criado' } = {}) {
  const mensagem = `Código de recuperação do Caixa da Família: ${codigo}\n\nGuarde esta mensagem. Se esquecer a senha, é com este código que você cria uma senha nova.`;
  const titulos = {
    criado: 'Seu código de recuperação',
    novo: 'Seu novo código de recuperação',
    recuperado: 'Senha nova criada! Guarde o novo código',
    atualizacao: 'Novidade: código de recuperação',
  };
  const explicacoes = {
    criado: 'Se você esquecer a senha, é com este código que cria uma senha nova, sem perder nada.',
    novo: 'O código anterior não funciona mais. Guarde este no lugar dele.',
    recuperado: 'Por segurança, o código que você usou deixou de valer. Guarde este no lugar dele.',
    atualizacao: 'Agora, se esquecer a senha, dá para criar uma nova com este código, sem perder nada.',
  };
  return new Promise((resolver) => {
    const d = dialogo({
      titulo: titulos[motivo],
      largura: 'max-w-md',
      obrigatorio: true,
      corpo: `
        <div class="grid gap-4">
          <p class="text-stone-700 dark:text-stone-300">${explicacoes[motivo]} <strong>Ele aparece só agora.</strong></p>
          <output class="block rounded-xl border-2 border-dashed border-brand-300 bg-brand-50 px-2 py-4 text-center font-mono text-lg font-bold whitespace-nowrap text-brand-900 select-all sm:text-2xl sm:tracking-wider dark:border-brand-800 dark:bg-brand-950 dark:text-brand-100"
            aria-label="Código de recuperação: ${esc(codigo.split('').join(' '))}">${esc(codigo)}</output>
          <div class="grid gap-2 sm:grid-cols-2">
            <a class="btn-primario sm:col-span-2" data-whatsapp href="https://wa.me/?text=${encodeURIComponent(mensagem)}" target="_blank" rel="noopener">${icone('enviar')} Mandar pro meu WhatsApp</a>
            ${navigator.share ? `<button type="button" class="btn-neutro" data-compartilhar>${icone('enviar')} Compartilhar</button>` : ''}
            <button type="button" class="btn-neutro ${navigator.share ? '' : 'sm:col-span-2'}" data-copiar>${icone('copiar')} Copiar</button>
          </div>
          <p class="text-sm text-stone-600 dark:text-stone-400">Dica: mande para você mesmo no WhatsApp ou anote num papel guardado em casa. Não deixe só neste celular.</p>
          <label class="flex cursor-pointer items-start gap-3 rounded-xl border border-stone-200 p-3 dark:border-stone-700">
            <input type="checkbox" data-guardei class="mt-0.5 size-5 accent-brand-600">
            <span class="font-semibold">Já guardei o código em um lugar seguro</span>
          </label>
          <button type="button" class="btn-primario" data-continuar disabled>Continuar</button>
        </div>`,
    });
    const continuar = d.querySelector('[data-continuar]');
    d.querySelector('[data-guardei]').onchange = (e) => (continuar.disabled = !e.target.checked);
    d.querySelector('[data-copiar]').onclick = async () => {
      try { await navigator.clipboard.writeText(codigo); toast('Código copiado. Cole num lugar seguro.'); }
      catch { toast('Não deu para copiar. Anote o código mostrado na tela.', { tipo: 'erro' }); }
    };
    d.querySelector('[data-compartilhar]')?.addEventListener('click', () => navigator.share({ text: mensagem }).catch(() => {}));
    continuar.onclick = () => d.close();
    d.addEventListener('close', () => resolver());
  });
}
