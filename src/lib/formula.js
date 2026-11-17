// Fórmulas no campo de valor, como no Excel: "3*4,50" ou "3x4,50+2" vira 15,50.
// Aceita + - * / (também x, X, × e ÷), parênteses e números no formato brasileiro (1.234,56).
// O "=" na frente é opcional. Não usa eval: a conta é feita por um analisador próprio.

/** Sinais que transformam o texto em conta */
export const OPERADORES = '+-−*/xX×÷()';

/** true se o texto é uma conta (tem algum sinal de operação ou começa com "=") */
export const ehFormula = (texto) => {
  const t = String(texto ?? '');
  return /^\s*=/.test(t) || [...t].some((c) => OPERADORES.includes(c));
};

/** Converte um número digitado em pt-BR. "4,50" → 4.5; "1.234,56" → 1234.56; "1.500" → 1500; "4.5" → 4.5 */
function numeroBR(t) {
  // formatos aceitos: 1234 | 1234,5 | 1.234,56 | 4.5 | ,50
  if (!/^(\d+|\d{1,3}(\.\d{3})+)?(,\d*)?$/.test(t) && !/^\d*\.\d+$/.test(t)) return NaN;
  if (t.includes(','))return parseFloat(t.replace(/\./g, '').replace(',', '.'));
  if (/^\d{1,3}(\.\d{3})+$/.test(t)) return parseFloat(t.replace(/\./g, '')); // ponto de milhar
  return parseFloat(t);
}

function separar(expr) {
  const tokens = [];
  let i = 0;
  while (i < expr.length) {
    const c = expr[i];
    if (/\s/.test(c)) { i++; continue; }
    if (/[\d.,]/.test(c)) {
      let j = i;
      while (j < expr.length && /[\d.,]/.test(expr[j])) j++;
      const texto = expr.slice(i, j);
      const n = numeroBR(texto);
      if (!/\d/.test(texto) || Number.isNaN(n)) throw new Error(`Número inválido: "${texto}"`);
      tokens.push({ tipo: 'num', valor: n });
      i = j;
      continue;
    }
    const op = { '+': '+', '-': '-', '−': '-', '*': '*', x: '*', X: '*', '×': '*', '/': '/', '÷': '/', '(': '(', ')': ')' }[c];
    if (!op) throw new Error(`Símbolo não aceito: "${c}"`);
    tokens.push({ tipo: 'op', valor: op });
    i++;
  }
  return tokens;
}

/**
 * Calcula a fórmula (com ou sem o "=" inicial). Retorna o número arredondado em centavos.
 * Lança Error com mensagem em português se a conta estiver incompleta ou inválida.
 */
export function calcularFormula(texto) {
  const expr = String(texto ?? '').trim().replace(/^=/, '');
  if (!expr.trim()) throw new Error('Digite a conta. Ex.: 3*4,50');
  const tokens = separar(expr);
  let pos = 0;
  const ver = () => tokens[pos];
  const pegarOp = (...ops) => (ver()?.tipo === 'op' && ops.includes(ver().valor) ? tokens[pos++].valor : null);

  const fator = () => {
    if (pegarOp('-')) return -fator();
    if (pegarOp('+')) return fator();
    if (pegarOp('(')) {
      const v = soma();
      if (!pegarOp(')')) throw new Error('Falta fechar o parêntese ")".');
      return v;
    }
    const t = tokens[pos++];
    if (t?.tipo !== 'num') throw new Error('Está incompleta: falta um número depois do sinal.');
    return t.valor;
  };
  const produto = () => {
    let v = fator();
    for (let op; (op = pegarOp('*', '/'));) {
      const d = fator();
      if (op === '/' && d === 0) throw new Error('Não dá para dividir por zero.');
      v = op === '*' ? v * d : v / d;
    }
    return v;
  };
  const soma = () => {
    let v = produto();
    for (let op; (op = pegarOp('+', '-'));) v = op === '+' ? v + produto() : v - produto();
    return v;
  };

  const resultado = soma();
  if (pos < tokens.length) throw new Error(ver().valor === ')' ? 'Tem um ")" sobrando.' : 'Falta um sinal (+ - * /) entre os números.');
  if (!Number.isFinite(resultado)) throw new Error('Conta inválida.');
  return Math.round(resultado * 100) / 100;
}

/** Versão que não lança erro: { valor } ou { erro } */
export function tentarFormula(texto) {
  try {
    return { valor: calcularFormula(texto) };
  } catch (e) {
    return { erro: e.message };
  }
}
