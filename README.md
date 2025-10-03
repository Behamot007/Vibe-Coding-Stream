# Vibe Coding Stream Event Bridge

Dieses Projekt stellt die Grundstruktur für eine Web-Anwendung bereit, mit der Twitch-Chat-Befehle auf Aktionen eines dedizierten Minecraft-Servers gemappt werden können. Die Anwendung konzentriert sich auf die Konfigurationsoberfläche und speichert alle Schnittstelleninformationen zentral in einer JSON-Datei.

## Überblick

- **Twitch Schnittstelle**: Konfiguriere Benutzername, Client-Informationen und OAuth-Token des gewünschten Twitch-Kontos. Über die API-Endpunkte kann später ein Chat-Listener implementiert werden, der Befehle von Zuschauer:innen entgegennimmt.
- **Minecraft Schnittstelle**: Hinterlege Host, RCON-Port, Passwort und einen Basis-Pfad für Skripte, die auf dem dedizierten Server liegen. Die Konfiguration bildet die Grundlage für spätere Trigger, die Minecraft-Ereignisse auslösen.
- **Command Mapping**: Ordne Klartext-Chatbefehle konkreten Skriptnamen zu. Diese Mappings werden genutzt, um aus Twitch-Nachrichten auslösbare Events zu erzeugen.

## Projektstruktur

```
├── config/
│   └── settings.json          # Persistente Konfiguration für Twitch, Minecraft und Befehls-Mappings
├── public/
│   ├── index.html             # Web UI zur Pflege der Konfiguration
│   ├── main.js                # Frontend-Logik für das Speichern/Laden der Konfiguration
│   └── styles.css             # Oberflächen-Styling
└── src/
    ├── server.js              # HTTP-Server mit REST-API für die Konfiguration
    └── eventBridge.js         # EventBridge-Klasse als Startpunkt für die spätere Integration
```

## Nutzung

1. **Abhängigkeiten installieren**: Das Projekt kommt ohne externe Pakete aus und nutzt ausschließlich Node.js Kernmodule, damit es auch in eingeschränkten Umgebungen läuft.
2. **Server starten**:

   ```bash
   node src/server.js
   ```

3. **Web-Oberfläche öffnen**: Rufe im Browser `http://localhost:3000` auf. Dort können die Schnittstelleninformationen gepflegt und neue Mappings angelegt werden.

## API-Überblick

| Methode | Pfad                          | Beschreibung                                  |
| ------- | ----------------------------- | --------------------------------------------- |
| GET     | `/api/config`                 | Liefert die komplette Konfiguration           |
| POST    | `/api/config/twitch`          | Aktualisiert die Twitch-spezifischen Werte (Server verbindet/verbindet neu bei Erfolg) |
| POST    | `/api/config/minecraft`       | Aktualisiert die Minecraft-spezifischen Werte |
| POST    | `/api/config/commands`        | Fügt ein neues Mapping hinzu oder aktualisiert es |
| DELETE  | `/api/config/commands/:cmd`   | Entfernt ein bestehendes Mapping              |
| GET     | `/api/test/twitch`            | Prüft live, ob mit der gespeicherten Twitch-Konfiguration eine Chat-Verbindung aufgebaut werden kann |

Die gespeicherte Konfiguration kann von Listener-Services (z. B. Twitch Chat Bot, Minecraft Remote Control) eingelesen werden, um den Eventfluss aufzubauen.

## Aktuelle Wege zur Generierung eines Twitch-Chat-Tokens

Der ehemals populäre "Twitchapps TMI Token Generator" ist seit Anfang 2024 nicht mehr verfügbar. Für neue Tokens empfiehlt sich einer der offiziell unterstützten OAuth-Flows. Die folgenden Schritte beschreiben den pragmatischen Weg über die [Twitch CLI](https://dev.twitch.tv/docs/cli), weil darüber ein kompletter Login samt Token-Verwaltung abgebildet werden kann:

1. **Twitch CLI installieren** – Lade das passende Paket für dein Betriebssystem herunter und stelle sicher, dass es im `PATH` liegt.
2. **Client anlegen** – Erstelle im [Twitch Developer Dashboard](https://dev.twitch.tv/console/apps) eine neue Anwendung. Notiere dir `Client ID` und `Client Secret`.
3. **CLI konfigurieren** – Führe `twitch configure` aus und trage die beiden Werte ein. Hinterlege als Redirect-URL `http://localhost:3000` (oder eine andere lokale Adresse, die du verwenden möchtest).
4. **Login durchführen** – Starte `twitch login --scopes "chat:read chat:edit"`. Die CLI öffnet den Browser, du bestätigst die angeforderten Berechtigungen und erhältst anschließend einen Access Token.
5. **Token nutzen** – Die CLI zeigt den OAuth-Token an und speichert ihn lokal. Verwende diesen Wert als `oauth:...`-Passwort für IRC-Verbindungen (z. B. mit `tmi.js`).

Alternativ kannst du die gleichen Schritte manuell über den Authorization-Code-Flow durchführen. Beachte dabei, dass Twitch-Access-Tokens zeitlich begrenzt sind: Bewahre das `refresh_token` sicher auf und erneuere den Token regelmäßig über `https://id.twitch.tv/oauth2/token`.

### Schnelle Tokens über den Twitch Token Generator

In der Web-Oberfläche steht zusätzlich eine Schaltfläche **„Twitch Token Generator testen“** bereit. Damit wird [twitchtokengenerator.com](https://twitchtokengenerator.com) geöffnet, wo du testweise ein `oauth:`-Token für Chat-Anwendungen erstellen kannst. Achte darauf, dass der erzeugte Wert mit `oauth:` beginnt – falls nicht, ergänze das Präfix im Formular. Tokens aus diesem Tool besitzen eine begrenzte Gültigkeit und sollten regelmäßig erneuert werden.

Nach dem Speichern der Konfiguration versucht der Server automatisch, eine Twitch-Chat-Verbindung aufzubauen. Über den Button **„Verbindung testen“** wird `/api/test/twitch` aufgerufen, das mit den gespeicherten Zugangsdaten eine echte Verbindung prüft und das Ergebnis direkt anzeigt. Erfolgreiche sowie fehlgeschlagene Verbindungsversuche werden außerdem im Chat-Log (Server-Sent Events) protokolliert.

## Weiteres Vorgehen

- Implementierung eines Twitch Chat Listeners (z. B. über die IRC-Schnittstelle), der `EventBridge#createTwitchEventPayload` nutzt.
- Aufbau eines Minecraft-RCON-Clients, der Trigger aus `EventBridge#createMinecraftTrigger` verarbeitet.
- Erweiterung der Web-Oberfläche um Validierung, Authentifizierung und Rollenkonzepte, sobald mehrere Personen auf die Konfiguration zugreifen sollen.

