# Vibe Coding Stream Event Bridge

Dieses Projekt stellt die Grundstruktur für eine Web-Anwendung bereit, mit der Twitch-Chat-Befehle auf Aktionen eines dedizierten Minecraft-Servers gemappt werden können. Die Anwendung konzentriert sich auf die Konfigurationsoberfläche und speichert alle Schnittstelleninformationen zentral in einer JSON-Datei.

## Überblick

- **Twitch Schnittstelle**: Konfiguriere Benutzername, Client-Informationen und OAuth-/Access-Token des gewünschten Twitch-Kontos. Der Server validiert Access Tokens automatisch über die Twitch OAuth-Endpoints und erneuert sie mithilfe eines gespeicherten Refresh Tokens.
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

1. **Abhängigkeiten installieren**: Die Anwendung benötigt lediglich Node.js (inkl. integriertem `fetch`) sowie das Paket `tmi.js`, das bereits als Abhängigkeit eingetragen ist.
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

Twitch verlangt seit 2023 für Chat-Interaktionen gültige OAuth-Tokens mit den Scopes `chat:read` und `chat:edit`. Du hast zwei praktikable Wege, um diese Tokens zu erhalten:

### 1. Offizieller Authorization-Code-Flow (empfohlen für Produktion)

1. **Client anlegen** – Erstelle im [Twitch Developer Dashboard](https://dev.twitch.tv/console/apps) eine Anwendung und notiere `Client ID` sowie `Client Secret`.
2. **Authorization-Code-Flow starten** – Öffne die URL `https://id.twitch.tv/oauth2/authorize?response_type=code&client_id=<CLIENT_ID>&redirect_uri=<REDIRECT_URL>&scope=chat:read+chat:edit+user:read:email` im Browser, bestätige die Berechtigungen und kopiere den zurückgelieferten `code`.
3. **Tokens austauschen** – Sende per `POST https://id.twitch.tv/oauth2/token` die Parameter `client_id`, `client_secret`, `code`, `redirect_uri` und `grant_type=authorization_code`. Die Antwort enthält `access_token`, `refresh_token` und `expires_in`.
4. **Konfiguration befüllen** – Hinterlege Benutzername, Kanal, Access- und Refresh-Token sowie das optionale Ablaufdatum (`tokenExpiresAt`) in der Web-Oberfläche. Der Server nutzt anschließend automatisch `https://id.twitch.tv/oauth2/validate` und `https://id.twitch.tv/oauth2/token`, um Tokens zu prüfen bzw. zu erneuern.

### 2. Twitch Token Generator (praktisch für Tests)

1. Öffne [twitchtokengenerator.com](https://twitchtokengenerator.com) über den Button in der Oberfläche.
2. Wähle den gewünschten Scope (`chat:read chat:edit`) und aktiviere „Provide Refresh Token“, damit du neben dem Access Token auch einen Refresh Token erhältst.
3. Übertrage den angezeigten Access Token (ohne `oauth:`-Präfix) sowie den Refresh Token in die erweiterten Felder der Twitch-Konfiguration. Ein separates `oauth:`-Token ist nicht erforderlich – der Server erzeugt automatisch das richtige IRC-Passwort.
4. Optional kannst du weiterhin klassische `oauth:`-Tokens (z. B. aus älteren Generatoren) in das Hauptfeld eintragen; diese werden unverändert verwendet.

Nach dem Speichern versucht der Server automatisch, eine Twitch-Chat-Verbindung aufzubauen. Über **„Verbindung testen“** wird `/api/test/twitch` aufgerufen. Der Endpoint validiert die gespeicherten Tokens, erneuert sie bei Bedarf und prüft anschließend eine Live-Verbindung zum angegebenen Kanal. Ergebnisse und Warnungen erscheinen zusätzlich im Chat-Log.

## Weiteres Vorgehen

- Implementierung eines Twitch Chat Listeners (z. B. über die IRC-Schnittstelle), der `EventBridge#createTwitchEventPayload` nutzt.
- Aufbau eines Minecraft-RCON-Clients, der Trigger aus `EventBridge#createMinecraftTrigger` verarbeitet.
- Erweiterung der Web-Oberfläche um Validierung, Authentifizierung und Rollenkonzepte, sobald mehrere Personen auf die Konfiguration zugreifen sollen.

