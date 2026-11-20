// Peças de interface reutilizáveis: ícones, avisos (toast), janelas (dialog) e campo de valor
import { esc, brl, valorParaCampo, DIGITOS_VALOR, VALOR_MAXIMO, valorMaximoTexto } from './format.js';
import { ehFormula, tentarFormula, OPERADORES } from './formula.js';

const ICONES = {
  inicio: '<path d="M3 11l9-7 9 7v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z"/>',
  extrato: '<path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"/>',
  cartao: '<rect x="2" y="5" width="20" height="14" rx="2"/><path d="M2 10h20M6 15h4"/>',
  relatorio: '<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>',
  ajustes: '<path d="M4 21v-7M4 10V3M12 21v-9M12 8V3M20 21v-5M20 12V3M1 14h6M9 8h6M17 16h6"/>',
  ajuda: '<circle cx="12" cy="12" r="10"/><path d="M9.1 9a3 3 0 0 1 5.8 1c0 2-3 3-3 3M12 17h.01"/>',
  mais: '<path d="M12 5v14M5 12h14"/>',
  check: '<path d="M20 6L9 17l-5-5"/>',
  x: '<path d="M18 6L6 18M6 6l12 12"/>',
  lixo: '<path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6M10 11v6M14 11v6"/>',
  editar: '<path d="M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/>',
  esquerda: '<path d="M15 18l-6-6 6-6"/>',
  direita: '<path d="M9 18l6-6-6-6"/>',
  sair: '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9"/>',
  busca: '<circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/>',
  saida: '<path d="M12 5v14M19 12l-7 7-7-7"/>',
  entrada: '<path d="M12 19V5M5 12l7-7 7 7"/>',
  transferir: '<path d="M17 3l4 4-4 4M21 7H9M7 21l-4-4 4-4M3 17h12"/>',
  alerta: '<path d="M12 9v4M12 17h.01"/><path d="M10.3 3.9L1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"/>',
  copiar: '<rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>',
  olho: '<path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/>',
  carteira: '<path d="M20 7H5a2 2 0 0 1 0-4h13v4"/><path d="M3 5v14a2 2 0 0 0 2 2h15V7"/><path d="M16 14h.01"/>',
  pessoas: '<path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.9M16 3.1a4 4 0 0 1 0 7.8"/>',
  etiqueta: '<path d="M20.6 13.4l-7.2 7.2a2 2 0 0 1-2.8 0L2 12V2h10l8.6 8.6a2 2 0 0 1 0 2.8z"/><path d="M7 7h.01"/>',
  casa: '<path d="M3 11l9-7 9 7"/><path d="M5 10v10h14V10"/>',
  paleta: '<circle cx="13.5" cy="6.5" r="1"/><circle cx="17.5" cy="10.5" r="1"/><circle cx="8.5" cy="7.5" r="1"/><circle cx="6.5" cy="12.5" r="1"/><path d="M12 2a10 10 0 0 0 0 20c1 0 2-.8 2-2 0-.5-.2-1-.5-1.3-.3-.4-.5-.8-.5-1.2 0-1 .8-1.5 2-1.5h2.3A5.7 5.7 0 0 0 22 10.3C22 5.7 17.5 2 12 2z"/>',
  celular: '<rect x="6" y="2" width="12" height="20" rx="2"/><path d="M11 18h2"/>',
  repetir: '<path d="M17 1l4 4-4 4"/><path d="M3 11V9a4 4 0 0 1 4-4h14M7 23l-4-4 4-4"/><path d="M21 13v2a4 4 0 0 1-4 4H3"/>',
  cadeado: '<rect x="4" y="11" width="16" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/>',
  planilha: '<rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18M3 15h18M9 3v18"/>',
  documento: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6M8 13h8M8 17h5"/>',
  escudo: '<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>',
  baixar: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3"/>',
  enviar: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M17 8l-5-5-5 5M12 3v12"/>',
  insumo: '<path d="M14 2v6a2 2 0 0 0 .245.96l5.51 10.08A2 2 0 0 1 18 22H6a2 2 0 0 1-1.755-2.96l5.51-10.08A2 2 0 0 0 10 8V2"/><path d="M6.453 15h11.094M8.5 2h7"/>',
  tambor: '<ellipse cx="12" cy="5" rx="8" ry="2.5"/><path d="M4 5v14c0 1.4 3.6 2.5 8 2.5s8-1.1 8-2.5V5M4 10.5c0 1.4 3.6 2.5 8 2.5s8-1.1 8-2.5M4 15.5c0 1.4 3.6 2.5 8 2.5s8-1.1 8-2.5"/>',
  caminhao: '<path d="M14 18V6a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2v11a1 1 0 0 0 1 1h2M15 18H9M19 18h2a1 1 0 0 0 1-1v-3.65a1 1 0 0 0-.22-.62l-3.48-4.35A1 1 0 0 0 17.52 8H14"/><circle cx="17" cy="18" r="2"/><circle cx="7" cy="18" r="2"/>',
  balanca: '<path d="M12 3v18M7 21h10M5 7h14M5 7l-3 7a3 3 0 0 0 6 0zM19 7l-3 7a3 3 0 0 0 6 0z"/>',
  arvore: '<path d="M12 22v-5M12 2l-6 8h3l-4 6h14l-4-6h3z"/>',
  dinheiro: '<rect x="2" y="6" width="20" height="12" rx="2"/><circle cx="12" cy="12" r="2.5"/><path d="M6 12h.01M18 12h.01"/>',
  cadastros: '<rect width="8" height="4" x="8" y="2" rx="1"/><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2M12 11h4M12 16h4M8 11h.01M8 16h.01"/>',
  calendario: '<rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/>',
};

export const icone = (nome, classe = 'size-5') =>
  `<svg class="${classe} shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONES[nome] || ''}</svg>`;

// ---------- Avisos rápidos no canto da tela (com botão opcional, ex.: "Desfazer")
export function toast(mensagem, { tipo = 'ok', acao } = {}) {
  const area = document.getElementById('toasts') || criarAreaToasts();
  const el = document.createElement('div');
  el.className =
    'pointer-events-auto flex w-full max-w-md items-center gap-3 rounded-xl px-4 py-3 text-sm shadow-lg animate-entrar ' +
    (tipo === 'erro' ? 'bg-red-700 text-white' : 'bg-stone-900 text-white dark:bg-stone-100 dark:text-stone-900');
  el.setAttribute('role', tipo === 'erro' ? 'alert' : 'status');
  // nomes enormes sem espaço deixariam o aviso com várias linhas: encurta só para exibir
  let texto = String(mensagem).replace(/\S{31,}/g, (p) => `${p.slice(0, 28)}…`);
  if (texto.length > 280) texto = `${texto.slice(0, 277)}…`; // só corta textos enormes (ex.: nomes digitados)
  el.innerHTML = `${icone(tipo === 'erro' ? 'alerta' : 'check')}<span class="min-w-0 flex-1">${esc(texto)}</span>`;
  if (texto !== String(mensagem)) el.title = mensagem;
  if (acao) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'shrink-0 cursor-pointer rounded-lg px-2 py-1 font-semibold underline underline-offset-2';
    b.textContent = acao.texto;
    b.onclick = () => { el.remove(); acao.fn(); };
    el.append(b);
  }
  const fechar = document.createElement('button');
  fechar.type = 'button';
  fechar.className = 'shrink-0 cursor-pointer rounded-lg p-1 opacity-70 hover:opacity-100';
  fechar.setAttribute('aria-label', 'Fechar aviso');
  fechar.innerHTML = icone('x', 'size-4');
  fechar.onclick = () => el.remove();
  el.append(fechar);
  area.append(el);
  while (area.children.length > 2) area.firstElementChild.remove(); // no máximo 2 avisos por vez
  setTimeout(() => el.remove(), acao ? 9000 : 5000);
}
function criarAreaToasts() {
  const a = document.createElement('div');
  a.id = 'toasts';
  a.className = 'pointer-events-none fixed inset-x-0 bottom-24 z-[60] flex flex-col items-center gap-2 px-4 lg:bottom-6';
  document.body.append(a);
  return a;
}

// ---------- Janela (dialog nativo: já cuida do foco e da tecla Esc)
let contadorDialogos = 0;
export function dialogo({ titulo, corpo, largura = 'max-w-lg', obrigatorio = false }) {
  const id = `dlg-${++contadorDialogos}`;
  const d = document.createElement('dialog');
  d.className = `m-auto w-[calc(100%-1.5rem)] ${largura} max-h-[90dvh] overflow-y-auto rounded-2xl bg-cartao p-0 text-texto shadow-2xl dark:bg-stone-900 dark:text-stone-100`;
  d.setAttribute('aria-labelledby', id);
  d.innerHTML = `
    <div class="flex items-center justify-between gap-3 px-5 pt-4">
      <h2 id="${id}" class="text-lg font-bold">${esc(titulo)}</h2>
      ${obrigatorio ? '' : `<button type="button" data-fechar class="btn-icone -mr-2" aria-label="Fechar janela">${icone('x')}</button>`}
    </div>
    <div class="px-5 pt-2 pb-5">${corpo}</div>`;
  document.body.append(d);
  d.addEventListener('click', (e) => {
    if ((!obrigatorio && e.target === d) || e.target.closest('[data-fechar]')) d.close();
  });
  // janela obrigatória: não fecha com Esc nem clicando fora
  if (obrigatorio) d.addEventListener('cancel', (e) => e.preventDefault());
  d.addEventListener('close', () => setTimeout(() => d.remove(), 0));
  d.showModal();
  return d;
}

/** Pergunta de confirmação. Retorna true/false. */
export function confirmar(mensagem, { titulo = 'Tem certeza?', botao = 'Confirmar', perigo = false, detalhes = '' } = {}) {
  return new Promise((resolver) => {
    const d = dialogo({
      titulo,
      largura: 'max-w-sm',
      corpo: `<p class="text-stone-600 dark:text-stone-300">${esc(mensagem)}</p>${detalhes /* HTML já escapado por quem chama */}
        <div class="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <button type="button" class="btn-neutro" data-resposta="nao">Cancelar</button>
          <button type="button" class="${perigo ? 'btn-perigo' : 'btn-primario'}" data-resposta="sim">${esc(botao)}</button>
        </div>`,
    });
    let resposta = false;
    d.addEventListener('click', (e) => {
      const b = e.target.closest('[data-resposta]');
      if (b) { resposta = b.dataset.resposta === 'sim'; d.close(); }
    });
    d.addEventListener('close', () => resolver(resposta));
    d.querySelector(perigo ? '[data-resposta="nao"]' : '[data-resposta="sim"]').focus();
  });
}

// ---------- Campo de dinheiro: a pessoa digita só números e ele formata (1234 -> 12,34)
// Aceita no máximo DIGITOS_VALOR dígitos (R$ 99.999.999,99). O que passar disso é ignorado
// (inclusive ao colar) e aparece um aviso embaixo do campo, lido também por leitores de tela.
// Também aceita conta como no Excel, sem precisar de "=" (ex.: 3*4,50 ou 3x4,50): a conta é feita
// ao sair do campo ou apertar Enter, e o campo fica com o resultado (13,50).
export function mascaraDinheiro(input) {
  const TAMANHO_NUMERO = DIGITOS_VALOR + Math.floor((DIGITOS_VALOR - 3) / 3) + 1; // dígitos + pontos + vírgula
  const TAMANHO_FORMULA = 100;
  input.maxLength = TAMANHO_NUMERO;
  const area = input.closest('[data-campo]') || input.parentElement;
  const aviso = document.createElement('p');
  aviso.className = 'dica hidden font-medium text-amber-800 dark:text-amber-300';
  aviso.setAttribute('aria-live', 'polite');
  const conta = document.createElement('p'); // mostra a fórmula e o resultado
  conta.className = 'dica hidden tabular-nums';
  conta.setAttribute('aria-live', 'polite');
  area.append(conta, aviso);

  const mostrar = (el, texto) => {
    el.textContent = texto || '';
    el.classList.toggle('hidden', !texto);
  };
  const mostrarAviso = (sim) => mostrar(aviso, sim ? `Valor máximo: ${valorMaximoTexto()} (${DIGITOS_VALOR} dígitos).` : '');
  const formatar = (d) => (d ? (Number(d) / 100).toLocaleString('pt-BR', { minimumFractionDigits: 2 }) : '');

  /** Faz a conta da fórmula. Retorna false se ela tiver erro (o campo continua com a fórmula). */
  const resolverFormula = () => {
    if (!ehFormula(input.value)) return true;
    const formula = input.value.trim();
    const { valor, erro } = tentarFormula(formula);
    const problema = erro
      || (!(valor > 0) && `O resultado deu ${brl(valor)}. O valor precisa ser maior que zero.`)
      || (valor > VALOR_MAXIMO && `O resultado passa do valor máximo (${valorMaximoTexto()}).`);
    if (problema) {
      mostrar(conta, '');
      mostrar(aviso, `Conta: ${problema}`);
      return false;
    }
    input.maxLength = TAMANHO_NUMERO;
    input.value = valorParaCampo(valor);
    input.dispatchEvent(new Event('input', { bubbles: true })); // atualiza prévias que escutam o campo
    mostrar(aviso, '');
    mostrar(conta, `${formula} = ${brl(valor)}`);
    return true;
  };

  // "digitado" guarda o número como a pessoa digitou (ex.: "3"), enquanto o campo mostra
  // formatado em centavos ("0,03"). Se ela digitar um sinal (3*), a conta começa com "3", e não "0,03".
  // Se o campo mudou por outro caminho (limpo pelo sistema, edição no meio), vale o que aparece no campo.
  let digitado = input.value;
  const soDigitos = (t) => String(t ?? '').replace(/\D/g, '').replace(/^0+/, '');
  const coerente = () => digitado != null && formatar(soDigitos(digitado)) === input.value;
  const noFim = () => input.selectionStart === input.value.length && input.selectionEnd === input.value.length;

  input.addEventListener('beforeinput', (e) => {
    if (ehFormula(input.value)) return; // já é conta: sem máscara nem limite de dígitos
    if (!coerente()) digitado = input.value;
    const dado = e.data || '';
    const temSinal = dado === '=' || [...dado].some((c) => OPERADORES.includes(c));
    if (e.inputType === 'insertText' && temSinal) {
      if (!noFim()) return; // sinal no meio do número: entra como está e o campo vira conta
      e.preventDefault();
      input.maxLength = TAMANHO_FORMULA;
      input.value = (dado.startsWith('=') ? '' : digitado) + dado;
      input.dispatchEvent(new Event('input', { bubbles: true }));
      return;
    }
    // bloqueia novos dígitos quando o limite já foi atingido (a não ser que haja texto selecionado)
    const temSelecao = input.selectionStart !== input.selectionEnd;
    const atuais = soDigitos(input.value).length;
    if (e.inputType?.startsWith('insert') && !temSelecao && /\d/.test(dado) && atuais >= DIGITOS_VALOR) {
      e.preventDefault();
      mostrarAviso(true);
      return;
    }
    if (e.inputType === 'insertText' && /^[\d,]$/.test(dado) && noFim()) digitado += dado;
    else if (e.inputType === 'deleteContentBackward' && noFim()) digitado = digitado.slice(0, -1);
    else digitado = null;
  });
  input.addEventListener('input', (e) => {
    if (ehFormula(input.value)) {
      input.maxLength = TAMANHO_FORMULA;
      mostrar(aviso, '');
      const { valor } = tentarFormula(input.value);
      mostrar(conta, valor !== undefined ? `= ${brl(valor)}` : 'Conta: use + - * / (ou x). Ex.: 3*4,50');
      return;
    }
    if (e.isTrusted) mostrar(conta, ''); // a pessoa voltou a digitar um número comum
    input.maxLength = TAMANHO_NUMERO;
    const digitos = input.value.replace(/\D/g, '').replace(/^0+/, '');
    mostrarAviso(digitos.length > DIGITOS_VALOR);
    input.value = formatar(digitos.slice(0, DIGITOS_VALOR));
  });
  // Enter com fórmula: faz a conta antes; se ela tiver erro, não envia o formulário
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && ehFormula(input.value) && !resolverFormula()) e.preventDefault();
  });
  input.addEventListener('blur', () => {
    if (ehFormula(input.value)) resolverFormula();
    else mostrarAviso(false);
  });
}

// ---------- Mensagens de erro ao lado do campo (leitores de tela também anunciam)
export function erroNoCampo(form, nome, mensagem) {
  const campo = form.elements[nome];
  if (!campo) return;
  const idErro = `erro-${nome}`;
  form.querySelector(`#${idErro}`)?.remove();
  if (!mensagem) {
    campo.removeAttribute('aria-invalid');
    return;
  }
  campo.setAttribute('aria-invalid', 'true');
  campo.setAttribute('aria-describedby', [campo.getAttribute('aria-describedby'), idErro].filter(Boolean).join(' '));
  const p = document.createElement('p');
  p.id = idErro;
  p.className = 'erro-campo';
  p.textContent = mensagem;
  (campo.closest('[data-campo]') || campo.parentElement).append(p);
}
export const limparErros = (form) => {
  form.querySelectorAll('.erro-campo').forEach((p) => p.remove());
  form.querySelectorAll('[aria-invalid]').forEach((c) => c.removeAttribute('aria-invalid'));
};

export const esqueleto = (linhas = 3) => `
  <div class="grid gap-4 lg:grid-cols-2" aria-hidden="true">
    ${Array.from({ length: linhas }, () => '<div class="esqueleto h-40"></div>').join('')}
  </div><p class="sr-only" role="status">Carregando…</p>`;

export const estadoVazio = (titulo, texto, acaoHTML = '') => `
  <div class="flex flex-col items-center gap-2 px-4 py-8 text-center">
    <p class="font-semibold">${titulo}</p>
    <p class="max-w-sm text-sm text-stone-600 dark:text-stone-400">${texto}</p>
    ${acaoHTML ? `<div class="mt-2">${acaoHTML}</div>` : ''}
  </div>`;

/**
 * Evita salvar duas vezes com clique duplo (ou Enter repetido): enquanto o envio anterior
 * não termina, os próximos são ignorados.
 */
export function semRepetir(fn) {
  let ocupado = false;
  return async function (e) {
    if (ocupado) {
      e?.preventDefault?.();
      return undefined;
    }
    ocupado = true;
    try {
      return await fn.call(this, e);
    } finally {
      ocupado = false;
    }
  };
}
