# Elternansicht

Schlichte Web-Seite ohne Build (`index.html`, `app.js`). Adresse des Servers in `config.js` eintragen und den Ordner statisch ausliefern.

## Ablauf
1. Lehrkraft oder Schulleitung: Beim Anlegen eines Kindes (Reiter "Schüler") erscheinen Schülercode und Elterncode einmalig auf dem Bildschirm (druckbar). Für bereits vorhandene Kinder: "Elterncodes für Kinder ohne Code erzeugen" oder beim Kind auf "Eltern" und "Elterncode erzeugen".
2. Eltern: Seite öffnen, Elterncode (z. B. K7QM-4TXD-9HRP, Schreibweise egal) eingeben, "Anmelden". Es gibt keine Geräte-Kopplung. Die Anmeldung bleibt 90 Tage bestehen (Konfiguration `security.parent_session_days`); dann einfach den Code noch einmal eingeben.
3. Neuer Elterncode (Schule): Der alte Code und alle Anmeldungen der Eltern enden sofort.
4. Eltern sehen nur lesend: Buchstaben mit Bronze/Silber/Gold (ohne Prozentwerte) und die Rundenzeiten ihres Kindes.

## Server
`POST /students/:id/parent-code/regenerate`, `GET /students/:id/parent-access`, `POST /classes/:cid/parent-codes/missing` (Admin, Schulleitung, Lehrkraft der eigenen Klasse); `POST /parent/login` (begrenzte Fehlversuche; `/parent/activate` ist ein alter Name für dasselbe); `GET /parent/me`, `/parent/letters`, `/parent/rounds` (nur angemeldete Eltern).
