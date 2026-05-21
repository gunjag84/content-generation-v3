# Onboarding — Content-Generation v3

Für Tim und Jule. Kein lokales Setup nötig — alles läuft im Browser.

---

## 1. Erste Schritte

### Login

URL: **https://contentai-78bfb.web.app**

Klick auf "Mit Google anmelden". Nur Tim und Jule haben Zugang (Allowlist).

### API-Key hinterlegen

Beim ersten Login direkt nach `/settings` gehen:

- **Anthropic API Key** eintragen und speichern.
- Ohne Key läuft keine Generierung.

### Brand-Identität setzen

Unter `/settings/identity` (Tab "Identität"):

- **Stimme** — wie klingt der Account? (z.B. "warm, direkt, ehrlich")
- **Persona** — wer spricht? (z.B. "Jule, Gründerin von LEBEN.LIEBEN")

Diese Felder fließen in jeden generierten Post ein. Je konkreter, desto besser der erste Entwurf.

> Tims Nebentätigkeitsanzeige ist eingereicht und bestätigt. Kein rechtlicher Blocker für die kommerzielle Nutzung.

### Foto-Pool aufbauen

Unter `/settings/photos` Bilder hochladen. Die App wählt beim Generieren passende Fotos aus dem Pool.

### Meta Graph Token + Instagram-Account-ID

Der Token und die `instagramUserId` pro Brand werden aktuell manuell in der Firestore-Console gepflegt (UI ist vorhanden; Fallback bleibt die Console). Tim übernimmt das Setup beim Cutover.

---

## 2. Carousel erstellen

1. Zu `/create` navigieren.
2. **Modus** wählen (z.B. "Create Demand" oder "Convert Demand").
3. **Methode** und **Länge** wählen.
4. "Generieren" klicken — der Stream läuft sichtbar durch.
5. Wenn fertig: Editor öffnet sich automatisch.

**Manuelles Carousel:** Eigener Button auf `/create` — Slide-Texte selbst eingeben, keine KI-Generierung. Nützlich für fertig formulierte Inhalte.

---

## 3. Bearbeitung im Editor

### Text inline bearbeiten (B1)

- **Doppelklick** auf einen Text-Bereich in der Vorschau → Bearbeitungsmodus.
- Text tippen oder ändern.
- **Enter** oder Klick außerhalb übernimmt die Änderung. **ESC** verwirft die Änderung und schließt den Editor.

### Zonen verschieben und ausrichten (B2)

- Zone einfach anklicken → ausgewählt.
- Ziehen zum Verschieben.
- Während des Ziehens: **cyan-gestricheltes Snap-Raster** + **pinke Ausrichtungslinien** helfen beim Einrasten.
- Beide Hilfslinien verschwinden beim Loslassen.

### Undo / Redo (B3)

- **Cmd+Z** — Schritt zurück.
- **Cmd+Shift+Z** — Schritt vor.
- Alternativ: ↶ ↷ Buttons in der Toolbar (deaktiviert wenn Stack leer).

### Tastatur-Shortcuts (D4)

| Shortcut | Aktion |
|----------|--------|
| Cmd+Z | Rückgängig |
| Cmd+Shift+Z | Wiederholen |
| Cmd+S | Speichern |
| Cmd+D | Ausgewählte Zone duplizieren |
| Pfeiltasten | Zone verschieben (1 px) |
| Shift+Pfeiltasten | Zone verschieben (10 px) |
| Del | Ausgewählte Zone löschen |
| Cmd+/ | Shortcut-Cheatsheet anzeigen |

### Foto bearbeiten (B4)

- Im rechten Rail den Button **"Foto bearbeiten"** klicken.
- **Zoom-Slider** + Drag zum Verschieben des Bildausschnitts.
- **"Fertig"** oder ESC schließt den Modus.

### Auf KI-Version zurücksetzen (C3)

- Gelber Button **"Auf KI-Version zurücksetzen"** im rechten Rail (Slide-Ebene).
- Bestätigungsdialog erscheint: "Auf KI-Version zurücksetzen? Deine manuellen Änderungen gehen verloren."
- **"Zurücksetzen"** (gelb) oder "Abbrechen".

---

## 4. Slides umsortieren + Terminkonflikt

### Slides umsortieren (D6)

- Im Slide-Streifen links erscheint bei Hover ein **6-Punkt-Grip** (⋮⋮).
- Slide per Drag-and-Drop in die gewünschte Position ziehen.

### Terminkonflikt

- Wenn ein geplanter Veröffentlichungszeitpunkt bereits belegt ist, erscheint ein Modal:
  "Du hast bereits einen Post am [Datum/Uhrzeit] geplant. Trotzdem speichern?"
- **"Trotzdem speichern"** (gelb) oder "Abbrechen".

---

## 5. Kalender (D1)

- `/calendar` öffnet die Monatsansicht.
- **7-Spalten-Raster** (Mo–So), farbcodierte Punkte pro Post:
  - Grau — Entwurf
  - Cyan — Geplant
  - Grün — Veröffentlicht
- Klick auf einen Post-Eintrag → öffnet den Post im Posts-Tab.
- Leerer Monat: Hinweis + Button zu `/create`.
- Navigation: ‹ › Pfeile oder Klick auf Monat/Jahr für Picker.

> v1: nur Lesen. Drag-and-Drop-Umplanung kommt in v1.1.

---

## 6. Veröffentlichen

- Im Editor oder Posts-Tab: **"Jetzt veröffentlichen"** oder **"Einplanen"** (Datum + Uhrzeit wählen).
- Render-Jobs laufen **asynchron** (Cloud Tasks, Polling alle 2 Sekunden).
- Status im Posts-Tab → History verfolgen: `rendering` → `scheduled` → `published`.
- Geplante Posts werden automatisch zur richtigen Zeit über Cloud Scheduler veröffentlicht.

---

## 7. Hinweis für Jule

Du brauchst **keine lokale Installation**. Alles läuft im Browser — von jedem Gerät aus.

Bei Problemen oder Fragen: Tim Bescheid sagen. Kein lokales Setup nötig.

Die App merkt sich im Hintergrund, wie du Posts bearbeitest, und verbessert damit die KI-Entwürfe über Zeit. Du musst dafür nichts extra tun.

---

## 8. Cutover-Checkliste für Tim

Manuell abhaken am Cutover-Tag:

- [ ] Sign-in erfolgreich (Google-Login auf prod URL)
- [ ] Anthropic API Key gespeichert
- [ ] Brand-Identität (Stimme + Persona) gesetzt
- [ ] Erster Post generiert
- [ ] Editor-Änderungen persistieren (nach Reload noch sichtbar)
- [ ] Erster echter Post auf @leben.lieben veröffentlicht (Acceptance Criterion A2)
