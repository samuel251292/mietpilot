# MietPilot Deployment Checklist

Diese Checkliste beschreibt den aktuellen MVP-Deployment-Stand fuer Docker und Synology. Docker macht die App erreichbar, ersetzt aber noch nicht die spaetere Supabase-Aktivierung fuer echte Teamfaehigkeit.

## Vor Deployment

- `npm run typecheck` lokal ausfuehren.
- `npm run build` lokal ausfuehren.
- `.env.production.example` nach `.env.production.local` kopieren.
- Keine echten Secrets ins Repository committen.
- Pruefen, ob der Zielhost ausgehenden Netzwerkzugriff fuer ConvertAPI braucht.
- Pruefen, ob genug CPU/RAM fuer OCR und PDF-Verarbeitung vorhanden ist.

## ENV Pruefen

MVP-Default:

```env
NEXT_PUBLIC_AUTH_PROVIDER=demo
NEXT_PUBLIC_CASE_REPOSITORY=local
NEXT_PUBLIC_FILE_STORAGE=local
OCR_LANGUAGE=deu
```

Optional:

```env
CONVERTAPI_SECRET=
NEXT_PUBLIC_APP_URL=https://app.domain.tld
```

Supabase bleibt vorbereitet, aber nicht aktiv:

```env
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
```

Wichtig: `NEXT_PUBLIC_*` Werte werden von Next.js fuer Client-Code zur Build-Zeit eingebettet. Fuer spaetere Supabase-Aktivierung muss das Image mit den passenden Public-Werten gebaut werden, nicht nur mit Runtime-ENV gestartet werden.

## Build Pruefen

```bash
docker build -t mietpilot:latest .
```

Das Dockerfile nutzt `node:22-bookworm-slim`, weil OCR/PDF/native Canvas auf Debian slim robuster ist als auf Alpine.

## Container Starten

```bash
docker run --rm -p 3000:3000 --env-file .env.production.local mietpilot:latest
```

Oder:

```bash
docker compose up -d --build
```

## Healthcheck

Lokal:

```bash
curl http://localhost:3000/api/health
```

Erwartete Antwort:

```json
{
  "status": "ok",
  "app": "mietpilot",
  "timestamp": "...",
  "environment": "production"
}
```

Es duerfen keine Secrets oder Konfigurationswerte ausgegeben werden.

## Synology Container Manager

1. Projektordner auf die NAS kopieren oder aus Git bereitstellen.
2. `.env.production.example` zu `.env.production.local` kopieren.
3. `.env.production.local` mit Domain und optionalen Server-Keys befuellen.
4. Container Manager oeffnen.
5. Neues Projekt aus `docker-compose.yml` erstellen.
6. Projekt starten.
7. Container-Logs pruefen.
8. `http://NAS-IP:3000/api/health` pruefen.

## GitHub / Vercel

- GitHub Repository erstellen.
- Projekt committen und pushen.
- Vercel mit GitHub verbinden.
- Framework Preset: `Next.js`.
- Install Command: `npm ci`.
- Build Command: `npm run build`.
- Environment Variables in Vercel setzen.
- Deploy starten.
- Healthcheck und Readiness pruefen:

```text
https://dein-projekt.vercel.app/api/health
https://dein-projekt.vercel.app/api/readiness
```

Modus A: Sicherer Online-MVP-Test:

```env
NEXT_PUBLIC_AUTH_PROVIDER=demo
NEXT_PUBLIC_CASE_REPOSITORY=local
NEXT_PUBLIC_FILE_STORAGE=local
OCR_LANGUAGE=deu
CONVERTAPI_SECRET=
```

Modus B: Supabase-Testmodus:

```env
NEXT_PUBLIC_AUTH_PROVIDER=demo
NEXT_PUBLIC_CASE_REPOSITORY=supabase
NEXT_PUBLIC_FILE_STORAGE=supabase
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
OCR_LANGUAGE=deu
CONVERTAPI_SECRET=
```

Hinweis: Supabase Auth bleibt in beiden Modi aus. Modus B testet Repository/Storage, nicht den produktiven Login.

Vercel-Risiken:

- LocalStorage bleibt browsergebunden.
- Demo-Auth ist kein echter Produktions-Login.
- OCR/PDF-Verarbeitung kann Free-/Hobby-Plan-Limits erreichen.
- Serverless Function Timeouts koennen OCR, PDF-Konvertierung und grosse Uploads abbrechen.
- Grosse Uploads koennen an Body-Size-/Timeout-Limits von Vercel oder vorgeschalteten Proxies scheitern.
- `NEXT_PUBLIC_*` Variablen brauchen nach Aenderung ein neues Deployment.
- ConvertAPI braucht `CONVERTAPI_SECRET`, wenn PDF-Export getestet werden soll.
- Supabase Auth/DB/Storage muss fuer echte Teamarbeit separat aktiviert werden.

## Erste Go-Live-Testliste

Nach jedem ersten Vercel-Testdeployment pruefen:

- `/api/health` gibt JSON mit `status: ok` zurueck.
- `/api/readiness` gibt JSON ohne Secrets zurueck.
- Readiness zeigt den erwarteten Modus:
  - MVP: `authProvider=demo`, `caseRepository=local`, `fileStorage=local`.
  - Supabase-Test: `authProvider=demo`, `caseRepository=supabase`, `fileStorage=supabase`.
- Demo-Login funktioniert.
- Dashboard oeffnet.
- `/cases` oeffnet.
- Ein bestehender Fall laesst sich oeffnen.
- Neuer Fall mit PDF-Upload funktioniert.
- Dokumentvorschau funktioniert.
- Dokumentdownload funktioniert.
- Re-Extraktion zeigt einen sauberen Erfolg oder eine klare Fehlermeldung.
- Vergleichsschreiben laesst sich generieren.
- PDF-Export funktioniert, falls `CONVERTAPI_SECRET` gesetzt ist.
- `/analytics` oeffnet.
- `/clients` oeffnet.
- `/tasks` oeffnet.
- `/calendar` oeffnet.
- Browser-Konsole und Vercel Logs enthalten keine Secrets.
- Bei Supabase-Testmodus: Tabellen und Buckets auf Testdaten pruefen.

## Supabase-Testdeployment

Vorbereitung:

- Supabase-Projekt erstellt.
- Project URL und anon public key notiert.
- Keine Service-Role-Keys in Vercel oder ins Repository kopiert.
- Migration `supabase/migrations/0001_initial_cases_schema.sql` ausgefuehrt.
- Tabellen `profiles`, `cases`, `case_shares` und `case_activities` geprueft.
- RLS auf allen vier Tabellen geprueft.
- Mindestens ein Testuser in Supabase Auth angelegt, falls Profil-/RLS-Tests geplant sind.
- Passender `profiles`-Datensatz fuer den Testuser angelegt.

Storage Buckets manuell anlegen:

- `case-documents`
- `generated-letters`
- `calculation-reports`
- `communication-attachments`
- `templates`
- `company-assets`
- `exports`

Storage-Sicherheit:

- Keine breite Public-Write-Policy gesetzt.
- Public Read nur bewusst und nach Datenschutzpruefung aktiviert.
- Private Buckets und Signed URLs fuer produktive Nutzung eingeplant.
- Storage-Fallback ueber DataURL/local getestet.

Vercel ENV fuer den ersten Test:

- `NEXT_PUBLIC_AUTH_PROVIDER=demo`
- `NEXT_PUBLIC_CASE_REPOSITORY=supabase`
- `NEXT_PUBLIC_FILE_STORAGE=supabase`
- `NEXT_PUBLIC_SUPABASE_URL` gesetzt.
- `NEXT_PUBLIC_SUPABASE_ANON_KEY` gesetzt.
- `OCR_LANGUAGE=deu` gesetzt.
- `CONVERTAPI_SECRET` nur gesetzt, wenn PDF-Konvertierung getestet wird.

Funktionstest:

- Neues Vercel Deployment gestartet, nachdem `NEXT_PUBLIC_*` Werte gesetzt wurden.
- `/api/health` gibt JSON mit `status: ok` zurueck.
- `/api/readiness` zeigt Repository-/Storage-Modus und `supabaseConfigured` ohne Secrets.
- `/cases` laedt ohne weissen Screen.
- LocalStorage-Fallback funktioniert, wenn Supabase-Konfiguration fehlt oder fehlschlaegt.
- Ein einfacher Fall kann im Testfluss gelesen werden.
- Ein Falldokument-Upload versucht Storage, bleibt bei Fehler aber ueber DataURL nutzbar.
- Supabase Tabellen und Buckets nach Testdaten geprueft.
- Vercel Logs enthalten keine Secrets.

Bewusst offen:

- Supabase Auth ist noch nicht als produktiver Login aktiviert.
- Nicht alle Schreibaktionen sind async migriert.
- Alte DataURLs werden nicht automatisch in Storage migriert.
- Storage Policies und Signed-URL-Refresh sind noch nicht final produktiv gehaertet.

## Reverse Proxy

Synology DSM:

```text
https://app.domain.tld -> http://NAS-IP:3000
```

SSL sollte ueber Synology/Let's Encrypt eingerichtet werden. Produktive Nutzung sollte nur ueber HTTPS erfolgen.

## Reverse-Proxy-Limits

Grosse PDF/DOCX-Uploads und OCR-Dateien brauchen passende Limits:

- Request body size ausreichend setzen.
- Proxy timeout fuer OCR/PDF-Verarbeitung nicht zu niedrig setzen.
- Uploads groesser als 10 MB koennen im MVP lokal langsam sein.

## Backup

Mit LocalStorage-MVP liegen Falldaten weiterhin im Browserprofil der Nutzer. Docker-Backups sichern daher nicht automatisch produktive Fall-/Dokumentdaten.

Fuer echte zentrale Backups sind spaeter noetig:

- Supabase DB Backup.
- Supabase Storage Backup.
- Export-/Dokumentenstrategie.

## Bekannte Risiken

- LocalStorage ist browsergebunden und nicht teamfaehig.
- Demo-Auth ist nicht fuer echte Produktion gedacht.
- OCR braucht CPU/RAM und kann je nach NAS langsam sein.
- PDF/Canvas braucht Debian-kompatible native Runtime.
- ConvertAPI braucht ausgehenden Netzwerkzugriff.
- Supabase Storage Policies sind noch nicht produktiv aktiviert.
- Signed-URL-Refresh ist noch offen.
- DataURL-Migration alter Dateien ist noch offen.
