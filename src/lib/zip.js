// Monta um arquivo .zip simples (sem compressão). É o formato por dentro da planilha .xlsx.
// Feito à mão para o sistema continuar funcionando sem internet e sem bibliotecas extras.

const TABELA_CRC = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

export function crc32(bytes) {
  let c = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) c = TABELA_CRC[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

/**
 * @param {{nome: string, conteudo: string|Uint8Array}[]} arquivos
 * @returns {Uint8Array}
 */
export function criarZip(arquivos) {
  const cod = new TextEncoder();
  const agora = new Date();
  const hora = (agora.getHours() << 11) | (agora.getMinutes() << 5) | (agora.getSeconds() >> 1);
  const data = ((agora.getFullYear() - 1980) << 9) | ((agora.getMonth() + 1) << 5) | agora.getDate();

  const partes = [];
  const central = [];
  let posicao = 0;

  for (const arq of arquivos) {
    const nome = cod.encode(arq.nome);
    const dados = typeof arq.conteudo === 'string' ? cod.encode(arq.conteudo) : arq.conteudo;
    const crc = crc32(dados);

    const local = new DataView(new ArrayBuffer(30));
    local.setUint32(0, 0x04034b50, true);
    local.setUint16(4, 20, true);
    local.setUint16(6, 0x0800, true); // nomes em UTF-8
    local.setUint16(8, 0, true); // sem compressão
    local.setUint16(10, hora, true);
    local.setUint16(12, data, true);
    local.setUint32(14, crc, true);
    local.setUint32(18, dados.length, true);
    local.setUint32(22, dados.length, true);
    local.setUint16(26, nome.length, true);
    local.setUint16(28, 0, true);

    const cab = new DataView(new ArrayBuffer(46));
    cab.setUint32(0, 0x02014b50, true);
    cab.setUint16(4, 20, true);
    cab.setUint16(6, 20, true);
    cab.setUint16(8, 0x0800, true);
    cab.setUint16(10, 0, true);
    cab.setUint16(12, hora, true);
    cab.setUint16(14, data, true);
    cab.setUint32(16, crc, true);
    cab.setUint32(20, dados.length, true);
    cab.setUint32(24, dados.length, true);
    cab.setUint16(28, nome.length, true);
    cab.setUint32(42, posicao, true);

    partes.push(new Uint8Array(local.buffer), nome, dados);
    central.push(new Uint8Array(cab.buffer), nome);
    posicao += 30 + nome.length + dados.length;
  }

  const tamanhoCentral = central.reduce((s, p) => s + p.length, 0);
  const fim = new DataView(new ArrayBuffer(22));
  fim.setUint32(0, 0x06054b50, true);
  fim.setUint16(8, arquivos.length, true);
  fim.setUint16(10, arquivos.length, true);
  fim.setUint32(12, tamanhoCentral, true);
  fim.setUint32(16, posicao, true);

  const tudo = [...partes, ...central, new Uint8Array(fim.buffer)];
  const saida = new Uint8Array(tudo.reduce((s, p) => s + p.length, 0));
  let i = 0;
  for (const p of tudo) { saida.set(p, i); i += p.length; }
  return saida;
}
