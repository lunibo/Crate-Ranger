# Crate Ranger

🇬🇧 [English version](README.md)

*Der Ranger, der die Plattenkisten durchstreift.* Crate Ranger ist ein inoffizieller Desktop-Musik-Client für Windows und Linux
für [SoundScout](https://www.soundscout.com) (Monstercat-Katalog) mit Download, vollständigem Tagging und
Bibliotheksverwaltung.

> Crate Ranger steht in keiner Verbindung zu SoundScout, Monstercat oder Create Music Group.
> Downloads sind nur im Rahmen des eigenen SoundScout-Plans möglich.

## Funktionen

- **Browsen**: Start (neue Releases, beliebte Tracks, Playlists), Katalog mit Filtern
  (Genre, Stimmung, Thema, Instrumente, Release-Typ, BPM, „Copyright Safe“), Entdecken, Artists, Releases.
- **Alles ist verlinkt**: Songtitel öffnen die Track-Seite (Metadaten, Stimmungen/Themen/Instrumente,
  Lyrics, „Erscheint auf“, ähnliche Tracks), Artist-Namen den Artist, Release-Titel und Cover das Release –
  in Listen, Karten, Player, Warteschlange, Downloads und Bibliothek.
- **Suche**: Namenssuche (Artists, Releases, Playlists, Tracks …) und SoundScout-KI-Suche per Beschreibung;
  „Ähnliche Tracks“ für jeden Track.
- **Player**: Warteschlange, Zufall, Wiederholen, Spulen, Lautstärke, Windows-Medientasten.
  Eingeloggt in voller Länge (MP3 320). Heruntergeladene Tracks werden lokal abgespielt.
- **Weiterhören**: Die App merkt sich Warteschlange, Track und Position – nach dem Neustart geht es mit „Play“
  genau dort weiter.
- **Endlos hören** (Einstellungen → Wiedergabe): Ist die Warteschlange, ein Album oder ein Song zu Ende, laufen
  ähnliche Tracks weiter – ohne Versionen von Songs, die schon liefen. Beim ersten Ende fragt die App einmal nach.
- **Playlists & Favoriten** des eigenen Kontos. Ein Herz in der Player-Leiste (laufender Song), in jeder
  Trackzeile und auf der Track-Seite fügt Songs den SoundScout-Favoriten hinzu bzw. entfernt sie.
- **Downloads** (FLAC, MP3 320, WAV) für Track, Release, Playlist, Favoriten oder die geladenen Tracks
  einer Artist-/Katalogansicht, mit Warteschlange
  (parallel, pausier- und fortsetzbar). Bei Kontingent- oder Abo-Fehlern hält die Warteschlange an.
- **Download-Kontingent** (Sidebar, Downloads-Seite, Einstellungen): „x / 3.000“ im aktuellen
  Abrechnungszeitraum mit Reset-Datum. SoundScout stellt keinen Zähler bereit; die App zählt daher ihre eigenen
  erfolgreichen Downloads (übersprungene zählen nicht). Downloads über die Website oder andere Geräte fehlen in
  der Zählung. Laut SoundScout-FAQ: Monatspläne 3.000 pro Abrechnungszeitraum, Jahrespläne unbegrenzt,
  Testphase 25. Meldet der Server das Limit, zeigt die App „Limit erreicht“ und hält die Warteschlange an.
  Beim Einreihen warnt sie, wenn die Warteschlange das geschätzte Restkontingent übersteigt.
- **Pre-Releases**: Tracks, deren Release-Zeitpunkt noch in der Zukunft liegt, sind mit „Pre-Release“ markiert
  (Tooltip: verfügbar ab Datum/Uhrzeit). Download-Buttons sind bis dahin gesperrt; beim Einreihen von Releases,
  Playlists oder Listen werden sie übersprungen und gemeldet – es wird kein Download-Aufruf an SoundScout gesendet.
- **Discord-Status** (in den Einstellungen aktivierbar): zeigt in Discord „Hört …“ mit Titel, Artist, Cover,
  Fortschrittsbalken und einem Button „Auf SoundScout anhören“; bei Pause ausgeblendet. Ein Klick auf Song, Artist
  oder Cover öffnet die Track-, Artist- bzw. Release-Seite auf SoundScout. Benötigt die
  Discord-Desktop-App auf demselben Rechner (Windows: Named Pipe, Linux: Socket inkl. Flatpak/Snap).
- **Field Report** (Hörstatistik, lokal): Minuten, Top-Artists/-Tracks/-Releases, Genres, Stimmungen, Monstercat-Labels,
  Hör-Uhr und Wochentage, Verlauf pro Monat/Tag, längste Serie, Entdeckungen, Tempo (BPM), Musik-Ären, Hörgewohnheiten
  (zu Ende gehört/übersprungen, lokal/Stream, Favoriten, Suchen, Downloads, Zeit in der App) und dein „Ranger-Typ“ –
  für ein Jahr, die letzten 30 Tage oder gesamt, mit Story-Modus im Vollbild. Gezählt wird nur tatsächlich gehörte
  Zeit (Spulen/Pausen nicht), ein „Play“ ab 30 s. Alle Daten bleiben auf dem Rechner (`%APPDATA%/Crate Ranger/stats`);
  Sammeln lässt sich in den Einstellungen abschalten, die Daten lassen sich löschen.
- **Tagging**: Titel, Artists, Album-Artist, Album, Track x/y, Datum, alle Genres, BPM, Tonart, ISRC, UPC,
  Katalognummer, Label, Brand (Uncaged/Instinct/Silk), Copyright, Stimmungen, Themen, Instrumente, Lyrics,
  Explicit, Copyright-Safe-Status, Cover und SoundScout-IDs. Bei FLAC wird der nicht standardkonforme
  ID3-Header der SoundScout-Dateien entfernt; das Audio bleibt bitgenau unverändert.
- **Bibliothek**: merkt sich jeden Download (Status ✓ in allen Listen, Release-Fortschritt x/y),
  erkennt fehlende Dateien und liest bestehende Downloads per „Ordner scannen“ wieder ein.
  **„Tags & Ordner aktualisieren“** schreibt die Tags aller Downloads neu und sortiert sie in die aktuelle
  Ordnerstruktur ein – ohne erneuten Download, also ohne Kontingent.

## Sprachen

Die App ist auf **Deutsch** und **Englisch** verfügbar. Unter *Einstellungen → Sprache* lässt sich
„Systemsprache“ (Standard) oder eine feste Sprache wählen; Datums- und Zahlenformate folgen der Sprache.

**Neue Sprache hinzufügen** (z. B. Französisch):

1. `src/shared/locales/en.json` nach `src/shared/locales/fr.json` kopieren.
2. `meta.name` (z. B. „Français“) und `meta.englishName` („French“) setzen und alle Werte übersetzen.
   Platzhalter wie `{{count}}` und Markup wie `<b>…</b>` unverändert lassen. Pluralformen werden über
   Suffixe nach CLDR gebildet (`_one`, `_other`, bei Bedarf `_few`, `_many` …).
3. `npm test` ausführen – der Test prüft, dass alle Schlüssel, Platzhalter und Tags vorhanden sind.

Die Datei wird automatisch erkannt (Vite `import.meta.glob`) und erscheint in der Sprachauswahl; Code muss nicht
geändert werden. Technik: [i18next](https://www.i18next.com) / react-i18next, gemeinsame Sprachdateien für Oberfläche
und Hauptprozess (`src/shared/i18n.ts`), typsichere Schlüssel mit `en.json` als Referenz (`src/shared/i18next.d.ts`).
In die Audiodateien geschriebene Metadaten (z. B. der Kommentar) bleiben bewusst sprachunabhängig auf Englisch.

## Discord-Status einrichten

Discord Rich Presence braucht eine Discord-Application – deren Name erscheint im Status als „Hört <Name>“.
Crate Ranger bringt eine fest hinterlegte Application mit; Nutzer brauchen nur den Schalter in den Einstellungen.

Wer das Projekt forkt und eine eigene Application nutzen möchte: im
[Discord Developer Portal](https://discord.com/developers/applications) „New Application“ anlegen (z. B. **SoundScout**),
die **Application ID** kopieren und in `src/shared/discord.ts` als `DEFAULT_DISCORD_CLIENT_ID` eintragen.
Die ID ist öffentlich und kein Geheimnis.

## Ordnerstruktur

Standard (in den Einstellungen änderbar):

```
<Download-Ordner>/
└─ Shingo Nakamura/
   └─ 2022 - Focus [MCS1380]/
      ├─ 01 - Focus.flac
      ├─ 02 - Focus (Extended Mix).flac
      └─ cover.jpg
```

Bei Compilations steht der Track-Artist im Dateinamen (`03 - Feint - Time Bomb.flac`).
Featured-Artists landen nicht im Ordnernamen („Stonebank feat. EMEL“ → `Stonebank/`), damit alle Releases eines
Artists zusammenliegen; im Album-Artist-Tag bleibt der volle Name (Platzhalter `{releaseArtistFull}` für den Ordner).
Namen werden für Windows bereinigt; zu lange Pfade werden automatisch gekürzt.

## Anmeldung

„Anmelden“ öffnet die offizielle SoundScout-Anmeldeseite in einem App-Fenster (inkl. Captcha/2FA).
Die App speichert kein Passwort, nur die Sitzung (30 Tage). Falls die Captcha-Prüfung dort scheitert, gibt es
im Dialog den Ausweichweg **„Mit Browser-Sitzung anmelden“**: Du meldest dich im normalen Browser an und
fügst den Wert des Cookies `goldloginz` ein.

Downloads sind nur mit einem bezahlten SoundScout-Plan möglich und zählen ggf. auf dessen Kontingent.

## Download

Fertige Versionen gibt es unter **Releases** dieses Repositorys:

| System | Datei |
|---|---|
| Windows | `CrateRanger-<version>-setup.exe` (Installer) oder `CrateRanger-<version>-portable.exe` |
| Linux (alle Distributionen) | `CrateRanger-<version>-x86_64.AppImage` – `chmod +x` und starten |
| Debian/Ubuntu | `crate-ranger_<version>_amd64.deb` – `sudo apt install ./crate-ranger_<version>_amd64.deb` |

Die Windows-Dateien sind nicht code-signiert; SmartScreen fragt beim ersten Start nach
(„Weitere Informationen“ → „Trotzdem ausführen“).

**Update-Prüfung:** Beim ersten Start fragt die App, ob sie nach neuen Versionen suchen darf. Mit Zustimmung ruft sie
höchstens alle 6 Stunden die öffentliche Release-Liste dieses Repositorys über die GitHub-API ab (keine Konto- oder
Nutzungsdaten; GitHub sieht wie bei jedem Abruf die IP-Adresse) und weist auf neue Releases hin – heruntergeladen wird
nur, wenn du es selbst tust. Abschaltbar unter *Einstellungen → Updates*. Bei einem Fork `UPDATE_REPO` in
`src/shared/update.ts` anpassen.

## Release veröffentlichen

Releases werden automatisch von GitHub Actions gebaut (`.github/workflows/release.yml`), sobald ein Versions-Tag
gepusht wird:

```bash
git tag v0.2.0
git push origin v0.2.0
```

Ablauf: Typecheck & Tests → Build auf Windows (Installer + portable .exe) und Linux (AppImage + .deb) →
GitHub-Release mit allen Dateien, `SHA256SUMS.txt` und automatisch erzeugten Release-Notes. Die Version wird aus
dem Tag übernommen (`package.json` muss dafür nicht angepasst werden). Tags mit Bindestrich wie `v0.3.0-beta.1`
erscheinen als Pre-Release. Über *Actions → Release → Run workflow* lässt sich ein Test-Build ohne Veröffentlichung
starten. Die Actions sind auf Commit-SHAs gepinnt; Dependabot (`.github/dependabot.yml`) hält sie aktuell.

## Entwicklung

```bash
npm install
npm run dev          # App mit Hot Reload starten
npm test             # Unit-Tests (vitest)
npm run typecheck
npm run dist:win     # dist/CrateRanger-<version>-portable.exe (baut auch unter WSL/Linux)
npm run dist:win:installer   # NSIS-Installer – unter Windows ausführen (unter Linux wird wine benötigt)
npm run dist:linux   # AppImage + .deb (.deb braucht eine homepage, z.B. -c.extraMetadata.homepage=…)
```

Tests gegen eine echte SoundScout-FLAC: `SS_TEST_FLAC=/pfad/zu/datei.flac npm test`.
Mit `CRATE_RANGER_USER_DATA=/tmp/irgendwo` startet die App mit einem eigenen Datenordner (z. B. für Demo-Statistiken),
ohne die echten Einstellungen, Bibliothek oder Statistiken zu berühren.
`scripts/smoke.mjs` und `scripts/e2e-loggedin.mjs` starten die gebaute App (`npm run build`) und machen Screenshots;
`e2e-loggedin.mjs` lädt nur mit `E2E_DOWNLOAD=1` genau einen Track herunter.
`scripts/readme-screenshots.mjs` erzeugt die README-Screenshots (`docs/screenshots/`) mit einem Demo-Datenordner und
ersetzt dabei private Angaben (Abo-Name, lokale Pfade, Discord-Nutzer).

> Hinweis für WSL: VS Code setzt `ELECTRON_RUN_AS_NODE`. Die Skripte entfernen die Variable selbst;
> beim manuellen Start `env -u ELECTRON_RUN_AS_NODE npx electron-vite dev` verwenden.
> Die Windows-.exe nicht direkt von `\\wsl.localhost\…` starten (GPU-Prozess scheitert), sondern nach Windows kopieren.

## Architektur

```
src/main/        Electron-Hauptprozess (alle Netzwerkzugriffe)
  api/           SoundScout-API-Client (Session-Cookie, columns-Listen)
  auth.ts        Anmeldefenster, Sitzungsimport, Abmelden
  stream.ts      signierte Stream-URLs auflösen
  downloads/     Metadaten → Pfad → Download → Tags → cover.jpg → Bibliothek; Warteschlange
  library/       JSON-Index (%APPDATA%/Crate Ranger/library.json) und Ordner-Scan
  discord/       Discord Rich Presence (IPC-Protokoll, Verbindung, Aktivität)
  stats/         lokale Hörstatistik (JSON-Lines) für den Field Report
  mediaProtocol  media:// für lokale Wiedergabe (mit Range/Spulen)
src/preload/     schmale IPC-Brücke (window.ss)
src/renderer/    React-UI (Router, TanStack Query, Zustand)
src/shared/      gemeinsame Typen, Sprachdateien, Field-Report-Auswertung
```

Die Website-API (`https://www.soundscout.com/api`) ist inoffiziell. Alle Endpunkte sind in
`src/main/api` bzw. `src/renderer/src/lib/api.ts` gekapselt, der Renderer darf nur Pfade aus einer
Whitelist aufrufen (`src/main/ipc.ts`).
