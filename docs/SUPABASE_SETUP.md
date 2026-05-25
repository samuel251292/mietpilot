# Supabase Testdeployment

Diese Anleitung beschreibt ein erstes Supabase-Testdeployment fuer MietPilot. Sie aktiviert noch keine produktive Supabase-Auth und ersetzt LocalStorage nicht verpflichtend. Ziel ist, Repository- und Storage-Pfade kontrolliert zu testen.

## Status

- Demo-Auth bleibt fuer den ersten Test aktiv.
- `CaseServiceAsync` kann Supabase nutzen, faellt aber bei fehlender Konfiguration auf LocalStorage zurueck.
- Datei-Storage ist optional und faellt auf DataURL/local zurueck.
- Alte DataURLs bleiben kompatibel.
- Nicht alle Schreibaktionen sind bereits async migriert.

## Supabase-Projekt erstellen

1. Neues Projekt in Supabase anlegen.
2. Region und Passwort sicher dokumentieren.
3. Unter Project Settings -> API die Werte notieren:
   - Project URL
   - anon public key
4. Keine Service-Role-Keys in die App oder nach Vercel kopieren.

## Datenbank-Migration anwenden

Die erste Migration liegt hier:

```text
supabase/migrations/0001_initial_cases_schema.sql
```

Option A: Supabase SQL Editor

1. Migration lokal oeffnen.
2. Inhalt in den Supabase SQL Editor kopieren.
3. Ausfuehren.
4. Fehlermeldungen pruefen, bevor weitere Schritte erfolgen.

Option B: Supabase CLI

```bash
supabase login
supabase link --project-ref <project-ref>
supabase db push
```

Nach der Migration pruefen:

- Tabelle `profiles` existiert.
- Tabelle `cases` existiert.
- Tabelle `case_shares` existiert.
- Tabelle `case_activities` existiert.
- RLS ist auf allen vier Tabellen aktiviert.
- Helper-Funktionen und Policies wurden angelegt.

## Testuser und Profile

Fuer den ersten Test bleibt `NEXT_PUBLIC_AUTH_PROVIDER=demo`. Supabase Auth wird dadurch noch nicht zur Login-Quelle.

Trotzdem kann Supabase Auth vorbereitet werden:

1. In Supabase Authentication einen Testuser anlegen.
2. Die User-ID aus `auth.users` kopieren.
3. In `profiles` einen Datensatz mit derselben ID anlegen:
   - `id`: Auth User UUID
   - `email`: Test-Mailadresse
   - `full_name`: Anzeigename
   - `role`: `admin` oder `employee`
   - `status`: `active`

Diese Profile werden erst voll relevant, wenn Supabase Auth spaeter aktiviert wird.

## Storage Buckets anlegen

Folgende Buckets sind fuer das Storage-ready-Modell vorgesehen:

- `case-documents`
- `generated-letters`
- `calculation-reports`
- `communication-attachments`
- `templates`
- `company-assets`
- `exports`

Storage Policies bewusst vorsichtig einrichten:

- Keine breite Public-Write-Policy setzen.
- Public Read nur aktivieren, wenn die fachliche Datenschutzpruefung abgeschlossen ist.
- Fuer produktive Nutzung private Buckets, RLS-nahe Zugriffskonzepte oder Signed URLs einplanen.
- Signed-URL-Refresh ist in der App vorbereitet, aber noch nicht produktiv automatisiert.

## Vercel ENV fuer Supabase-Test

Fuer ein erstes Vercel-Testdeployment mit Supabase Repository und optionalem Storage:

```env
NEXT_PUBLIC_AUTH_PROVIDER=demo
NEXT_PUBLIC_CASE_REPOSITORY=supabase
NEXT_PUBLIC_FILE_STORAGE=supabase
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
OCR_LANGUAGE=deu
CONVERTAPI_SECRET=
```

Wichtig:

- Auth bleibt `demo`, damit Login/UI noch nicht auf Supabase Auth umgestellt werden.
- `NEXT_PUBLIC_CASE_REPOSITORY=supabase` testet die vorbereitete async Repository-Schicht.
- `NEXT_PUBLIC_FILE_STORAGE=supabase` versucht neue Dateien in Storage zu laden.
- Wenn Supabase fehlt oder ein Upload fehlschlaegt, bleibt der LocalStorage/DataURL-Fallback erhalten.
- `CONVERTAPI_SECRET` nur setzen, wenn PDF-Konvertierung im Test benoetigt wird.
- Nach Aenderungen an `NEXT_PUBLIC_*` Variablen muss ein neues Vercel Deployment gestartet werden.

## Testablauf

1. Vercel Deployment mit den Test-ENV-Werten starten.
2. Healthcheck und Readiness pruefen:

```text
https://<projekt>.vercel.app/api/health
https://<projekt>.vercel.app/api/readiness
```

3. In `/api/readiness` pruefen:
   - `authProvider` ist `demo`.
   - `caseRepository` ist `supabase`.
   - `fileStorage` ist `supabase`.
   - `supabaseConfigured` ist `true`, wenn URL und anon key gesetzt sind.
4. Demo-Login testen.
5. Dashboard und `/cases` oeffnen.
6. Einen einfachen Fall anlegen oder vorhandene LocalStorage-Daten fuer Fallback pruefen.
7. Ein Falldokument hochladen und pruefen:
   - Bei Storage-Erfolg: Objekt im passenden Bucket vorhanden.
   - Bei Storage-Fehler: DataURL-Fallback bleibt nutzbar.
8. Dokumentvorschau und Download testen.
9. Vergleichsschreiben generieren.
10. PDF-Export testen, falls `CONVERTAPI_SECRET` gesetzt ist.
11. `/analytics`, `/clients`, `/tasks` und `/calendar` oeffnen.
12. Relevante Tabellen in Supabase pruefen:
   - `cases`
   - `case_shares`
   - `case_activities`
13. Browser-Konsole und Vercel Logs auf klare, nicht geheime Fehlermeldungen pruefen.

## Bekannte Test-Limits

- Vercel Free/Hobby kann OCR- und PDF-Verarbeitung durch Laufzeitlimits begrenzen.
- Grosse Uploads koennen an Body-Size- oder Timeout-Limits scheitern.
- ConvertAPI braucht ausgehenden Netzwerkzugriff und `CONVERTAPI_SECRET`.
- LocalStorage-Daten bleiben browsergebunden.
- Supabase-Testmodus ist ein Repository-/Storage-Test; Auth bleibt Demo.
- Nicht alle Schreibaktionen sind bereits async migriert.

## Bewusst nicht aktiviert

- Supabase Auth als produktiver Login.
- Pflichtmigration weg von LocalStorage.
- Pflichtmigration alter DataURLs in Storage.
- Vollstaendige Async-Migration aller Schreibaktionen.
- Private Storage Policies mit Signed-URL-Refresh.
- Service-Role-Zugriffe aus der App.

## Naechste Schritte

1. Supabase Auth in einem separaten Schritt aktivieren und Profile/Rollen live testen.
2. Weitere Schreibaktionen auf `CaseServiceAsync` migrieren.
3. Storage Policies und Signed URLs fachlich absichern.
4. Alte DataURLs nach erfolgreicher Storage-Stabilisierung migrieren.
