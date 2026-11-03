// Panneau des dernières mesures (⚙ → « Afficher les mesures ») et « Copier le rapport ».
import type { Mesures } from './mesures';

const ms = (v: number | null | undefined) => (v == null ? '—' : `${Math.round(v)}`);

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
        ? `Geste ${g.type} : ${g.stats.images} images, méd. ${g.stats.mediane_ms} · p95 ${g.stats.p95_ms} · max ${g.stats.max_ms} ms, ${g.stats.perdues} perdue(s) · longues ${g.longues_images.nombre} · fin ${ms(g.fin.script_ms)}/${ms(g.fin.image_ms)} ms`
        : 'Geste : —',
      t
        ? `Toucher ${t.pick ? `${t.pick.id} (${t.pick.via})` : 'mer'} : script ${t.traitement_ms} · rAF ${ms(t.latence_raf_ms)} · peint ${ms(t.latence_peinte_ms)} · Event Timing ${t.event_timing ? ms(t.event_timing.duree_ms) : '< 16'} ms`
        : 'Toucher : —',
    ];
    lignes.replaceChildren(...texte.map((l) => Object.assign(document.createElement('div'), { textContent: l })));
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
