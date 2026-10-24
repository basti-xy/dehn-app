# Milon – Hinweise für die Entwicklung

Öffentliches Repo `basti-xy/milon` (lokaler Ordner heißt noch `dehn-app`), GitHub Pages: https://basti-xy.github.io/milon/
**Hier liegt nur Code. Nichts Persönliches** (Übungsnamen, Trainingsdaten, Wettkämpfe, Werte, Namen, E-Mail) –
alles Inhaltliche liegt im privaten Repo `app-daten`. Vor jedem Push öffentliche Dateien auf persönliche Begriffe prüfen.

## Regeln
- Vanilla JS, kein Framework, kein Build. Dunkles Design über CSS-Variablen (`--accent`, `--accent-grad`, `--good` …).
- Mobile first (iPhone/iPad, Safe Areas), auch Tablet/Laptop. Offline-fähig (sw.js, Network-first).
- Nach jeder Änderung `?v=…` in `index.html` und `CACHE` in `sw.js` hochzählen; neue Dateien in `ASSETS` von `sw.js`.
- localStorage-Schlüssel `dehnapp.*` und Dateinamen in app-daten (`dehn.json`, `dehn-routines.json`, `dehn-audio/`, `gym.json` …)
  **nie umbenennen** – sonst gehen Daten verloren. Gemeinsamer Token-Schlüssel aller eigenen Apps: `ghsync.config.v1`.
- Lokal testen: `py -m http.server 8010` im Ordner. Echte Daten zum Testen nur nach `.local/` kopieren (gitignored) und danach löschen.
- Kleine Commits, README aktualisieren. Commits laufen unter der GitHub-noreply-Adresse (lokale git config).

## Aufbau
`app.js` (Router, Tab-Leiste, Dehnen, Player, Ansagen, Trainingswoche, Einstellungen, Sync, Backup) ·
`gym.js` (Gym) · `werte.js` (Werte) · `sync.js` (GHSync) · `audio-test/` (Testseite für Audio auf dem iPad).
Sync-Muster: `GHSync.syncFile(path, { local, merge, equals })` + Löschmarkierungen; Merge pro Eintrag nach `id`
(Gym: neueste `updatedAt` gewinnt). Unterseiten mit Eingaben nicht durch `rerenderCurrent()` neu zeichnen.

## Ton auf iPhone/iPad – Erfahrungen (wichtig!)
Ziel war: Ansagen hörbar **und** ein Video aus einer anderen App im Bild-in-Bild läuft weiter, auch im Stummmodus.
Ergebnis nach vielen Tests auf dem echten iPad: **Für Web-Apps nicht möglich.** Safari setzt nie `mixWithOthers`.

| Technik | Video (andere App) | Stummmodus |
|---|---|---|
| `speechSynthesis` | stoppt bei jeder Ansage, läuft nicht von selbst weiter | hörbar (schaltet die Seite auf „Medienwiedergabe“) |
| Web Audio ohne `audioSession` | läuft weiter (mischt sich) | **stumm** |
| `navigator.audioSession.type = 'ambient'` / `'transient'` | läuft weiter, Lautstärke unverändert (`transient` = in WebKit auch Ambient) | stumm |
| `'playback'` (einmal beim Start gesetzt) | **pausiert** | hörbar, Medienlautstärke |
| `transient-solo`, `play-and-record` | unterbrechen laut WebKit-Quellcode ebenfalls | – |

- `audioSession.type` **nur einmal beim Start setzen, bevor ein Ton läuft.** Umstellen vor jeder Ansage hat jeglichen Ton abgewürgt.
- „Erste Ansage per `speechSynthesis`, Rest per Web Audio“ hat nicht funktioniert (kein Ton im Stummmodus, Video stoppte trotzdem).
- Umgesetzte Lösung: Ansagen sind **vorab erzeugte WAV-Bausteine** (in app-daten/`dehn-audio/`, Windows-Stimme Katja),
  abgespielt über Web Audio wie die Pieptöne; auf Apple-WebKit `audioSession.type = 'playback'` einmal in `init()`.
  Im Player **Ton-Schalter**: *Ton an* = hörbar im Stummmodus, Video pausiert; *Ton aus* = kein AudioContext, Video läuft ungestört.
- AudioContext nach 1,5 s Ruhe `suspend()`, vor dem nächsten Ton `resume()`; Zustand `interrupted` beachten.
- Ein Video im **selben** Kontext (z. B. eigener Player in der App) würde mit `playback` parallel laufen – nicht umgesetzt.
- Testseite `audio-test/` probiert alle Kombinationen auf dem Gerät durch. Der Claude-Browser kann Service Worker nur über
  Vorschau-Server zuverlässig laden – Audio-Verhalten lässt sich dort nicht prüfen, nur am echten Gerät.
