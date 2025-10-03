# Twitch Live Chat One-Pager

Diese Anwendung ersetzt das ursprüngliche Projekt durch eine minimalistische, aber funktionsreiche Einzelseite, mit der du dich direkt im Browser mit einem Twitch-Channel verbinden kannst.

## Features

- Verbindung zu Twitch per OAuth-Token und Benutzername
- Echtzeit-Anzeige eingehender Chatnachrichten mithilfe von [tmi.js](https://tmijs.com/)
- Möglichkeit, Nachrichten in den ausgewählten Channel zu senden
- Stilvolle, responsive Oberfläche mit Dark-Mode-Unterstützung

## Voraussetzungen

- Ein Twitch-Account
- Ein [Chat-OAuth-Token](https://dev.twitch.tv/docs/irc/get-started#generating-an-oauth-token) im Format `oauth:xxxxxxxxxxxxxxxx`
- Der Name des Twitch-Channels, den du betreten möchtest (ohne `#`)

## Verwendung

1. Öffne die `index.html` in einem Browser.
2. Gib deinen Twitch-Benutzernamen, das OAuth-Token und den Ziel-Channel ein.
3. Klicke auf **Verbinden**. Nach erfolgreicher Verbindung erscheinen Nachrichten automatisch im Live-Chat-Bereich.
4. Versende Nachrichten über das Formular "Nachricht senden". Eigene Nachrichten werden im Verlauf markiert.
5. Trenne die Verbindung bei Bedarf oder lösche den Chatverlauf mit den entsprechenden Buttons.

> **Sicherheitshinweis:** OAuth-Token gewähren Zugriff auf deinen Account. Bewahre sie sicher auf und teile sie nicht. Die Demo speichert keine Daten und arbeitet ausschließlich im Browser.

## Entwicklung

Die Seite verwendet ausschließlich statische Assets (`index.html`, `styles.css`, `app.js`). Es sind keine Build-Schritte erforderlich.

Zum Anpassen:

- Passe das Styling in `styles.css` an.
- Ergänze eigene Logik in `app.js`.
- Erweitere die HTML-Struktur in `index.html`.

## Lizenz

Dieses Projekt steht dir zur freien Anpassung für private Zwecke zur Verfügung. Prüfe vor produktivem Einsatz die Nutzungsbedingungen von Twitch.
