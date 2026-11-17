// Telas do módulo Resina (registradas no roteador junto com as do Caixa)
import producao from './producao.js';
import cargas from './cargas.js';
import carga from './carga.js';
import cadastros from './cadastros.js';
import contaCorrente from './conta-corrente.js';
import insumos from './insumos.js';

export const TELAS_RESINA = { resina: producao, cargas, carga, 'resina-cadastros': cadastros, 'conta-corrente': contaCorrente, insumos };
