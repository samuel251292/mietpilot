# MietPilot

Automatisierte Vergleichsschreiben für Mietzinsprüfungen.

## Umgesetzt

- Next.js App Router mit TypeScript und Tailwind CSS
- Seriöses Dashboard mit Navy, Weiß, Gold und Statusfarben
- Linke Navigation mit allen gewünschten Bereichen
- Seiten: `/dashboard`, `/cases`, `/cases/new`, `/cases/[id]`, `/templates`, `/settings` sowie weitere Arbeitsbereiche
- Wizard-MVP mit Upload, Datenprüfung, Berechnung, Schreiben und PDF-Vorschau
- Demo-Daten fuer statische Beispielbereiche; produktive Fall-, Dokument- und Berechnungsansichten nutzen gespeicherte CaseService-Daten
- Überschreibbare Formularwerte vor der PDF-Erstellung
- Zentrale Berechnungslogik in `src/lib/calculation/rent-calculation.ts` fuer Mietzusammensetzung, Richtwertbasis, Rueckforderung, Vergleich und Zukunftsmiete
- Override-System fuer manuell korrigierte Abrechnungswerte inklusive Quellen-/Warnhinweisen
- Zentrales Warnungs- und Validierungssystem fuer fehlende Werte, unrealistische Flaechen, negative Werte, Zeitraumfehler und ungueltige Vergleichsquoten
- Strukturierter Berechnungsbericht mit DOCX/PDF-Exportvorbereitung und serverseitigem DOCX/PDF-Export ueber ConvertAPI
- Zentrale `LetterTemplateData` in `src/lib/letters/letter-data.ts` fuer Textvorschau, DOCX und PDF-Export
- Zentraler Platzhalterkatalog mit Parteien, Mietverhaeltnis, Berechnung, Abrechnung, Quellen/Warnungen, Schreiben-Struktur, Anlagen und Unternehmen
- Professionelle Vergleichsschreiben-Struktur mit Betreff, Einleitung, Berechnungsgrundlage, Forderungsaufstellung, Vergleichsvorschlag, Zukunftsmiete, Anlagen und Pruefungsvorbehalt
- Schreiben-Versionierung mit `generatedLetters`, Legacy-Fallback fuer `generatedWord`/`generatedPdf`, Outdated-Markierung und Statushistorie
- Review-System fuer fehlende Pflichtwerte, nicht ersetzte Platzhalter, OCR-/Berechnungswarnungen und Anlagenhinweise
- Anlagenlogik fuer Mietvertrag, Datenblatt, Richtwert, Gutachten, weitere Dokumente und Berechnungsbericht
- `/writings` zeigt echte Schreiben-Historien aus gespeicherten Faellen statt Demo-Daten
- Template-System mit zentralem Platzhalterkatalog
- Kommunikationsmodell mit `CommunicationThread`, `CommunicationMessage` und `CommunicationAttachment`
- Lokale E-Mail-Entwuerfe aus Schreiben-Versionen inklusive Anhaengen, Fallbezug und Bezug zur Schreiben-Version
- Manuelles Versandprotokoll fuer Kommunikation: bereit, versendet, fehlgeschlagen, empfangen und archiviert
- `/communications` sammelt echte Kommunikationsdaten aus sichtbaren Faellen; Admins sehen alle, Mitarbeiter eigene/geteilte Faelle
- Provider-Architektur fuer spaeteren Versand vorbereitet: `manual`, `smtp`, `gmail`, `outlook`
- Echter SMTP-/Gmail-/Outlook-Versand ist aktuell bewusst nicht aktiv; `/api/communications/send` liefert JSON mit "Provider noch nicht konfiguriert".
- Aufgaben-/Reminder-Modell mit `CaseTask` fuer Aufgaben, Erinnerungen, Fristen, Follow-ups, Termine, Verhandlungen und Besichtigungen.
- Zentraler Task-Service in `src/lib/tasks/task-service.ts` fuer Erstellen, Bearbeiten, Statuswechsel, Overdue-Normalisierung, ActivityLog und Deduplizierung nach Quellen.
- Automatische Task-Vorschlaege in `src/lib/tasks/task-suggestions.ts` aus Dokumentenqualitaet, Schreibenstatus, Kommunikation und Berechnungswarnungen.
- Aufgaben im Case-Cockpit mit Vorschlagsbereich, manueller Erstellung, Bearbeitung, Archivierung und Erledigung.
- Globale `/tasks` Seite sammelt echte Aufgaben aus sichtbaren Faellen; Admins sehen alle, Mitarbeiter eigene/geteilte Faelle.
- Dashboard-Metriken fuer Erinnerungen, Fristen, Termine, Verhandlungen und Besichtigungen nutzen echte `caseTasks`.
- Reminder-/Follow-up-Konzept ist lokal vorbereitet; Kalenderintegration, Push-Notifications und externe Aufgabenprovider sind noch nicht aktiv.
- Kalender basiert im MVP auf `CaseTask` mit den kalenderfaehigen Typen Termin, Verhandlung und Besichtigung.
- `src/lib/calendar/calendar-service.ts` erzeugt CalendarEvents aus Fall-Tasks inklusive `dueAt`-Fallback, `endAt`-Fallback und Tages-/Wochen-/Monatsgruppen.
- `/calendar` zeigt echte Termine aus sichtbaren Faellen als Agenda, Wochenansicht und Monatsansicht; Admins sehen alle, Mitarbeiter eigene/geteilte Faelle.
- Case-Cockpit besitzt einen eigenen Termine-Tab fuer Kundentermine, Verhandlungen und Besichtigungen mit fallbezogener Anlage und Bearbeitung.
- Automatische Terminvorschlaege in `src/lib/calendar/calendar-suggestions.ts` erkennen Fristen, Follow-ups, Befristungsenden, Verhandlungen und Besichtigungen aus Schreiben, Kommunikation, Dokumenten und Falldaten.
- Externe Kalenderintegration, Google/Outlook-Sync, Push-Notifications und Drag-and-Drop-Kalender sind im MVP bewusst noch nicht aktiv.
- Zentrale Analytics-Grundlage in `src/lib/analytics/analytics-service.ts` mit echten CaseService-Daten, Rollenfilter ueber sichtbare Faelle und Zeitraumfiltern fuer alle, 30 Tage, 90 Tage und Jahr.
- `/analytics` zeigt echte KPI-Gruppen fuer Faelle, Forderungen, Dokumente/OCR, Schreiben, Kommunikation, Aufgaben, Kalender, Mitarbeiter und Performance ohne `mock-data.ts`.
- Analytics-Charts werden im MVP als responsive CSS-Balken ohne externe Chart-Library gerendert.
- Analytics-Reports in `src/lib/analytics/analytics-report.ts` und `src/lib/analytics/analytics-report-renderer.ts` erzeugen strukturierte Management-Zusammenfassungen, HTML/Text-Ausgabe, Print-Ansicht sowie DOCX-/PDF-Vorbereitungsdateien.
- Mitarbeiter-/Performance-Analytics umfassen Arbeitslast, offene/ueberfaellige Aufgaben, Termine, Schreiben, Kommunikation, Forderungen, ActivityLog-Anzahl und letzte Aktivitaet.
- Dokument-/OCR-Analytics umfassen OCR-Quote, Extraktions-Erfolgsquote, fehlende Pflichtdokumente, ungepruefte Aenderungen, haeufigste Warnungen, Review-Backlog und Risiko-/Warnlisten mit Fallbezug.
- Aufgaben-/Kalender-Analytics werten echte `caseTasks` und CalendarEvents aus; externe BI-Systeme, SQL-Analytics und Echtzeit-WebSockets sind im MVP bewusst nicht aktiv.
- CRM-Grundlage mit `CRMContact`, `CRMOrganization` und `CRMCaseLink` in `src/types/crm.ts`.
- Zentraler CRM-Service in `src/lib/crm/crm-service.ts` fuer lokale Persistenz, Deduplizierung, Fallverknuepfungen, Ableitung aus Faellen und Activity Feed.
- `/clients` nutzt echte CRM-Daten plus abgeleitete Fallkontakte statt Mock-Daten; Admins sehen alle Eintraege, Mitarbeiter nur Eintraege mit sichtbarem Fallbezug.
- Kontakt- und Organisationsdetailseiten zeigen Stammdaten, verknuepfte Faelle, Kommunikation, Schreiben, Aufgaben, Termine und chronologische CRM-Aktivitaeten.
- Kontakte und Organisationen koennen manuell erstellt und bearbeitet werden; Mitarbeiter muessen neue Eintraege mit einem sichtbaren Fall verknuepfen.
- Kommunikation, Aufgaben und Kalendertermine koennen mit `contactId`/`organizationId` auf CRM-Eintraege verweisen; E-Mail-Entwuerfe setzen diese Verknuepfung soweit ableitbar automatisch.
- Persistentes Kanzlei-/Unternehmensprofil in `src/lib/company-profile.ts` mit Branding, Briefkopf-Grundlage, Zahlungsdaten, Billing-Basis und Standardwerten.
- `/settings` verwaltet das Unternehmensprofil lokal; Admins koennen bearbeiten, Mitarbeiter lesen. Logo und Signatur bleiben als DataURL kompatibel und sind optional Storage-ready.
- Externe CRM-Systeme, Google/Outlook Contacts Sync, echte Rechnungen, DATEV/FinanzOnline und Billing-Provider sind im MVP bewusst noch nicht aktiv.
- Zod-Schemas für Validierung
- Vorbereitete Supabase-, PDF-Text-, OCR- und PDF-Generierungsservices
- Dokumente werden im MVP als DataURL in LocalStorage gespeichert; fuer Produktion wird Supabase Storage oder S3 empfohlen.
- Phase 12.1 vorbereitet: Dateiobjekte koennen `StoredFileMeta`/`storage`-Metadaten tragen, ohne bestehende DataURLs zu entfernen.
- `src/lib/storage/file-resolver.ts` kapselt Download-/Preview-Quellen fuer DataURL und vorbereitete `publicUrl`-Referenzen.
- Phase 12.2 vorbereitet: `src/lib/storage/storage-buckets.ts` definiert die geplanten Supabase Storage Buckets; `src/lib/storage/supabase-storage.ts` enthaelt Upload-/Download-/URL-Helper, die nur bei vorhandener Supabase-Konfiguration aktiv nutzbar sind.
- OCR-Fallback laeuft serverseitig ueber `tesseract.js`.
- DOCX-zu-PDF-Export wird serverseitig ueber ConvertAPI erzeugt.
- Berechnungs-Fixtures fuer technische Prueffälle liegen in `src/lib/calculation/fixtures.ts`.
- Repository-Abstraktion fuer Faelle ist vorbereitet: `CaseService` nutzt aktuell `localCaseRepository`, waehrend das asynchrone Supabase-Repository echte vorbereitete Operationen fuer die Kernbereiche enthaelt.
- `src/lib/repositories/supabase-case-repository.ts` enthaelt vorbereitete echte Supabase-Operationen fuer `cases`, `case_shares` und `case_activities`; die synchrone App-Fassade nutzt weiterhin LocalStorage.
- `CaseServiceAsync` ist parallel vorbereitet und kann spaeter schrittweise von Seiten/Services genutzt werden; `CaseService` bleibt synchroner LocalStorage-MVP.
- Initiales Supabase-Schema liegt in `supabase/migrations/0001_initial_cases_schema.sql` fuer `profiles`, `cases`, `case_shares` und `case_activities` inklusive RLS-Policies.
- Supabase Client- und Auth-Service-Struktur ist vorbereitet: `src/services/supabase.ts`, `src/lib/auth/auth-service.ts` und `src/lib/auth/supabase-auth-provider.ts`.
- Demo-Auth bleibt aktuell der aktive Standardprovider; Supabase Auth wird erst spaeter ueber Provider-Konfiguration aktiviert.
- Die Supabase-Migration ist noch nicht aktiv mit der App verdrahtet; LocalStorage bleibt aktuell die produktive MVP-Persistenz.
- Phase 11 Abschluss: Die lesenden Kernseiten `/cases`, `/dashboard`, `/documents`, `/analytics`, `/cases/[id]`, `/tasks`, `/calendar`, `/communications`, `/writings` und `/clients` sind async-kompatibel vorbereitet und zeigen Loading-/Error-Zustaende mit LocalStorage-Fallback.
- Erste einfache Schreibaktionen sind async vorbereitet: Teilen, Abschliessen und Loeschen von Faellen. Weitere Schreibfluesse wie Dokumente, Exporte, Kommunikation, Tasks, Kalender, CRM und Company Profile bleiben bewusst synchron/lokal bis zu spaeteren Migrationsphasen.

## Lokal starten

```bash
npm install
npm run dev
```

Danach im Browser öffnen:

```text
http://localhost:3000
```

## Docker / Synology Deployment

MietPilot ist fuer einen ersten Docker-/Synology-Betrieb vorbereitet. Der Container macht die App erreichbar, aktiviert aber bewusst noch keine echte Online-Teamfaehigkeit. Mit den MVP-Defaults bleiben Auth, Faelle und Dateien browser-/LocalStorage-gebunden. Echte gemeinsame Nutzung braucht spaeter die aktivierte Supabase Auth/DB/Storage-Schicht.

Healthcheck:

```text
GET /api/health
```

Antwortet ohne Secrets mit Status, App-Name, Timestamp und `NODE_ENV`.

Production-ENV vorbereiten:

```bash
cp .env.production.example .env.production.local
```

Die Datei `.env.production.local` bleibt lokal und darf keine echten Secrets im Repository landen lassen.

Docker Build:

```bash
docker build -t mietpilot:latest .
```

Docker Run:

```bash
docker run --rm -p 3000:3000 --env-file .env.production.local mietpilot:latest
```

Docker Compose:

```bash
docker compose up -d --build
```

Die Compose-Datei startet den Service `mietpilot-app` auf Port `3000:3000` mit `restart: unless-stopped` und nutzt `.env.production.local`.

Synology Container Manager Ablauf:

1. Projektordner auf die Synology kopieren oder aus Git bereitstellen.
2. `.env.production.example` zu `.env.production.local` kopieren und Werte setzen.
3. In Container Manager ein neues Projekt aus `docker-compose.yml` erstellen.
4. Service starten und Healthcheck unter `http://NAS-IP:3000/api/health` pruefen.
5. Reverse Proxy in Synology DSM einrichten:

```text
https://app.domain.tld -> http://NAS-IP:3000
```

SSL kann ueber Synology/Let's Encrypt verwaltet werden. Fuer Produktivbetrieb sollte der Zugriff nur ueber HTTPS erfolgen.

Docker-Hinweis: Das Dockerfile nutzt Debian slim statt Alpine, damit OCR/PDF/native Canvas-Abhaengigkeiten robuster laufen. Ausgehender Netzwerkzugriff ist fuer ConvertAPI noetig, wenn PDF-Erzeugung aktiv genutzt wird.

Runtime-Hinweise:

- OCR benoetigt CPU/RAM und kann auf kleinen NAS-Systemen langsam laufen.
- PDF/Canvas-Abhaengigkeiten sind der Grund fuer Debian slim als Runtime-Basis.
- ConvertAPI braucht ausgehenden Netzwerkzugriff vom Container.
- Grosse Uploads brauchen passende Reverse-Proxy-Limits fuer Request Body Size und Timeouts.
- `NEXT_PUBLIC_*` Werte werden fuer Client-Code zur Build-Zeit eingebettet. Fuer eine spaetere Supabase-Aktivierung muss das Docker-Image mit den passenden Public-Werten gebaut werden.
- LocalStorage bleibt browsergebunden. Docker stellt die App bereit, speichert aber keine zentralen Fall-/Dokumentdaten fuer mehrere Nutzer.
- Supabase Auth/DB/Storage bleibt fuer echte Teamfaehigkeit und zentrale Backups noetig.

Eine kompakte Deployment-Checkliste liegt in `docs/DEPLOYMENT_CHECKLIST.md`.

## GitHub / Vercel Deployment

MietPilot ist als Standard-Next.js-App auf Vercel deploybar. Eine separate `vercel.json` ist aktuell nicht noetig, weil Vercel das Framework automatisch erkennt und die API-Routen durch `runtime = "nodejs"` bereits passend fuer Node ausgelegt sind.

GitHub vorbereiten:

```bash
git init
git add .
git commit -m "Initial MietPilot deployment"
git branch -M main
git remote add origin https://github.com/DEIN-ACCOUNT/DEIN-REPO.git
git push -u origin main
```

Wichtig: `.env.local`, `.env.production.local` und andere lokale ENV-Dateien sind ueber `.gitignore` ausgeschlossen. Keine echten Secrets committen.

Vercel einrichten:

1. Neues Projekt in Vercel erstellen.
2. GitHub Repository verbinden.
3. Framework Preset: `Next.js`.
4. Build Command: `npm run build`.
5. Install Command: `npm ci`.
6. Output Directory leer lassen, Vercel erkennt Next.js automatisch.
7. Environment Variables setzen.
8. Deploy starten.
9. Healthcheck und Readiness pruefen:

```text
https://dein-projekt.vercel.app/api/health
https://dein-projekt.vercel.app/api/readiness
```

Modus A: Sicherer Online-MVP-Test auf Vercel:

```env
NEXT_PUBLIC_AUTH_PROVIDER=demo
NEXT_PUBLIC_CASE_REPOSITORY=local
NEXT_PUBLIC_FILE_STORAGE=local
OCR_LANGUAGE=deu
CONVERTAPI_SECRET=
```

Modus B: Supabase-Testmodus, sobald Projekt, Migration und Buckets vorbereitet sind:

```env
NEXT_PUBLIC_AUTH_PROVIDER=demo
NEXT_PUBLIC_CASE_REPOSITORY=supabase
NEXT_PUBLIC_FILE_STORAGE=supabase
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
OCR_LANGUAGE=deu
CONVERTAPI_SECRET=
```

Dabei bleibt Auth bewusst im Demo-Modus. Getestet werden nur die vorbereitete async CaseRepository-Schicht und optionaler Supabase Storage mit LocalStorage/DataURL-Fallback. Supabase Auth wird erst in einem separaten Schritt aktiviert.

Vercel-Hinweise:

- LocalStorage ist browsergebunden; Vercel macht die App erreichbar, aber nicht automatisch teamfaehig.
- Demo-Auth ist nur fuer Test-/MVP-Betrieb gedacht.
- Echte Teamfaehigkeit braucht spaeter aktivierte Supabase Auth, Datenbank und Storage.
- Grosse OCR-/PDF-Jobs koennen auf Vercel Free-/Hobby-Limits stossen.
- Serverless Function Timeouts koennen OCR, grosse PDF-Uploads oder Konvertierung abbrechen.
- Grosse Uploads sind auf Vercel und hinter Proxies besonders empfindlich fuer Body-Size- und Timeout-Limits.
- ConvertAPI braucht `CONVERTAPI_SECRET`, wenn PDF-Export produktiv genutzt wird.
- `NEXT_PUBLIC_*` Variablen werden fuer Client-Code zur Build-Zeit eingebettet. Nach Aenderungen an diesen Variablen neu deployen.
- `/api/health` ist ein minimaler Alive-Check; `/api/readiness` zeigt Deployment-Modi und Supabase-Konfiguration ohne Secrets.

Erste Go-Live-Testliste:

1. `/api/health` pruefen.
2. `/api/readiness` pruefen.
3. Demo-Login testen.
4. Dashboard oeffnen.
5. Fallliste und bestehenden Fall oeffnen.
6. Neuen Fall mit PDF-Upload testen.
7. Dokumentvorschau und Download testen.
8. Re-Extraktion testen, wenn ein Dokument vorhanden ist.
9. Vergleichsschreiben generieren.
10. PDF-Export testen, wenn `CONVERTAPI_SECRET` gesetzt ist.
11. `/analytics` oeffnen.
12. `/clients` oeffnen.
13. `/tasks` und `/calendar` oeffnen.
14. Browser-Konsole und Vercel Logs auf klare Fehler ohne Secrets pruefen.

## ENV-Variablen

Für das Mock-MVP sind keine ENV-Variablen erforderlich. Für die Supabase-Integration werden benötigt:

```bash
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
NEXT_PUBLIC_APP_URL=http://localhost:3000
NEXT_PUBLIC_AUTH_PROVIDER=demo
NEXT_PUBLIC_CASE_REPOSITORY=local
NEXT_PUBLIC_FILE_STORAGE=local
```

Optional fuer OCR-/Dokumentenverarbeitung:

```bash
OCR_LANGUAGE=deu
PDF_STORAGE_BUCKET=case-documents
```

Fuer die PDF-Erstellung aus fertigen Word-Dateien wird ConvertAPI serverseitig genutzt.

Setup:

1. Bei ConvertAPI registrieren: https://www.convertapi.com/
2. API Secret im ConvertAPI-Dashboard kopieren.
3. `.env.local` anlegen oder ergänzen:

```env
CONVERTAPI_SECRET=
```

4. App neu starten, damit die Server-Route die neue Umgebungsvariable liest.

## Supabase Vorbereitung

Phase 11 bereitet die Online-Faehigkeit schrittweise vor. Aktuell gibt es:

- `src/lib/repositories/case-repository.ts` als Repository-Interface fuer Faelle.
- `src/lib/repositories/local-case-repository.ts` als aktive LocalStorage-Implementierung.
- `src/lib/repositories/supabase-case-repository.ts` mit asynchron vorbereiteten Supabase-Operationen fuer `list`, `get`, `save`, `delete`, `share`, `assign`, `complete` und `addActivity`.
- `CaseServiceAsync` und `getActiveAsyncCaseRepository()` in `src/lib/case-service.ts` fuer die spaetere schrittweise Async-Migration.
- `src/services/supabase.ts` mit sicherer Konfigurationserkennung und Client-Factorys, die ohne ENV nicht crashen.
- `src/lib/auth/auth-service.ts` als Provider-Abstraktion fuer Demo-Auth und spaeter Supabase Auth.
- `src/lib/auth/supabase-auth-provider.ts` als vorbereiteter Supabase-Auth-Provider mit Profil-Mapping.
- `supabase/migrations/0001_initial_cases_schema.sql` als initiale Datenbankmigration.
- `src/lib/deployment/supabase-check.ts` als kleiner Readiness-Helper fuer ENV-/Moduspruefung ohne Ausgabe von Secrets.

Die erste Migration erstellt:

- `profiles` fuer Supabase-Auth-Profile mit Rolle `admin` oder `employee`.
- `cases` fuer den Fallstamm und MVP-nahe JSONB-Felder fuer Extraktion, Berechnung, Dokumentmetadaten, Schreiben, Kommunikation und Tasks.
- `case_shares` fuer Lese-/Schreibfreigaben.
- `case_activities` fuer das ActivityLog.

RLS ist fuer alle vier Tabellen aktiviert. Vorbereitet sind Policies fuer Admin-Vollzugriff, Owner-Zugriff, geteilte Faelle und Activity-Erstellung bei Bearbeitungsrechten. Dateiobjekte bleiben im MVP kompatibel mit LocalStorage/DataURL, koennen aber fuer neue Uploads und Generierungen optional Storage-Metadaten und Public URLs speichern.

Storage-Hinweis: `src/types/storage.ts` definiert `StoredFileMeta` und `StorageFileReference`. Bestehende Dateiobjekte wie Falldokumente, generierte Dateien, Kommunikationsanhaenge, Word-Vorlagen und Company-Branding koennen damit Storage-Metadaten speichern. Der Resolver nutzt weiterhin `dataUrl` und vorhandene `storage.publicUrl` fuer Download/Vorschau/Re-Extraktion. Signed-URL-Refresh, automatische Migration alter DataURLs und verpflichtende Storage-Nutzung sind noch nicht aktiv.

Storage-Helper-Hinweis: Die geplanten Buckets sind `case-documents`, `generated-letters`, `calculation-reports`, `communication-attachments`, `templates`, `company-assets` und `exports`. `buildStoragePath()` erzeugt vorbereitete Pfade wie `case-documents/{caseId}/{documentType}/{timestamp}-{fileName}`, `generated-letters/{caseId}/{letterVersion}/{fileName}`, `calculation-reports/{caseId}/{fileName}`, `templates/{templateId}/{fileName}` und `company-assets/{assetType}/{fileName}`. Ohne Supabase-ENV werfen Upload-/Download-Helper klare Konfigurationsfehler; bestehende DataURL-Flows bleiben unveraendert.

Falldokument-Storage: `NEXT_PUBLIC_FILE_STORAGE=local` ist der Default und speichert Dokumente weiter als DataURL. Mit `NEXT_PUBLIC_FILE_STORAGE=supabase` versucht der Wizard neue Falldokumente zusaetzlich in den Bucket `case-documents` hochzuladen. Wenn Supabase fehlt oder der Upload fehlschlaegt, bleibt der DataURL-Fallback aktiv und die App laeuft lokal weiter. Alte Faelle werden nicht automatisch migriert.

Generierte Dateien: Schreiben-DOCX/PDF und Berechnungsbericht-DOCX/PDF sind Storage-ready. Bei `NEXT_PUBLIC_FILE_STORAGE=supabase` werden neue generierte Dateien zusaetzlich in `generated-letters` bzw. `calculation-reports` hochgeladen und mit Storage-Metadaten gespeichert. DataURL bleibt als Legacy-/Fallback-Inhalt erhalten, damit Vorschau, Download und alte LocalStorage-Faelle weiter funktionieren.

Templates und Company Assets: Word-Vorlagen sowie Logo/Signatur sind Storage-ready. Neue DOCX-Templates koennen optional in `templates` gespeichert werden; Branding-Assets koennen optional in `company-assets` gespeichert werden. DataURL bleibt weiterhin gespeichert und wird als Fallback verwendet, wenn Storage nicht konfiguriert ist oder ein Upload fehlschlaegt.

Kommunikationsanhaenge: `CommunicationAttachment` ist Storage-ready und kann bestehende Schreiben, Berechnungsberichte und Falldokumente per Referenz verknuepfen, statt Dateiinhalt erneut zu duplizieren. Der Attachment-Resolver kann Referenzen aufloesen und nutzt weiterhin DataURL oder `storage.publicUrl` als Download-Quelle. Custom-Anhaenge sind fuer den Bucket `communication-attachments` vorbereitet; echte Versand-/Provider-Integration bleibt offen.

Auth-Hinweis: Ohne `NEXT_PUBLIC_SUPABASE_URL` und `NEXT_PUBLIC_SUPABASE_ANON_KEY` bleibt die App lauffaehig. `NEXT_PUBLIC_AUTH_PROVIDER=demo` ist der aktuelle Default; `supabase` ist technisch vorbereitet, aber noch nicht in Login/UI und CaseService aktiviert.

Case-Repository-Hinweis: `NEXT_PUBLIC_CASE_REPOSITORY=local` ist der aktuelle Default. Wenn `supabase` gesetzt wird, aber Supabase nicht konfiguriert ist, fallen `CaseService` und `CaseServiceAsync` auf LocalStorage zurueck. `CaseService` bleibt bewusst synchron und lokal; `CaseServiceAsync` ist die vorbereitete Schicht fuer spaetere Supabase-Aktivierung, sobald einzelne Seiten und Services auf async umgestellt werden.

Weitere Migrationsdetails stehen in `docs/MIGRATION_ROADMAP.md`. Offen bleiben insbesondere echte Storage Policies, Signed-URL-Refresh, automatische Migration alter DataURLs, spaetere DataURL-Entfernung, echte Auth-Aktivierung, vollstaendige Async-Schreibmigration und Normalisierung grosser JSONB-Felder.

## Supabase Testdeployment

Die Schritt-fuer-Schritt-Anleitung liegt in `docs/SUPABASE_SETUP.md`.

Fuer einen ersten Test:

1. Supabase-Projekt anlegen.
2. Migration `supabase/migrations/0001_initial_cases_schema.sql` ausfuehren.
3. Tabellen `profiles`, `cases`, `case_shares` und `case_activities` pruefen.
4. RLS auf allen Tabellen pruefen.
5. Storage Buckets manuell anlegen:
   - `case-documents`
   - `generated-letters`
   - `calculation-reports`
   - `communication-attachments`
   - `templates`
   - `company-assets`
   - `exports`
6. In Vercel die Supabase-Test-ENV setzen:

```env
NEXT_PUBLIC_AUTH_PROVIDER=demo
NEXT_PUBLIC_CASE_REPOSITORY=supabase
NEXT_PUBLIC_FILE_STORAGE=supabase
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
OCR_LANGUAGE=deu
CONVERTAPI_SECRET=
```

Diese Einstellung ist bewusst ein Testmodus: Supabase Auth bleibt aus, LocalStorage bleibt Fallback, Storage bleibt optional, und alte DataURLs werden nicht migriert. Broad Public Storage Policies sollten nicht gesetzt werden; private Buckets, RLS-nahe Rechte und Signed URLs muessen vor produktiver Nutzung fachlich abgesichert werden.

## Sinnvolle nächste Schritte

1. Supabase Storage Policies fuer Bucket-Zugriffe fachlich pruefen und mit RLS/Case-Rechten abstimmen.
2. Signed-URL-Refresh fuer private Buckets vorbereiten.
3. DataURL-Migrationshelper fuer bestehende lokale Dateien bauen, ohne automatische Zwangsmigration.
3. Generierte Schreiben, Berechnungsberichte, Templates und Company Assets schrittweise auf Storage erweitern.
4. Auth produktiv aktivieren: Supabase Login/UI anbinden, Profile synchronisieren und RLS live testen.
5. Verbleibende Schreibaktionen auf `CaseServiceAsync` migrieren.
6. Grosse JSONB-Felder spaeter normalisieren, sobald echte Online-Nutzung stabil ist.
7. PDF-Text-Extraktion und OCR-Fallback fuer Hintergrundjobs/Queue-Betrieb haerten.
8. Schreiben-/Anlagenpakete spaeter als ZIP, Sammel-PDF oder echten Mailversand an eine Storage-Schicht anbinden.
9. Kommunikationsprovider fuer SMTP, Gmail oder Outlook mit OAuth/ENV-Konfiguration und Sendestatus implementieren.
10. Rollenmodell fuer interne Mitarbeiter ergaenzen und Freigabe bei Bedarf Admin-only machen.
