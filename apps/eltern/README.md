# Elternansicht

Schlichte Web-Seite ohne Build (`index.html`, `app.js`). Adresse des Servers in `config.js` eintragen und den Ordner statisch ausliefern.

## Ablauf
1. Lehrkraft oder Schulleitung: Reiter "Schüler", beim Kind auf "Eltern", dann "Neuen Elterncode erzeugen". Der Code (z. B. K7QM-4TXD-9HRP) ist 30 Tage gültig, nur einmal benutzbar und nur beim Erzeugen sichtbar.
2. Eltern: Seite öffnen, Code eingeben, "Koppeln". Das Gerät bleibt gekoppelt, bis die Schule es widerruft (Reiter "Schüler" → "Eltern" → "Widerrufen"). Pro Kind sind mehrere Geräte möglich.
3. Eltern sehen nur lesend: Buchstaben mit Bronze/Silber/Gold (ohne Prozentwerte) und die Rundenzeiten ihres Kindes.

## Server
`POST /students/:id/parent-codes`, `GET /students/:id/parent-devices`, `POST /students/:id/parent-devices/:did/revoke` (Admin, Schulleitung, Lehrkraft der eigenen Klasse); `POST /parent/activate` (begrenzte Fehlversuche); `GET /parent/me`, `/parent/letters`, `/parent/rounds` (nur Elterngeräte). Gültigkeit des Codes: Konfiguration `security.parent_code_days` (30).
