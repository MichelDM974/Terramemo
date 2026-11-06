// uuid v4 des événements, des séances et de l'appareil (src/srs/journal.ts).
// crypto.randomUUID n'existe qu'en contexte sûr (https, localhost) : le site
// ouvert en http sur le réseau local (vite --host) passe par getRandomValues,
// qui existe partout.

/** Un uuid v4 en minuscules (36 caractères). */
export function uuid(): string {
  if (typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  const o = crypto.getRandomValues(new Uint8Array(16));
  o[6] = (o[6]! & 0x0f) | 0x40; // version 4
  o[8] = (o[8]! & 0x3f) | 0x80; // variante RFC 4122
  const h = Array.from(o, (x) => x.toString(16).padStart(2, '0')).join('');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

/** Forme d'un uuid (toute version), minuscules ou majuscules. */
export const estUuid = (x: unknown): x is string =>
  typeof x === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(x);
