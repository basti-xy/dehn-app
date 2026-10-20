# Routinen-App

Statische Web-App (HTML/CSS/JS, kein Backend), die Schritt für Schritt durch Trainings-Routinen führt:
Countdown bzw. Wiederholungen, Seitenwechsel, Satzpausen, Töne, deutsche Sprachansage, Streak.

Die **Routinen und der Verlauf liegen nicht in diesem Repository**, sondern in einem privaten Daten-Repository.
Die App lädt sie über die GitHub-API mit einem persönlichen Token, den man pro Gerät einmal in der App einträgt.
Hier liegt nur der Programmcode.

## Daten-Repository (privat)

| Datei | Inhalt |
|---|---|
| `dehn-routines.json` | Routinen, Zyklus, Rollen (siehe unten) |
| `dehn.json` | Verlauf, wird von der App geschrieben |

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
