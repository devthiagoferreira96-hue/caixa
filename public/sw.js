// =====================================================================
// Service worker: guarda os arquivos do sistema no aparelho para que ele
// abra mesmo sem internet. Os DADOS não passam por aqui (ficam no IndexedDB
// e são enviados pelo src/lib/sync.js).
// Ao publicar uma versão nova, ela é baixada em segundo plano e usada na
// próxima vez que o sistema for aberto.
// =====================================================================
const CACHE = 'caixa-v1';
const BASICOS = ['./', './index.html', './manifest.webmanifest', './icon.svg', './icon-192.png', './icon-512.png'];

self.addEventListener('install', (e) => {
  self.skipWaiting();
  e.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    await cache.addAll(BASICOS);
    // guarda também o JS e o CSS gerados pelo Vite (os nomes mudam a cada versão)
    const html = await (await fetch('./index.html', { cache: 'no-store' })).text();
    const arquivos = [...html.matchAll(/(?:src|href)="([^"]+\.(?:js|css))"/g)]
      .map((m) => m[1])
      .filter((u) => !/^https?:/.test(u));
    await cache.addAll(arquivos);
  })());
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((nomes) => Promise.all(nomes.filter((n) => n !== CACHE).map((n) => caches.delete(n))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  const mesmoSite = url.origin === self.location.origin;
  const fonte = url.host.endsWith('fonts.googleapis.com') || url.host.endsWith('fonts.gstatic.com');
  if (!mesmoSite && !fonte) return; // Supabase e outros: sempre direto pela internet

  // Páginas: tenta a internet primeiro (pega a versão nova); sem internet, usa a guardada
  if (req.mode === 'navigate') {
    e.respondWith(
      fetch(req)
        .then((resp) => { guardar('./index.html', resp.clone()); return resp; })
        .catch(() => caches.match('./index.html')),
    );
    return;
  }

  // Arquivos (JS, CSS, imagens, fontes): usa o guardado e atualiza em segundo plano
  e.respondWith(
    caches.match(req).then((guardado) => {
      const daRede = fetch(req)
        .then((resp) => { if (resp.ok || resp.type === 'opaque') guardar(req, resp.clone()); return resp; })
        .catch(() => guardado || Response.error());
      return guardado || daRede;
    }),
  );
});

function guardar(chave, resposta) {
  caches.open(CACHE).then((c) => c.put(chave, resposta)).catch(() => {});
}
