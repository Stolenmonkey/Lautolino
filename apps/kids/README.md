# Kinder-App (Phase 5)

Installierbare Web-App im Silbenzauber-Design. Läuft nur im Browser.

## Starten
1. `npm run build:kids` bündelt `src/` (mit core und engine, unverändert) zu `dist/app.js`.
2. In `config.js` die Adresse des Servers eintragen (`window.SILBENFLUG_API`).
3. Den Ordner `apps/kids` als statische Seite ausliefern (z. B. Cloudflare Pages). Auf dem Tablet "Zum Startbildschirm hinzufügen".

## Ablauf
- Anmeldung mit dem Schülercode (z. B. SonneWald7, ohne Umlaute und Bindestrich), Schreibweise egal. Ältere Codes wie Tiger-Sonne-47 gelten weiter.
- Übersicht: alle 26 Buchstaben, freigegebene hervorgehoben, je freigegebenem Buchstaben Bronze/Silber/Gold als Medaille der höchsten Stufe plus drei Punkte (erreichte Stufen farbig, noch offene grau) und eine Legende, keine Prozentwerte.
- Übung: 20 Silben. Die Hauptsilbe steht etwas links, rechts daneben klein und hellgrau die tatsächlich nächsten zwei Silben. Unter jeder Sprechsilbe steht ein Silbenbogen (WAR ein Bogen, MAMA zwei). Weiter-Taste, Zeit je Silbe und Zeit der Runde. Eine Runde nutzt immer alle für das Kind freigegebenen Buchstaben und die Silbenlängen der Klasse.
- Automatik (immer an): Schwierigkeit je Buchstabenkombination, Zielzeit aus der Konfiguration. Neue Kombination startet leichter als die ähnlichste bekannte.
- Rundenende: "Deine Zeit" in Sekunden. Glückwunsch-Popup nur für die höchste neu erreichte Stufe je Buchstabe.

## Offline
- Fertige Runden liegen im Puffer (je mit `clientRoundId`) und werden gesendet, sobald Netz da ist (beim Start, beim Zurückkehren in die App, bei "online"). Der Server erkennt Doppelte.
- Plan, Konfiguration, Auszeichnungen und Silbenzeiten werden gemerkt; die Übung geht ohne Netz weiter. Nur die Anmeldung braucht Netz.
- Abgelaufene Anmeldung: zurück zur Anmeldung, der Puffer bleibt und wird nach erneuter Anmeldung gesendet.

## Bekannte Grenzen
- Die Bestätigung des Popups quittiert beim Server alle offenen Auszeichnungen auf einmal.
- Vorlesen und Sperren aus Silbenzauber sind nicht übernommen.

## Abgleich mehrerer Geräte
Sind alle gemerkten Runden gesendet, übernimmt das Gerät die Silbenzeiten vom Server (`GET /student/sync-data`). So hat ein Kind auf jedem Gerät denselben Stand. Solange noch Runden im Puffer liegen, gilt der lokale Stand.

## Lernstufen
Die Runde wird in der App je Silbe zusammengestellt (`syllablePlan` + `groupedTasks`): Freischaltung nach `stages.gate_percent`, Mix aus `stages.mix_*_percent`, berechnet aus den lokalen Silbenzeiten. Ohne Lernstufen (`stages.enabled = 0`) oder bei zu wenigen Silben gilt die Aufgabenverteilung wie in Silbenzauber.
