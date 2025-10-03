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
| POST    | `/api/config/twitch`          | Aktualisiert die Twitch-spezifischen Werte    |
| POST    | `/api/config/minecraft`       | Aktualisiert die Minecraft-spezifischen Werte |
| POST    | `/api/config/commands`        | Fügt ein neues Mapping hinzu oder aktualisiert es |
| DELETE  | `/api/config/commands/:cmd`   | Entfernt ein bestehendes Mapping              |

Die gespeicherte Konfiguration kann von Listener-Services (z. B. Twitch Chat Bot, Minecraft Remote Control) eingelesen werden, um den Eventfluss aufzubauen.

## Weiteres Vorgehen

- Implementierung eines Twitch Chat Listeners (z. B. über die IRC-Schnittstelle), der `EventBridge#createTwitchEventPayload` nutzt.
- Aufbau eines Minecraft-RCON-Clients, der Trigger aus `EventBridge#createMinecraftTrigger` verarbeitet.
- Erweiterung der Web-Oberfläche um Validierung, Authentifizierung und Rollenkonzepte, sobald mehrere Personen auf die Konfiguration zugreifen sollen.

