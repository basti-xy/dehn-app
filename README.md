# Milon

*Kleine Lasten, täglich getragen, werden zu großer Kraft.* – benannt nach Milon von Kroton, der der Sage nach jeden Tag
ein Kalb trug, bis es ein ausgewachsener Stier war.

Statische Web-App (HTML/CSS/JS, kein Build, kein Backend) für das eigene Training: Dehn-Routinen mit Timer und
Sprachansagen, Gym-Tracking, Trainingswoche und Leistungswerte.

Die **Routinen und der Verlauf liegen nicht in diesem Repository**, sondern in einem privaten Daten-Repository.
Die App lädt sie über die GitHub-API mit einem persönlichen Token, den man pro Gerät einmal in der App einträgt.
Hier liegt nur der Programmcode.

## Daten-Repository (privat)

| Datei | Inhalt |
|---|---|
| `dehn-routines.json` | Routinen, Zyklus, Rollen (siehe unten) |
| `dehn.json` | Verlauf, wird von der App geschrieben |
| `dehn-audio/` | Sprachansagen als WAV-Bausteine plus `index.json` (Text → Datei) |
| `gym-plans.json` | Gym-Pläne: Splits mit Übungen (id, Block, Sätze, Wdh., kg, Schrittweite) und Wochenziel |
| `gym.json` | Gym-Protokoll, wird von der App geschrieben (Sync + Merge pro Einheit, Löschmarkierungen) |
| `training/weekly.json` | Trainingswoche für die Karte auf der Startseite (Stunden, Umfang je Sportart, Erholung, Erkenntnisse), optional |

Die Ansagen werden wie die Countdown-Töne über Web Audio abgespielt. Dadurch mischen sie sich mit anderem Audio
(ein Video im Bild-in-Bild läuft weiter) und folgen der Medienlautstärke. Fehlt ein Baustein, nutzt die App die
eingebaute Sprachausgabe des Browsers.

Token: *Settings → Developer settings → Fine-grained tokens*. Bei *Repository access* nur das Daten-Repository auswählen,
bei *Contents* **Read and write** setzen. Der Token wird nur im Browser des Geräts gespeichert und nur an `api.github.com` gesendet.
Er gilt für alle eigenen Apps unter derselben `*.github.io`-Adresse.

## Routinen-Datei

- `settings`: `transitionSeconds`, `sideSwitchSeconds`, `defaultSecondsPerRep`, `defaultRestBetweenSetsSeconds`, `autoAdvanceRepExercises`
- `rotation.cycle`: fester Zyklus aus Routinen-IDs und `"pause"`
- `roles.weekly`: `{ routine, weekday (0 = Sonntag), hint, cooldown }`, eine Routine mit eigener Wochen-Streak und Hinweis an ihrem Wochentag
- `roles.extra`: `{ routine, onPlanDays }`, optionales Extra, das an bestimmten Plan-Tagen vorgeschlagen wird
- `routines[].exercises[]`: `type` (`time`/`reps`), `seconds`, `reps`, `secondsPerRep`, `perSide`, `alternating`, `sets`,
  `restSeconds`, `phase`, `cue`, `important`, `benefit`, `note`, `repsRange`, `secondsRange`, optional `image`

Änderungen direkt im Daten-Repository bearbeiten. Die App holt sie beim nächsten Öffnen oder über *Jetzt abgleichen*.
Offline nutzt sie die zuletzt geladene Version.

## Streak

- Erledigte Zyklus-Einheit = +1, geplanter Pausentag zählt automatisch mit.
- Ein verpasster Tag pro Kalenderwoche wird von einem Joker abgefangen, danach beginnt die Streak neu.
- Die Wochen-Routine hat eine eigene Wochen-Streak.

## Lokal starten

`py -m http.server 8010` im Ordner, dann `http://localhost:8010`. Eine lokale `routines.json` wird als Rückfall genutzt,
ist aber per `.gitignore` vom Repository ausgeschlossen.

## Bedienung

Tippen auf den Ring = Pause. Tastatur: **Leertaste** Pause, **→** überspringen, **←** zurück, **Enter** „Fertig“, **Esc** abbrechen.
