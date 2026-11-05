// Guarda dados no aparelho usando o IndexedDB do navegador (aguenta muito mais que o localStorage
// e continua lá depois de fechar o navegador).
const NOME = 'caixa-familia';
let conexao;

function abrir() {
  conexao ||= new Promise((resolver, rejeitar) => {
    const pedido = indexedDB.open(NOME, 1);
    pedido.onupgradeneeded = () => pedido.result.createObjectStore('chaves');
    pedido.onsuccess = () => resolver(pedido.result);
    pedido.onerror = () => rejeitar(pedido.error);
  });
  return conexao;
}

async function transacao(modo, fn) {
  const db = await abrir();
  return new Promise((resolver, rejeitar) => {
    const tx = db.transaction('chaves', modo);
    const pedido = fn(tx.objectStore('chaves'));
    tx.oncomplete = () => resolver(pedido?.result);
    tx.onerror = () => rejeitar(tx.error);
  });
}

export const ler = (chave) => transacao('readonly', (s) => s.get(chave));
export const gravar = (chave, valor) => transacao('readwrite', (s) => s.put(valor, chave));
export const apagar = (chave) => transacao('readwrite', (s) => s.delete(chave));
