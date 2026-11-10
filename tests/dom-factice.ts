// DOM factice, juste ce que les vues du Chrono et de Toucher touchent (creer, hidden,
// textContent, dataset, clics, sélecteurs simples) : l'environnement des
// tests est node, sans jsdom. installerDom() pose document, window,
// getComputedStyle et requestAnimationFrame (à retirer par vi.unstubAllGlobals).
import { vi } from 'vitest';

type Enfant = El | Texte;

class Texte {
  parent: El | null = null;
  constructor(public data: string) {}
  get textContent(): string {
    return this.data;
  }
}

const camel = (s: string) => s.replace(/-([a-z])/g, (_, c: string) => c.toUpperCase());

export class El {
  parent: El | null = null;
  enfants: Enfant[] = [];
  attrs = new Map<string, string>();
  dataset: Record<string, string> = {};
  style: Record<string, string> = {};
  hidden = false;
  disabled = false;
  value = '';
  className = '';
  private ecouteurs = new Map<string, ((ev: unknown) => void)[]>();
  readonly classList = {
    contains: (c: string) => this.className.split(/\s+/).includes(c),
    add: (c: string) => {
      if (!this.classList.contains(c)) this.className = `${this.className} ${c}`.trim();
    },
    remove: (c: string) => {
      this.className = this.className
        .split(/\s+/)
        .filter((x) => x && x !== c)
        .join(' ');
    },
    toggle: (c: string, force?: boolean) => {
      const oui = force ?? !this.classList.contains(c);
      if (oui) this.classList.add(c);
      else this.classList.remove(c);
      return oui;
    },
  };

  constructor(readonly tagName: string) {}

  get id(): string {
    return this.attrs.get('id') ?? '';
  }
  set id(v: string) {
    this.setAttribute('id', v);
  }
  setAttribute(k: string, v: string): void {
    this.attrs.set(k, v);
    if (k.startsWith('data-')) this.dataset[camel(k.slice(5))] = v;
  }
  getAttribute(k: string): string | null {
    return this.attrs.get(k) ?? null;
  }
  removeAttribute(k: string): void {
    this.attrs.delete(k);
    if (k.startsWith('data-')) delete this.dataset[camel(k.slice(5))];
  }
  append(...n: (Enfant | string)[]): void {
    for (const x of n) {
      const e = typeof x === 'string' ? new Texte(x) : x;
      e.parent = this;
      this.enfants.push(e);
    }
  }
  after(e: El): void {
    this.parent?.append(e);
  }
  remove(): void {
    if (this.parent) this.parent.enfants = this.parent.enfants.filter((e) => e !== this);
    this.parent = null;
  }
  replaceChildren(...n: (Enfant | string)[]): void {
    this.enfants = [];
    this.append(...n);
  }
  get textContent(): string {
    return this.enfants.map((e) => e.textContent).join('');
  }
  set textContent(v: string) {
    this.replaceChildren(...(v ? [v] : []));
  }
  /** Texte visible : sans les éléments cachés (hidden), comme innerText. */
  get innerText(): string {
    return this.hidden ? '' : this.enfants.map((e) => (e instanceof El ? e.innerText : e.data)).join('');
  }
  addEventListener(type: string, f: (ev: unknown) => void): void {
    this.ecouteurs.set(type, [...(this.ecouteurs.get(type) ?? []), f]);
  }
  removeEventListener(type: string, f: (ev: unknown) => void): void {
    this.ecouteurs.set(
      type,
      (this.ecouteurs.get(type) ?? []).filter((g) => g !== f),
    );
  }
  emettre(type: string, ev: unknown = {}): void {
    for (const f of this.ecouteurs.get(type) ?? []) f(ev);
  }
  click(): void {
    if (!this.disabled) this.emettre('click');
  }
  /** Le focus : document.activeElement (écran de connexion). */
  focus(): void {
    (globalThis as unknown as { document: { activeElement?: El } }).document.activeElement = this;
  }
  getBoundingClientRect() {
    return { x: 0, y: 0, width: 0, height: 0, top: 0, left: 0, right: 0, bottom: 0 };
  }
  /** Descendants, dans l'ordre du document. */
  private *descendants(): Generator<El> {
    for (const e of this.enfants)
      if (e instanceof El) {
        yield e;
        yield* e.descendants();
      }
  }
  private correspond(sel: string): boolean {
    const m = /^([a-z0-9]+)?(?:#([\w-]+))?((?:\.[\w-]+)*)(?:\[([\w-]+)(?:="([^"]*)")?\])?$/i.exec(sel);
    if (!m) throw new Error(`sélecteur non pris en charge : ${sel}`);
    const [, tag, id, classes, attr, val] = m;
    if (tag && this.tagName !== tag.toLowerCase()) return false;
    if (id && this.id !== id) return false;
    for (const c of (classes ?? '').split('.').filter(Boolean)) if (!this.classList.contains(c)) return false;
    // [attr] : l'attribut présent ; [attr="v"] : de cette valeur.
    if (attr && (val === undefined ? this.getAttribute(attr) === null : this.getAttribute(attr) !== val)) return false;
    return true;
  }
  /** Sélecteurs simples, éventuellement descendants (« #a .b », « button[data-mode] »). */
  querySelectorAll(sel: string): El[] {
    const parts = sel.match(/(?:[^\s[]+|\[[^\]]*\])+/g) ?? [];
    let courants: El[] = [this];
    for (const p of parts) courants = [...new Set(courants.flatMap((c) => [...c.descendants()].filter((d) => d.correspond(p))))];
    return courants;
  }
  querySelector(sel: string): El | null {
    return this.querySelectorAll(sel)[0] ?? null;
  }
}

/** Pose un DOM factice ; rend son body. Avec vi.useFakeTimers, poser les minuteries avant. */
export function installerDom(): El {
  const body = new El('body');
  // Le document écoute comme un élément (keydown des boutons de zoom) : emettre() sur document.
  const doc = new El('#document');
  vi.stubGlobal(
    'document',
    Object.assign(doc, {
      createElement: (t: string) => new El(t.toLowerCase()),
      createElementNS: (_ns: string, t: string) => new El(t),
      body,
    }),
  );
  vi.stubGlobal('window', globalThis);
  vi.stubGlobal('getComputedStyle', () => ({ transform: 'none' }));
  vi.stubGlobal('requestAnimationFrame', (f: (t: number) => void) => setTimeout(() => f(performance.now()), 16));
  return body;
}

/** Un localStorage en mémoire. */
export function installerStockage(): Map<string, string> {
  const m = new Map<string, string>();
  vi.stubGlobal('localStorage', {
    getItem: (k: string) => m.get(k) ?? null,
    setItem: (k: string, v: string) => void m.set(k, v),
    removeItem: (k: string) => void m.delete(k),
  });
  return m;
}
