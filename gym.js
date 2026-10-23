'use strict';

/* =========================================================================
   Milon – Gym-Tracking
   Pläne:     gym-plans.json im privaten Daten-Repository (von Hand gepflegt)
   Protokoll: gym.json im Daten-Repository (schreibt die App, Sync + Merge wie dehn.json)
   Nutzt die gemeinsamen Hilfsfunktionen aus app.js (store, esc, dayKey, GHSync, …).
   ========================================================================= */

const GYM_PLANS_PATH = 'gym-plans.json';
const GYM_LOG_PATH = 'gym.json';
const GYM_KEYS = {
  plans: 'dehnapp.gymplans.cache.v1',
  sessions: 'dehnapp.gym.sessions.v1',
  deleted: 'dehnapp.gym.deleted.v1',
  draft: 'dehnapp.gym.draft.v1',
};
const BLOCK_LABEL = { warmup: 'Aufwärmen', ss1: 'Supersatz 1', ss2: 'Supersatz 2', optional: 'Optional', alt: 'Ersatz' };
const COLLAPSED_BLOCKS = ['optional', 'alt'];

/* ---------- Pläne ---------- */
function gymPlans() {
  const p = store.get(GYM_KEYS.plans, null);
  return p && Array.isArray(p.splits) && p.splits.length ? p : null;
}
async function loadGymPlans() {
  const c = GHSync.getConfig();
  if (!c || navigator.onLine === false) return;
  try {
    const r = await GHSync.readFile(c, GYM_PLANS_PATH);
    if (!r || !Array.isArray(r.data?.splits)) return;
    const before = JSON.stringify(gymPlans());
    store.set(GYM_KEYS.plans, r.data);
    if (JSON.stringify(r.data) !== before) rerenderCurrent();
  } catch { /* ohne Datei oder offline bleibt der letzte Stand */ }
}
const weeklyTarget = () => Number(gymPlans()?.settings?.weeklyTarget) || 3;
const splitById = (id) => gymPlans()?.splits.find((s) => s.id === id) || null;
/** Übung aus dem Plan (eine ID kann in mehreren Splits vorkommen, z. B. Face Pulls). */
function planExercise(id, splitId = null) {
  const splits = gymPlans()?.splits || [];
  const pref = splits.find((s) => s.id === splitId);
  return pref?.exercises.find((e) => e.id === id) || splits.flatMap((s) => s.exercises).find((e) => e.id === id) || null;
}
/** "6–8" → [6, 8], "10" → [10, 10], "max −2" → null */
function repsRange(r) {
  const s = String(r ?? '');
  const m = s.match(/(\d+)\s*[–-]\s*(\d+)/);
  if (m) return [Number(m[1]), Number(m[2])];
  const n = s.match(/^\s*(\d+)\s*$/);
  return n ? [Number(n[1]), Number(n[1])] : null;
}
const exUnit = (ex) => (ex?.unit === 's' ? 's' : 'reps');
const isTracked = (ex) => ex && ex.block !== 'warmup'; // Aufwärmsätze zählen nicht für Bestwerte/Progression
function planKgForSet(ex, i) {
  if (Array.isArray(ex.kg)) return ex.kg[Math.min(i, ex.kg.length - 1)] ?? null;
  return typeof ex.kg === 'number' ? ex.kg : null;
}
const fmtKg = (kg) => (kg == null || kg === '' ? '–' : `${Number(kg).toLocaleString('de-DE', { maximumFractionDigits: 2 })}`);
function planDose(ex) {
  const reps = `${ex.reps}${exUnit(ex) === 's' ? ' s' : ''}${ex.perSide ? ' pro Seite' : ''}`;
  let kg = '';
  if (ex.bodyweight) kg = 'Körpergewicht';
  else if (Array.isArray(ex.kg)) kg = `${ex.kg.map(fmtKg).join(' / ')} kg`;
  else if (typeof ex.kg === 'number') kg = `${fmtKg(ex.kg)} kg${ex.kgLabel ? ` ${ex.kgLabel}` : ''}`;
  return `${ex.sets} × ${reps}${kg ? ` · ${kg}` : ''}${ex.kgTarget ? ` (Ziel ${fmtKg(ex.kgTarget)} kg)` : ''}`;
}

/* ---------- Protokoll + Abgleich ---------- */
function getGymSessions() {
  const s = store.get(GYM_KEYS.sessions, []);
  return Array.isArray(s) ? s.filter((x) => x && x.id && /^\d{4}-\d{2}-\d{2}$/.test(x.date)) : [];
}
const setGymSessions = (s) => store.set(GYM_KEYS.sessions, s);
function getGymDeleted() { const d = store.get(GYM_KEYS.deleted, []); return Array.isArray(d) ? d : []; }
const gymSnapshot = () => ({ app: 'milon-gym', version: 1, sessions: getGymSessions(), deleted: getGymDeleted() });
const sortSessions = (list) => list.sort((a, b) => a.date.localeCompare(b.date) || String(a.createdAt).localeCompare(String(b.createdAt)));

/** Vereinigung beider Stände: pro Einheit gewinnt die neueste Bearbeitung, Gelöschtes bleibt gelöscht. */
function mergeGym(a, b) {
  const deleted = [...new Set([...(a?.deleted || []), ...(b?.deleted || [])])].sort();
  const gone = new Set(deleted);
  const byId = new Map();
  for (const s of [...(a?.sessions || []), ...(b?.sessions || [])]) {
    if (!s?.id || gone.has(s.id) || !/^\d{4}-\d{2}-\d{2}$/.test(s.date)) continue;
    const cur = byId.get(s.id);
    if (!cur || String(s.updatedAt || '') > String(cur.updatedAt || '')) byId.set(s.id, s);
  }
  return { app: 'milon-gym', version: 1, sessions: sortSessions([...byId.values()]), deleted };
}
const gymKey = (s) => JSON.stringify([(s?.sessions || []).map((x) => `${x.id}@${x.updatedAt}`).sort(), [...(s?.deleted || [])].sort()]);

/** Wird von runSync() in app.js aufgerufen. Gibt true zurück, wenn sich lokal etwas geändert hat. */
async function syncGymLog() {
  const before = gymKey(gymSnapshot());
  const res = await GHSync.syncFile(GYM_LOG_PATH, {
    local: gymSnapshot(),
    merge: mergeGym,
    equals: (x, y) => gymKey(x) === gymKey(y),
    message: `Milon Gym: ${getGymSessions().length} Einheiten`,
  });
  const merged = mergeGym(gymSnapshot(), res.data); // falls während des Abgleichs etwas dazukam
  setGymSessions(merged.sessions);
  store.set(GYM_KEYS.deleted, merged.deleted);
  if (gymKey(merged) !== gymKey(res.data)) sync.again = true;
  return gymKey(merged) !== before;
}
function importGymSnapshot(snap) {
  const before = getGymSessions().length;
  const merged = mergeGym(gymSnapshot(), snap);
  setGymSessions(merged.sessions);
  store.set(GYM_KEYS.deleted, merged.deleted);
  return Math.max(0, merged.sessions.length - before);
}
function saveGymSession(session) {
  const list = getGymSessions().filter((s) => s.id !== session.id);
  list.push(session);
  setGymSessions(sortSessions(list));
  scheduleSync(400);
}
function deleteGymSession(id) {
  setGymSessions(getGymSessions().filter((s) => s.id !== id));
  store.set(GYM_KEYS.deleted, [...new Set([...getGymDeleted(), id])]);
  scheduleSync(400);
}

/* ---------- Woche, nächster Split, Streak ---------- */
const sessionsInWeek = (wk, list = getGymSessions()) => list.filter((s) => weekKey(parseDay(s.date)) === wk);
function nextSplit(list = getGymSessions()) {
  const splits = gymPlans()?.splits || [];
  if (!splits.length) return null;
  const last = [...list].reverse().find((s) => splits.some((x) => x.id === s.splitId));
  if (!last) return splits[0];
  const i = splits.findIndex((x) => x.id === last.splitId);
  return splits[(i + 1) % splits.length];
}
/** Monat für den Joker: der Monat, in dem der Donnerstag der Woche liegt (ISO-Regel). */
const jokerMonth = (monday) => { const th = addDays(monday, 3); return `${th.getFullYear()}-${pad2(th.getMonth() + 1)}`; };

/**
 * Gym-Streak in Wochen (Mo–So):
 *  - Woche mit ≥ Wochenziel Einheiten → +1
 *  - laufende Woche bleibt offen (bricht nichts)
 *  - verpasste Woche → 1 Joker pro Kalendermonat fängt sie ab (Streak bleibt, +0), sonst Reset auf 0
 */
function computeGymStreak(list = getGymSessions(), now = new Date(), target = weeklyTarget()) {
  const res = { current: 0, best: 0, weeks: new Map(), jokerUsedThisMonth: false, startKey: null };
  if (!list.length) return res;
  const thisWeek = weekStart(now);
  let w = weekStart(parseDay(list[0].date));
  res.startKey = dayKey(w);
  const jokers = new Set();
  let cur = 0, best = 0;
  for (; w <= thisWeek; w = addDays(w, 7)) {
    const k = dayKey(w);
    const n = sessionsInWeek(k, list).length;
    let status;
    if (n >= target) { cur++; status = 'done'; }
    else if (k === dayKey(thisWeek)) status = 'open';
    else if (cur > 0 && !jokers.has(jokerMonth(w))) { jokers.add(jokerMonth(w)); status = 'joker'; }
    else { cur = 0; status = 'missed'; }
    best = Math.max(best, cur);
    res.weeks.set(k, { n, status });
  }
  return Object.assign(res, { current: cur, best, jokerUsedThisMonth: jokers.has(jokerMonth(thisWeek)) });
}

/** Für die Karte „Trainingswoche“ (app.js): Gym-Einheiten einer Woche plus aktuelle Gym-Streak. */
function gymWeekSummary(from, to) {
  if (!gymPlans()) return null;
  const list = getGymSessions();
  if (!list.length || to < dayKey(weekStart(parseDay(list[0].date)))) return null; // vor der ersten Milon-Einheit
  const target = weeklyTarget();
  const st = computeGymStreak(list, new Date(), target);
  const sessions = list.filter((s) => s.date >= from && s.date <= to)
    .map((s) => ({ date: s.date, splitName: splitById(s.splitId)?.name || s.splitName || s.splitId }));
  const status = st.weeks.get(from)?.status || (sessions.length >= target ? 'done' : 'missed');
  const statusLabel = { done: 'Ziel erreicht', joker: 'Joker eingesetzt', missed: 'Ziel verfehlt', open: 'Woche läuft' }[status] || '';
  return { n: sessions.length, target, sessions, status, statusLabel, streak: st.current, best: st.best };
}

/* ---------- Progression ---------- */
/** Alle erfassten Sätze einer Übung, neueste Einheit zuletzt. */
function exerciseHistory(exId, list = getGymSessions()) {
  const out = [];
  for (const s of list) {
    if (s.quick) continue;
    const e = (s.exercises || []).find((x) => x.exerciseId === exId);
    if (e && e.sets?.length) out.push({ sessionId: s.id, date: s.date, splitId: s.splitId, sets: e.sets });
  }
  return out;
}
/** Schwerster Satz (bei Körpergewicht/Zeit: meiste Wiederholungen/Sekunden). */
function topSet(sets) {
  return [...sets].sort((a, b) => (Number(b.kg) || 0) - (Number(a.kg) || 0) || (Number(b.reps) || 0) - (Number(a.reps) || 0))[0] || null;
}
const setScore = (s) => (Number(s.kg) || 0) * 1000 + (Number(s.reps) || 0);
function fmtSet(s, ex) {
  const unit = exUnit(ex) === 's' ? ' s' : '';
  const kg = s.kg != null && s.kg !== '' && Number(s.kg) > 0 ? `${fmtKg(s.kg)} kg × ` : '';
  return `${kg}${s.reps ?? '–'}${unit}`;
}
function exerciseStats(exId) {
  const hist = exerciseHistory(exId);
  if (!hist.length) return null;
  const last = hist[hist.length - 1];
  let best = null, bestDate = null;
  for (const h of hist) for (const s of h.sets) if (!best || setScore(s) > setScore(best)) { best = s; bestDate = h.date; }
  return { hist, last, best, bestDate, tops: hist.map((h) => ({ date: h.date, top: topSet(h.sets) })) };
}
/** Hinweis, wenn beim letzten Mal alle Sätze das obere Ende erreicht haben. */
function progressionHint(ex, stats) {
  if (!ex || !stats || !isTracked(ex)) return null;
  const range = repsRange(ex.reps);
  if (!range) return null;
  const sets = stats.last.sets;
  if (sets.length < (ex.sets || 1) || !sets.every((s) => Number(s.reps) >= range[1])) return null;
  if (exUnit(ex) === 's') return '+5 s probieren';
  if (ex.bodyweight) return 'Mehr Wdh. oder Zusatzgewicht probieren';
  const step = Number(ex.stepKg) || Number(gymPlans()?.settings?.progressionStepKg) || 2.5;
  return `+${fmtKg(step)} kg probieren`;
}

/* ---------- kleine Grafiken ---------- */
function sparkline(values, { w = 96, h = 28, cls = 'spark' } = {}) {
  const v = values.filter((x) => Number.isFinite(x));
  if (v.length < 2) return '';
  const min = Math.min(...v), max = Math.max(...v), span = max - min || 1;
  const pts = v.map((x, i) => `${((i / (v.length - 1)) * (w - 4) + 2).toFixed(1)},${(h - 3 - ((x - min) / span) * (h - 6)).toFixed(1)}`);
  const lastPt = pts[pts.length - 1].split(',');
  return `<svg class="${cls}" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" aria-hidden="true">
    <polyline points="${pts.join(' ')}" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>
    <circle cx="${lastPt[0]}" cy="${lastPt[1]}" r="2.6" fill="currentColor"/></svg>`;
}
const topValue = (top, ex) => (ex?.bodyweight || !(Number(top?.kg) > 0) ? Number(top?.reps) : Number(top?.kg));

/* =========================================================================
   Bildschirme
   ========================================================================= */
let gymTimer = null;
function leaveGymPage(r) {
  if (!(r.name === 'gym' && r.arg === 'log')) { clearInterval(gymTimer); gymTimer = null; }
}

function renderGymRoute(r) {
  if (!gymPlans()) return renderGymSetup();
  if (r.arg === 'log') return renderGymLog(r.arg2);
  if (r.arg === 'edit') return renderGymLog(null, r.arg2);
  if (r.arg === 'uebung') return renderGymExercise(r.arg2);
  return renderGym();
}

function renderGymSetup() {
  app.innerHTML = `<div class="page">${pageHead({ title: 'Gym' })}
    <section class="card">
      <h2 class="card-title">Noch keine Gym-Pläne</h2>
      <p class="small muted">Lege <code>${GYM_PLANS_PATH}</code> in deinem Daten-Repository an (Splits, Übungen, Sätze, Gewichte).
      ${GHSync.getConfig() ? 'Danach in den Einstellungen „Jetzt abgleichen“.' : 'Verbinde dazu zuerst die Synchronisierung in den Einstellungen.'}</p>
    </section></div>`;
}

/* ---------- Karte „Gym diese Woche“ (Heute und Gym-Tab) ---------- */
function gymWeekHtml(now = new Date(), { compact = false } = {}) {
  if (!gymPlans()) return '';
  const list = getGymSessions();
  const wk = weekKey(now);
  const inWeek = sessionsInWeek(wk, list);
  const target = weeklyTarget();
  const next = nextSplit(list);
  const st = computeGymStreak(list, now, target);
  const doneToday = inWeek.filter((s) => s.date === dayKey(now));
  const dots = Array.from({ length: Math.max(target, inWeek.length) }, (_, i) =>
    `<i class="gw-dot ${i < inWeek.length ? 'on' : ''}" title="${esc(inWeek[i] ? `${fmtDate(inWeek[i].date)} · ${splitById(inWeek[i].splitId)?.name || ''}` : '')}"></i>`).join('');
  const reached = inWeek.length >= target;
  return `<section class="card gym-week ${reached ? 'is-reached' : ''}">
    <div class="gw-top">
      <div>
        <div class="today-label">Gym diese Woche</div>
        <div class="gw-count"><strong>${inWeek.length}</strong> von ${target}${reached ? ' <span class="gw-ok">Ziel erreicht</span>' : ''}</div>
      </div>
      <div class="gw-streak" title="Wochen in Folge mit Wochenziel">${ICONS.tabGym}<span><strong>${st.current}</strong> ${plural(st.current, 'Woche', 'Wochen')}</span></div>
    </div>
    <div class="gw-dots" aria-hidden="true">${dots}</div>
    ${inWeek.length ? `<p class="small muted gw-list">${inWeek.map((s) => `${esc(fmtDate(s.date))} ${esc(splitById(s.splitId)?.name || s.splitName || '')}${s.quick ? '' : ' ✓'}`).join(' · ')}</p>` : ''}
    ${next ? `<div class="gw-next">
      <div><span class="muted small">${doneToday.length ? 'Heute erledigt · Als Nächstes' : 'Als Nächstes'}</span><div class="gw-split">${esc(next.name)}</div></div>
      <div class="gw-actions">
        <button class="btn btn-ghost btn-sm" data-act="gym-quick" data-split="${esc(next.id)}">${ICONS.check}<span>Abhaken</span></button>
        <a class="btn btn-primary btn-sm" href="#/gym/log/${encodeURIComponent(next.id)}">Erfassen</a>
      </div>
    </div>` : ''}
    ${!compact && next && savedDraft(next.id) ? '<p class="small muted">Begonnene Einheit gespeichert – „Erfassen“ setzt sie fort.</p>' : ''}
  </section>`;
}
function gymTodayHtml(now = new Date()) { return gymWeekHtml(now, { compact: true }); }

/* ---------- Gym-Streak mit Wochen-Kalender ---------- */
function gymStreakHtml(now = new Date()) {
  const list = getGymSessions();
  const target = weeklyTarget();
  const st = computeGymStreak(list, now, target);
  const thisWeek = weekStart(now);
  const cells = [];
  for (let i = 11; i >= 0; i--) {
    const w = addDays(thisWeek, -7 * i);
    const k = dayKey(w);
    const info = st.weeks.get(k);
    const n = info?.n ?? sessionsInWeek(k, list).length;
    const status = info?.status || (k === dayKey(thisWeek) ? 'open' : 'none');
    const kw = Number(isoWeek(w));
    cells.push(`<div class="gs-cell st-${status} ${i === 0 ? 'is-now' : ''}" title="KW ${kw}: ${n} von ${target}">
      <span class="gs-kw">KW ${kw}</span><strong>${n}/${target}</strong></div>`);
  }
  const msg = !st.startKey ? 'Die Gym-Streak zählt Wochen, in denen du dein Wochenziel erreichst.'
    : st.weeks.get(dayKey(thisWeek))?.status === 'done' ? 'Diese Woche geschafft – die Streak wächst.'
      : st.jokerUsedThisMonth ? 'Achtung: Der Joker für diesen Monat ist schon verbraucht.'
        : `Noch ${Math.max(0, target - sessionsInWeek(dayKey(thisWeek), list).length)} bis zum Wochenziel.`;
  return `<section class="card streak gym-streak">
    <div class="streak-head">
      <div class="flame ${st.current > 0 ? 'lit' : ''}">${ICONS.tabGym}</div>
      <div class="streak-count">
        <div class="streak-num">${st.current}</div>
        <div class="streak-unit">${plural(st.current, 'Woche', 'Wochen')} in Folge</div>
      </div>
      <div class="streak-side">
        <div class="stat"><span class="muted">Rekord</span> <strong>${st.best}</strong></div>
        <div class="joker ${st.jokerUsedThisMonth ? 'used' : ''}" title="1 verpasste Woche pro Monat wird abgefangen">${ICONS.shield}<span>Joker ${st.jokerUsedThisMonth ? 'weg' : 'frei'}</span></div>
      </div>
    </div>
    <p class="streak-msg">${esc(msg)}</p>
    <div class="gs-grid">${cells.join('')}</div>
    <div class="cal-legend">
      <span><i class="lg st-done"></i>Ziel erreicht</span>
      <span><i class="lg st-joker"></i>Joker</span>
      <span><i class="lg st-missed"></i>verpasst</span>
    </div>
  </section>`;
}
/** ISO-Kalenderwoche */
function isoWeek(d) {
  const t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const day = t.getUTCDay() || 7;
  t.setUTCDate(t.getUTCDate() + 4 - day);
  const y0 = new Date(Date.UTC(t.getUTCFullYear(), 0, 1));
  return Math.ceil(((t - y0) / 86400000 + 1) / 7);
}

/* ---------- Gym-Tab ---------- */
function renderGym() {
  const now = new Date();
  const plans = gymPlans();
  const list = getGymSessions();
  const recent = [...list].reverse().slice(0, 8);
  app.innerHTML = `<div class="page">
    ${pageHead({ title: 'Gym', now })}
    ${gymWeekHtml(now)}
    ${gymStreakHtml(now)}
    <section class="section">
      <h2 class="section-title">Splits</h2>
      <div class="routine-list">${plans.splits.map((s) => `
        <div class="routine-row split-row">
          <a class="rr-main" href="#/gym/log/${encodeURIComponent(s.id)}">
            <div class="rr-name">${esc(s.name)}</div>
            <div class="rr-meta">${s.exercises.filter((e) => !COLLAPSED_BLOCKS.includes(e.block) && e.block !== 'warmup').length} Übungen${s.weekday != null ? ` · ${esc(weekdayName(s.weekday))}` : ''}</div>
          </a>
          <button class="icon-btn sm" data-act="gym-quick" data-split="${esc(s.id)}" aria-label="${esc(s.name)} abhaken" title="Abhaken">${ICONS.check}</button>
        </div>`).join('')}</div>
    </section>
    ${recent.length ? `<section class="section">
      <h2 class="section-title">Letzte Einheiten</h2>
      <ul class="hist-list card gym-hist">${recent.map((s) => `<li>
        <span class="hist-date">${esc(fmtDate(s.date))}</span>
        <a class="hist-name" href="#/gym/edit/${encodeURIComponent(s.id)}">${esc(splitById(s.splitId)?.name || s.splitName || s.splitId)}
          <span class="muted small">${s.quick ? 'abgehakt' : `${(s.exercises || []).length} Übungen`}${s.durationMin ? ` · ${s.durationMin} min` : ''}</span></a>
      </li>`).join('')}</ul>
    </section>` : ''}
    <section class="section">
      <h2 class="section-title">Übungen</h2>
      ${plans.splits.map((sp) => `<div class="card ex-progress">
        <div class="today-label">${esc(sp.name)}</div>
        ${sp.exercises.filter(isTracked).map((ex) => exerciseRowHtml(ex, sp.id)).join('')}
      </div>`).join('')}
    </section>
    ${plans.rules?.length ? `<section class="card"><h2 class="card-title">Grundregeln</h2>${plans.rules.map((t) => `<p class="small muted">${esc(t)}</p>`).join('')}</section>` : ''}
  </div>`;
}
function exerciseRowHtml(ex, splitId) {
  const st = exerciseStats(ex.id);
  const hint = progressionHint(ex, st);
  const spark = st ? sparkline(st.tops.slice(-12).map((t) => topValue(t.top, ex))) : '';
  return `<a class="exp-row" href="#/gym/uebung/${encodeURIComponent(ex.id)}">
    <div class="exp-main">
      <div class="exp-name">${esc(ex.name)}${ex.block && BLOCK_LABEL[ex.block] && ex.block !== 'ss1' && ex.block !== 'ss2' ? ` <span class="chip">${esc(BLOCK_LABEL[ex.block])}</span>` : ''}</div>
      <div class="exp-meta">${st
        ? `Zuletzt ${esc(st.last.sets.map((s) => fmtSet(s, ex)).join(', '))} · Bestwert ${esc(fmtSet(st.best, ex))}`
        : `Plan: ${esc(planDose(ex))}`}</div>
      ${hint ? `<div class="exp-hint">${ICONS.flame}<span>${esc(hint)}</span></div>` : ''}
    </div>
    <div class="exp-spark">${spark}</div>
  </a>`;
}

/* ---------- Einheit erfassen / bearbeiten ---------- */
/** Vorbelegung: Werte vom letzten Mal, sonst aus dem Plan. */
function prefillSets(ex) {
  const st = exerciseStats(ex.id);
  const n = Math.max(1, ex.sets || 1);
  const range = repsRange(ex.reps);
  const out = [];
  for (let i = 0; i < n; i++) {
    const lastSet = st?.last.sets[Math.min(i, st.last.sets.length - 1)];
    out.push({
      kg: ex.bodyweight ? '' : (lastSet?.kg ?? planKgForSet(ex, i) ?? ''),
      reps: lastSet?.reps ?? (range ? range[0] : ''),
      done: false,
    });
  }
  return out;
}
function newDraft(splitId) {
  const sp = splitById(splitId);
  const exercises = {};
  for (const ex of sp.exercises) exercises[ex.id] = { sets: prefillSets(ex) };
  return { splitId, sessionId: null, date: todayKey(), startedAt: Date.now(), durationMin: null, note: '', exercises, showMore: false };
}
function draftFromSession(s) {
  const sp = splitById(s.splitId);
  const exercises = {};
  for (const ex of sp?.exercises || []) {
    const logged = (s.exercises || []).find((e) => e.exerciseId === ex.id);
    exercises[ex.id] = { sets: logged ? logged.sets.map((x) => ({ kg: x.kg ?? '', reps: x.reps ?? '', done: true })) : prefillSets(ex) };
  }
  return { splitId: s.splitId, sessionId: s.id, date: s.date, startedAt: null, durationMin: s.durationMin ?? null, note: s.note || '', exercises, showMore: false, quick: !!s.quick, createdAt: s.createdAt };
}
/* Begonnene Einheiten pro Split zwischenspeichern – App schließen, Bildschirm sperren: nichts geht verloren */
let gymDraft = null;
const DRAFT_MAX_AGE_MS = 12 * 3600 * 1000;
function getDrafts() { const d = store.get(GYM_KEYS.draft, {}); return d && typeof d === 'object' && !Array.isArray(d) ? d : {}; }
function savedDraft(splitId) {
  const d = getDrafts()[splitId];
  return d && !d.sessionId && Date.now() - (d.startedAt || 0) < DRAFT_MAX_AGE_MS ? d : null;
}
function saveDraft() {
  if (!gymDraft || gymDraft.sessionId) return; // Bearbeiten einer gespeicherten Einheit braucht keinen Entwurf
  const all = getDrafts();
  all[gymDraft.splitId] = gymDraft;
  store.set(GYM_KEYS.draft, all);
}
function clearDraft() {
  if (!gymDraft) return;
  const all = getDrafts();
  delete all[gymDraft.splitId];
  store.set(GYM_KEYS.draft, all);
  gymDraft = null;
}

function renderGymLog(splitId, sessionId = null) {
  if (sessionId) {
    const s = getGymSessions().find((x) => x.id === sessionId);
    if (!s || !splitById(s.splitId)) { redirect('#/gym'); return; }
    if (!gymDraft || gymDraft.sessionId !== sessionId) gymDraft = draftFromSession(s);
  } else {
    if (!splitById(splitId)) { redirect('#/gym'); return; }
    const saved = savedDraft(splitId);
    if (gymDraft?.splitId === splitId && !gymDraft.sessionId) { /* weiter */ }
    else if (saved) gymDraft = saved; // begonnene Einheit fortsetzen
    else gymDraft = newDraft(splitId);
    saveDraft();
  }
  drawGymLog();
  clearInterval(gymTimer);
  if (!gymDraft.sessionId) gymTimer = setInterval(updateGymClock, 15000);
}

function drawGymLog() {
  const d = gymDraft;
  const sp = splitById(d.splitId);
  const groups = [];
  for (const ex of sp.exercises) {
    const hidden = COLLAPSED_BLOCKS.includes(ex.block) && !d.showMore && !(d.exercises[ex.id]?.sets || []).some((s) => s.done);
    if (hidden) continue;
    const g = groups[groups.length - 1];
    if ((ex.block === 'ss1' || ex.block === 'ss2') && g?.block === ex.block) g.items.push(ex);
    else groups.push({ block: ex.block, items: [ex] });
  }
  const hiddenCount = sp.exercises.filter((ex) => COLLAPSED_BLOCKS.includes(ex.block)).length;
  app.innerHTML = `<div class="page page-gymlog">
    ${topbar({ backHref: '#/gym', title: esc(d.sessionId ? 'Einheit bearbeiten' : 'Einheit erfassen') })}
    <h1 class="ov-title">${esc(sp.name)}</h1>
    <div class="gl-meta">
      <label>Datum <input type="date" data-gym-field="date" value="${esc(d.date)}" max="${todayKey()}"></label>
      <label>Dauer <input type="number" inputmode="numeric" min="0" max="300" data-gym-field="durationMin" value="${d.durationMin ?? ''}" placeholder="${d.startedAt ? '' : '–'}"> min</label>
      ${d.startedAt ? `<span class="gl-clock" id="gl-clock">${gymClockText()}</span>` : ''}
    </div>
    ${groups.map((g) => `<section class="gl-group ${g.items.length > 1 ? 'is-superset' : ''}">
      ${BLOCK_LABEL[g.block] ? `<div class="gl-block">${esc(BLOCK_LABEL[g.block])}${g.items.length > 1 ? ' · direkt hintereinander' : ''}</div>` : ''}
      ${g.items.map(exerciseLogHtml).join('')}
    </section>`).join('')}
    ${hiddenCount && !d.showMore ? `<button class="btn btn-ghost gl-more" data-act="gym-more">Optional und Ersatz anzeigen (${hiddenCount})</button>` : ''}
    <label class="gl-note">Notiz<textarea data-gym-field="note" rows="2" placeholder="z. B. wie es lief, Technik, Gefühl">${esc(d.note)}</textarea></label>
    ${d.sessionId ? `<button class="btn btn-ghost gl-delete" data-act="gym-delete">${ICONS.trash}<span>Einheit löschen</span></button>` : ''}
    <div class="start-bar"><button class="btn btn-primary btn-xl" data-act="gym-save">${ICONS.check}<span>Speichern</span></button></div>
  </div>`;
}
function exerciseLogHtml(ex) {
  const d = gymDraft;
  const sets = d.exercises[ex.id]?.sets || [];
  const st = exerciseStats(ex.id);
  const hint = progressionHint(ex, st);
  const unit = exUnit(ex) === 's' ? 's' : 'Wdh.';
  return `<article class="gl-ex" data-ex="${esc(ex.id)}">
    <div class="gl-ex-head">
      <div>
        <div class="gl-ex-name">${esc(ex.name)}</div>
        <div class="small muted">${esc(planDose(ex))}${ex.restSec ? ` · Pause ${Math.floor(ex.restSec / 60)}:${pad2(ex.restSec % 60)}` : ''}</div>
      </div>
      <button class="btn btn-ghost btn-sm" data-act="gym-all-done" data-ex="${esc(ex.id)}">Alle ✓</button>
    </div>
    ${hint ? `<div class="exp-hint">${ICONS.flame}<span>${esc(hint)}</span></div>` : ''}
    ${st ? `<div class="small muted">Letztes Mal (${esc(fmtDate(st.last.date))}): ${esc(st.last.sets.map((s) => fmtSet(s, ex)).join(', '))}</div>` : ''}
    ${ex.note || ex.alt ? `<details class="benefit"><summary>Hinweis</summary>${ex.note ? `<p>${esc(ex.note)}</p>` : ''}${ex.alt ? `<p><strong>Alternative:</strong> ${esc(ex.alt)}</p>` : ''}${ex.why ? `<p class="muted">${esc(ex.why)}</p>` : ''}</details>` : ex.why ? `<details class="benefit"><summary>Nutzen</summary><p>${esc(ex.why)}</p></details>` : ''}
    <div class="gl-sets">
      ${sets.map((s, i) => `<div class="gl-set ${s.done ? 'is-done' : ''}">
        <button class="gl-check" data-act="gym-set-done" data-ex="${esc(ex.id)}" data-set="${i}" aria-label="Satz ${i + 1} erledigt" aria-pressed="${s.done}">${s.done ? ICONS.check : `<span>${i + 1}</span>`}</button>
        ${ex.bodyweight ? '<span class="gl-bw">KG</span>' : `<label class="gl-in"><input type="text" inputmode="decimal" data-gym-field="kg" data-ex="${esc(ex.id)}" data-set="${i}" value="${esc(String(s.kg ?? '').replace('.', ','))}" aria-label="Satz ${i + 1} Gewicht"><span>kg</span></label>`}
        <span class="gl-x">×</span>
        <label class="gl-in"><input type="text" inputmode="numeric" data-gym-field="reps" data-ex="${esc(ex.id)}" data-set="${i}" value="${esc(s.reps ?? '')}" aria-label="Satz ${i + 1} ${unit}"><span>${unit}</span></label>
      </div>`).join('')}
      <div class="gl-set-btns">
        <button class="btn btn-ghost btn-sm" data-act="gym-add-set" data-ex="${esc(ex.id)}">+ Satz</button>
        ${sets.length > 1 ? `<button class="btn btn-ghost btn-sm" data-act="gym-del-set" data-ex="${esc(ex.id)}">− Satz</button>` : ''}
      </div>
    </div>
  </article>`;
}
function gymClockText() {
  if (!gymDraft?.startedAt) return '';
  const min = Math.max(0, Math.round((Date.now() - gymDraft.startedAt) / 60000));
  return `läuft seit ${min} min`;
}
function updateGymClock() {
  const el = document.getElementById('gl-clock');
  if (el) el.textContent = gymClockText();
}

/** Eingaben auf der Erfassen-Seite übernehmen (ohne Neuzeichnen, damit der Fokus bleibt). */
app.addEventListener('input', (e) => {
  const f = e.target.dataset?.gymField;
  if (!f || !gymDraft) return;
  if (f === 'date') gymDraft.date = e.target.value || todayKey();
  else if (f === 'note') gymDraft.note = e.target.value;
  else if (f === 'durationMin') gymDraft.durationMin = e.target.value === '' ? null : Number(e.target.value);
  else {
    const set = gymDraft.exercises[e.target.dataset.ex]?.sets[Number(e.target.dataset.set)];
    if (!set) return;
    const raw = e.target.value.trim().replace(',', '.');
    set[f] = raw === '' ? '' : raw;
    if (!set.done && raw !== '') { set.done = true; markSetUi(e.target.dataset.ex, Number(e.target.dataset.set)); } // Eintippen = Satz gemacht
  }
  saveDraft();
});
function markSetUi(exId, i) {
  const row = app.querySelector(`.gl-ex[data-ex="${CSS.escape(exId)}"] .gl-set:nth-child(${i + 1})`);
  if (!row) return;
  row.classList.add('is-done');
  const b = row.querySelector('.gl-check');
  b.innerHTML = ICONS.check;
  b.setAttribute('aria-pressed', 'true');
}

function toNum(v) { const n = Number(String(v ?? '').replace(',', '.')); return v === '' || v == null || !Number.isFinite(n) ? null : n; }

async function handleGymAction(act, el) {
  const exId = el.dataset.ex;
  const ex = gymDraft?.exercises[exId];
  switch (act) {
    case 'gym-quick': {
      const sp = splitById(el.dataset.split);
      if (!sp) return;
      const ok = await confirmModal({ title: 'Gym erledigt?', text: `${sp.name} – heute, ${fmtDate(todayKey())}`, ok: 'Abhaken', cancel: 'Abbrechen' });
      if (!ok) return;
      const now = new Date().toISOString();
      saveGymSession({ id: genId(), date: todayKey(), splitId: sp.id, splitName: sp.name, quick: true, durationMin: null, note: '', exercises: [], createdAt: now, updatedAt: now });
      toast(`Abgehakt: ${sp.name}`);
      rerenderCurrent();
      break;
    }
    case 'gym-set-done': {
      const s = ex?.sets[Number(el.dataset.set)];
      if (!s) return;
      s.done = !s.done;
      saveDraft(); drawGymLogKeepScroll();
      break;
    }
    case 'gym-all-done': if (ex) { ex.sets.forEach((s) => { s.done = true; }); saveDraft(); drawGymLogKeepScroll(); } break;
    case 'gym-add-set': if (ex) { const l = ex.sets[ex.sets.length - 1] || { kg: '', reps: '' }; ex.sets.push({ kg: l.kg, reps: l.reps, done: false }); saveDraft(); drawGymLogKeepScroll(); } break;
    case 'gym-del-set': if (ex && ex.sets.length > 1) { ex.sets.pop(); saveDraft(); drawGymLogKeepScroll(); } break;
    case 'gym-more': gymDraft.showMore = true; saveDraft(); drawGymLogKeepScroll(); break;
    case 'gym-save': await saveGymDraft(); break;
    case 'gym-delete': {
      const ok = await confirmModal({ title: 'Einheit löschen?', text: 'Sie verschwindet auf allen Geräten.', ok: 'Löschen', danger: true });
      if (!ok) return;
      deleteGymSession(gymDraft.sessionId);
      gymDraft = null;
      toast('Einheit gelöscht.');
      location.hash = '#/gym';
      break;
    }
  }
}
function drawGymLogKeepScroll() { const y = window.scrollY; drawGymLog(); window.scrollTo(0, y); }

async function saveGymDraft() {
  const d = gymDraft;
  const sp = splitById(d.splitId);
  const exercises = [];
  for (const exPlan of sp.exercises) {
    const sets = (d.exercises[exPlan.id]?.sets || []).filter((s) => s.done)
      .map((s) => ({ kg: exPlan.bodyweight ? null : toNum(s.kg), reps: toNum(s.reps) }))
      .filter((s) => s.reps != null || s.kg != null);
    if (sets.length) exercises.push({ exerciseId: exPlan.id, name: exPlan.name, sets });
  }
  if (!exercises.length) {
    const ok = await confirmModal({ title: 'Keine Sätze abgehakt', text: 'Trotzdem als erledigt speichern (ohne Sätze)?', ok: 'Speichern', cancel: 'Zurück' });
    if (!ok) return;
  }
  const now = new Date().toISOString();
  const duration = d.durationMin != null && d.durationMin !== '' ? Number(d.durationMin)
    : d.startedAt ? Math.max(1, Math.round((Date.now() - d.startedAt) / 60000)) : null;
  const session = {
    id: d.sessionId || genId(),
    date: /^\d{4}-\d{2}-\d{2}$/.test(d.date) ? d.date : todayKey(),
    splitId: sp.id, splitName: sp.name,
    quick: !exercises.length,
    durationMin: duration,
    note: d.note.trim(),
    exercises,
    createdAt: d.createdAt || now,
    updatedAt: now,
  };
  saveGymSession(session);
  const wasEdit = !!d.sessionId;
  if (!wasEdit) clearDraft(); else gymDraft = null;
  toast(wasEdit ? 'Einheit aktualisiert.' : `Gespeichert: ${sp.name}${duration ? ` · ${duration} min` : ''}`);
  location.hash = '#/gym';
}

/* ---------- Übung im Detail ---------- */
function renderGymExercise(exId) {
  const ex = planExercise(exId);
  if (!ex) { redirect('#/gym'); return; }
  const st = exerciseStats(exId);
  const hint = progressionHint(ex, st);
  const valueLabel = ex.bodyweight || !(st?.tops.some((t) => Number(t.top?.kg) > 0)) ? (exUnit(ex) === 's' ? 'Sekunden' : 'Wiederholungen') : 'kg im schwersten Satz';
  app.innerHTML = `<div class="page">
    ${topbar({ backHref: '#/gym', title: '' })}
    <h1 class="ov-title">${esc(ex.name)}</h1>
    <p class="muted">Plan: ${esc(planDose(ex))}</p>
    ${hint ? `<div class="exp-hint big">${ICONS.flame}<span>${esc(hint)}</span></div>` : ''}
    ${st ? `<section class="card">
      <div class="ex-stats">
        <div><span class="muted small">Zuletzt (${esc(fmtDate(st.last.date))})</span><strong>${esc(st.last.sets.map((s) => fmtSet(s, ex)).join(', '))}</strong></div>
        <div><span class="muted small">Bestwert (${esc(fmtDate(st.bestDate))})</span><strong>${esc(fmtSet(st.best, ex))}</strong></div>
      </div>
      ${st.tops.length > 1 ? `<div class="ex-chart">${sparkline(st.tops.slice(-24).map((t) => topValue(t.top, ex)), { w: 320, h: 90, cls: 'spark big' })}<div class="small muted">${esc(valueLabel)}, letzte ${Math.min(24, st.tops.length)} Einheiten</div></div>` : ''}
    </section>
    <section class="card">
      <h2 class="card-title">Verlauf</h2>
      <ul class="hist-list">${[...st.hist].reverse().slice(0, 30).map((h) => `<li>
        <span class="hist-date">${esc(fmtDate(h.date))}</span>
        <span class="hist-name">${esc(h.sets.map((s) => fmtSet(s, ex)).join(', '))}</span>
      </li>`).join('')}</ul>
    </section>` : '<section class="card"><p class="muted">Noch nicht erfasst. Beim ersten „Erfassen“ wird der Plan vorausgefüllt.</p></section>'}
    ${ex.note || ex.why || ex.alt ? `<section class="card">
      ${ex.note ? `<p>${esc(ex.note)}</p>` : ''}
      ${ex.alt ? `<p><strong>Alternative:</strong> ${esc(ex.alt)}</p>` : ''}
      ${ex.why ? `<p class="small muted">${esc(ex.why)}</p>` : ''}
    </section>` : ''}
  </div>`;
}
