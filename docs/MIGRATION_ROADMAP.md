# Migration Roadmap

## Phase 11 Status

Phase 11 bereitet die Online-Faehigkeit vor, erzwingt sie aber noch nicht. Die produktive MVP-Persistenz bleibt LocalStorage.

Bereits vorbereitet:

- `CaseService` bleibt synchron kompatibel und nutzt LocalStorage.
- `CaseServiceAsync` nutzt `localCaseRepositoryAsync` oder optional `supabaseCaseRepositoryAsync`.
- `NEXT_PUBLIC_CASE_REPOSITORY=local` ist Default.
- Wenn `NEXT_PUBLIC_CASE_REPOSITORY=supabase` gesetzt ist, aber Supabase-ENV fehlt, greift LocalStorage-Fallback.
- Supabase Schema fuer `profiles`, `cases`, `case_shares` und `case_activities` liegt in `supabase/migrations/0001_initial_cases_schema.sql`.
- RLS-Helper und Policies fuer Admins, Owner, geteilte Faelle und Activity-Erstellung sind vorbereitet.
- Supabase Client und Auth-Provider sind vorbereitet, Demo-Auth bleibt Default.

## Async-kompatible Bereiche

Lesendes Laden ist vorbereitet fuer:

- `/cases`
- `/dashboard`
- `/documents`
- `/analytics`
- `/cases/[id]`
- `/tasks`
- `/calendar`
- `/communications`
- `/writings`
- `/clients`

Diese Bereiche haben Loading-/Error-Zustaende und fallen bei Async-Fehlern auf LocalStorage zurueck.

Erste Schreibaktionen sind async vorbereitet:

- Fall teilen
- Fall abschliessen
- Fall loeschen

Noch bewusst lokal/synchron:

- Dokument-Upload und Re-Extraktion
- Schreiben- und Berechnungsbericht-Export
- Kommunikations-Drafts und Versandprotokoll
- Aufgaben- und Kalender-Schreibaktionen
- CRM-Schreibaktionen
- Company Profile

## Was bleibt LocalStorage

Folgende Module speichern aktuell weiterhin lokal oder in Case-JSON:

- Falldokumente und Upload-Dateien als DataURL
- generierte DOCX/PDF-Dateien
- Berechnungsberichte
- Schreiben-Anhaenge
- Kommunikationsanhaenge
- Templates/Vorlagen, soweit lokal gespeichert
- CRM-Speicher
- Company Profile inklusive Logo und Signatur

## DataURL-Felder fuer Storage-Migration

In Phase 12 sollten diese Datei-/Blob-Felder in Storage wandern:

- `documents[].dataUrl`
- `documents[].previewDataUrl`, falls vorhanden
- `generatedWord.dataUrl`
- `generatedPdf.dataUrl`
- `generatedLetters[].docx.dataUrl`
- `generatedLetters[].pdf.dataUrl`
- `calculationReportDocx.dataUrl`
- `calculationReportPdf.dataUrl`
- `communicationThreads[].messages[].attachments[].dataUrl`
- `letterAttachments[]` mit generierten oder referenzierten Dateien
- `companyProfile.logoDataUrl`
- `companyProfile.signatureDataUrl`

Empfohlenes Legacy-Modell:

- Phase 12.1 fuehrt `StoredFileMeta` und `StorageFileReference` ein.
- `src/lib/storage/file-resolver.ts` nutzt aktuell bevorzugt DataURL und danach vorhandene `publicUrl`.
- Phase 12.2 fuehrt Bucket-Konstanten und Supabase-Storage-Helper ein, aktiviert aber noch keine automatische Migration.
- Storage-Dateien bekommen stabile Pfade und Metadaten.
- Alte DataURLs bleiben lesbar, bis sie migriert wurden.
- Neue Uploads speichern Dateiinhalt in Storage und nur Metadaten/Storage-Pfade im Case.

## Empfohlene Storage Buckets fuer Phase 12

- `case-documents`
- `generated-letters`
- `calculation-reports`
- `communication-attachments`
- `templates`
- `company-assets`
- `exports`

RLS sollte je Bucket ueber Fallrechte oder administrative Rechte abgeleitet werden. Fuer den MVP kann eine Storage-Referenz im Case-Datensatz die Zugriffskontrolle vereinfachen.

Vorbereitete Pfadregeln:

- `case-documents/{caseId}/{documentType}/{timestamp}-{fileName}`
- `generated-letters/{caseId}/{letterVersion}/{fileName}`
- `calculation-reports/{caseId}/{fileName}`
- `communication-attachments/{caseId}/{category}/{timestamp}-{fileName}`
- `templates/{templateId}/{fileName}`
- `company-assets/{assetType}/{fileName}`
- `exports/{category}/{timestamp}-{fileName}`

`src/lib/storage/supabase-storage.ts` stellt dafuer `buildStoragePath`, Upload-Helper, Public-URL-/Signed-URL-Vorbereitung, Download und Delete bereit. Ohne Supabase-Konfiguration werfen diese Helper klare Konfigurationsfehler; die App bleibt ueber DataURL-Fallback lauffaehig.

Phase 12.3 fuehrt optionale Storage-Nutzung fuer neue Falldokumente ein:

- `NEXT_PUBLIC_FILE_STORAGE=local` bleibt Default.
- `NEXT_PUBLIC_FILE_STORAGE=supabase` versucht neue Uploads in `case-documents` zu speichern.
- Bei fehlender Supabase-Konfiguration oder Upload-Fehlern bleibt DataURL aktiv.
- Alte Faelle werden nicht automatisch migriert.
- Erfolgreiche Uploads speichern Storage-Metadaten in `SavedCaseDocument.storage`.

Phase 12.5 erweitert die optionale Storage-Nutzung auf generierte Dateien:

- Schreiben-DOCX/PDF werden bei neuen Generierungen optional in `generated-letters` gespeichert.
- Berechnungsbericht-DOCX/PDF werden optional in `calculation-reports` gespeichert.
- `SavedGeneratedFile.storage` enthaelt Bucket, Pfad, Public URL, Dateiname, MIME-Type, Groesse, Erzeugungszeitpunkt und Storage-Status.
- DataURL bleibt gespeichert, damit Legacy-Faelle, LocalStorage und Fallback-Downloads weiterhin funktionieren.

Phase 12.6 erweitert Storage-Readiness auf Vorlagen und Unternehmens-Assets:

- Neue Word-Templates werden weiterhin als DataURL gespeichert und koennen optional in `templates` hochgeladen werden.
- Logo, Signatur und vorbereitete Briefkopf-Assets koennen Storage-Metadaten fuer `company-assets` speichern.
- `StoredWordTemplate.storage`, `CompanyProfile.logoStorage`, `signatureStorage` und `letterheadStorage` halten Bucket, Pfad, Public URL, MIME-Type, Groesse und Storage-Status.
- Wenn Storage nicht konfiguriert ist oder ein Upload fehlschlaegt, bleibt der DataURL-Fallback aktiv.

Phase 12.7 macht Kommunikationsanhaenge Storage-ready:

- `CommunicationAttachment` kann Storage-Metadaten, MIME-Type, Groesse und Source-Status speichern.
- Schreiben, Berechnungsberichte und Falldokumente werden beim E-Mail-Entwurf bevorzugt als Referenz verknuepft.
- Der Attachment-Resolver kann Referenzen auf bestehende Case-Dateien aufloesen und danach DataURL oder Public URL fuer Downloads nutzen.
- Custom-Anhaenge sind fuer `communication-attachments` vorbereitet; eine eigene Upload-/Mail-UI ist noch nicht Teil des MVP.

Phase 12.8 schliesst das Storage-Modul technisch ab:

- Alle Dateiarten bleiben DataURL-kompatibel und koennen optional `StoredFileMeta` fuehren.
- `file-resolver.ts` ist zentrale Download-/Preview-/Fetch-Schicht fuer DataURL und Public URL.
- Falldokumente, generierte Schreiben, Berechnungsberichte, Templates, Company Assets und Kommunikationsanhaenge sind Storage-ready.
- `NEXT_PUBLIC_FILE_STORAGE=local` bleibt der sichere Default; `supabase` ist optional und faellt bei Fehlern auf DataURL/local zurueck.
- Offen bleiben echte Supabase Storage Policies, Signed-URL-Refresh, automatische Migration alter DataURLs und spaetere Entfernung grosser DataURL-Felder.

## Weitere Normalisierung

Die `cases` Tabelle nutzt aktuell JSONB fuer viele Modulbereiche, damit Phase 11 wenig Risiko erzeugt. Spaetere Normalisierung ist sinnvoll fuer:

- `case_documents`
- `case_extractions`
- `case_calculations`
- `generated_letters`
- `communication_threads`
- `communication_messages`
- `case_tasks`
- `calendar_events` oder weiterhin task-basiert
- `crm_contacts`, `crm_organizations`, `crm_case_links`
- `company_profiles`

Die Normalisierung sollte erst nach stabiler Storage- und Auth-Aktivierung erfolgen.

## Auth-Aktivierung

Vor echter Aktivierung:

- Supabase-Projekt konfigurieren.
- `profiles` fuer Demo-/Testnutzer anlegen.
- Login-Seite an `AppAuthService` anbinden.
- `NEXT_PUBLIC_AUTH_PROVIDER=supabase` testen.
- RLS mit Admin, Owner, geteilter Lese-Berechtigung und geteilter Schreib-Berechtigung pruefen.

Bis dahin bleibt `NEXT_PUBLIC_AUTH_PROVIDER=demo` der sichere Default.

## Supabase-/Vercel-Testdeployment

Phase 13.4 und 13.5 dokumentieren ein erstes Vercel-Testdeployment, ohne Supabase produktiv zu erzwingen:

- `docs/SUPABASE_SETUP.md` beschreibt Projektanlage, Migration, RLS-Pruefung, Testprofile und Storage-Buckets.
- Modus A bleibt sicherer Online-MVP-Test: `NEXT_PUBLIC_AUTH_PROVIDER=demo`, `NEXT_PUBLIC_CASE_REPOSITORY=local`, `NEXT_PUBLIC_FILE_STORAGE=local`.
- Vercel kann mit `NEXT_PUBLIC_AUTH_PROVIDER=demo`, `NEXT_PUBLIC_CASE_REPOSITORY=supabase` und `NEXT_PUBLIC_FILE_STORAGE=supabase` gegen Supabase getestet werden.
- `src/lib/deployment/supabase-check.ts` liefert Modus-/ENV-Pruefungen ohne Secrets auszugeben.
- `/api/health` bleibt ein minimaler Alive-Check, `/api/readiness` zeigt Deployment-Modus, Supabase-Konfigurationsstatus und Warnungen ohne Keys.
- LocalStorage und DataURL bleiben Fallback, wenn Repository oder Storage nicht konfiguriert sind.
- Supabase Auth, vollstaendige Async-Schreibmigration, Storage Policies und DataURL-Migration bleiben separate Folgeschritte.

## Nach Phase 12 offen

1. Storage Policies fuer private Buckets mit Case-Rechten und spaeterer Supabase Auth abstimmen.
2. Signed-URL-Refresh einbauen, bevor private Buckets fuer produktive Vorschau/Download genutzt werden.
3. DataURL-Migrationshelper bauen, aber alte Faelle nicht automatisch ohne Nutzerkontrolle veraendern.
4. Spaetere DataURL-Entfernung erst nach stabiler Storage-, Auth- und Async-Migration angehen.
