// Service worker: deixa o app instalável e abrindo mesmo sem internet.
// Ao publicar uma nova versão, aumente o número abaixo.
const VERSAO = 'lar-em-dia-v0.1.0';
const ARQUIVOS = ['./', 'index.html', 'css/style.css', 'js/app.js', 'js/store.js', 'js/util.js', 'js/dominio.js', 'js/firebase-config.js', 'manifest.webmanifest', 'icons/icon.svg'];

self.addEventListener('install', e => { e.waitUntil(caches.open(VERSAO).then(c => c.addAll(ARQUIVOS))); self.skipWaiting(); });
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== VERSAO).map(k => caches.delete(k)))));
  self.clients.claim();
});
// Rede primeiro (pega sempre a versão nova); se estiver offline, usa o cache
self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin) return;
  e.respondWith(fetch(e.request).then(r => {
    const copia = r.clone(); caches.open(VERSAO).then(c => c.put(e.request, copia)); return r;
  }).catch(() => caches.match(e.request).then(r => r || caches.match('index.html'))));
});
self.addEventListener('notificationclick', e => {
  e.notification.close();
  e.waitUntil(self.clients.matchAll({ type: 'window' }).then(cs => cs.length ? cs[0].focus() : self.clients.openWindow('./#painel')));
});
