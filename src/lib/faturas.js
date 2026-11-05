// Regras de fatura de cartão de crédito
import { parseISO, toISO } from './format.js';

/**
 * Em qual fatura cai uma compra? Retorna o 1º dia do mês em que a fatura VENCE.
 * Ex.: cartão fecha dia 3 e vence dia 10. Compra em 02/11 -> fatura de novembro.
 *      Compra em 04/11 (depois do fechamento) -> fatura de dezembro.
 * `parcela` = 0 para a 1ª parcela, 1 para a 2ª, e assim por diante.
 */
export function faturaDe(cartao, dataCompra, parcela = 0) {
  const d = parseISO(dataCompra);
  let mes = d.getMonth() + (d.getDate() >= cartao.dia_fechamento ? 1 : 0);
  // Quando o vencimento é "antes" do fechamento (ex.: fecha 25, vence 5), a fatura vence no mês seguinte
  if (cartao.dia_vencimento <= cartao.dia_fechamento) mes += 1;
  return toISO(new Date(d.getFullYear(), mes + parcela, 1));
}

/** Data de vencimento de uma fatura (respeitando meses com menos dias) */
export function vencimentoFatura(cartao, faturaMes) {
  const d = parseISO(faturaMes);
  const ultimoDia = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
  return toISO(new Date(d.getFullYear(), d.getMonth(), Math.min(cartao.dia_vencimento, ultimoDia)));
}

/** Divide um valor em parcelas; os centavos que sobram vão para a última */
export function dividirParcelas(total, n) {
  const base = Math.floor((total / n) * 100) / 100;
  return Array.from({ length: n }, (_, i) =>
    i === n - 1 ? Math.round((total - base * (n - 1)) * 100) / 100 : base,
  );
}
