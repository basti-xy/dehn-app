# Milon

*Kleine Lasten, täglich getragen, werden zu großer Kraft.* – benannt nach Milon von Kroton, der der Sage nach jeden Tag
ein Kalb trug, bis es ein ausgewachsener Stier war.

Statische Web-App (PWA, HTML/CSS/Vanilla JS, kein Build, kein Backend) für das eigene Training. Offline-fähig,
für iPhone und iPad gemacht, auch am Laptop nutzbar.

Alle **Inhalte und Verläufe liegen nicht in diesem Repository**, sondern in einem privaten Daten-Repository.
Die App liest und schreibt sie über die GitHub-API mit einem persönlichen Token, den man pro Gerät einmal in der App einträgt.
Hier liegt nur der Programmcode.

## Bereiche (untere Tab-Leiste)

| Tab | Inhalt |
|---|---|
| **Heute** | Dehn-Aufgabe des Tages, Gym-Status der Woche mit nächstem Split, Karte *Trainingswoche* |
| **Gym** | Wochenziel, Gym-Streak mit Kalender, Splits (abhaken oder ausführlich erfassen), letzte Einheiten, Progression pro Übung |
| **Dehnen** | Dehn-Streak mit Kalender, Wochen-Routine, alle Routinen, Player mit Timer und Sprachansagen |
| **Werte** | Leistungs- und Körperwerte mit Stand-Datum und Verlauf |

Einstellungen (Zahnrad oben): Übergangszeiten, Töne, Sprachansage, Synchronisierung, Backup, Einheit nachtragen.

## Code

| Datei | Inhalt |
|---|---|
| `index.html`, `styles.css` | Gerüst und Design (dunkel, Akzent über CSS-Variablen `--accent`, `--accent-grad`, `--good`) |
| `app.js` | Router, Tab-Leiste, Dehnen (Streak, Player, Ansagen), Trainingswoche, Einstellungen, Sync, Backup |
| `gym.js` | Gym: Pläne, Protokoll mit Sync, Erfassen, Progression, Gym-Streak |
| `werte.js` | Werte-Tab |
| `sync.js` | `GHSync`: Lesen/Schreiben einer Datei im Daten-Repository mit Konflikt-Wiederholung |
| `sw.js` | Service Worker (Network-first, offline aus dem Cache) |

Nach jeder Änderung die Versionen hochzählen: `?v=…` in `index.html` und `CACHE` in `sw.js`.
Bestehende localStorage-Schlüssel (`dehnapp.*`) und Dateinamen im Daten-Repository nicht umbenennen.

## Daten-Repository (privat)

| Datei | von Hand | App schreibt | Inhalt |
|---|---|---|---|
| `dehn-routines.json` | ✓ | | Dehn-Routinen, Zyklus, Rollen |
| `dehn.json` | | ✓ | Dehn-Verlauf (Sync + Merge, Löschmarkierungen) |
| `dehn-audio/` | Generator | | Sprachansagen als WAV-Bausteine plus `index.json` (Text → Datei) |
| `gym-plans.json` | ✓ | | Gym-Pläne: Splits mit Übungen (`id`, `block`, `sets`, `reps`, `kg`, `stepKg` …) und `settings.weeklyTarget` |
| `gym.json` | | ✓ | Gym-Protokoll (Merge pro Einheit: neueste Bearbeitung gewinnt, Löschmarkierungen) |
| `training/weekly.json` | Auswertung | | Trainingswoche (Stunden, Erkenntnisse, Sportarten, Erholung) – App liest nur |
| `training/values.json` | ✓ | | Werte: `groups[].items[]` mit `unit`, `kind` (`number`/`pace`/`time`), `better`, `entries[]` (`date` optional) |

Die Ansagen werden wie die Countdown-Töne über Web Audio abgespielt. Auf iPhone/iPad gibt es im Player einen
Ton-Schalter: *Ton an* = hörbar auch im Stummmodus (ein Video im Bild-in-Bild hält dabei an), *Ton aus* = die App
gibt keinen Ton aus und das Video läuft ungestört weiter.

Token: *Settings → Developer settings → Fine-grained tokens*. Bei *Repository access* nur das Daten-Repository auswählen,
bei *Contents* **Read and write** setzen. Der Token wird nur im Browser des Geräts gespeichert und nur an `api.github.com` gesendet.
Er gilt für alle eigenen Apps unter derselben `*.github.io`-Adresse.

## Routinen-Datei (Dehnen)

- `settings`: `transitionSeconds`, `sideSwitchSeconds`, `defaultSecondsPerRep`, `defaultRestBetweenSetsSeconds`, `autoAdvanceRepExercises`
- `rotation.cycle`: fester Zyklus aus Routinen-IDs und `"pause"`
- `roles.weekly`: `{ routine, weekday (0 = Sonntag), hint, cooldown }`, eine Routine mit eigener Wochen-Streak und Hinweis an ihrem Wochentag
- `roles.extra`: `{ routine, onPlanDays }`, optionales Extra, das an bestimmten Plan-Tagen vorgeschlagen wird
- `routines[].exercises[]`: `type` (`time`/`reps`), `seconds`, `reps`, `secondsPerRep`, `perSide`, `alternating`, `sets`,
  `restSeconds`, `phase`, `cue`, `important`, `benefit`, `note`, `repsRange`, `secondsRange`, optional `image`, `say`

Änderungen direkt im Daten-Repository bearbeiten. Die App holt sie beim nächsten Öffnen oder über *Jetzt abgleichen*.
Offline nutzt sie die zuletzt geladene Version.

## Streaks

- **Dehnen:** erledigte Zyklus-Einheit = +1, geplanter Pausentag zählt automatisch mit. Ein verpasster Tag pro
  Kalenderwoche wird von einem Joker abgefangen, danach beginnt die Streak neu. Die Wochen-Routine hat eine eigene Wochen-Streak.
- **Gym:** Wochen (Mo–So) in Folge mit mindestens `weeklyTarget` Einheiten (abgehakt oder ausführlich). Die laufende Woche
  bleibt offen. Ein Joker pro Kalendermonat (Monat des Donnerstags der Woche) fängt eine verpasste Woche ab, die Streak
  bleibt dann stehen; die zweite verpasste Woche im selben Monat setzt sie auf 0.
- **Progression:** Haben beim letzten Mal alle Sätze das obere Ende der Wiederholungsspanne erreicht, zeigt die App
  „+`stepKg` kg probieren“ (bei Körpergewicht: mehr Wdh./Zusatzgewicht, bei Zeit: +5 s). Aufwärmsätze zählen nicht.

## Lokal starten

`py -m http.server 8010` im Ordner, dann `http://localhost:8010`. Eine lokale `routines.json` wird als Rückfall genutzt.
Für Tests mit echten Daten Kopien in `.local/` legen – `routines.json`, Backups und `.local/` sind per `.gitignore`
ausgeschlossen.

## Bedienung

Tippen auf den Ring = Pause. Tastatur: **Leertaste** Pause, **→** überspringen, **←** zurück, **Enter** „Fertig“, **Esc** abbrechen.
Trainingswoche: Pfeile, Wischen oder Tippen auf einen Wochenbalken blättert durch ältere Wochen.
