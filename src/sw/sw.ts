// Le service worker du site (#22), servi en /sw.js : src/sw/logique.ts
// branché sur ses événements. Construit par le plugin de vite.config.ts
// (src/sw/construction.ts), en un seul fichier sans import ni export (un
// script classique, que tout navigateur accepte), son manifeste injecté
// après coup à la place de MARQUEUR. Rien ici n'est partagé avec la page :
// un module commun ferait de sw.js un module ES qui en importe un autre.
import { activer, aiguiller, installer, MESSAGE_ACTIVER, MESSAGE_CHARGES, releveAccordee, repondre, retenir, type Manifeste, type Moteur } from './logique';

// Remplacé au build par le manifeste en JSON (construction.ts, injecterManifeste).
const manifeste = JSON.parse('__TERRAMEMO_MANIFESTE_SW__') as Manifeste;

/** Ce que ce fichier utilise de ServiceWorkerGlobalScope (la bibliothèque WebWorker n'est pas dans tsconfig, qui a DOM). */
interface EvenementDuree extends Event {
  waitUntil(tache: Promise<unknown>): void;
}
interface EvenementRequete extends EvenementDuree {
  request: Request;
  respondWith(r: Promise<Response>): void;
}
interface EvenementMessage extends EvenementDuree {
  data: unknown;
}
interface PorteeSw {
  location: Location;
  registration: { installing: unknown; waiting: unknown };
  skipWaiting(): Promise<void>;
  clients: { claim(): Promise<void>; matchAll(o: { type: 'window'; includeUncontrolled: boolean }): Promise<readonly unknown[]> };
  addEventListener(type: 'install' | 'activate', f: (e: EvenementDuree) => void): void;
  addEventListener(type: 'fetch', f: (e: EvenementRequete) => void): void;
  addEventListener(type: 'message', f: (e: EvenementMessage) => void): void;
}

const portee = self as unknown as PorteeSw;
const mo: Moteur = {
  caches,
  fetch: (r, i) => fetch(r, i),
  manifeste,
  origine: portee.location.origin,
  etat: {},
  nouvelleVersion: () => !!(portee.registration.installing ?? portee.registration.waiting),
};

portee.addEventListener('install', (e) => e.waitUntil(installer(mo)));

// Première version : elle prend aussi la page de la première visite (claim),
// pour ranger ce qu'elle charge à la demande. Relève d'une version : la page
// qui l'a demandée se recharge (src/sw/enregistrer.ts).
portee.addEventListener('activate', (e) => e.waitUntil(activer(mo).then(() => portee.clients.claim())));

portee.addEventListener('fetch', (e) => {
  const a = aiguiller(e.request, mo.origine, manifeste);
  if (a.strategie === 'hors-sw') return;
  e.respondWith(repondre(mo, e.request, a, (t) => e.waitUntil(t)));
});

portee.addEventListener('message', (e) => {
  const m = e.data as { type?: unknown; urls?: unknown } | null;
  if (m?.type === MESSAGE_ACTIVER) {
    e.waitUntil(
      portee.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((f) => (releveAccordee(f.length) ? portee.skipWaiting() : undefined)),
    );
  } else if (m?.type === MESSAGE_CHARGES && Array.isArray(m.urls)) {
    e.waitUntil(retenir(mo, m.urls.filter((u): u is string => typeof u === 'string')));
  }
});
