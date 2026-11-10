// passimi.com — pasaportlarini gir, dunyayi dort renkte gor.
// Veri (vize matrisi, harita, adlar, metinler) data.js'te; uygulamanin kaynaklarindan uretilir
// (website/build.mjs). Kurallar uygulamadaki Seyahatler haritasiyla ayni:
//   turuncu = gittigin, fildisi / kum = gitmedigin · koyu ton = vize gerekli, acik ton = vizesiz*
// Her sey tarayicida kalir (localStorage); hicbir sunucuya veri gitmez.
import D from './data.js';

const $ = (s, root = document) => root.querySelector(s);
const el = (tag, cls, text) => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text != null) e.textContent = text;
  return e;
};
const sv = (tag, attrs = {}) => {
  const e = document.createElementNS('http://www.w3.org/2000/svg', tag);
  for (const k in attrs) e.setAttribute(k, attrs[k]);
  return e;
};
const ls = {
  get(k, d) { try { const v = localStorage.getItem('passimi.' + k); return v == null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { try { localStorage.setItem('passimi.' + k, JSON.stringify(v)); } catch { /* ozel pencere */ } },
};

// ------------------------------------------------------------------ durum
const idx = Object.fromEntries(D.codes.map((c, i) => [c, i]));
const TYPES = ['ordinary', 'special', 'service', 'diplomatic'];
let lang = ls.get('lang', null);
if (!D.langs.includes(lang)) {
  lang = (navigator.languages ?? [navigator.language ?? 'en']).map((l) => l.slice(0, 2).toLowerCase()).find((l) => D.langs.includes(l)) ?? 'en';
}
// Sinirlar: 2 pasaport, 2 oturum, 2 vize
const MAX_P = 2, MAX_DOC = 2;
let passports = (ls.get('passports', []) || []).filter((p) => p && p.c in idx).slice(0, MAX_P)
  .map((p) => ({ c: p.c, t: TYPES.includes(p.t) ? p.t : 'ordinary' }));
let docs = (ls.get('docs', []) || []).filter((d) => d && (d.c in idx || d.c === '_SCH') && (d.k === 'permit' || d.k === 'visa'));
docs = [...docs.filter((d) => d.k === 'permit').slice(0, MAX_DOC), ...docs.filter((d) => d.k === 'visa').slice(0, MAX_DOC)];
const docCount = (k) => docs.filter((d) => d.k === k).length;
let visited = new Set((ls.get('visited', []) || []).filter((c) => c in idx));
let unOnly = !!ls.get('unOnly', false);
let docKind = 'permit';
// Aciklama (legend) filtresi: vf/vr = gittigin vizesiz/vizeli, nf/nr = gitmedigin vizesiz/vizeli. Dordu secili = filtre yok.
const CELLS = ['vf', 'vr', 'nf', 'nr'];
let filt = new Set((ls.get('filter', CELLS) || CELLS).filter((x) => CELLS.includes(x)));
if (!filt.size) filt = new Set(CELLS);
const filtering = () => passports.length > 0 && filt.size < CELLS.length;
let region = 'world';

const t = (k, vars) => {
  let s = D.str[lang][k] ?? D.str.en[k] ?? k;
  if (vars) for (const v in vars) s = s.replace('{{' + v + '}}', vars[v]);
  return s;
};
const cname = (c) => (c === '_SCH' ? t('schengen') : D.names[lang][c] ?? D.names.en[c] ?? c);
const flag = (c) => (c === '_SCH' ? '🇪🇺' : D.flags[c] ?? '🏳️');

// ------------------------------------------------------------------ vize (uygulamadaki cozumleyiciyle ayni sira)
const PRI = { o: 7, f: 6, t: 5, e: 4, a: 3, r: 2, n: 1 };
const rows = {};
function rowOf(key) {
  if (!rows[key]) {
    rows[key] = (D.matrix[key] ?? '').match(/[a-z-]\d*/g)?.map((x) => (x === '-' ? null : { t: x[0], d: x.length > 1 ? +x.slice(1) : 0 })) ?? [];
  }
  return rows[key];
}
function resolve(dest) {
  let best = null;
  const i = idx[dest];
  for (const p of passports) {
    const e = i == null ? null : rowOf(p.c === 'TR' && p.t !== 'ordinary' ? 'TR:' + p.t : p.c)[i];
    if (e && (!best || PRI[e.t] > PRI[best.t] || (PRI[e.t] === PRI[best.t] && e.d > best.d))) best = e;
  }
  return best ?? { t: 'r', d: 0 };
}
function visaLabel(r) {
  const d = r.d > 0 ? { days: r.d } : null;
  switch (r.t) {
    case 'o': return t('ownCountry');
    case 'f': return d ? t('visaFreeWithDays', d) : t('visaFree');
    case 't': return d ? t('etaWithDays', d) : t('eta');
    case 'e': return t('evisa');
    case 'a': return d ? t('voaWithDays', d) : t('voa');
    case 'n': return t('noAdmission');
    default: return t('visaRequired');
  }
}
const sch = new Set(D.schengen);
const inSch = (c) => c === '_SCH' || sch.has(c);
/** Oturum izni / vize bu ulkeye girisi sagliyor mu? (etiket ya da null). r = pasaportla cozulen sonuc */
function docCover(dest, r) {
  const permits = docs.filter((d) => d.k === 'permit'), visas = docs.filter((d) => d.k === 'visa');
  if (permits.some((d) => d.c === dest)) return t('hasResidence', { country: cname(dest) });
  if (visas.some((d) => d.c === dest)) return t('hasVisa', { country: cname(dest) });
  const sp = permits.find((d) => inSch(d.c)), svz = visas.find((d) => inSch(d.c));
  const viaSchengen = () => (sp ? t('schengenResidence', { country: cname(sp.c) }) : svz ? t('schengenVisa') : null);
  // Guney Kibris: Schengen vizesi / oturumu yeterli; Turkiye ve Azerbaycan vatandaslari haric
  if (dest === 'CY' && !passports.some((p) => p.c === 'TR' || p.c === 'AZ')) { const v = viaSchengen(); if (v) return v; }
  if (sch.has(dest)) { const v = viaSchengen(); if (v) return v; }
  if (dest === 'IE') {
    if (permits.some((d) => d.c === 'GB')) return t('ukResidence');
    if (visas.some((d) => d.c === 'GB')) return t('ukVisa');
  }
  if (dest === 'GB' && permits.some((d) => d.c === 'IE')) return t('ieResidence');
  // Karadag (01.11.2026): vize gereken pasaportlar gecerli Schengen / ABD / BK / Irlanda vizesi ya da
  // oturumu ile vizesiz (30 gune kadar). Pasaport zaten vizesizse dokunulmaz. Uygulamadaki kuralla ayni.
  if (dest === 'ME' && !'oftea'.includes(r.t)) {
    const ok = (c) => inSch(c) || c === 'US' || c === 'GB' || c === 'IE';
    const p = permits.find((d) => ok(d.c)), v = visas.find((d) => ok(d.c));
    if (p) return inSch(p.c) ? t('schengenResidence', { country: cname(p.c) }) : p.c === 'GB' ? t('ukResidence') : p.c === 'IE' ? t('ieResidence') : t('visaFreeWithResidence', { country: cname(p.c) });
    if (v) return inSch(v.c) ? t('schengenVisa') : v.c === 'GB' ? t('ukVisa') : t('visaFreeWithVisa', { country: cname(v.c) });
  }
  return null;
}
let cache = new Map();
/** { free: true | false | null, label, g: grup harfi } */
function infoOf(c) {
  let v = cache.get(c);
  if (!v) {
    if (!passports.length) v = { free: null, label: '', g: null, d: 0 };
    else {
      const r = resolve(c);
      const cov = r.t === 'o' ? null : docCover(c, r);
      v = cov ? { free: true, label: cov, g: 'f', d: 0 } : { free: 'oftea'.includes(r.t), label: visaLabel(r), g: r.t, d: r.d };
    }
    cache.set(c, v);
  }
  return v;
}

// ------------------------------------------------------------------ harita birimleri (lib/map/worldMap.ts)
const pathCountry = (k) => D.alias[k] ?? D.sovereign[k] ?? k;
const unitOf = (c) => (unOnly ? D.unParent[c] ?? c : c);
const unitParts = (u) => (unOnly ? [u, ...Object.keys(D.unParent).filter((c) => D.unParent[c] === u)] : [u]);
function effVisited() {
  if (!unOnly) return visited;
  const out = new Set(visited);
  for (const c in D.unParent) if (visited.has(c)) out.add(D.unParent[c]);
  return out;
}

// ------------------------------------------------------------------ harita cizimi
const MW = 800, MH = D.mapH, KMAX = 16;
const wrap = $('#mapwrap'), svg = $('#map');
const vp = sv('g', { id: 'vp' }), lands = sv('g', { id: 'lands' }), linesG = sv('g', { id: 'lines' }), dotsG = sv('g', { id: 'dots' });
for (const k of D.order) {
  const p = sv('path', { d: D.paths[k] });
  p.dataset.k = k;
  if (k === 'AQ') p.setAttribute('class', 'aq');
  lands.append(p);
}
for (const d of D.lines) linesG.append(sv('path', { d }));
for (const m of D.markers) {
  const c = sv('circle', { cx: m.x, cy: m.y, r: 1 });
  c.dataset.k = m.code;
  dotsG.append(c);
}
vp.append(lands, linesG, dotsG);
svg.append(vp);
const painted = [...lands.children, ...dotsG.children].filter((e) => e.dataset.k !== 'AQ');

let VH = MH, view = { k: 1, x: 0, y: 0 };
function clamp(v) {
  const k = Math.min(KMAX, Math.max(1, v.k)), h = MH * k;
  return {
    k,
    x: Math.min(0, Math.max(MW - MW * k, v.x)),
    y: h <= VH ? (VH - h) / 2 : Math.min(0, Math.max(VH - h, v.y)),
  };
}
function apply(v, anim) {
  view = clamp(v);
  vp.classList.toggle('anim', !!anim);
  vp.style.transform = `translate(${view.x}px,${view.y}px) scale(${view.k})`;
  wrap.classList.toggle('zoomed', view.k > 1.05);
  // Kucuk ulke noktalari: yakinlasinca gorunur, ekranda hep ayni boyda
  dotsG.style.display = view.k >= 2.2 ? '' : 'none';
  const r = (2.6 * MW) / (wrap.clientWidth || MW) / view.k;
  for (const c of dotsG.children) c.setAttribute('r', r.toFixed(3));
}
function fit(key, anim = true) {
  const rg = D.regions.find((x) => x.key === key);
  if (!rg?.r) return apply({ k: 1, x: 0, y: 0 }, anim);
  const [x0, y0, x1, y1] = rg.r;
  const k = Math.min(MW / (x1 - x0), VH / (y1 - y0)) * 0.94;
  apply({ k, x: MW / 2 - (k * (x0 + x1)) / 2, y: VH / 2 - (k * (y0 + y1)) / 2 }, anim);
}
function resize() {
  const w = wrap.clientWidth, h = wrap.clientHeight;
  if (!w || !h) return;
  VH = (MW * h) / w;
  svg.setAttribute('viewBox', `0 0 ${MW} ${VH.toFixed(1)}`);
  if (region) fit(region, false); else apply(view);
}
function setRegion(key) {
  region = key;
  for (const b of $('#regions').children) b.classList.toggle('on', b.dataset.k === key);
}
function zoomAt(px, py, k2, anim) {
  const k = Math.min(KMAX, Math.max(1, k2)), f = k / view.k;
  apply({ k, x: px - (px - view.x) * f, y: py - (py - view.y) * f }, anim);
  setRegion(k <= 1.001 ? 'world' : null);
}
const toMap = (cx, cy) => {
  const r = svg.getBoundingClientRect(), s = MW / r.width;
  return { x: (cx - r.left) * s, y: (cy - r.top) * s, s };
};

// Parmak / fare: tek parmak kaydirir, iki parmak yakinlastirir, kisa dokunus ulkeyi isaretler.
const pts = new Map();
let ges = null;
svg.addEventListener('pointerdown', (e) => {
  if (e.pointerType === 'mouse' && e.button !== 0) return;
  pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
  try { svg.setPointerCapture(e.pointerId); } catch { /* yok say */ }
  hideTip();
  if (pts.size === 1) {
    ges = { type: 'pan', sx: e.clientX, sy: e.clientY, vx: view.x, vy: view.y, moved: 0, key: e.target.dataset?.k };
  } else if (pts.size === 2) {
    const [a, b] = [...pts.values()], m = toMap((a.x + b.x) / 2, (a.y + b.y) / 2);
    ges = { type: 'pinch', d: Math.hypot(a.x - b.x, a.y - b.y) || 1, k: view.k, mx: m.x, my: m.y, vx: view.x, vy: view.y };
  }
});
svg.addEventListener('pointermove', (e) => {
  if (!pts.has(e.pointerId)) { if (e.pointerType === 'mouse') hover(e); return; }
  pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
  if (!ges) return;
  if (ges.type === 'pan' && pts.size === 1) {
    const dx = e.clientX - ges.sx, dy = e.clientY - ges.sy;
    ges.moved = Math.max(ges.moved, Math.hypot(dx, dy));
    if (ges.moved > 5 && view.k > 1.001) {
      const s = MW / svg.getBoundingClientRect().width;
      apply({ k: view.k, x: ges.vx + dx * s, y: ges.vy + dy * s });
      setRegion(null);
    }
  } else if (ges.type === 'pinch' && pts.size === 2) {
    const [a, b] = [...pts.values()];
    const k = Math.min(KMAX, Math.max(1, (ges.k * Math.hypot(a.x - b.x, a.y - b.y)) / ges.d)), f = k / ges.k;
    apply({ k, x: ges.mx - (ges.mx - ges.vx) * f, y: ges.my - (ges.my - ges.vy) * f });
    setRegion(k <= 1.001 ? 'world' : null);
  }
});
function endPointer(e) {
  if (!pts.has(e.pointerId)) return;
  pts.delete(e.pointerId);
  const was = ges;
  if (pts.size === 0) {
    ges = null;
    if (e.type === 'pointerup' && was?.type === 'pan' && was.moved <= 5 && was.key) tapKey(was.key);
  } else if (pts.size === 1) {
    const [a] = [...pts.values()];
    ges = { type: 'pan', sx: a.x, sy: a.y, vx: view.x, vy: view.y, moved: 99 };
  }
}
svg.addEventListener('pointerup', endPointer);
svg.addEventListener('pointercancel', endPointer);
svg.addEventListener('pointerleave', hideTip);
// Tekerlek: sayfa kaydirmasini bozmamak icin yalniz Ctrl / Cmd ile (dokunmatik yuzeyde iki parmak acma)
wrap.addEventListener('wheel', (e) => {
  if (!e.ctrlKey && !e.metaKey) return;
  e.preventDefault();
  const p = toMap(e.clientX, e.clientY);
  zoomAt(p.x, p.y, view.k * Math.exp(-e.deltaY * 0.012));
}, { passive: false });
$('#zin').onclick = () => zoomAt(MW / 2, VH / 2, view.k * 1.8, true);
$('#zout').onclick = () => zoomAt(MW / 2, VH / 2, view.k / 1.8, true);

// ------------------------------------------------------------------ ipucu + bildirim
const tip = $('#tip'), toast = $('#toast');
function titleOf(key) {
  const c = pathCountry(key), u = unitOf(c);
  const part = D.terr[lang][key] && key !== c && !D.alias[key] ? D.terr[lang][key] : u !== c ? cname(c) : null;
  return part ? `${part} · ${cname(u)}` : cname(u);
}
function hover(e) {
  const key = e.target.dataset?.k;
  if (!key || key === 'AQ' || !(unitOf(pathCountry(key)) in idx)) return hideTip();
  const r = wrap.getBoundingClientRect(), info = infoOf(unitOf(pathCountry(key)));
  tip.replaceChildren(document.createTextNode(titleOf(key)));
  if (info.label) tip.append(el('small', null, info.label));
  tip.style.left = Math.min(r.width - 70, Math.max(70, e.clientX - r.left)) + 'px';
  tip.style.top = Math.max(46, e.clientY - r.top) + 'px';
  tip.hidden = false;
}
function hideTip() { tip.hidden = true; }

let toastTimer = 0;
function showToast(title, code, added, label, undo) {
  const tx = el('div', 'tx');
  tx.append(el('b', null, title), el('small', added ? 'add' : '', (added ? t('toastAdded') : t('toastRemoved')) + (label ? '  ·  ' + label : '')));
  const b = el('button', null, t('undo'));
  b.type = 'button';
  b.onclick = () => { undo(); toast.hidden = true; };
  toast.replaceChildren(el('span', 'fl', flag(code)), tx, b);
  toast.hidden = false;
  toast.style.animation = 'none'; void toast.offsetWidth; toast.style.animation = '';
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { toast.hidden = true; }, 3500);
}

/** Birimi (BM acikken ust ulke + bolgeleri) birlikte isaretler / kaldirir. */
function toggleUnit(u, title) {
  if (!passports.length || !(u in idx)) return;
  const prev = new Set(visited);
  const parts = unitParts(u).filter((c) => c in idx);
  const any = parts.some((c) => visited.has(c));
  for (const c of parts) any ? visited.delete(c) : visited.add(c);
  ls.set('visited', [...visited]);
  paint();
  showToast(title ?? cname(u), u, !any, infoOf(u).label, () => { visited = prev; ls.set('visited', [...visited]); paint(); });
}
function tapKey(key) {
  if (key === 'AQ') return;
  toggleUnit(unitOf(pathCountry(key)), titleOf(key));
}

// ------------------------------------------------------------------ boyama, sayilar, liste
const cellOf = (c, eff) => (eff.has(c) ? 'v' : 'n') + (infoOf(c).free === false ? 'r' : 'f');
function paint() {
  cache = new Map();
  const eff = effVisited(), on = filtering();
  for (const p of painted) {
    const cell = cellOf(unitOf(pathCountry(p.dataset.k)), eff);
    p.setAttribute('class', on && !filt.has(cell) ? 'x' : cell);
  }
  renderLegend();
  const scope = unOnly ? D.un : D.codes;
  const stats = $('#stats');
  stats.replaceChildren();
  if (passports.length) {
    const own = scope.filter((c) => infoOf(c).g === 'o').length;
    const free = scope.filter((c) => infoOf(c).free && infoOf(c).g !== 'o').length;
    const seen = scope.filter((c) => eff.has(c)).length;
    const stat = (big, small, label) => {
      const s = el('div', 'stat'), b = el('b', null, big + ' ');
      b.append(el('i', null, small));
      s.append(b, el('span', null, label));
      return s;
    };
    stats.append(stat(free, '/ ' + (scope.length - own), t('statFree')), stat(seen, '· ' + Math.round((seen / scope.length) * 100) + '%', t('statVisited')));
  }
  renderList(scope, eff);
}
// Gruplar: vizesiz · ETA / e-vize / kapida vize (tek grup) · vize gerekli; her grubun icinde kita kita.
const GROUPS = [['free', ['f'], 'nf'], ['easy', ['t', 'e', 'a'], 'nf'], ['req', ['r', 'n'], 'nr']];
const CONTS = ['europe', 'asia', 'northAmerica', 'southAmerica', 'africa', 'oceania'];
const groupLabel = (g) => (g === 'free' ? t('visaFree') : g === 'easy' ? [t('eta'), t('evisa'), t('voa')].join(' · ') : t('visaRequired'));
const openGroups = new Set(['free']);
function renderList(scope, eff) {
  const card = $('#listcard');
  card.hidden = !passports.length;
  if (!passports.length) return;
  const on = filtering();
  const coll = new Intl.Collator(lang);
  const sorted = [...scope].sort((a, b) => coll.compare(cname(a), cname(b)));
  const out = [];
  for (const [g, types, swatch] of GROUPS) {
    const items = sorted.filter((c) => types.includes(infoOf(c).g) && (!on || filt.has(cellOf(c, eff))));
    if (on && !items.length) continue;
    const d = el('details');
    d.open = openGroups.has(g) || on;
    d.ontoggle = () => { if (!on) d.open ? openGroups.add(g) : openGroups.delete(g); };
    const s = el('summary'), sw = el('span', 'sw e');
    sw.style.background = `var(--${swatch})`;
    s.append(sw, el('span', null, groupLabel(g)), el('span', 'n', String(items.length)));
    const body = el('div', 'gbody');
    for (const k of CONTS) {
      const sub = items.filter((c) => (D.cont[c] ?? 'asia') === k);
      if (!sub.length) continue;
      const h = el('div', 'ct', t(k));
      h.append(el('span', null, String(sub.length)));
      const box = el('div', 'cl');
      for (const c of sub) {
        const b = el('button', eff.has(c) ? 'v' : '');
        b.type = 'button';
        b.title = infoOf(c).label;
        b.append(el('span', 'fl', flag(c)), el('span', null, cname(c)));
        if (infoOf(c).d > 0) b.append(el('small', null, String(infoOf(c).d)));
        b.onclick = () => toggleUnit(unitOf(c));
        box.append(b);
      }
      body.append(h, box);
    }
    d.append(s, body);
    out.push(d);
  }
  if (!out.length) out.push(el('p', 'empty', t('noneInFilter')));
  $('#list').replaceChildren(...out);
}

// ------------------------------------------------------------------ aciklama = filtre
function setFilter(next) {
  filt = next.size ? next : new Set(CELLS);
  ls.set('filter', [...filt]);
  paint();
}
function renderLegend() {
  const on = filtering();
  const sw = (v, edge) => { const s = el('span', 'sw' + (edge ? ' e' : '')); s.style.background = `var(--${v})`; return s; };
  const cell = (k) => {
    const b = el('button', 'cell' + (on ? (filt.has(k) ? ' on' : ' off') : ''));
    b.type = 'button';
    b.setAttribute('aria-pressed', String(on && filt.has(k)));
    b.setAttribute('aria-label', `${t(k[0] === 'v' ? 'legendVisited' : 'legendNotVisited')} · ${t(k[1] === 'f' ? 'legendFree' : 'legendReq')}`);
    b.append(sw(k, k === 'nf'));
    // Ilk dokunus yalniz o rengi gosterir; sonrakiler ekler / cikarir
    b.onclick = () => {
      if (!on) return setFilter(new Set([k]));
      const n = new Set(filt);
      n.has(k) ? n.delete(k) : n.add(k);
      setFilter(n);
    };
    return b;
  };
  const row = (label, a, b) => {
    const r = el('button', 'rl', label);
    r.type = 'button';
    r.onclick = () => setFilter(on && filt.size === 2 && filt.has(a) && filt.has(b) ? new Set(CELLS) : new Set([a, b]));
    return [r, cell(a), cell(b)];
  };
  const kids = [el('span'), el('b', null, t('legendFree')), el('b', null, t('legendReq')),
    ...row(t('legendVisited'), 'vf', 'vr'), ...row(t('legendNotVisited'), 'nf', 'nr')];
  if (on) {
    const all = el('button', 'all', t('all'));
    all.type = 'button';
    all.onclick = () => setFilter(new Set(CELLS));
    kids.push(all);
  }
  $('#legend').replaceChildren(...kids);
}

// ------------------------------------------------------------------ form
const norm = (s) => s.toLocaleLowerCase('tr').replace(/ı/g, 'i').normalize('NFD').replace(/[̀-ͯ]/g, '');
function combo(root, items, onPick) {
  const input = $('input', root), list = $('ul', root);
  let cur = [], hi = 0;
  const pick = (o) => { input.value = ''; list.hidden = true; input.blur(); onPick(o); };
  const open = () => {
    const q = norm(input.value.trim());
    cur = items().filter((o) => !q || norm(o.label).includes(q) || o.c.toLowerCase() === q);
    if (q) cur.sort((a, b) => norm(b.label).startsWith(q) - norm(a.label).startsWith(q));
    cur = cur.slice(0, 80);
    hi = Math.min(hi, Math.max(0, cur.length - 1));
    list.replaceChildren(...cur.map((o, i) => {
      const li = el('li', i === hi ? 'hi' : '');
      li.append(el('span', 'fl', flag(o.c)), el('span', null, o.label));
      li.onpointerdown = (e) => { e.preventDefault(); pick(o); };
      return li;
    }));
    if (!cur.length) list.append(el('li', 'none', t('noMatch')));
    list.hidden = false;
    list.children[hi]?.scrollIntoView({ block: 'nearest' });
  };
  input.onfocus = () => { hi = 0; open(); };
  input.oninput = () => { hi = 0; open(); };
  input.onblur = () => setTimeout(() => { list.hidden = true; }, 150);
  input.onkeydown = (e) => {
    if (e.key === 'ArrowDown') { hi++; open(); e.preventDefault(); }
    else if (e.key === 'ArrowUp') { hi = Math.max(0, hi - 1); open(); e.preventDefault(); }
    else if (e.key === 'Enter') { if (cur[hi]) pick(cur[hi]); e.preventDefault(); }
    else if (e.key === 'Escape') input.blur();
  };
}
const unSet = new Set(D.un);
function countryItems(skip) {
  const coll = new Intl.Collator(lang);
  return D.codes.filter((c) => !skip(c) && (!unOnly || unSet.has(c))).map((c) => ({ c, label: cname(c) })).sort((a, b) => coll.compare(a.label, b.label));
}
function commit() {
  ls.set('passports', passports);
  ls.set('docs', docs);
  renderForm();
  paint();
}
function chip(code, extra, onRemove) {
  const c = el('span', 'chip');
  c.append(el('span', 'fl', flag(code)), el('span', null, cname(code)));
  if (extra) c.append(extra);
  const x = el('button', 'x', '×');
  x.type = 'button';
  x.setAttribute('aria-label', t('remove'));
  x.onclick = onRemove;
  c.append(x);
  return c;
}
function renderForm() {
  $('#pchips').replaceChildren(...passports.map((p, i) => {
    let extra = null;
    if (p.c === 'TR') {   // Turk pasaportunda tur vize kurallarini degistirir (hususi, hizmet, diplomatik)
      extra = el('select');
      for (const k of TYPES) { const o = el('option', null, t('pt_' + k)); o.value = k; o.selected = p.t === k; extra.append(o); }
      extra.onchange = () => { p.t = extra.value; commit(); };
    }
    return chip(p.c, extra, () => { passports.splice(i, 1); commit(); });
  }));
  $('#pcombo').hidden = passports.length >= MAX_P;
  $('#dchips').replaceChildren(...docs.map((d, i) =>
    chip(d.c, el('small', null, t(d.k === 'permit' ? 'kindPermit' : 'kindVisa')), () => { docs.splice(i, 1); commit(); })));
  // Dolan tur secilemez; secili tur dolduysa digerine gec, ikisi de doluysa giris kutusu gizlenir
  if (docCount(docKind) >= MAX_DOC) docKind = docKind === 'permit' ? 'visa' : 'permit';
  const full = docCount('permit') >= MAX_DOC && docCount('visa') >= MAX_DOC;
  for (const b of $('#kind').children) {
    b.classList.toggle('on', !full && b.dataset.k === docKind);
    b.disabled = docCount(b.dataset.k) >= MAX_DOC;
  }
  $('#dcombo').hidden = full;
  const locked = !passports.length;
  wrap.classList.toggle('locked', locked);
  $('#gate').hidden = !locked;
}
combo($('#pcombo'), () => countryItems((c) => passports.some((p) => p.c === c)), (o) => {
  if (passports.length < MAX_P) passports.push({ c: o.c, t: 'ordinary' });
  commit();
});
combo($('#dcombo'), () => {
  const list = countryItems((c) => docs.some((d) => d.c === c && d.k === docKind));
  // Schengen vizesi hangi ulkeden alinmis olursa olsun butun bolgede gecerli: ayri secenek
  if (docKind === 'visa' && !docs.some((d) => d.c === '_SCH')) list.unshift({ c: '_SCH', label: t('schengen') });
  return list;
}, (o) => { if (docCount(docKind) < MAX_DOC) docs.push({ c: o.c, k: docKind }); commit(); });
for (const b of $('#kind').children) b.onclick = () => { if (b.disabled) return; docKind = b.dataset.k; renderForm(); $('#dcombo input').focus(); };
$('#gate button').onclick = () => { $('#pcombo input').focus(); };
const unSeg = () => { for (const b of $('#unseg').children) b.classList.toggle('on', (b.dataset.u === '1') === unOnly); };
for (const b of $('#unseg').children) b.onclick = () => { unOnly = b.dataset.u === '1'; ls.set('unOnly', unOnly); unSeg(); paint(); };
unSeg();

// ------------------------------------------------------------------ dil
const LANG_NAMES = { en: 'English', tr: 'Türkçe', es: 'Español', fr: 'Français', ru: 'Русский' };
function applyLang() {
  document.documentElement.lang = lang;
  document.title = t('title');
  $('meta[name=description]').content = t('desc');
  for (const e of document.querySelectorAll('[data-i]')) e.textContent = t(e.dataset.i);
  for (const e of document.querySelectorAll('[data-ip]')) { e.placeholder = t(e.dataset.ip); e.setAttribute('aria-label', t(e.dataset.ip)); }
  $('#legal').href = 'https://umutjihan-commits.github.io/passimi-legal/' + (lang === 'tr' ? 'tr.html' : '');
  $('#regions').replaceChildren(...D.regions.map((r) => {
    const b = el('button', r.key === region ? 'on' : '', t(r.key));
    b.type = 'button';
    b.dataset.k = r.key;
    b.onclick = () => { setRegion(r.key); fit(r.key); };
    return b;
  }));
  renderForm();
  paint();
}
const langSel = $('#lang');
for (const l of D.langs) { const o = el('option', null, LANG_NAMES[l] ?? l); o.value = l; o.selected = l === lang; langSel.append(o); }
langSel.onchange = () => { lang = langSel.value; ls.set('lang', lang); applyLang(); };

// ------------------------------------------------------------------ baslat
if (matchMedia('(prefers-reduced-motion: reduce)').matches) {
  const plane = $('#plane');
  $('animateMotion', plane)?.remove();
  plane.setAttribute('transform', 'translate(640 -6)');
}
applyLang();
new ResizeObserver(resize).observe(wrap);
resize();
