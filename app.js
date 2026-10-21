'use strict';

/* =========================================================================
   Routinen-App
   Alle Übungen, der Zyklus und die Rollen einzelner Routinen (Wochen-Routine,
   Extra-Vorschlag) kommen aus der Routinen-Datei – im Code steht nichts davon.
   ========================================================================= */

/* Rollen aus routines.json → "roles" */
const weeklyRole = () => DATA?.roles?.weekly || null;   // { routine, weekday (0 = So), hint, cooldown }
const extraRole = () => DATA?.roles?.extra || null;     // { routine, onPlanDays: [...] }
const WEEKLY_ID = () => weeklyRole()?.routine || null;
const weeklyName = () => shortName(routineById(WEEKLY_ID())) || 'Wochen-Routine';
const weekdayName = (n) => new Date(2024, 0, 7 + n).toLocaleDateString('de-DE', { weekday: 'long' }); // 7.1.2024 = Sonntag
const MILESTONES = [7, 14, 21, 30, 50, 75, 100, 150, 200, 250, 300, 365, 500, 1000];

const KEYS = {
  settings: 'dehnapp.settings.v1',
  history: 'dehnapp.history.v1',
  deleted: 'dehnapp.deleted.v1',
  meta: 'dehnapp.meta.v1',
  routinesCache: 'dehnapp.routines.cache.v1',
  voiceIndex: 'dehnapp.voice.index.v1',
};
const SYNC_PATH = 'dehn.json';               // Verlauf im privaten GitHub-Daten-Repository
const ROUTINES_PATH = 'dehn-routines.json';  // Routinen im selben Repository
let routinesSource = null; // github | local | cache
let routinesError = null;
const BACKUP_REMINDER_DAYS = 30;
const APP_DEFAULTS = {
  transitionSeconds: 10,
  sideSwitchSeconds: 5,
  defaultSecondsPerRep: 3,
  defaultRestBetweenSetsSeconds: 30,
  autoAdvanceRepExercises: true,
  sound: true,
  voice: true,
  firstVoiceSynth: true, // iPad/iPhone: erste Ansage jeder Einheit über die Systemstimme (Ton im Stummmodus hörbar)
};

/* ---------- Speicher (localStorage, immer mit try/catch) ---------- */
const store = {
  get(key, fallback) {
    try {
      const raw = localStorage.getItem(key);
      return raw == null ? fallback : JSON.parse(raw);
    } catch {
      return fallback;
    }
  },
  set(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
      return true;
    } catch {
      return false;
    }
  },
  remove(key) {
    try { localStorage.removeItem(key); } catch { /* egal */ }
  },
};

/** Prüft, ob localStorage wirklich schreib- und lesbar ist (z. B. nicht in privaten Fenstern blockiert). */
function checkStorage() {
  try {
    const k = 'dehnapp.test';
    localStorage.setItem(k, '1');
    const ok = localStorage.getItem(k) === '1';
    localStorage.removeItem(k);
    return ok;
  } catch {
    return false;
  }
}
let storageOk = true;
let storagePersisted = null; // true = Browser löscht die Daten nicht automatisch
async function requestPersist(ask = true) {
  try {
    if (!navigator.storage?.persisted) return;
    storagePersisted = await navigator.storage.persisted();
    if (!storagePersisted && ask && navigator.storage.persist) storagePersisted = await navigator.storage.persist();
  } catch { /* optional */ }
}
const getMeta = () => { const m = store.get(KEYS.meta, {}); return m && typeof m === 'object' ? m : {}; };
const saveMeta = (patch) => store.set(KEYS.meta, { ...getMeta(), ...patch });
const genId = () => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

/* ---------- Hilfsfunktionen ---------- */
const ESC_MAP = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ESC_MAP[c]);
const pad2 = (n) => String(n).padStart(2, '0');
const dayKey = (d) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
const parseDay = (k) => { const [y, m, d] = k.split('-').map(Number); return new Date(y, m - 1, d); };
const addDays = (d, n) => { const x = new Date(d.getFullYear(), d.getMonth(), d.getDate()); x.setDate(x.getDate() + n); return x; };
const weekStart = (d) => addDays(d, -((d.getDay() + 6) % 7)); // Montag
const weekKey = (d) => dayKey(weekStart(d));
const todayKey = () => dayKey(new Date());
const cap = (s) => (s ? s[0].toUpperCase() + s.slice(1) : '');

function fmtClock(sec) {
  const s = Math.max(0, Math.ceil(sec));
  return `${Math.floor(s / 60)}:${pad2(s % 60)}`;
}
const fmtDuration = (sec) => `≈ ${Math.max(1, Math.round(sec / 60))} min`;
const fmtDate = (key) => parseDay(key).toLocaleDateString('de-DE', { weekday: 'short', day: 'numeric', month: 'numeric' });
const plural = (n, one, many) => (n === 1 ? one : many);

/* ---------- Icons ---------- */
const svg = (inner, cls = '') =>
  `<svg class="ico ${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${inner}</svg>`;
const ICONS = {
  settings: svg('<path d="M4 6h9M17 6h3M4 12h3M11 12h9M4 18h11M19 18h1"/><circle cx="15" cy="6" r="2"/><circle cx="9" cy="12" r="2"/><circle cx="17" cy="18" r="2"/>'),
  back: svg('<path d="M15 5l-7 7 7 7"/>'),
  chevron: svg('<path d="M9 5l7 7-7 7"/>', 'chev'),
  close: svg('<path d="M6 6l12 12M18 6L6 18"/>'),
  play: svg('<path d="M7 4.5v15l12.5-7.5z" fill="currentColor"/>'),
  pause: svg('<rect x="6" y="4.5" width="4" height="15" rx="1" fill="currentColor" stroke="none"/><rect x="14" y="4.5" width="4" height="15" rx="1" fill="currentColor" stroke="none"/>'),
  prev: svg('<path d="M19 5.5L9.5 12l9.5 6.5z" fill="currentColor"/><path d="M6 5v14"/>'),
  next: svg('<path d="M5 5.5l9.5 6.5L5 18.5z" fill="currentColor"/><path d="M18 5v14"/>'),
  check: svg('<path d="M5 12.5l4.5 4.5L19 7.5"/>'),
  clock: svg('<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>'),
  flame: svg('<path d="M12 2.5c.6 3.2-1.2 5.2-2.9 7.1C7.6 11.3 6 13 6 15.6 6 19 8.7 21.5 12 21.5s6-2.5 6-5.9c0-2.6-1.4-4.6-2.8-6.2.1 1.7-.6 3-1.7 3.6.5-3.8-.4-7.4-1.5-10.5z" fill="currentColor" stroke="none"/>'),
  moon: svg('<path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z"/>'),
  trash: svg('<path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/>'),
  shield: svg('<path d="M12 3l7 3v6c0 4.5-3 7.5-7 9-4-1.5-7-4.5-7-9V6z"/>'),
};

/* ---------- Zustand ---------- */
let DATA = null;       // Inhalt von routines.json
let cfg = { ...APP_DEFAULTS };
let run = null;        // laufende Einheit
let lastResult = null; // für den Fertig-Screen
let playerEls = null;  // gecachte DOM-Elemente des Players
const app = document.getElementById('app');

/* =========================================================================
   Einstellungen
   ========================================================================= */
function refreshCfg() {
  const overrides = store.get(KEYS.settings, {});
  cfg = { ...APP_DEFAULTS, ...(DATA?.settings || {}), ...(overrides && typeof overrides === 'object' ? overrides : {}) };
}
function saveSetting(key, value) {
  const o = store.get(KEYS.settings, {}) || {};
  o[key] = value;
  store.set(KEYS.settings, o);
  refreshCfg();
}

/* =========================================================================
   Routinen & Ablauf-Schritte
   ========================================================================= */
const routineById = (id) => DATA.routines.find((r) => r.id === id) || null;
const cycleList = () => (Array.isArray(DATA.rotation?.cycle) ? DATA.rotation.cycle : []);
const isCycleRoutine = (id) => id !== 'pause' && cycleList().includes(id);
const shortName = (r) => (r ? r.name.replace(/\s*\(.*\)\s*$/, '') : '');
const planName = (id) => (id === 'pause' ? 'Pause' : shortName(routineById(id)) || id);
const planLetter = (id) => (id === 'pause' ? 'P' : (shortName(routineById(id)) || id || '?')[0].toUpperCase());

function doseText(ex) {
  const sets = ex.sets > 1 ? `${ex.sets} × ` : '';
  const amount = ex.type === 'reps' ? `${ex.reps} Wdh.` : `${ex.seconds} s`;
  const side = ex.perSide ? (ex.alternating ? ' je Seite, abwechselnd' : ' je Seite') : '';
  return sets + amount + side;
}
function rangeText(ex) {
  const r = ex.repsRange || ex.secondsRange;
  if (!r) return '';
  const unit = /\d$/.test(r) ? (ex.repsRange ? ' Wdh.' : ' s') : '';
  return `Zielbereich: ${r}${unit}`;
}
function spokenDose(ex) {
  if (ex.type === 'reps') return `${ex.reps} Wiederholungen${ex.perSide && ex.alternating ? ' je Seite' : ''}`;
  return `${ex.seconds} Sekunden`;
}
/** Bausteine einer Ansage – müssen zu werkzeuge/ansagen-erzeugen.ps1 im Daten-Repository passen. */
function announceParts(st) {
  return [st.ex.name, st.side, st.sets > 1 ? `Satz ${st.set} von ${st.sets}` : null, spokenDose(st.ex)].filter(Boolean);
}
/** Was beim Betreten eines Schritts angesagt wird (oder null). */
function stepParts(st, prev) {
  switch (st.kind) {
    case 'transition': return announceParts(st);
    case 'switch': return ['Seitenwechsel', st.side];
    case 'rest': return ['Satzpause', `${st.duration} Sekunden`];
    case 'work': return !prev || prev.unit !== st.unit ? announceParts(st) : null; // ohne Übergang direkt ansagen
    default: return null;
  }
}

function workDuration(ex) {
  if (ex.type === 'reps') {
    const perRep = ex.secondsPerRep || cfg.defaultSecondsPerRep || 3;
    const factor = ex.perSide && ex.alternating ? 2 : 1; // abwechselnd: beide Seiten in einem Satz
    return (ex.reps || 0) * perRep * factor;
  }
  return ex.seconds || 0;
}

/**
 * Wandelt eine Routine in eine flache Liste von Schritten um:
 * transition (vor der Übung) → work → switch (Seitenwechsel) → work → rest (Satzpause) → …
 * Alle Schritte bis inkl. eines work-Schritts bilden eine "unit" (für Zurück).
 */
function buildSteps(routine) {
  const steps = [];
  routine.exercises.forEach((ex, exIndex) => {
    const sets = Math.max(1, ex.sets || 1);
    const sides = ex.perSide && !ex.alternating ? ['links', 'rechts'] : [null];
    const rest = ex.restSeconds ?? cfg.defaultRestBetweenSetsSeconds ?? 30;
    const duration = workDuration(ex);
    for (let set = 1; set <= sets; set++) {
      sides.forEach((side, si) => {
        const base = { exIndex, ex, set, sets, side };
        if (set === 1 && si === 0) {
          if (cfg.transitionSeconds > 0) steps.push({ ...base, kind: 'transition', duration: cfg.transitionSeconds });
        } else if (si > 0) {
          if (cfg.sideSwitchSeconds > 0) steps.push({ ...base, kind: 'switch', duration: cfg.sideSwitchSeconds });
        } else if (rest > 0) {
          steps.push({ ...base, kind: 'rest', duration: rest });
        }
        steps.push({ ...base, kind: 'work', duration });
      });
    }
  });
  let unit = 0;
  for (const s of steps) { s.unit = unit; if (s.kind === 'work') unit++; }
  return steps;
}
const totalDuration = (routine) => buildSteps(routine).reduce((a, s) => a + s.duration, 0);
const isRepsStep = (st) => st.kind === 'work' && st.ex.type === 'reps';

/* =========================================================================
   Verlauf & Streak
   ========================================================================= */
function getHistory() {
  const h = store.get(KEYS.history, []);
  return Array.isArray(h) ? h.filter((e) => e && e.routineId && /^\d{4}-\d{2}-\d{2}$/.test(e.date)) : [];
}
function setHistory(h) { return store.set(KEYS.history, h); }
function addHistory(entry) { const h = getHistory(); h.push(entry); return setHistory(h); }
/** IDs gelöschter Einträge – damit sie beim Abgleich nicht von einem anderen Gerät zurückkommen. */
function getDeleted() { const d = store.get(KEYS.deleted, []); return Array.isArray(d) ? d.filter((x) => typeof x === 'string') : []; }
function deleteHistoryEntry(id) {
  setHistory(getHistory().filter((h) => h.id !== id));
  store.set(KEYS.deleted, [...new Set([...getDeleted(), id])]);
}

/* ---------- Backup (Export / Import) ---------- */
async function exportBackup() {
  const now = new Date();
  const data = { app: 'dehnapp', version: 1, exportedAt: now.toISOString(), history: getHistory(), deleted: getDeleted() };
  const name = `dehn-backup-${dayKey(now)}.json`;
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  // Auf dem Handy über das Teilen-Menü (Dateien, Drive, Mail …), am PC als Download
  const touch = window.matchMedia?.('(pointer: coarse)').matches;
  try {
    const file = new File([blob], name, { type: 'application/json' });
    if (touch && navigator.canShare?.({ files: [file] })) {
      await navigator.share({ files: [file], title: 'Dehn-App Backup' });
      saveMeta({ lastBackupAt: now.toISOString() });
      return true;
    }
  } catch (err) {
    if (err?.name === 'AbortError') return false; // Teilen abgebrochen
  }
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  saveMeta({ lastBackupAt: now.toISOString() });
  return true;
}

/** Führt importierte Einträge mit dem vorhandenen Verlauf zusammen (keine Duplikate). */
function mergeHistory(incoming) {
  const cur = getHistory();
  const ids = new Set([...cur.map((h) => h.id), ...getDeleted()]);
  const sigs = new Set(cur.map((h) => `${h.date}|${h.routineId}|${h.completedAt}`));
  let added = 0;
  for (const h of incoming) {
    if (!h || typeof h.routineId !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(h.date)) continue;
    const [y, m, d] = h.date.split('-').map(Number);
    const completedAt = typeof h.completedAt === 'string' ? h.completedAt : new Date(y, m - 1, d, 12).toISOString();
    const sig = `${h.date}|${h.routineId}|${completedAt}`;
    if ((h.id && ids.has(h.id)) || sigs.has(sig)) continue;
    const entry = { id: typeof h.id === 'string' && h.id ? h.id : genId(), routineId: h.routineId, date: h.date, completedAt };
    if (Number.isFinite(h.durationSec)) entry.durationSec = h.durationSec;
    if (h.manual) entry.manual = true;
    cur.push(entry);
    ids.add(entry.id);
    sigs.add(sig);
    added++;
  }
  return { added, ok: added === 0 || setHistory(cur) };
}

/* ---------- GitHub-Sync ---------- */
const validEntry = (h) => h && typeof h.id === 'string' && typeof h.routineId === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(h.date);
const localSnapshot = () => ({ app: 'dehnapp', version: 1, history: getHistory(), deleted: getDeleted() });

/** Vereinigung beider Stände: alle Einträge (nach id), minus alles, was irgendwo gelöscht wurde. */
function mergeSnapshots(a, b) {
  const deleted = [...new Set([...(a?.deleted || []), ...(b?.deleted || [])])].filter((x) => typeof x === 'string').sort();
  const gone = new Set(deleted);
  const byId = new Map();
  for (const h of [...(a?.history || []), ...(b?.history || [])]) {
    if (validEntry(h) && !gone.has(h.id) && !byId.has(h.id)) byId.set(h.id, h);
  }
  const history = [...byId.values()].sort((x, y) => x.date.localeCompare(y.date) || String(x.completedAt).localeCompare(String(y.completedAt)) || x.id.localeCompare(y.id));
  return { app: 'dehnapp', version: 1, history, deleted };
}
const snapshotKey = (s) => JSON.stringify([(s?.history || []).map((h) => h.id).sort(), [...(s?.deleted || [])].sort()]);
const sameSnapshot = (a, b) => snapshotKey(a) === snapshotKey(b);

const sync = { busy: false, again: false, timer: null, status: 'off', message: '' };
function scheduleSync(delay = 400) {
  if (!GHSync.getConfig()) return;
  clearTimeout(sync.timer);
  sync.timer = setTimeout(runSync, delay);
}
async function runSync() {
  if (!GHSync.getConfig() || !storageOk) { sync.status = 'off'; return; }
  if (sync.busy) { sync.again = true; return; }
  if (navigator.onLine === false) { setSyncStatus('offline', 'Offline – wird abgeglichen, sobald Internet da ist.'); return; }
  sync.busy = true;
  setSyncStatus('busy', 'Gleiche ab …');
  try {
    const before = snapshotKey(localSnapshot());
    const res = await GHSync.syncFile(SYNC_PATH, {
      local: localSnapshot(),
      merge: mergeSnapshots,
      equals: sameSnapshot,
      message: `Dehn-App: ${getHistory().length} Einheiten`,
    });
    // Erneut mit dem aktuellen lokalen Stand mergen – falls während des Abgleichs etwas dazukam
    const merged = mergeSnapshots(localSnapshot(), res.data);
    setHistory(merged.history);
    store.set(KEYS.deleted, merged.deleted);
    if (snapshotKey(merged) !== snapshotKey(res.data)) sync.again = true;
    saveMeta({ lastSyncAt: new Date().toISOString() });
    setSyncStatus('ok', '');
    if (snapshotKey(merged) !== before) refreshAfterSync();
  } catch (e) {
    const code = e?.code || 'other';
    setSyncStatus(code === 'network' ? 'offline' : 'error', e?.message || 'Unbekannter Fehler beim Abgleich.');
  } finally {
    sync.busy = false;
    if (sync.again) { sync.again = false; scheduleSync(1000); }
  }
}
function setSyncStatus(status, message) {
  sync.status = status;
  sync.message = message;
  const dot = document.getElementById('sync-dot');
  if (dot) { dot.className = `sync-dot s-${status}`; dot.title = syncTitle(); }
  const box = document.getElementById('sync-status');
  if (box) box.innerHTML = syncStatusHtml();
}
function syncTitle() {
  const last = getMeta().lastSyncAt;
  return { ok: 'Synchronisiert', busy: 'Gleicht ab …', offline: 'Offline', error: 'Sync-Fehler', off: 'Sync aus' }[sync.status]
    + (last ? ` · zuletzt ${new Date(last).toLocaleString('de-DE', { day: 'numeric', month: 'numeric', hour: '2-digit', minute: '2-digit' })}` : '');
}
function refreshAfterSync() {
  if (run || modalOpen() || !DATA) return;
  const r = currentRoute().name;
  if (r === 'home') renderHome();
  else if (r === 'settings') renderSettings();
}

async function connectSync(owner, repo, token) {
  const cfg = { owner: owner.trim().replace(/^@/, ''), repo: repo.trim(), token: token.trim() };
  if (!cfg.owner || !cfg.repo || !cfg.token) return 'Bitte Benutzername, Repository und Token ausfüllen.';
  let info;
  try {
    info = await GHSync.testRepo(cfg);
  } catch (e) {
    return e?.message || 'Verbindung fehlgeschlagen.';
  }
  if (!info.private) {
    const ok = await confirmModal({
      title: 'Repository ist öffentlich',
      text: `${info.fullName} ist öffentlich – jeder könnte deinen Trainingsverlauf sehen. Empfohlen: das Repository auf „Private“ stellen.`,
      ok: 'Trotzdem verbinden',
      cancel: 'Abbrechen',
    });
    if (!ok) return null;
  }
  if (!GHSync.setConfig(cfg)) return 'Konnte die Zugangsdaten nicht speichern.';
  await runSync();
  return null;
}

async function importBackup(file) {
  let data;
  try {
    data = JSON.parse(await file.text());
  } catch {
    return 'Die Datei ist kein gültiges Backup (kein JSON).';
  }
  const list = Array.isArray(data) ? data : data?.history;
  if (!Array.isArray(list)) return 'Die Datei enthält keinen Verlauf.';
  const { added, ok } = mergeHistory(list);
  if (!ok) return 'Speichern fehlgeschlagen – der Browser blockiert den lokalen Speicher.';
  return added ? `${added} ${plural(added, 'Einheit', 'Einheiten')} importiert.` : 'Nichts Neues – alle Einträge waren schon vorhanden.';
}

/**
 * Rhythmus-Streak: Tag für Tag ab der ersten Einheit durchspielen.
 *  - Dehneinheit aus dem Zyklus erledigt → +1, Zyklus geht nach der erledigten Routine weiter
 *  - geplanter Pausentag → +1 (Pause gehört zum Plan)
 *  - verpasster Dehntag → 1 Joker pro Kalenderwoche fängt ihn ab (Streak bleibt, +0),
 *    sonst Reset auf 0. Der Zyklus bleibt stehen (Vorschlag = nächster Plan nach der letzten Einheit).
 *  - heute noch offen → zählt (noch) nicht als verpasst.
 */
function computeStreak(history, now = new Date()) {
  const cyc = cycleList();
  const tKey = dayKey(now);
  const result = {
    current: 0, best: 0, days: new Map(), doneByDay: new Map(),
    expectedToday: cyc[0] || null, doneToday: null, nextIdx: 0,
    todayStatus: 'open', jokerUsedThisWeek: false, startKey: null,
  };
  if (!cyc.length) return result;

  const entries = history
    .filter((h) => isCycleRoutine(h.routineId) && h.date <= tKey)
    .sort((a, b) => a.date.localeCompare(b.date) || new Date(a.completedAt) - new Date(b.completedAt));
  for (const h of entries) {
    if (!result.doneByDay.has(h.date)) result.doneByDay.set(h.date, []);
    result.doneByDay.get(h.date).push(h.routineId);
  }
  if (!entries.length) return result;

  result.startKey = entries[0].date;
  const jokerWeeks = new Set();
  let current = 0, best = 0, expIdx = 0;

  for (let d = parseDay(result.startKey); dayKey(d) <= tKey; d = addDays(d, 1)) {
    const k = dayKey(d);
    const isToday = k === tKey;
    if (isToday) result.expectedToday = cyc[expIdx];
    const done = result.doneByDay.get(k);
    if (done) {
      const last = done[done.length - 1];
      expIdx = (cyc.indexOf(last) + 1) % cyc.length;
      current++;
      result.days.set(k, 'done');
      if (isToday) result.doneToday = last;
    } else if (cyc[expIdx] === 'pause') {
      current++;
      result.days.set(k, 'pause');
      expIdx = (expIdx + 1) % cyc.length;
    } else if (isToday) {
      result.days.set(k, 'open');
    } else if (current > 0 && !jokerWeeks.has(weekKey(d))) {
      jokerWeeks.add(weekKey(d));
      result.days.set(k, 'joker');
    } else {
      current = 0;
      result.days.set(k, 'missed');
    }
    best = Math.max(best, current);
  }

  Object.assign(result, {
    current, best, nextIdx: expIdx,
    todayStatus: result.days.get(tKey) || 'open',
    jokerUsedThisWeek: jokerWeeks.has(weekKey(now)),
  });
  return result;
}
const nextExpected = (s) => cycleList()[s.nextIdx] ?? null;

/** Wochen-Streak: Kalenderwochen in Folge mit mind. einer Einheit der Wochen-Routine. */
function computeWeekly(history, now = new Date()) {
  const weeklyEntries = history.filter((h) => h.routineId === WEEKLY_ID());
  const weeks = new Set(weeklyEntries.map((h) => weekKey(parseDay(h.date))));
  const days = new Set(weeklyEntries.map((h) => h.date));
  const doneThisWeek = weeks.has(weekKey(now));
  let w = doneThisWeek ? weekStart(now) : addDays(weekStart(now), -7);
  let current = 0;
  while (weeks.has(dayKey(w))) { current++; w = addDays(w, -7); }
  let best = 0, streak = 0, prev = null;
  for (const k of [...weeks].sort()) {
    streak = prev && dayKey(addDays(parseDay(prev), 7)) === k ? streak + 1 : 1;
    best = Math.max(best, streak);
    prev = k;
  }
  return { current, best, doneThisWeek, days, doneToday: days.has(dayKey(now)) };
}

/* =========================================================================
   Audio, Sprache, Wake Lock
   ========================================================================= */
let actx = null;
function audioInit() {
  try {
    actx = actx || new (window.AudioContext || window.webkitAudioContext)();
    // iPadOS meldet nach Unterbrechungen (Anruf, anderes Audio, Sprachausgabe) "interrupted"
    if (actx.state !== 'running') actx.resume().catch(() => {});
  } catch { actx = null; }
}
function tone(freq, dur, { type = 'sine', vol = 0.28, delay = 0 } = {}) {
  if (!actx || !cfg.sound) return;
  try {
    if (actx.state !== 'running') actx.resume().catch(() => {});
    const t0 = actx.currentTime + delay;
    const osc = actx.createOscillator();
    const gain = actx.createGain();
    osc.type = type;
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(0.0001, t0);
    gain.gain.exponentialRampToValueAtTime(vol, t0 + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(gain).connect(actx.destination);
    osc.start(t0);
    osc.stop(t0 + dur + 0.03);
  } catch { /* Audio ist optional */ }
}
const sfx = {
  tick: () => tone(660, 0.13),
  start: () => { tone(880, 0.12); tone(1175, 0.4, { delay: 0.12 }); },
  switchSide: () => { tone(740, 0.16); tone(988, 0.16, { delay: 0.2 }); tone(740, 0.22, { delay: 0.4 }); },
  rest: () => tone(440, 0.4, { type: 'triangle' }),
  soft: () => tone(587, 0.18, { vol: 0.16 }),
  done: () => [523, 659, 784, 1047].forEach((f, i) => tone(f, 0.32, { delay: i * 0.15 })),
};

const hasSpeech = 'speechSynthesis' in window && 'SpeechSynthesisUtterance' in window;
let deVoice = null;
function pickVoice() {
  try {
    const voices = speechSynthesis.getVoices();
    deVoice = voices.find((v) => v.lang === 'de-DE' && v.localService)
      || voices.find((v) => v.lang === 'de-DE')
      || voices.find((v) => (v.lang || '').toLowerCase().startsWith('de'))
      || null;
  } catch { deVoice = null; }
}
if (hasSpeech) { pickVoice(); speechSynthesis.addEventListener?.('voiceschanged', pickVoice); }
/** Ersatz: eingebaute Sprachausgabe (auf dem iPad pausiert sie laufende Videos). */
function speakSynth(text) {
  if (!hasSpeech) return;
  try {
    speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.lang = 'de-DE';
    if (deVoice) u.voice = deVoice;
    u.rate = 1.0;
    speechSynthesis.speak(u);
  } catch { /* Sprache ist optional */ }
}

/* ---------- Ansagen als Aufnahmen ----------
 * Die Aufnahmen (dehn-audio/*.wav im privaten Daten-Repository) werden wie die Countdown-Töne
 * über Web Audio abgespielt: Sie mischen sich mit Videos/Musik (Bild-in-Bild läuft weiter),
 * richten sich nach der Medienlautstärke und werden für offline zwischengespeichert.
 */
const VOICE_DIR = 'dehn-audio';
const VOICE_CACHE = 'dehn-ansagen-v1';
const voice = { index: null, files: new Map(), decoded: new Map(), sources: [], seq: 0 };
const voiceKey = (t) => String(t).trim().toLowerCase().replace(/\s+/g, ' ');
const hasCacheApi = 'caches' in window;

async function loadVoiceIndex() {
  const gh = GHSync.getConfig();
  if (gh && navigator.onLine !== false) {
    try {
      const r = await GHSync.readFile(gh, `${VOICE_DIR}/index.json`);
      if (r?.data?.clips) { voice.index = r.data; store.set(KEYS.voiceIndex, r.data); }
    } catch { /* offline oder noch keine Aufnahmen → Zwischenspeicher */ }
  }
  if (!voice.index) {
    const cached = store.get(KEYS.voiceIndex, null);
    if (cached?.clips) voice.index = cached;
  }
  if (voice.index) prefetchVoiceFiles();
}

/** Rohdaten einer Aufnahme: Zwischenspeicher → sonst von GitHub holen und ablegen. */
function voiceFile(file) {
  if (voice.files.has(file)) return voice.files.get(file);
  const p = (async () => {
    const req = new Request(`__ansagen/${file}`, { method: 'GET' });
    if (hasCacheApi) {
      try {
        const hit = await (await caches.open(VOICE_CACHE)).match(req);
        if (hit) return await hit.arrayBuffer();
      } catch { /* weiter zu GitHub */ }
    }
    const gh = GHSync.getConfig();
    if (!gh) throw new Error('Sync nicht eingerichtet');
    const buf = await GHSync.readRaw(gh, `${VOICE_DIR}/${file}`);
    if (hasCacheApi) {
      try { await (await caches.open(VOICE_CACHE)).put(req, new Response(buf.slice(0), { headers: { 'Content-Type': 'audio/wav' } })); } catch { /* egal */ }
    }
    return buf;
  })();
  voice.files.set(file, p);
  p.catch(() => voice.files.delete(file)); // beim nächsten Mal erneut versuchen
  return p;
}

/** Lädt alle Aufnahmen im Hintergrund in den Zwischenspeicher (für offline) und räumt alte auf. */
async function prefetchVoiceFiles() {
  const files = [...new Set(Object.values(voice.index.clips))];
  for (let i = 0; i < files.length; i += 4) {
    await Promise.all(files.slice(i, i + 4).map((f) => voiceFile(f).catch(() => null)));
  }
  if (hasCacheApi) {
    try {
      const cache = await caches.open(VOICE_CACHE);
      const keep = new Set(files);
      for (const req of await cache.keys()) {
        const name = req.url.split('/').pop();
        if (!keep.has(name)) await cache.delete(req);
      }
    } catch { /* egal */ }
  }
}

/** Dekodierte Aufnahme inkl. Beschnitt der Stille am Anfang/Ende. */
function voiceClip(key) {
  const file = voice.index?.clips?.[key];
  if (!file || !actx) return Promise.resolve(null);
  if (voice.decoded.has(file)) return voice.decoded.get(file);
  const p = voiceFile(file)
    .then((buf) => new Promise((ok, fail) => actx.decodeAudioData(buf.slice(0), ok, fail)))
    .then((audio) => {
      const data = audio.getChannelData(0);
      const thr = 0.01;
      let a = 0, b = data.length - 1;
      while (a < b && Math.abs(data[a]) < thr) a++;
      while (b > a && Math.abs(data[b]) < thr) b--;
      const pad = Math.floor(audio.sampleRate * 0.02);
      const start = Math.max(0, a - pad) / audio.sampleRate;
      const end = Math.min(data.length, b + pad) / audio.sampleRate;
      return { audio, start, dur: Math.max(0.05, end - start) };
    })
    .catch(() => { voice.decoded.delete(file); return null; });
  voice.decoded.set(file, p);
  return p;
}
const missingVoiceKeys = (parts) => parts.map(voiceKey).filter((k) => !voice.index?.clips?.[k]);

/** Dekodiert alle Aufnahmen einer Routine vorab (beim Start der Einheit). */
function prepareVoice(routine) {
  if (!voice.index || !actx) return;
  const steps = buildSteps(routine);
  const keys = new Set(['geschafft']);
  steps.forEach((st, i) => (stepParts(st, steps[i - 1]) || []).forEach((p) => keys.add(voiceKey(p))));
  keys.forEach((k) => voiceClip(k));
}

/**
 * iPad/iPhone (Safari): Aufnahmen und Pieptöne laufen als "Umgebungston" – sie mischen sich mit Videos,
 * sind im Stummmodus aber still. Die Systemstimme meldet die Seite dagegen als Medienwiedergabe an:
 * Danach ist der Ton der Seite im Stummmodus hörbar und folgt der Medienlautstärke (ein laufendes Video
 * hält dabei einmal an). Deshalb kommt – wenn eingeschaltet – nur die erste Ansage jeder Einheit von der
 * Systemstimme, alle weiteren aus den Aufnahmen.
 */
const isAppleWebKit = 'audioSession' in navigator; // Safari 16.4+ auf iPad/iPhone/Mac
const useFirstVoiceSynth = () => isAppleWebKit && hasSpeech && cfg.firstVoiceSynth;

/** Ansage abspielen: Aufnahmen hintereinander, sonst Ersatz über die eingebaute Sprachausgabe. */
async function say(parts, force = false, preferSynth = false) {
  if ((!cfg.voice && !force) || !parts?.length) return;
  const seq = ++voice.seq;
  if (preferSynth) { speakSynth(parts.join(', ')); return; }
  if (voice.index && actx && missingVoiceKeys(parts).length === 0) {
    const clips = await Promise.race([
      Promise.all(parts.map((p) => voiceClip(voiceKey(p)))),
      new Promise((r) => setTimeout(() => r(null), 2500)),
    ]);
    if (seq !== voice.seq) return;                // inzwischen neuere Ansage oder Pause
    if (clips && clips.every(Boolean)) { playClips(clips); return; }
  }
  if (seq !== voice.seq) return;
  speakSynth(parts.join(', '));
}
function playClips(clips) {
  stopVoiceSources();
  if (actx.state !== 'running') actx.resume().catch(() => {});
  let t = actx.currentTime + 0.03;
  const gain = actx.createGain();
  gain.gain.value = 1;
  gain.connect(actx.destination);
  for (const c of clips) {
    const src = actx.createBufferSource();
    src.buffer = c.audio;
    src.connect(gain);
    src.start(t, c.start, c.dur);
    voice.sources.push(src);
    t += c.dur + 0.12;
  }
}
function stopVoiceSources() {
  for (const s of voice.sources) { try { s.stop(); } catch { /* schon zu Ende */ } }
  voice.sources = [];
}
function stopSpeech() {
  voice.seq++;
  stopVoiceSources();
  try { if (hasSpeech) speechSynthesis.cancel(); } catch { /* egal */ }
}

/** Alle Bausteine, die die aktuellen Routinen brauchen – für die Anzeige fehlender Aufnahmen. */
function requiredVoiceKeys() {
  const keys = new Set(['geschafft']);
  for (const r of DATA?.routines || []) {
    const steps = buildSteps(r);
    steps.forEach((st, i) => (stepParts(st, steps[i - 1]) || []).forEach((p) => keys.add(voiceKey(p))));
  }
  return [...keys];
}
function voiceStatusText() {
  if (!voice.index) return hasSpeech ? 'Browser-Stimme – pausiert auf dem iPad laufende Videos (Aufnahmen nicht geladen)' : 'Nicht verfügbar';
  const missing = requiredVoiceKeys().filter((k) => !voice.index.clips[k]);
  const base = `Aufnahmen (${voice.index.voice || 'Windows-Stimme'}) – laufen parallel zu Video/Musik`;
  return missing.length ? `${base}. ${missing.length} fehlen, dafür Browser-Stimme: ${missing.slice(0, 3).join(', ')}${missing.length > 3 ? ' …' : ''}` : base;
}

let wakeLock = null;
async function requestWakeLock() {
  try {
    if ('wakeLock' in navigator && document.visibilityState === 'visible' && !wakeLock) {
      wakeLock = await navigator.wakeLock.request('screen');
      wakeLock.addEventListener?.('release', () => { wakeLock = null; });
    }
  } catch { wakeLock = null; }
}
function releaseWakeLock() {
  try { wakeLock?.release(); } catch { /* egal */ }
  wakeLock = null;
}

/* =========================================================================
   Timer-Engine (zeitbasiert: Restzeit = Dauer − (jetzt − Schrittstart))
   ========================================================================= */
function startRun(id) {
  const routine = routineById(id);
  if (!routine) return;
  audioInit();
  refreshCfg();
  const steps = buildSteps(routine);
  if (!steps.length) return;
  const suffix = new Array(steps.length + 1).fill(0);
  for (let i = steps.length - 1; i >= 0; i--) suffix[i] = suffix[i + 1] + steps[i].duration;
  const now = Date.now();
  run = {
    id, routine, steps, suffix, total: suffix[0] || 1,
    i: 0, stepStart: now, startedAt: now, pausedAt: null, pausedTotal: 0,
    waiting: false, lastBeep: null, finished: false, timer: null, raf: null,
  };
  requestWakeLock();
  prepareVoice(routine); // Aufnahmen der Routine vorab dekodieren
  location.hash = `#/run/${encodeURIComponent(id)}`;
  renderPlayer();
  onStepEnter(false); // direkt im Klick-Handler, damit iOS Ton & Sprache erlaubt
  run.timer = setInterval(tick, 200);
  const current = run;
  const loop = () => {
    if (run !== current || current.finished) return;
    tick();
    if (run === current && !current.finished) current.raf = requestAnimationFrame(loop);
  };
  current.raf = requestAnimationFrame(loop);
}

function stopLoops() {
  if (!run) return;
  clearInterval(run.timer);
  cancelAnimationFrame(run.raf);
}

const elapsedSec = () => ((run.pausedAt ?? Date.now()) - run.stepStart) / 1000;

function tick() {
  if (!run || run.finished) return;
  if (!run.pausedAt) {
    let advanced = false;
    let lagging = false;
    for (let guard = 0; guard < 1000; guard++) {
      const st = run.steps[run.i];
      const el = (Date.now() - run.stepStart) / 1000;
      if (el < st.duration) break;
      if (isRepsStep(st) && !cfg.autoAdvanceRepExercises) {
        if (!run.waiting) { run.waiting = true; sfx.soft(); }
        break;
      }
      if (el - st.duration > 2) lagging = true; // z. B. nach Bildschirmsperre: still nachholen
      run.stepStart += st.duration * 1000;
      if (run.i + 1 >= run.steps.length) { finishRun(); return; }
      run.i++;
      run.waiting = false;
      run.lastBeep = null;
      advanced = true;
    }
    if (advanced) { renderPlayer(); onStepEnter(lagging); }

    // 3-2-1 vor Ende (nicht bei Wiederholungs-Übungen – dort läuft nur der Balken)
    const st = run.steps[run.i];
    if (!isRepsStep(st)) {
      const sec = Math.ceil(st.duration - elapsedSec());
      if (sec >= 1 && sec <= 3 && sec < st.duration && run.lastBeep !== sec) {
        run.lastBeep = sec;
        sfx.tick();
      }
    }
  }
  renderPlayerDynamic();
}

function onStepEnter(silent) {
  if (!run || silent || run.pausedAt) return;
  const st = run.steps[run.i];
  const prev = run.steps[run.i - 1];
  ({ transition: sfx.soft, switch: sfx.switchSide, rest: sfx.rest, work: sfx.start })[st.kind]?.();
  const parts = stepParts(st, prev);
  if (parts && cfg.voice) {
    const first = !run.spokeFirst; // erste Ansage dieser Einheit
    run.spokeFirst = true;
    say(parts, false, first && useFirstVoiceSynth());
  }
}

function goTo(i) {
  if (!run) return;
  if (i >= run.steps.length) { finishRun(); return; }
  run.i = Math.max(0, i);
  run.stepStart = run.pausedAt ?? Date.now();
  run.waiting = false;
  run.lastBeep = null;
  renderPlayer();
  onStepEnter(false);
}
function goBack() {
  if (!run) return;
  const st = run.steps[run.i];
  if (st.kind === 'work' && elapsedSec() > 3) { goTo(run.i); return; } // Übung neu starten
  const target = Math.max(0, st.unit - 1);
  goTo(run.steps.findIndex((s) => s.unit === target));
}
function pauseRun() {
  if (!run || run.pausedAt) return;
  run.pausedAt = Date.now();
  stopSpeech();
  updatePauseUi();
}
function resumeRun() {
  if (!run || !run.pausedAt) return;
  const d = Date.now() - run.pausedAt;
  run.stepStart += d;
  run.pausedTotal += d;
  run.pausedAt = null;
  audioInit();
  requestWakeLock();
  updatePauseUi();
}
const togglePause = () => (run?.pausedAt ? resumeRun() : pauseRun());

function abortRun() {
  if (!run) return;
  stopLoops();
  stopSpeech();
  releaseWakeLock();
  run = null;
  playerEls = null;
}

async function requestAbort(targetHash) {
  if (!run || run.finished) return;
  const wasPaused = !!run.pausedAt;
  pauseRun();
  const ok = await confirmModal({
    title: 'Einheit abbrechen?',
    text: 'Sie wird nicht gespeichert und zählt nicht für die Streak.',
    ok: 'Abbrechen',
    cancel: 'Weitermachen',
    danger: true,
  });
  if (!run) return;
  if (ok) {
    const id = run.id;
    abortRun();
    location.hash = targetHash || `#/routine/${encodeURIComponent(id)}`;
  } else if (!wasPaused) {
    resumeRun();
  }
}

function finishRun() {
  if (!run || run.finished) return;
  run.finished = true;
  stopLoops();
  releaseWakeLock();
  const hist = getHistory();
  const before = computeStreak(hist);
  const weeklyBefore = computeWeekly(hist);
  const now = new Date();
  const entry = {
    id: genId(),
    routineId: run.id,
    date: dayKey(now),
    completedAt: now.toISOString(),
    durationSec: Math.round((now.getTime() - run.startedAt - run.pausedTotal) / 1000),
  };
  const saved = addHistory(entry);
  requestPersist();
  scheduleSync(1500);
  const histAfter = saved ? getHistory() : [...hist, entry];
  lastResult = { entry, saved, before, after: computeStreak(histAfter), weeklyBefore, weeklyAfter: computeWeekly(histAfter) };
  run = null;
  playerEls = null;
  sfx.done();
  say(['Geschafft']);
  history.replaceState(null, '', '#/done');
  route();
}

/* =========================================================================
   Router
   ========================================================================= */
function currentRoute() {
  const h = location.hash.replace(/^#\/?/, '');
  const [name = '', arg = ''] = h.split('/');
  return { name: name || 'home', arg: decodeURIComponent(arg) };
}

function route() {
  const r = currentRoute();
  if (run && !run.finished) {
    if (r.name === 'run') { renderPlayer(); return; }
    // Zurück-Taste während einer Einheit: erst nachfragen
    const target = location.hash || '#/';
    history.pushState(null, '', `#/run/${encodeURIComponent(run.id)}`);
    requestAbort(target);
    return;
  }
  playerEls = null;
  window.scrollTo(0, 0);
  if (!DATA) { renderSetup(); return; }
  switch (r.name) {
    case 'routine': {
      const routine = routineById(r.arg);
      if (routine) renderOverview(routine);
      else redirect('#/');
      return;
    }
    case 'run':
      redirect(routineById(r.arg) ? `#/routine/${encodeURIComponent(r.arg)}` : '#/');
      return;
    case 'done':
      if (lastResult) renderDone();
      else redirect('#/');
      return;
    case 'settings':
      renderSettings();
      return;
    default:
      renderHome();
  }
}
function redirect(hash) { history.replaceState(null, '', hash); route(); }

/* =========================================================================
   Screens
   ========================================================================= */
function topbar({ title = '', backHref = null, right = '' } = {}) {
  return `<header class="topbar">
    ${backHref ? `<a class="icon-btn" href="${backHref}" aria-label="Zurück">${ICONS.back}</a>` : ''}
    <div class="topbar-title">${title}</div>
    ${right || '<span class="icon-spacer"></span>'}
  </header>`;
}

/* ---------- Startseite ---------- */
function renderHome() {
  const hist = getHistory();
  const now = new Date();
  const s = computeStreak(hist, now);
  const a = computeWeekly(hist, now);
  app.innerHTML = `
  <div class="page">
    <header class="home-head">
      <div>
        <div class="eyebrow">${esc(now.toLocaleDateString('de-DE', { weekday: 'long', day: 'numeric', month: 'long' }))}</div>
        <h1 class="home-title">Dehnen</h1>
      </div>
      <a class="icon-btn has-dot" href="#/settings" aria-label="Einstellungen">${ICONS.settings}${GHSync.getConfig() ? `<i id="sync-dot" class="sync-dot s-${sync.status}" title="${esc(syncTitle())}"></i>` : ''}</a>
    </header>
    ${storageOk ? '' : `<section class="card warn-card">
      <strong>Speichern nicht möglich.</strong> Dieser Browser blockiert den lokalen Speicher (z. B. privates Fenster).
      Streak und Verlauf gehen beim Schließen verloren.
    </section>`}
    ${todayHtml(s, a, now)}
    ${streakHtml(s, a, now)}
    ${weeklyHtml(a, now)}
    ${backupReminderHtml(hist, now)}
    <section class="section">
      <h2 class="section-title">Alle Routinen</h2>
      <div class="routine-list">${DATA.routines.map(routineRowHtml).join('')}</div>
    </section>
  </div>`;
}

function startLink(r, label = 'Los geht’s') {
  return `<a class="btn btn-primary btn-lg" href="#/routine/${encodeURIComponent(r.id)}">${ICONS.play}<span>${esc(label)}</span></a>`;
}

function todayHtml(s, a, now) {
  const expected = s.expectedToday;
  const todaysPlan = s.doneToday || expected;
  const extra = extraRole() ? routineById(extraRole().routine) : null;
  const showExtra = extra && (extraRole().onPlanDays || []).includes(todaysPlan)
    && !getHistory().some((h) => h.routineId === extra.id && h.date === dayKey(now));
  const extraHtml = showExtra
    ? `<a class="extra-offer" href="#/routine/${encodeURIComponent(extra.id)}">
         <span><strong>Optional:</strong> ${esc(shortName(extra))} <span class="muted">· ${fmtDuration(totalDuration(extra))}</span></span>${ICONS.chevron}
       </a>`
    : '';

  let main;
  if (s.doneToday) {
    main = `<section class="card today is-done">
      <div class="today-label">Heute erledigt</div>
      <h2 class="today-title">${ICONS.check}<span>${esc(planName(s.doneToday))}</span></h2>
      <p class="today-sub">Morgen: <strong>${esc(planName(nextExpected(s)))}</strong></p>
      ${extraHtml}
    </section>`;
  } else if (expected === 'pause') {
    main = `<section class="card today is-pause">
      <div class="today-label">Heute</div>
      <h2 class="today-title">${ICONS.moon}<span>Pause</span></h2>
      <p class="today-sub">Regeneration gehört zum Plan – der Tag zählt automatisch für deine Streak. Morgen: <strong>${esc(planName(nextExpected(s)))}</strong></p>
      ${extraHtml}
    </section>`;
  } else {
    const r = routineById(expected);
    main = r
      ? `<section class="card today">
          <div class="today-label">Heute dran</div>
          <h2 class="today-title"><span>${esc(shortName(r))}</span></h2>
          <p class="today-sub">${r.exercises.length} Übungen · ${fmtDuration(totalDuration(r))}</p>
          ${startLink(r)}
          ${extraHtml}
        </section>`
      : '';
  }

  let weekly = '';
  const role = weeklyRole();
  const weeklyR = role ? routineById(role.routine) : null;
  if (weeklyR && now.getDay() === role.weekday) {
    const cool = role.cooldown ? routineById(role.cooldown) : null;
    const day = weekdayName(role.weekday);
    weekly = a.doneToday
      ? `<section class="card today-weekly is-done">
          <div class="today-label">${esc(day)}</div>
          <h3 class="today-weekly-title">${ICONS.check}<span>${esc(shortName(weeklyR))} erledigt</span></h3>
          ${cool && s.doneToday !== cool.id ? `<a class="extra-offer" href="#/routine/${encodeURIComponent(cool.id)}"><span><strong>Cool-down:</strong> ${esc(shortName(cool))}</span>${ICONS.chevron}</a>` : ''}
        </section>`
      : `<section class="card today-weekly">
          <div class="today-label">${esc(day)}${role.hint ? ` · ${esc(role.hint)}` : ''}</div>
          <h3 class="today-weekly-title"><span>${esc(shortName(weeklyR))}</span></h3>
          <p class="today-sub">${weeklyR.exercises.length} Übungen · ${fmtDuration(totalDuration(weeklyR))}</p>
          <a class="btn btn-secondary" href="#/routine/${encodeURIComponent(weeklyR.id)}">${ICONS.play}<span>${esc(shortName(weeklyR))} starten</span></a>
        </section>`;
  }
  return main + weekly;
}

function streakMessage(s) {
  if (!s.startKey) return 'Deine Streak startet mit der ersten Einheit. Pausentage im Plan zählen automatisch mit.';
  if (s.todayStatus === 'done') {
    if (s.current >= s.best && s.best > 1) return 'Heute erledigt – das ist dein Rekord!';
    if (s.best > s.current) return `Heute erledigt – noch ${s.best - s.current} ${plural(s.best - s.current, 'Tag', 'Tage')} bis zum Rekord.`;
    return 'Heute erledigt – stark!';
  }
  if (s.todayStatus === 'pause') return 'Pausentag – zählt automatisch mit.';
  if (s.current === 0) return 'Neuer Anlauf: Mit der heutigen Einheit geht’s wieder los.';
  if (s.jokerUsedThisWeek) return 'Heute zählt! Dein Joker für diese Woche ist schon verbraucht.';
  return 'Heute noch offen – halte die Streak am Leben.';
}

function streakHtml(s, a, now) {
  const used = s.jokerUsedThisWeek;
  return `<section class="card streak">
    <div class="streak-head">
      <div class="flame ${s.current > 0 ? 'lit' : ''}">${ICONS.flame}</div>
      <div class="streak-count">
        <div class="streak-num">${s.current}</div>
        <div class="streak-unit">${plural(s.current, 'Tag', 'Tage')} in Folge</div>
      </div>
      <div class="streak-side">
        <div class="stat"><span class="muted">Rekord</span> <strong>${s.best}</strong></div>
        <div class="joker ${used ? 'used' : ''}" title="1 verpasster Dehntag pro Woche wird abgefangen">${ICONS.shield}<span>Joker ${used ? 'weg' : 'frei'}</span></div>
      </div>
    </div>
    <p class="streak-msg">${esc(streakMessage(s))}</p>
    ${calendarHtml(s, a, now)}
  </section>`;
}

function calendarHtml(s, a, now) {
  const cyc = cycleList();
  const tKey = dayKey(now);
  const start = addDays(weekStart(now), -28);
  // Vorschau auf die kommenden Tage (Plan läuft weiter, als würde heute erledigt)
  let projIdx = s.todayStatus === 'open' ? s.nextIdx + 1 : s.nextIdx;
  if (!s.startKey) projIdx = 1;
  const labels = { done: 'erledigt', pause: 'Pause', joker: 'Joker', missed: 'verpasst', open: 'heute offen' };
  const cells = [];
  for (let i = 0; i < 35; i++) {
    const d = addDays(start, i);
    const k = dayKey(d);
    let status = s.days.get(k);
    let letter = '';
    if (k > tKey) {
      status = 'future';
      letter = cyc.length ? planLetter(cyc[projIdx++ % cyc.length]) : '';
    } else if (!status) {
      status = k === tKey ? 'open' : 'none';
    }
    if (status === 'done') { const list = s.doneByDay.get(k); letter = planLetter(list[list.length - 1]); }
    if (status === 'pause') letter = 'P';
    if (status === 'open') letter = cyc.length ? planLetter(s.expectedToday) : '';
    if (status === 'joker') letter = 'J';
    const weeklyDot = a.days.has(k) ? '<i class="weekly-dot"></i>' : '';
    const title = `${fmtDate(k)}${labels[status] ? ' – ' + labels[status] : ''}${a.days.has(k) ? ` · ${weeklyName()}` : ''}`;
    cells.push(`<div class="cal-cell st-${status} ${k === tKey ? 'is-today' : ''}" title="${esc(title)}"><span>${esc(letter)}</span>${weeklyDot}</div>`);
  }
  const heads = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'].map((d) => `<div class="cal-head">${d}</div>`).join('');
  return `<div class="cal" role="img" aria-label="Letzte 5 Wochen">${heads}${cells.join('')}</div>
    <div class="cal-legend">
      <span><i class="lg st-done"></i>erledigt</span>
      <span><i class="lg st-pause"></i>Pause</span>
      <span><i class="lg st-joker"></i>Joker</span>
      <span><i class="lg st-missed"></i>verpasst</span>
      ${weeklyRole() ? `<span><i class="weekly-dot static"></i>${esc(weeklyName())}</span>` : ''}
    </div>`;
}

function weeklyHtml(a, now) {
  if (!WEEKLY_ID() || !routineById(WEEKLY_ID())) return '';
  return `<section class="card weekly-card">
    <div class="weekly-row">
      <div>
        <div class="today-label">${esc(weeklyName())}-Streak</div>
        <div class="weekly-num">${a.current} <span>${plural(a.current, 'Woche', 'Wochen')}</span></div>
      </div>
      <div class="pill ${a.doneThisWeek ? 'ok' : ''}">${a.doneThisWeek ? `${ICONS.check}<span>Diese Woche</span>` : '<span>Diese Woche offen</span>'}</div>
    </div>
    <p class="small muted">Rekord ${a.best} · zählt, wenn du mindestens einmal pro Woche ${esc(weeklyName())} machst.</p>
  </section>`;
}

function backupReminderHtml(hist, now) {
  if (!storageOk || hist.length < 5) return '';
  const last = getMeta().lastBackupAt;
  const days = last ? Math.floor((now - new Date(last)) / 86400000) : null;
  if (days !== null && days < BACKUP_REMINDER_DAYS) return '';
  return `<a class="backup-hint" href="#/settings">
    <span>${days === null ? 'Noch kein Backup deiner Streak.' : `Letztes Backup vor ${days} Tagen.`} <strong>Jetzt sichern</strong></span>${ICONS.chevron}
  </a>`;
}

function routineRowHtml(r) {
  const inCycle = isCycleRoutine(r.id);
  return `<a class="routine-row" href="#/routine/${encodeURIComponent(r.id)}">
    <div class="rr-main">
      <div class="rr-name">${esc(r.name)}</div>
      <div class="rr-meta">${r.exercises.length} ${plural(r.exercises.length, 'Übung', 'Übungen')} · ${fmtDuration(totalDuration(r))}${inCycle ? '' : ' · zählt nicht zum Zyklus'}</div>
    </div>
    ${ICONS.chevron}
  </a>`;
}

/* ---------- Übersicht ---------- */
function renderOverview(r) {
  const total = totalDuration(r);
  app.innerHTML = `
  <div class="page page-overview">
    ${topbar({ backHref: '#/', title: '' })}
    <h1 class="ov-title">${esc(r.name)}</h1>
    <div class="ov-meta"><span>${ICONS.clock}${fmtDuration(total)}</span><span>${r.exercises.length} ${plural(r.exercises.length, 'Übung', 'Übungen')}</span></div>
    ${r.description ? `<p class="ov-desc">${esc(r.description)}</p>` : ''}
    <ol class="ex-list">${r.exercises.map(exItemHtml).join('')}</ol>
    <div class="start-bar">
      <button class="btn btn-primary btn-xl" data-act="start" data-id="${esc(r.id)}">${ICONS.play}<span>Start</span></button>
    </div>
  </div>`;
}

function exItemHtml(ex, i) {
  const range = rangeText(ex);
  return `<li class="ex-item">
    <div class="ex-num">${i + 1}</div>
    <div class="ex-body">
      <div class="ex-head"><span class="ex-name">${esc(ex.name)}</span>${ex.phase ? `<span class="chip">${esc(ex.phase)}</span>` : ''}</div>
      <div class="ex-dose">${esc(doseText(ex))}${range ? ` <span class="muted">· ${esc(range)}</span>` : ''}</div>
      ${ex.note ? `<div class="ex-note">${esc(ex.note)}</div>` : ''}
      ${ex.image ? `<img class="ex-img" src="${esc(ex.image)}" alt="${esc(ex.name)}" loading="lazy">` : ''}
      ${ex.cue ? `<p class="ex-cue">${esc(ex.cue)}</p>` : ''}
      ${ex.important ? `<p class="important"><strong>Wichtig:</strong> ${esc(ex.important)}</p>` : ''}
      ${ex.benefit ? `<details class="benefit"><summary>Nutzen</summary><p>${esc(ex.benefit)}</p></details>` : ''}
    </div>
  </li>`;
}

/* ---------- Player ---------- */
function nextWorkText() {
  const st = run.steps[run.i];
  let workIdx = run.i;
  if (st.kind !== 'work') workIdx = run.steps.findIndex((s, k) => k >= run.i && s.kind === 'work');
  const nx = run.steps.find((s, k) => k > workIdx && s.kind === 'work');
  if (!nx) return 'Ende der Routine';
  const bits = [esc(nx.ex.name)];
  if (nx.side) bits.push(`<span class="side-txt side-${nx.side}">${esc(cap(nx.side))}</span>`);
  if (nx.sets > 1) bits.push(`Satz ${nx.set}/${nx.sets}`);
  return bits.join(' · ');
}

function renderPlayer() {
  if (!run) return;
  const st = run.steps[run.i];
  const ex = st.ex;
  const kicker = { transition: 'Gleich', switch: 'Seitenwechsel', rest: 'Satzpause', work: ex.phase ? cap(ex.phase) : 'Los' }[st.kind];
  const range = rangeText(ex);
  const reps = isRepsStep(st);
  app.innerHTML = `
  <div class="player kind-${st.kind} ${st.side ? `side-${st.side}` : ''} ${run.pausedAt ? 'is-paused' : ''}" id="player">
    <div class="p-top">
      <button class="icon-btn" data-act="abort" aria-label="Abbrechen">${ICONS.close}</button>
      <div class="p-progress">
        <div class="p-bar"><span id="p-bar"></span></div>
        <div class="p-meta"><span>Übung ${st.exIndex + 1}/${run.routine.exercises.length}</span><span id="p-remaining"></span></div>
      </div>
    </div>
    <div class="p-scroll">
      <div class="p-stage">
        <div class="p-head">
          <div class="p-kicker">${esc(kicker)}</div>
          <h1 class="p-name">${esc(ex.name)}</h1>
          <div class="p-tags">
            ${st.side ? `<span class="side-badge side-${st.side}">${st.side === 'links' ? 'LINKS' : 'RECHTS'}</span>` : ''}
            ${st.sets > 1 ? `<span class="tag">Satz ${st.set}/${st.sets}</span>` : ''}
            ${ex.perSide && ex.alternating ? '<span class="tag">Seiten abwechselnd</span>' : ''}
          </div>
        </div>
        <button class="ring" data-act="toggle" aria-label="Pause oder Fortsetzen">
          <svg viewBox="0 0 100 100" aria-hidden="true">
            <circle class="ring-track" cx="50" cy="50" r="45"/>
            <circle class="ring-fill" id="ring-fill" cx="50" cy="50" r="45" pathLength="100"/>
          </svg>
          <span class="ring-center">
            <span class="ring-num" id="ring-num"></span>
            <span class="ring-unit" id="ring-unit"></span>
          </span>
        </button>
      </div>
      <div class="p-info">
        ${st.kind !== 'work' ? `<div class="p-dose">${esc(doseText(ex))}</div>` : ''}
        ${range || ex.note ? `<div class="p-note">${esc([ex.note, range].filter(Boolean).join(' · '))}</div>` : ''}
        ${ex.image ? `<img class="ex-img" src="${esc(ex.image)}" alt="${esc(ex.name)}">` : ''}
        ${ex.cue ? `<p class="p-cue">${esc(ex.cue)}</p>` : ''}
        ${ex.important ? `<p class="important"><strong>Wichtig:</strong> ${esc(ex.important)}</p>` : ''}
        ${ex.benefit ? `<details class="benefit"><summary>Nutzen</summary><p>${esc(ex.benefit)}</p></details>` : ''}
        <div class="p-next"><span class="muted">Als Nächstes:</span> ${nextWorkText()}</div>
      </div>
    </div>
    <div class="p-controls">
      ${reps ? `<button class="btn btn-done" data-act="skip" id="btn-done">${ICONS.check}<span>Fertig</span></button>` : ''}
      <div class="ctrl-row">
        <button class="ctrl" data-act="back" aria-label="Zurück">${ICONS.prev}<span>Zurück</span></button>
        <button class="ctrl ctrl-main" data-act="toggle" id="btn-toggle"></button>
        <button class="ctrl" data-act="skip" aria-label="Überspringen">${ICONS.next}<span>Überspringen</span></button>
      </div>
    </div>
  </div>`;
  playerEls = {
    root: document.getElementById('player'),
    bar: document.getElementById('p-bar'),
    remaining: document.getElementById('p-remaining'),
    fill: document.getElementById('ring-fill'),
    num: document.getElementById('ring-num'),
    unit: document.getElementById('ring-unit'),
    toggle: document.getElementById('btn-toggle'),
    done: document.getElementById('btn-done'),
    last: {},
  };
  updatePauseUi();
  renderPlayerDynamic();
}

function setText(key, el, value) {
  if (!el || playerEls.last[key] === value) return;
  playerEls.last[key] = value;
  el.textContent = value;
}

function renderPlayerDynamic() {
  if (!run || !playerEls) return;
  const st = run.steps[run.i];
  const el = elapsedSec();
  let p, num, unit;
  if (isRepsStep(st)) {
    p = st.duration > 0 ? Math.min(1, el / st.duration) : 1;
    num = String(st.ex.reps);
    unit = run.waiting ? 'Fertig?' : st.ex.perSide && st.ex.alternating ? 'Wdh. je Seite' : 'Wiederholungen';
  } else {
    const rem = Math.max(0, st.duration - el);
    p = st.duration > 0 ? rem / st.duration : 0;
    num = String(Math.ceil(rem));
    unit = 'Sekunden';
  }
  if (run.pausedAt) unit = 'Pausiert';
  playerEls.fill.style.strokeDashoffset = (100 * (1 - p)).toFixed(2);
  setText('num', playerEls.num, num);
  setText('unit', playerEls.unit, unit);
  playerEls.root.classList.toggle('is-waiting', !!run.waiting);

  const remCurrent = run.waiting ? 0 : Math.max(0, st.duration - el);
  const remaining = remCurrent + run.suffix[run.i + 1];
  playerEls.bar.style.width = `${Math.min(100, (1 - remaining / run.total) * 100).toFixed(2)}%`;
  setText('rem', playerEls.remaining, `noch ${fmtClock(remaining)}`);
}

function updatePauseUi() {
  if (!run || !playerEls) return;
  const paused = !!run.pausedAt;
  playerEls.root.classList.toggle('is-paused', paused);
  playerEls.toggle.innerHTML = paused ? `${ICONS.play}<span>Weiter</span>` : `${ICONS.pause}<span>Pause</span>`;
  playerEls.toggle.setAttribute('aria-label', paused ? 'Fortsetzen' : 'Pause');
  playerEls.last = {};
  renderPlayerDynamic();
}

/* ---------- Fertig ---------- */
function renderDone() {
  const { entry, saved, before, after, weeklyBefore, weeklyAfter } = lastResult;
  const r = routineById(entry.routineId);
  const isCycle = isCycleRoutine(entry.routineId);
  const isWeekly = !!WEEKLY_ID() && entry.routineId === WEEKLY_ID();
  let streakBlock = '';

  if (isCycle) {
    const gained = before.todayStatus !== 'done' && after.current > before.current;
    const record = after.current > before.best && after.current > 1;
    const milestone = gained && MILESTONES.includes(after.current);
    streakBlock = `<div class="done-streak">
      <div class="flame lit big">${ICONS.flame}</div>
      <div class="done-streak-num">${after.current}${gained ? '<span class="plus">+1</span>' : ''}</div>
      <div class="done-streak-unit">${plural(after.current, 'Tag', 'Tage')} in Folge</div>
      ${milestone ? `<div class="badge">Meilenstein: ${after.current} Tage!</div>` : record ? '<div class="badge">Neuer Rekord!</div>' : ''}
      ${!gained ? '<p class="small muted">Heute war schon gezählt – Extra-Bonus für die Beweglichkeit.</p>' : ''}
      <p class="small muted">Morgen: <strong>${esc(planName(nextExpected(after)))}</strong></p>
    </div>`;
  } else if (isWeekly) {
    const gained = !weeklyBefore.doneThisWeek;
    streakBlock = `<div class="done-streak weekly">
      <div class="done-streak-num">${weeklyAfter.current}${gained ? '<span class="plus">+1</span>' : ''}</div>
      <div class="done-streak-unit">${plural(weeklyAfter.current, 'Woche', 'Wochen')} ${esc(weeklyName())} in Folge</div>
      ${gained && weeklyAfter.current > weeklyBefore.best && weeklyAfter.current > 1 ? '<div class="badge">Neuer Rekord!</div>' : ''}
    </div>`;
  } else {
    streakBlock = `<div class="done-streak">
      <p class="muted">Extra-Einheit – zählt nicht zur Streak, tut aber gut. Deine Streak: <strong>${after.current} ${plural(after.current, 'Tag', 'Tage')}</strong></p>
    </div>`;
  }

  const cool = isWeekly && weeklyRole().cooldown ? routineById(weeklyRole().cooldown) : null;
  app.innerHTML = `
  <div class="page page-done">
    <div class="done-check">${ICONS.check}</div>
    <h1 class="done-title">Geschafft!</h1>
    <p class="done-sub">${esc(r ? r.name : entry.routineId)} · ${fmtClock(entry.durationSec)} min</p>
    ${streakBlock}
    ${saved ? '' : '<section class="card warn-card"><strong>Nicht gespeichert!</strong> Der Browser blockiert den lokalen Speicher (privates Fenster?). Diese Einheit geht beim Schließen verloren.</section>'}
    <div class="done-actions">
      ${cool ? `<a class="btn btn-secondary btn-lg" href="#/routine/${encodeURIComponent(cool.id)}">Cool-down: ${esc(shortName(cool))}-Dehnung</a>` : ''}
      <a class="btn btn-primary btn-lg" href="#/">Zur Startseite</a>
    </div>
  </div>`;
}

/* ---------- Einstellungen ---------- */
function stepperHtml(key, label, hint, delta, min, max) {
  const v = Number(cfg[key]) || 0;
  return `<div class="set-row">
    <div class="set-text"><div class="set-label">${label}</div><div class="set-hint">${hint}</div></div>
    <div class="stepper">
      <button data-act="step" data-key="${key}" data-delta="${-delta}" data-min="${min}" data-max="${max}" aria-label="${label} verringern" ${v <= min ? 'disabled' : ''}>−</button>
      <output>${v} s</output>
      <button data-act="step" data-key="${key}" data-delta="${delta}" data-min="${min}" data-max="${max}" aria-label="${label} erhöhen" ${v >= max ? 'disabled' : ''}>+</button>
    </div>
  </div>`;
}
function toggleHtml(key, label, hint, extra = '', disabled = false) {
  return `<div class="set-row">
    <div class="set-text"><div class="set-label">${label}</div><div class="set-hint">${hint}</div></div>
    <div class="set-ctrl">
      ${extra}
      <label class="switch"><input type="checkbox" role="switch" data-setting="${key}" ${cfg[key] ? 'checked' : ''} ${disabled ? 'disabled' : ''} aria-label="${label}"><span class="slider"></span></label>
    </div>
  </div>`;
}

function renderSettings() {
  const hist = getHistory().slice().sort((a, b) => b.date.localeCompare(a.date) || new Date(b.completedAt) - new Date(a.completedAt));
  const tKey = todayKey();
  app.innerHTML = `
  <div class="page">
    ${topbar({ backHref: '#/', title: 'Einstellungen' })}
    <section class="card settings">
      ${stepperHtml('transitionSeconds', 'Übergangszeit', 'Zeit zum Positionieren vor jeder Übung', 5, 0, 60)}
      ${stepperHtml('sideSwitchSeconds', 'Seitenwechsel', 'Pause zwischen links und rechts', 1, 0, 20)}
      ${toggleHtml('sound', 'Töne', '3-2-1, Start, Seitenwechsel, Satzpause', '<button class="btn btn-ghost btn-sm" data-act="test-sound">Test</button>')}
      ${toggleHtml('voice', 'Sprachansage', esc(voiceStatusText()), '<button class="btn btn-ghost btn-sm" data-act="test-voice">Test</button>')}
      ${isAppleWebKit && hasSpeech ? toggleHtml('firstVoiceSynth', 'Ton im Stummmodus', 'Die erste Ansage jeder Einheit kommt von der iPad-Stimme. Danach ist die App im Stummmodus hörbar (Medienlautstärke). Ein Video im Bild-in-Bild hält dabei einmal an.') : ''}
      ${toggleHtml('autoAdvanceRepExercises', 'Auto-Weiter bei Wiederholungen', 'Aus: Nach der geschätzten Zeit wartet die App auf „Fertig“')}
      <div class="set-foot"><button class="btn btn-ghost btn-sm" data-act="reset-settings">Auf Standard zurücksetzen</button></div>
    </section>

    ${syncSectionHtml()}

    <section class="card">
      <h2 class="card-title">Datensicherung</h2>
      <p class="small muted">${GHSync.getConfig()
        ? 'Zusätzliche Sicherung als Datei – unabhängig von GitHub.'
        : 'Ohne Synchronisierung liegen Verlauf und Streak nur in <strong>diesem Browser auf diesem Gerät</strong>. Mit einem Backup überträgst du sie auf ein anderes Gerät.'}</p>
      <ul class="status-list small">
        <li><span class="muted">Gespeichert</span><strong>${hist.length} ${plural(hist.length, 'Einheit', 'Einheiten')}</strong></li>
        <li><span class="muted">Speicher</span>${storageOk
          ? (storagePersisted ? '<strong class="ok">dauerhaft</strong>' : '<strong>normal</strong>')
          : '<strong class="warn">blockiert</strong>'}</li>
        <li><span class="muted">Letztes Backup</span><strong>${getMeta().lastBackupAt ? esc(fmtDate(dayKey(new Date(getMeta().lastBackupAt)))) : 'noch keins'}</strong></li>
      </ul>
      <div class="btn-row">
        <button class="btn btn-secondary" data-act="export">Backup speichern</button>
        <label class="btn btn-ghost">Backup importieren<input type="file" id="import-file" accept=".json,application/json" hidden></label>
      </div>
    </section>

    <section class="card">
      <h2 class="card-title">Einheit nachtragen</h2>
      <p class="small muted">App vergessen? Hier nachtragen – zählt für Streak und Rhythmus.</p>
      <div class="form-row">
        <select id="add-routine" aria-label="Routine">${DATA.routines.map((r) => `<option value="${esc(r.id)}">${esc(shortName(r))}</option>`).join('')}</select>
        <input type="date" id="add-date" value="${tKey}" max="${tKey}" aria-label="Datum">
      </div>
      <button class="btn btn-secondary" data-act="add-entry">Nachtragen</button>
    </section>

    <section class="card">
      <h2 class="card-title">Verlauf</h2>
      ${hist.length ? `<ul class="hist-list">${hist.slice(0, 40).map((h) => `
        <li>
          <span class="hist-date">${esc(fmtDate(h.date))}</span>
          <span class="hist-name">${esc(planName(h.routineId))}${h.manual ? ' <span class="muted small">· nachgetragen</span>' : ''}</span>
          <button class="icon-btn sm" data-act="del-entry" data-id="${esc(h.id)}" aria-label="Eintrag löschen">${ICONS.trash}</button>
        </li>`).join('')}</ul>` : '<p class="small muted">Noch keine Einheiten.</p>'}
    </section>
    <p class="footnote">Alle Daten bleiben lokal auf diesem Gerät. Übungen änderst du in <code>routines.json</code>.</p>
  </div>`;
}

function syncStatusHtml() {
  const last = getMeta().lastSyncAt;
  const lastTxt = last ? new Date(last).toLocaleString('de-DE', { weekday: 'short', day: 'numeric', month: 'numeric', hour: '2-digit', minute: '2-digit' }) : 'noch nie';
  const label = { ok: '<strong class="ok">synchronisiert</strong>', busy: '<strong>gleicht ab …</strong>', offline: '<strong>offline</strong>', error: '<strong class="warn">Fehler</strong>', off: '<strong>bereit</strong>' }[sync.status];
  return `<li><span class="muted">Status</span>${label}</li>
    <li><span class="muted">Letzter Abgleich</span><strong>${esc(lastTxt)}</strong></li>
    ${sync.message && sync.status !== 'busy' ? `<li class="sync-msg ${sync.status === 'error' ? 'warn' : 'muted'}">${esc(sync.message)}</li>` : ''}`;
}

function syncSectionHtml() {
  const cfg = GHSync.getConfig();
  if (cfg) {
    return `<section class="card">
      <h2 class="card-title">Synchronisierung</h2>
      <p class="small muted">Verlauf und Streak werden über GitHub zwischen deinen Geräten abgeglichen.</p>
      <ul class="status-list small">
        <li><span class="muted">Repository</span><strong>${esc(cfg.owner)}/${esc(cfg.repo)}</strong></li>
        <li><span class="muted">Dateien</span><strong>${esc(SYNC_PATH)}, ${esc(ROUTINES_PATH)}</strong></li>
        <li><span class="muted">Routinen</span><strong>${{ github: 'von GitHub', local: 'lokale Datei', cache: 'Zwischenspeicher (offline)' }[routinesSource] || 'nicht geladen'}</strong></li>
      </ul>
      <ul class="status-list small" id="sync-status">${syncStatusHtml()}</ul>
      <div class="btn-row">
        <button class="btn btn-secondary" data-act="sync-now">Jetzt abgleichen</button>
        <button class="btn btn-ghost" data-act="sync-disconnect">Trennen</button>
      </div>
    </section>`;
  }
  return `<section class="card">
    <h2 class="card-title">Synchronisierung</h2>
    <p class="small muted">Gleicht Verlauf und Streak über ein <strong>privates GitHub-Repository</strong> zwischen Handy, PC und Browsern ab. Pro Gerät einmal einrichten.</p>
    <details class="benefit">
      <summary>Anleitung</summary>
      <ol class="steps small">
        <li>Auf github.com ein neues Repository anlegen, z. B. <code>app-daten</code>, Sichtbarkeit <strong>Private</strong>, Haken bei „Add a README file“.</li>
        <li>Unter <a href="https://github.com/settings/personal-access-tokens/new" target="_blank" rel="noopener">Settings → Developer settings → Fine-grained tokens</a> einen Token erstellen:
          <em>Repository access</em> → „Only select repositories“ → <code>app-daten</code>;
          <em>Permissions</em> → „Contents“ → <strong>Read and write</strong>.</li>
        <li>Token kopieren und hier zusammen mit deinem GitHub-Benutzernamen eintragen.</li>
      </ol>
    </details>
    <div class="field-stack">
      <input id="sync-owner" type="text" placeholder="GitHub-Benutzername" autocomplete="username" autocapitalize="off" spellcheck="false" aria-label="GitHub-Benutzername">
      <input id="sync-repo" type="text" value="app-daten" placeholder="Repository" autocapitalize="off" spellcheck="false" aria-label="Repository">
      <input id="sync-token" type="password" placeholder="Token (github_pat_…)" autocomplete="off" spellcheck="false" aria-label="Token">
    </div>
    <p class="small muted">Der Token wird nur auf diesem Gerät gespeichert und nur an api.github.com gesendet.</p>
    <button class="btn btn-primary" data-act="sync-connect">Verbinden</button>
  </section>`;
}

/* ---------- Einrichtung (noch keine Routinen auf diesem Gerät) ---------- */
function renderSetup() {
  const isFile = location.protocol === 'file:';
  app.innerHTML = `<div class="page">
    <header class="home-head"><div><h1 class="home-title">Dehnen</h1></div></header>
    ${routinesError ? `<section class="card warn-card">${esc(routinesError)}</section>` : ''}
    <section class="card">
      <h2 class="card-title">Willkommen</h2>
      <p class="small muted">Deine Routinen und dein Verlauf liegen privat in deinem GitHub-Repository.
        Verbinde dieses Gerät einmal – danach lädt die App alles und funktioniert auch offline.</p>
      ${isFile ? '<p class="small warn">Die Seite wurde direkt als Datei geöffnet. Bitte über die Web-Adresse oder start.cmd öffnen.</p>' : ''}
    </section>
    ${syncSectionHtml()}
  </div>`;
}

/* =========================================================================
   Modal
   ========================================================================= */
const modalRoot = document.getElementById('modal-root');
const modalOpen = () => modalRoot.childElementCount > 0;
function confirmModal({ title, text = '', ok = 'OK', cancel = 'Abbrechen', danger = false }) {
  return new Promise((resolve) => {
    modalRoot.innerHTML = `<div class="modal-backdrop">
      <div class="modal" role="dialog" aria-modal="true" aria-labelledby="m-title">
        <h2 id="m-title">${esc(title)}</h2>
        ${text ? `<p>${esc(text)}</p>` : ''}
        <div class="modal-actions">
          <button class="btn btn-ghost" data-m="0">${esc(cancel)}</button>
          <button class="btn ${danger ? 'btn-danger' : 'btn-primary'}" data-m="1">${esc(ok)}</button>
        </div>
      </div>
    </div>`;
    const onKey = (e) => { if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close(false); } };
    const close = (v) => {
      modalRoot.innerHTML = '';
      document.removeEventListener('keydown', onKey, true);
      resolve(v);
    };
    modalRoot.querySelector('.modal-backdrop').addEventListener('click', (e) => {
      const b = e.target.closest('[data-m]');
      if (b) close(b.dataset.m === '1');
      else if (e.target.classList.contains('modal-backdrop')) close(false);
    });
    document.addEventListener('keydown', onKey, true);
    modalRoot.querySelector('[data-m="0"]').focus(); // sichere Option fokussieren (Leertaste!)
  });
}

/* =========================================================================
   Events
   ========================================================================= */
app.addEventListener('click', async (e) => {
  const el = e.target.closest('[data-act]');
  if (!el) return;
  const act = el.dataset.act;
  switch (act) {
    case 'start': startRun(el.dataset.id); break;
    case 'toggle': togglePause(); el.blur(); break;
    case 'skip': if (run) goTo(run.i + 1); el.blur(); break;
    case 'back': goBack(); el.blur(); break;
    case 'abort': requestAbort(null); break;
    case 'step': {
      const { key } = el.dataset;
      const v = Math.min(Number(el.dataset.max), Math.max(Number(el.dataset.min), (Number(cfg[key]) || 0) + Number(el.dataset.delta)));
      saveSetting(key, v);
      renderSettings();
      break;
    }
    case 'test-sound': audioInit(); sfx.tick(); setTimeout(sfx.tick, 1000); setTimeout(sfx.start, 2000); break;
    case 'test-voice': {
      // Erste Ansage der ersten Routine abspielen – genau so wie im Training
      audioInit();
      const steps = DATA?.routines?.[0] ? buildSteps(DATA.routines[0]) : [];
      const st = steps.find((s) => s.side) || steps[0];
      say(st ? announceParts(st) : ['Geschafft'], true);
      break;
    }
    case 'reset-settings': store.remove(KEYS.settings); refreshCfg(); renderSettings(); break;
    case 'export': if (await exportBackup()) { toast('Backup erstellt.'); renderSettings(); } break;
    case 'sync-connect': {
      el.disabled = true;
      el.textContent = 'Verbinde …';
      const err = await connectSync(
        document.getElementById('sync-owner').value,
        document.getElementById('sync-repo').value,
        document.getElementById('sync-token').value,
      );
      if (err) { toast(err); el.disabled = false; el.textContent = 'Verbinden'; return; }
      if (!GHSync.getConfig()) { el.disabled = false; el.textContent = 'Verbinden'; return; }
      await loadRoutines();
      loadVoiceIndex(); // Ansage-Aufnahmen (im Hintergrund)
      route();
      toast(routinesError || (sync.status === 'ok' ? 'Verbunden und abgeglichen.' : sync.message || 'Verbunden.'));
      break;
    }
    case 'sync-now':
      await runSync();
      await loadRoutines(); // auch geänderte Routinen holen
      loadVoiceIndex(); // Ansage-Aufnahmen (im Hintergrund)
      route();
      toast(routinesError || (sync.status === 'ok' ? 'Abgeglichen.' : sync.message));
      break;
    case 'sync-disconnect': {
      const ok = await confirmModal({
        title: 'Sync trennen?',
        text: 'Der Token wird von diesem Gerät entfernt (auch für deine anderen Apps unter derselben Adresse). Dein Verlauf bleibt lokal und auf GitHub erhalten.',
        ok: 'Trennen',
        danger: true,
      });
      if (ok) { GHSync.clearConfig(); sync.status = 'off'; sync.message = ''; renderSettings(); }
      break;
    }
    case 'add-entry': {
      const routineId = document.getElementById('add-routine').value;
      const date = document.getElementById('add-date').value;
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || date > todayKey()) return;
      const [y, m, d] = date.split('-').map(Number);
      addHistory({
        id: genId(),
        routineId, date, completedAt: new Date(y, m - 1, d, 12).toISOString(), manual: true,
      });
      renderSettings();
      scheduleSync();
      break;
    }
    case 'del-entry': {
      const entry = getHistory().find((h) => h.id === el.dataset.id);
      if (!entry) return;
      const ok = await confirmModal({ title: 'Eintrag löschen?', text: `${planName(entry.routineId)} am ${fmtDate(entry.date)}`, ok: 'Löschen', danger: true });
      if (ok) { deleteHistoryEntry(entry.id); renderSettings(); scheduleSync(); }
      break;
    }
  }
});

app.addEventListener('change', async (e) => {
  const key = e.target.dataset?.setting;
  if (key) saveSetting(key, e.target.checked);  if (e.target.id === 'import-file' && e.target.files?.[0]) {
    const msg = await importBackup(e.target.files[0]);
    renderSettings();
    toast(msg);
    scheduleSync();
  }
});

function toast(text) {
  document.querySelector('.toast')?.remove();
  const el = document.createElement('div');
  el.className = 'toast';
  el.setAttribute('role', 'status');
  el.textContent = text;
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 3500);
}

document.addEventListener('keydown', (e) => {
  if (modalOpen() || !run || run.finished || currentRoute().name !== 'run') return;
  if (e.target.closest?.('input, select, textarea')) return;
  const st = run.steps[run.i];
  if (e.code === 'Space' || e.key === ' ') { e.preventDefault(); if (!e.repeat) togglePause(); }
  else if (e.key === 'ArrowRight') { e.preventDefault(); goTo(run.i + 1); }
  else if (e.key === 'ArrowLeft') { e.preventDefault(); goBack(); }
  else if (e.key === 'Enter' && isRepsStep(st)) { e.preventDefault(); goTo(run.i + 1); }
  else if (e.key === 'Escape') { e.preventDefault(); requestAbort(null); }
});
document.addEventListener('keyup', (e) => {
  if (run && (e.code === 'Space' || e.key === ' ')) e.preventDefault();
});

document.addEventListener('visibilitychange', () => {
  if (document.visibilityState !== 'visible') return;
  if (run && !run.finished) { requestWakeLock(); tick(); return; }
  if (DATA && currentRoute().name === 'home') renderHome(); // Datumswechsel über Nacht
  if (DATA) scheduleSync(); // Änderungen von anderen Geräten holen
});
window.addEventListener('online', () => { if (DATA) scheduleSync(); });

/* =========================================================================
   Start
   ========================================================================= */
/**
 * Routinen laden. Reihenfolge:
 *  1. privates GitHub-Repository (wenn Sync eingerichtet und online) → wird zwischengespeichert
 *  2. lokale routines.json (nur bei lokalem Betrieb vorhanden, nicht auf GitHub Pages)
 *  3. Zwischenspeicher vom letzten Laden (offline)
 */
async function loadRoutines() {
  routinesError = null;
  const cfg = GHSync.getConfig();
  if (cfg && navigator.onLine !== false) {
    try {
      const r = await GHSync.readFile(cfg, ROUTINES_PATH);
      if (r && validRoutines(r.data)) {
        store.set(KEYS.routinesCache, r.data);
        return useRoutines(r.data, 'github');
      }
      routinesError = r
        ? `${ROUTINES_PATH} im Repository ist ungültig („routines“ fehlt).`
        : `${ROUTINES_PATH} fehlt im Repository ${cfg.owner}/${cfg.repo}.`;
    } catch (e) {
      routinesError = e?.message || 'Routinen konnten nicht von GitHub geladen werden.';
    }
  }
  try {
    const res = await fetch('routines.json', { cache: 'no-cache' });
    if (res.ok) {
      const json = await res.json();
      if (validRoutines(json)) return useRoutines(json, 'local');
    }
  } catch { /* auf GitHub Pages gibt es keine lokale Datei */ }
  const cached = store.get(KEYS.routinesCache, null);
  if (validRoutines(cached)) return useRoutines(cached, 'cache');
  return false;
}
const validRoutines = (j) => !!j && Array.isArray(j.routines);
function useRoutines(json, source) {
  DATA = json;
  routinesSource = source;
  refreshCfg();
  return true;
}

async function init() {
  refreshCfg();
  storageOk = checkStorage();
  await loadRoutines();
  loadVoiceIndex(); // Ansage-Aufnahmen (im Hintergrund)
  if (storageOk) await requestPersist(getHistory().length > 0); // erst fragen, wenn es etwas zu schützen gibt
  window.addEventListener('hashchange', route);
  route();
  scheduleSync(0);
  if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }
}
init();
