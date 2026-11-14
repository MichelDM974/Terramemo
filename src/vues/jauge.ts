// La jauge du temps d'une question (étude J2 § 9.3, sortie de vues/chrono.ts
// pour le quiz) : une barre qui part pleine et se vide en ligne droite pendant
// le délai de la question, et les secondes qui restent à côté (« 12 s »,
// relues toutes les 200 ms). La transition CSS fait le mouvement ; figée à la
// réponse, la barre garde où elle en était pendant la rétroaction. Les
// classes (.chrono-temps, .chrono-jauge, .chrono-jauge-reste,
// .chrono-secondes : carte.css) et le texte des secondes sont ceux du Chrono,
// que tests et pilote lisent.
import { creer } from './commun';

/** Les secondes affichées : arrondies au-dessus (« 15 s » au départ, « 1 s » jusqu'à la fin), espace insécable. */
export const texteSecondes = (ms: number): string => `${Math.ceil(Math.max(0, ms) / 1000)} s`;

export interface Jauge {
  /** La ligne de la jauge et des secondes, à mettre dans la barre. */
  readonly el: HTMLElement;
  /** La question ouverte : la barre part pleine et se vide en `ms`, les secondes comptent à rebours depuis `debut` (performance.now()). */
  partir(ms: number, debut?: number): void;
  /** Pleine et immobile, `ms` affichées : la question attend (une image pas encore là). */
  pleine(ms: number): void;
  /** La réponse donnée : la barre s'arrête où elle en est, les secondes aussi. */
  figer(): void;
  /** Le délai écoulé : « 0 s », la barre arrêtée. */
  vide(): void;
  /** Plus de rafraîchissement des secondes (la partie s'arrête). */
  arreter(): void;
}

export function creerJauge(): Jauge {
  const reste = creer('span', { class: 'chrono-jauge-reste' });
  const secondes = creer('span', { class: 'chrono-secondes' });
  const el = creer('div', { class: 'chrono-temps' }, creer('span', { class: 'chrono-jauge' }, reste), secondes);
  let affichage = 0;
  let debut = 0;
  let delai = 0;

  const afficher = () => {
    secondes.textContent = texteSecondes(delai - (performance.now() - debut));
  };
  const arreter = () => {
    clearInterval(affichage);
    affichage = 0;
  };

  return {
    el,
    partir(ms, d = performance.now()) {
      arreter();
      debut = d;
      delai = ms;
      reste.style.transition = 'none';
      reste.style.transform = 'scaleX(1)';
      reste.getBoundingClientRect(); // l'état de départ s'applique avant la transition
      reste.style.transition = `transform ${ms}ms linear`;
      reste.style.transform = 'scaleX(0)';
      afficher();
      affichage = window.setInterval(afficher, 200);
    },
    pleine(ms) {
      arreter();
      reste.style.transition = 'none';
      reste.style.transform = 'scaleX(1)';
      secondes.textContent = texteSecondes(ms);
    },
    figer() {
      arreter();
      const t = getComputedStyle(reste).transform;
      reste.style.transition = 'none';
      reste.style.transform = t === 'none' ? '' : t;
    },
    vide() {
      arreter();
      secondes.textContent = texteSecondes(0);
    },
    arreter,
  };
}
