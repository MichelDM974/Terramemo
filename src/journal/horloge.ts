// Horloge réelle de l'appareil pour src/srs/ (pur : il la reçoit injectée,
// src/srs/jour.ts) : l'instant et le décalage local à cet instant, à l'est
// positif, stockés dans chaque événement.

import type { Horloge } from '../srs/jour';

export const horlogeAppareil: Horloge = () => {
  const d = new Date();
  // 0 - … : jamais -0 (UTC), et des minutes entières.
  return { ts: d.getTime(), tz: 0 - Math.round(d.getTimezoneOffset()) };
};
