// Panneau des dernières mesures (⚙ → « Afficher les mesures ») et « Copier le rapport ».
import type { Mesures } from './mesures';
import type { Geste, Toucher } from './rapport';
import { acoupsParSeconde, sansSaccade, SEUIL_120_MS, SEUIL_ACOUP_MS, SEUIL_GEL_MS } from './stats';

const ms = (v: number | null | undefined) => (v == null ? '—' : `${Math.round(v)}`);

/** Event Timing d'un toucher : « < 16 » seulement sous le seuil de l'API. */
const etEtat = (t: Toucher) =>
  t.event_timing_etat === 'mesure' ? ms(t.event_timing?.duree_ms) : t.event_timing_etat === 'sous_seuil' ? '< 16' : 'indisponible';

const hz = (periode: number | null) => (periode ? `${Math.round(1000 / periode)} Hz` : '—');

/** Event Timing d'une fin de geste, et la marque d'une entrée close par l'entrée suivante. */
const etFin = (g: Geste) =>
  g.fin.event_timing_etat === 'sous_seuil'
    ? '< 16 ms'
    : g.fin.event_timing_etat === 'en_attente'
      ? 'en attente'
      : `${ms(g.fin.event_timing_ms)} ms${g.fin.close_par_entree_suivante ? ' (close par l’entrée suivante)' : ''}`;

const pct = (part: number) => `${Math.round(part * 100)} %`;

const parS = (v: number) => `${v.toFixed(1).replace('.', ',')}/s`;

/**
 * À-coups d'un geste (≥ 21 ms, par seconde de geste), gels (≥ 46 ms) et
 * « NON » si ce geste seul saccade (stats.saccade : un gel, ou plus de 3
 * à-coups par seconde avec au moins 2), puis la tenue des 120 i/s (sans
 * verdict) : période du geste, part des intervalles ≤ 12,5 ms, images par
 * seconde, et l'écart au repos s'il y en a un.
 */
function cadenceGeste(g: Geste): string {
  const s = g.stats;
  const acoups = `${s.acoups} à-coup(s) ≥ ${SEUIL_ACOUP_MS} ms (${parS(s.acoups_par_s)})${s.gels ? `, ${s.gels} gel(s) ≥ ${SEUIL_GEL_MS} ms` : ''}${s.saccade ? ' : NON, saccade' : ''}`;
  const periode = ` · période ${s.periode_geste_ms ?? s.periode_repos_ms} ms${s.bascule_images ? ` après ${s.bascule_images} à la période du repos` : ''}`;
  const tenue = ` · tenue 120 i/s ${pct(s.tenue_120)}, ${s.cadence_ips ?? '—'} i/s`;
  const ecart = s.ecart_sens
    ? ` (⚠ geste ${s.ecart_sens === 'plus_rapide' ? 'plus rapide' : 'plus lent'} que le repos : ${hz(s.periode_geste_ms)} contre ${hz(s.periode_repos_ms)})`
    : '';
  return acoups + periode + tenue + ecart;
}

/**
 * Verdict « pas de saccade » de chaque type de geste (sansSaccade, comme le
 * driver : moyenne par seconde sur ses gestes, ou un seul geste qui saccade).
 */
function verdictsTypes(gestes: readonly Geste[]): string {
  const types = [...new Set(gestes.map((g) => g.type))];
  return types
    .map((t) => {
      const s = gestes.filter((g) => g.type === t).map((g) => g.stats);
      const seuls = s.filter((x) => x.saccade).length;
      return `${t} ${sansSaccade(s) ? 'OK' : `NON${seuls ? ` (${seuls} geste(s) seul(s))` : ''}`}`;
    })
    .join(', ');
}

/** Tous les gestes : à-coups par seconde, verdict par type, tenue des 120 i/s, écarts de période, pire fin (Event Timing). */
function resumeGestes(gestes: readonly Geste[]): string {
  const acoups = gestes.reduce((a, g) => a + g.stats.acoups, 0);
  const duree = gestes.reduce((a, g) => a + g.stats.duree_ms, 0);
  const intervalles = gestes.reduce((a, g) => a + g.intervalles_ms.length, 0);
  const a120 = gestes.reduce((a, g) => a + g.intervalles_ms.filter((d) => d <= SEUIL_120_MS).length, 0);
  const rapides = gestes.filter((g) => g.stats.ecart_sens === 'plus_rapide').length;
  const lents = gestes.filter((g) => g.stats.ecart_sens === 'plus_lent').length;
  const ecarts = [rapides ? `${rapides} plus rapide(s)` : '', lents ? `${lents} plus lent(s)` : ''].filter(Boolean).join(', ');
  const fins = gestes.map((g) => g.fin.event_timing_ms).filter((v): v is number => v != null);
  const attente = gestes.filter((g) => g.fin.event_timing_etat === 'en_attente').length;
  return `${gestes.length} gestes : ${acoups} à-coups ≥ ${SEUIL_ACOUP_MS} ms (${parS(acoupsParSeconde(acoups, duree))}) · saccade : ${verdictsTypes(gestes)} · tenue 120 i/s ${intervalles ? pct(a120 / intervalles) : '—'}${ecarts ? ` · ⚠ ${ecarts} que le repos` : ''} · fin Event Timing max ${fins.length ? ms(Math.max(...fins)) : '—'} ms (${fins.length} mesurée(s)${attente ? `, ${attente} en attente` : ''})`;
}

async function copier(texte: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(texte);
    return true;
  } catch {
    // WebView ou origine sans presse-papiers asynchrone : ancien chemin.
    const zone = document.createElement('textarea');
    zone.value = texte;
    zone.setAttribute('readonly', '');
    zone.style.position = 'fixed';
    zone.style.opacity = '0';
    document.body.append(zone);
    zone.select();
    const ok = document.execCommand('copy');
    zone.remove();
    return ok;
  }
}

export function panneauMesures(zone: HTMLElement, mesures: Mesures): HTMLElement {
  const lignes = document.createElement('div');
  lignes.className = 'mesures-lignes';
  const bCopier = document.createElement('button');
  bCopier.type = 'button';
  bCopier.className = 'secondary';
  bCopier.id = 'mesures-copier';
  bCopier.textContent = 'Copier le rapport';
  const bVider = document.createElement('button');
  bVider.type = 'button';
  bVider.className = 'secondary';
  bVider.id = 'mesures-vider';
  bVider.textContent = 'Réinitialiser';
  const actions = document.createElement('div');
  actions.className = 'mesures-actions';
  actions.append(bCopier, bVider);
  const panneau = document.createElement('div');
  panneau.className = 'panneau-mesures';
  panneau.id = 'panneau-mesures';
  panneau.append(lignes, actions);
  zone.append(panneau);

  const maj = () => {
    if (panneau.hidden) return;
    const r = mesures.rapport();
    const c = r.chargement;
    const g = r.gestes.at(-1);
    const t = r.touchers.at(-1);
    const texte = [
      c
        ? `Chargement ${ms(c.total_ms)} ms (script ${ms(c.debut_script_ms)} · fichiers ${ms(c.etapes.telechargement_ms)} · analyse ${ms(c.etapes.analyse_ms)} · feature ${ms(c.etapes.feature_ms)} · tracés ${ms(c.etapes.chemins_ms)} · insertion ${ms(c.etapes.insertion_ms)} · peinture ${ms(c.etapes.peinture_ms)})`
        : 'Chargement…',
      `Écran ${r.ecran.hz ?? '—'} Hz (${r.ecran.periode_ms ?? '—'} ms) · rendu ${r.rendu} · ${r.projection} · ${r.gestes.length} geste(s), ${r.touchers.length} toucher(s)`,
      g
        ? `Geste ${g.type} k ${g.k_debut}→${g.k_fin} : ${g.stats.images} images, méd. ${g.stats.mediane_ms} · p95 ${g.stats.p95_ms} · max ${g.stats.max_ms} ms, ${cadenceGeste(g)} · longues ${g.longues_images.nombre}${g.dessin_ms ? ` · dessin méd. ${g.dessin_ms.mediane} · p95 ${g.dessin_ms.p95} · max ${g.dessin_ms.max} ms (${g.dessin_ms.images})` : ''} · fin : script ${ms(g.fin.script_ms)}, fil principal ${ms(g.fin.image_ms)}, Event Timing ${etFin(g)}`
        : 'Geste : —',
      r.gestes.length > 1 ? resumeGestes(r.gestes) : '',
      t
        ? `Toucher ${t.pick ? `${t.pick.id} (${t.pick.via})` : 'mer'} : script ${t.traitement_ms} · rAF ${ms(t.latence_raf_ms)} · fil principal ${ms(t.fin_fil_principal_ms)} · Event Timing ${etEtat(t)} ms`
        : 'Toucher : —',
    ];
    lignes.replaceChildren(...texte.filter(Boolean).map((l) => Object.assign(document.createElement('div'), { textContent: l })));
  };

  let prevu = 0;
  mesures.surChangement(() => {
    if (!prevu) prevu = window.setTimeout(() => ((prevu = 0), maj()), 250);
  });
  bCopier.addEventListener('click', async () => {
    const ok = await copier(JSON.stringify(mesures.rapport(), null, 1));
    bCopier.textContent = ok ? 'Copié' : 'Échec de la copie';
    window.setTimeout(() => (bCopier.textContent = 'Copier le rapport'), 1500);
  });
  bVider.addEventListener('click', () => mesures.reinitialiser());
  new MutationObserver(maj).observe(panneau, { attributes: true, attributeFilter: ['hidden'] });
  maj();
  return panneau;
}
