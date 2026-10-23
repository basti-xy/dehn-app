'use strict';

/* =========================================================================
   Milon – Werte (Leistungs- und Körperwerte)
   Quelle: training/values.json im privaten Daten-Repository (von Hand gepflegt, App liest nur).
   Pro Wert eine Liste von Messungen; die letzte gilt als aktuell, ab zwei Einträgen gibt es einen Verlauf.
   ========================================================================= */

const VALUES_PATH = 'training/values.json';
const VALUES_KEY = 'dehnapp.values.cache.v1';

function valuesData() {
  const d = store.get(VALUES_KEY, null);
  return d && Array.isArray(d.groups) ? d : null;
}
async function loadValues() {
  const c = GHSync.getConfig();
  if (!c || navigator.onLine === false) return;
  try {
    const r = await GHSync.readFile(c, VALUES_PATH);
    if (!r || !Array.isArray(r.data?.groups)) return;
    const before = JSON.stringify(valuesData());
    store.set(VALUES_KEY, r.data);
    if (JSON.stringify(r.data) !== before && currentRoute().name === 'werte') rerenderCurrent();
  } catch { /* ohne Datei oder offline bleibt der letzte Stand */ }
}

/** "4:30" → Sekunden; "1:45" mit Einheit h → Stunden:Minuten; "1:45:30" → Sekunden */
function valueToNumber(item, v) {
  if (item.kind === 'number' || typeof v === 'number') return Number(v);
  const parts = String(v).split(':').map(Number);
  if (parts.some((x) => !Number.isFinite(x))) return NaN;
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  if (parts.length === 2) return item.unit === 'h' ? parts[0] * 3600 + parts[1] * 60 : parts[0] * 60 + parts[1];
  return parts[0];
}
function fmtValue(item, v) {
  if (v == null || v === '') return '–';
  return typeof v === 'number' ? v.toLocaleString('de-DE', { maximumFractionDigits: 2 }) : String(v);
}
function fmtStand(date) {
  if (!date) return 'ohne Datum';
  if (/^\d{4}-\d{2}$/.test(date)) {
    const [y, m] = date.split('-').map(Number);
    return new Date(y, m - 1, 1).toLocaleDateString('de-DE', { month: 'short', year: 'numeric' });
  }
  if (/^\d{4}-\d{2}-\d{2}$/.test(date)) return parseDay(date).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' });
  return String(date);
}
/** Veränderung zur vorherigen Messung, gefärbt nach "better" (höher/niedriger ist besser). */
function trendHtml(item, entries) {
  if (entries.length < 2) return '';
  const a = valueToNumber(item, entries[entries.length - 2].value);
  const b = valueToNumber(item, entries[entries.length - 1].value);
  if (!Number.isFinite(a) || !Number.isFinite(b) || a === b) return '';
  const up = b > a;
  const good = item.better ? (item.better === 'higher' ? up : !up) : null;
  const cls = good == null ? 'muted' : good ? 'tw-up' : 'tw-down';
  return `<span class="${cls}" title="ggü. ${esc(fmtValue(item, entries[entries.length - 2].value))}">${up ? '↑' : '↓'}</span>`;
}

function valueItemHtml(item) {
  const entries = Array.isArray(item.entries) ? item.entries : [];
  const cur = entries[entries.length - 1];
  if (!cur) {
    return `<div class="val-row is-open">
      <div class="val-main"><div class="val-name">${esc(item.name)}</div>${item.note ? `<div class="small muted">${esc(item.note)}</div>` : ''}</div>
      <div class="val-value"><span class="pill">offen</span></div>
    </div>`;
  }
  const nums = entries.map((e) => valueToNumber(item, e.value));
  // Bei Zeiten/Pace ist "niedriger besser": Kurve umdrehen, damit "besser" oben liegt
  const spark = entries.length > 1 ? sparkline(item.better === 'lower' ? nums.map((n) => -n) : nums) : '';
  return `<details class="val-row" ${entries.length > 1 ? '' : 'data-single'}>
    <summary>
      <div class="val-main">
        <div class="val-name">${esc(item.name)}</div>
        <div class="small muted">${cur.date ? `Stand ${esc(fmtStand(cur.date))}` : 'aktuell'}${cur.note ? ` · ${esc(cur.note)}` : ''}</div>
      </div>
      ${spark ? `<div class="val-spark">${spark}</div>` : ''}
      <div class="val-value"><strong>${esc(fmtValue(item, cur.value))}</strong> <span class="muted">${esc(item.unit || '')}</span>${trendHtml(item, entries)}</div>
    </summary>
    ${entries.length > 1 ? `<ul class="hist-list val-hist">${[...entries].reverse().map((e) => `<li>
      <span class="hist-date">${esc(fmtStand(e.date))}</span>
      <span class="hist-name">${esc(fmtValue(item, e.value))} ${esc(item.unit || '')}${e.note ? ` <span class="muted small">· ${esc(e.note)}</span>` : ''}</span>
    </li>`).join('')}</ul>` : ''}
  </details>`;
}

function renderWerte() {
  const d = valuesData();
  app.innerHTML = `<div class="page">
    ${pageHead({ title: 'Werte' })}
    ${d ? d.groups.map((g) => `<section class="card values-group">
      <div class="today-label">${esc(g.name)}</div>
      ${(g.items || []).map(valueItemHtml).join('')}
    </section>`).join('') : `<section class="card">
      <h2 class="card-title">Noch keine Werte</h2>
      <p class="small muted">Lege <code>${VALUES_PATH}</code> in deinem Daten-Repository an.
      ${GHSync.getConfig() ? 'Danach in den Einstellungen „Jetzt abgleichen“.' : 'Verbinde dazu zuerst die Synchronisierung in den Einstellungen.'}</p>
    </section>`}
    ${d ? '<p class="footnote">Werte pflegst du in <code>training/values.json</code>. Neue Messungen unten an „entries“ anhängen – dann zeigt Milon den Verlauf.</p>' : ''}
  </div>`;
}
