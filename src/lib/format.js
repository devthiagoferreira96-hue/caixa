// Funções pequenas de formatação de dinheiro e datas (padrão brasileiro)

// Espaço comum entre "R$" e o número: em telas estreitas o "R$" pode ir para uma linha
// e o número para a outra, mas o número nunca é cortado no meio (ver .tabular-nums no CSS).
export const brl = (v) =>
  Number(v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }).replace(/\u00a0/g, ' ');

/** Versão curta para espaços apertados: R$ 4,2 mi (a partir de 1 milhão). Use com o valor completo em title. */
export const brlCurto = (v) =>
  Math.abs(Number(v || 0)) >= 1_000_000
    ? Number(v).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', notation: 'compact', maximumFractionDigits: 1 }).replace(/\u00a0/g, ' ')
    : brl(v);

// Sempre use esc() ao colocar texto digitado pelo usuário dentro de HTML
export const esc = (s) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

const pad = (n) => String(n).padStart(2, '0');

export const toISO = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const parseISO = (s) => {
  const [y, m, d] = String(s).slice(0, 10).split('-').map(Number);
  return new Date(y, m - 1, d || 1);
};
export const hoje = () => {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
};
export const hojeISO = () => toISO(hoje());
export const somarDias = (n) => {
  const d = hoje();
  d.setDate(d.getDate() + n);
  return toISO(d);
};

export const inicioMes = (d, n = 0) => new Date(d.getFullYear(), d.getMonth() + n, 1);
export const mesISO = (d, n = 0) => toISO(inicioMes(d, n));

const maiuscula = (t) => t.charAt(0).toUpperCase() + t.slice(1);
export const nomeMes = (d) => maiuscula(d.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' }));
export const nomeMesCurto = (d) => maiuscula(d.toLocaleDateString('pt-BR', { month: 'short' }).replace('.', ''));
export const diaMes = (s) => {
  const d = parseISO(s);
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}`;
};
export const dataCompleta = (s) => parseISO(s).toLocaleDateString('pt-BR');
export const dataPorExtenso = (s) =>
  maiuscula(parseISO(s).toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' }));

// Soma meses mantendo o dia (31/01 + 1 mês = 28/02)
export const somarMeses = (s, n) => {
  const d = parseISO(s);
  const r = new Date(d.getFullYear(), d.getMonth() + n, 1);
  const ultimo = new Date(r.getFullYear(), r.getMonth() + 1, 0).getDate();
  r.setDate(Math.min(d.getDate(), ultimo));
  return toISO(r);
};

export const diasAte = (s) => Math.round((parseISO(s) - hoje()) / 86400000);
export const quandoVence = (s) => {
  const n = diasAte(s);
  if (n === 0) return 'vence hoje';
  if (n === 1) return 'vence amanhã';
  if (n === -1) return 'venceu ontem';
  if (n < 0) return `venceu há ${-n} dias`;
  return `vence em ${n} dias`;
};

// "1.234,56" -> 1234.56
export const lerValor = (s) => {
  let t = String(s ?? '').replace(/[R$\s]/g, '');
  if (!t) return NaN;
  if (t.includes(',')) t = t.replace(/\./g, '').replace(',', '.');
  return Math.round(parseFloat(t) * 100) / 100;
};
export const valorParaCampo = (v) =>
  v ? Number(v).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '';

// ---------- Limite dos campos de valor em R$
export const DIGITOS_VALOR = 10; // até 10 dígitos: R$ 99.999.999,99
export const VALOR_MAXIMO = 99_999_999.99;
export const valorMaximoTexto = () => brl(VALOR_MAXIMO);

export const porcentagem = (v) => `${v.toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%`;
