"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, Building2, CalendarDays, Edit3, FileText, UserRound, ClipboardList, MessagesSquare } from "lucide-react";
import { CRMContactFormModal, CRMOrganizationFormModal, type CRMContactFormValues, type CRMOrganizationFormValues } from "@/components/clients/crm-form-modal";
import { visibleCases } from "@/lib/auth";
import { listCalendarEvents } from "@/lib/calendar/calendar-service";
import { CaseService, formatStoredDate } from "@/lib/case-service";
import {
  buildCaseLinksFromCase,
  buildContactsFromCase,
  buildOrganizationsFromCase,
  buildCrmActivityFeed,
  createContact,
  createOrganization,
  getContact,
  getOrganization,
  linkContactToCase,
  linkOrganizationToCase,
  listCaseLinks,
  listContacts,
  listOrganizations,
  normalizeContactKey,
  normalizeOrganizationKey,
  updateContact,
  updateOrganization,
} from "@/lib/crm/crm-service";
import { useAuth } from "@/lib/use-auth";
import type { CaseTask, CommunicationMessage, CommunicationThread, GeneratedLetterVersion, SavedCaseRecord } from "@/types/case";
import type { CRMCaseLink, CRMContact, CRMContactType, CRMOrganization, CRMOrganizationType } from "@/types/crm";

type CRMDetailMode = "contact" | "organization";

type ContactDetail = CRMContact & { caseIds: string[]; sourceLabel: string };
type OrganizationDetail = CRMOrganization & { caseIds: string[]; sourceLabel: string };

export function CRMDetailPage({ id, mode }: { id: string; mode: CRMDetailMode }) {
  const { user, loaded } = useAuth();
  const [records, setRecords] = useState<SavedCaseRecord[]>([]);
  const [storedContacts, setStoredContacts] = useState<CRMContact[]>([]);
  const [storedOrganizations, setStoredOrganizations] = useState<CRMOrganization[]>([]);
  const [storedLinks, setStoredLinks] = useState<CRMCaseLink[]>([]);
  const [editOpen, setEditOpen] = useState(false);

  useEffect(() => {
    const load = () => {
      setRecords(CaseService.list());
      setStoredContacts(listContacts());
      setStoredOrganizations(listOrganizations());
      setStoredLinks(listCaseLinks());
    };
    load();
    window.addEventListener("mietpilot-cases-changed", load);
    window.addEventListener("mietpilot-crm-changed", load);
    window.addEventListener("storage", load);
    return () => {
      window.removeEventListener("mietpilot-cases-changed", load);
      window.removeEventListener("mietpilot-crm-changed", load);
      window.removeEventListener("storage", load);
    };
  }, []);

  const decodedId = useMemo(() => decodeURIComponent(id), [id]);
  const scopeRecords = useMemo(() => visibleCases(user, records), [records, user]);
  const scopeCaseIds = useMemo(() => new Set(scopeRecords.map((record) => record.id)), [scopeRecords]);
  const derivedContacts = useMemo(() => scopeRecords.flatMap(buildContactsFromCase), [scopeRecords]);
  const derivedOrganizations = useMemo(() => scopeRecords.flatMap(buildOrganizationsFromCase), [scopeRecords]);
  const derivedLinks = useMemo(() => scopeRecords.flatMap(buildCaseLinksFromCase), [scopeRecords]);
  const allLinks = useMemo(() => dedupeLinks([...storedLinks, ...derivedLinks]), [derivedLinks, storedLinks]);
  const allContacts = useMemo(() => mergeContacts([...storedContacts, ...derivedContacts]), [derivedContacts, storedContacts]);
  const allOrganizations = useMemo(() => mergeOrganizations([...storedOrganizations, ...derivedOrganizations]), [derivedOrganizations, storedOrganizations]);

  const contact = useMemo(() => (mode === "contact" ? resolveContactDetail(decodedId, allContacts, allLinks, scopeCaseIds, user?.role === "admin") : null), [allContacts, allLinks, decodedId, mode, scopeCaseIds, user?.role]);
  const organization = useMemo(() => (mode === "organization" ? resolveOrganizationDetail(decodedId, allOrganizations, allLinks, scopeCaseIds, user?.role === "admin") : null), [allLinks, allOrganizations, decodedId, mode, scopeCaseIds, user?.role]);
  const relatedCaseIds = contact?.caseIds ?? organization?.caseIds ?? [];
  const relatedCases = useMemo(() => scopeRecords.filter((record) => relatedCaseIds.includes(record.id)), [relatedCaseIds, scopeRecords]);

  const organizationForContact = useMemo(() => {
    if (!contact?.organizationId) return undefined;
    return allOrganizations.find((item) => item.id === contact.organizationId);
  }, [allOrganizations, contact?.organizationId]);

  const primaryContact = useMemo(() => {
    if (!organization?.primaryContactId) return undefined;
    return allContacts.find((item) => item.id === organization.primaryContactId);
  }, [allContacts, organization?.primaryContactId]);

  const linkedContacts = useMemo(() => {
    if (!organization) return [];
    return allContacts.filter((item) => isContactLinkedToOrganization(item, organization));
  }, [allContacts, organization]);

  const communicationRows = useMemo(() => collectCommunicationRows(relatedCases), [relatedCases]);
  const letterRows = useMemo(() => collectLetterRows(relatedCases), [relatedCases]);
  const taskRows = useMemo(() => collectTaskRows(relatedCases).filter((row) => !["appointment", "hearing", "visit"].includes(row.task.type)), [relatedCases]);
  const calendarRows = useMemo(() => listCalendarEvents(relatedCases).slice(0, 8), [relatedCases]);
  const activityRows = useMemo(() => buildCrmActivityFeed(contact ? { contactId: contact.id } : { organizationId: organization?.id }, scopeRecords).slice(0, 16), [contact, organization?.id, scopeRecords]);

  if (!loaded) return null;

  function refreshCrm() {
    setStoredContacts(listContacts());
    setStoredOrganizations(listOrganizations());
    setStoredLinks(listCaseLinks());
  }

  function saveContactEdit(values: CRMContactFormValues) {
    if (!contact) return;
    const linkedCaseIds = unique([...contact.caseIds, ...(values.linkedCaseId ? [values.linkedCaseId] : [])]);
    const payload = {
      type: values.type,
      firstName: values.firstName,
      lastName: values.lastName,
      displayName: values.displayName,
      email: values.email,
      phone: values.phone,
      mobile: values.mobile,
      address: values.address,
      postalCode: values.postalCode,
      city: values.city,
      country: values.country,
      organizationId: values.organizationId,
      tags: values.tags,
      notes: values.notes,
      linkedCaseIds,
    };
    const saved = getContact(contact.id) ? updateContact(contact.id, payload) : createContact(payload);
    if (values.linkedCaseId && values.linkRole) linkContactToCase(saved.id, values.linkedCaseId, values.linkRole, "manual");
    refreshCrm();
    setEditOpen(false);
  }

  function saveOrganizationEdit(values: CRMOrganizationFormValues) {
    if (!organization) return;
    const linkedCaseIds = unique([...organization.caseIds, ...(values.linkedCaseId ? [values.linkedCaseId] : [])]);
    const payload = {
      type: values.type,
      name: values.name,
      email: values.email,
      phone: values.phone,
      address: values.address,
      postalCode: values.postalCode,
      city: values.city,
      country: values.country,
      uid: values.uid,
      fn: values.fn,
      iban: values.iban,
      tags: values.tags,
      notes: values.notes,
      linkedCaseIds,
    };
    const saved = getOrganization(organization.id) ? updateOrganization(organization.id, payload) : createOrganization(payload);
    if (values.linkedCaseId && values.linkRole) linkOrganizationToCase(saved.id, values.linkedCaseId, values.linkRole, "manual");
    refreshCrm();
    setEditOpen(false);
  }

  const hasAccess = Boolean(contact || organization);
  if (!hasAccess) {
    return (
      <Shell>
        <EmptyDetail title="CRM-Eintrag nicht gefunden" description="Der Kontakt oder die Organisation ist nicht gespeichert oder für den aktuellen Nutzer nicht über sichtbare Fälle verknüpft." />
      </Shell>
    );
  }

  return (
    <Shell>
      {contact ? (
        <Header
          eyebrow="CRM Kontakt"
          title={contact.displayName}
          subtitle={`${contactTypeLabel(contact.type)} · ${contact.sourceLabel}`}
          icon={<UserRound size={22} />}
          onEdit={() => setEditOpen(true)}
        />
      ) : organization ? (
        <Header
          eyebrow="CRM Organisation"
          title={organization.name}
          subtitle={`${organizationTypeLabel(organization.type)} · ${organization.sourceLabel}`}
          icon={<Building2 size={22} />}
          onEdit={() => setEditOpen(true)}
        />
      ) : null}

      <section className="grid gap-4 xl:grid-cols-[1.1fr_0.9fr]">
        {contact && (
          <InfoSection title="Übersicht">
            <Field label="Typ" value={contactTypeLabel(contact.type)} />
            <Field label="E-Mail" value={contact.email} />
            <Field label="Telefon" value={contact.phone} />
            <Field label="Mobil" value={contact.mobile} />
            <Field label="Adresse" value={formatAddress(contact)} />
            <Field label="Organisation" value={organizationForContact?.name} href={organizationForContact ? `/clients/organizations/${encodeURIComponent(organizationForContact.id)}` : undefined} />
            <Field label="Tags" value={contact.tags?.join(", ")} />
            <Field label="Notizen" value={contact.notes} />
          </InfoSection>
        )}

        {organization && (
          <InfoSection title="Übersicht">
            <Field label="Typ" value={organizationTypeLabel(organization.type)} />
            <Field label="E-Mail" value={organization.email} />
            <Field label="Telefon" value={organization.phone} />
            <Field label="Adresse" value={formatAddress(organization)} />
            <Field label="UID" value={organization.uid} />
            <Field label="FN" value={organization.fn} />
            <Field label="IBAN" value={organization.iban} />
            <Field label="Primärer Kontakt" value={primaryContact?.displayName} href={primaryContact ? `/clients/contacts/${encodeURIComponent(primaryContact.id)}` : undefined} />
            <Field label="Tags" value={organization.tags?.join(", ")} />
            <Field label="Notizen" value={organization.notes} />
          </InfoSection>
        )}

        {organization && (
          <InfoSection title="Verknüpfte Kontakte">
            {linkedContacts.length > 0 ? (
              linkedContacts.slice(0, 8).map((item) => (
                <MiniRow key={item.id} title={item.displayName} meta={[contactTypeLabel(item.type), item.email].filter(Boolean).join(" · ")} href={`/clients/contacts/${encodeURIComponent(item.id)}`} />
              ))
            ) : (
              <Muted text="Keine verknüpften Kontakte gefunden." />
            )}
          </InfoSection>
        )}

        <InfoSection title="Verknüpfte Fälle">
          {relatedCases.length > 0 ? relatedCases.map((record) => <MiniRow key={record.id} title={`${record.id} · ${record.tenant || "Fall"}`} meta={record.address || record.status} href={`/cases/${record.id}`} />) : <Muted text="Keine sichtbaren Fälle verknüpft." />}
        </InfoSection>
      </section>

      <section className="grid gap-4 xl:grid-cols-2">
        <ListSection icon={<ClipboardList size={18} />} title="Aktivitäten" empty="Noch keine CRM-Aktivitäten vorhanden.">
          {activityRows.map((item) => (
            <MiniRow key={item.id} title={item.title} meta={[item.relatedCaseId, activityTypeLabel(item.type), formatStoredDate(item.timestamp)].join(" · ")} href={`/cases/${item.relatedCaseId}`} />
          ))}
        </ListSection>

        <ListSection icon={<MessagesSquare size={18} />} title="Kommunikation" empty="Keine Kommunikation in verknüpften Fällen.">
          {communicationRows.slice(0, 8).map((row) => (
            <MiniRow key={`${row.caseId}:${row.thread.id}:${row.message?.id ?? row.thread.id}`} title={row.message?.subject || row.thread.subject || "Kommunikation"} meta={[row.caseId, row.message?.status ?? row.thread.status, formatStoredDate(row.message?.createdAt ?? row.thread.lastMessageAt)].join(" · ")} href={`/cases/${row.caseId}`} />
          ))}
        </ListSection>

        <ListSection icon={<FileText size={18} />} title="Schreiben" empty="Keine Schreiben in verknüpften Fällen.">
          {letterRows.slice(0, 8).map((row) => (
            <MiniRow key={`${row.caseId}:${row.letter.id}`} title={`Version ${row.letter.version} · ${letterStatusLabel(row.letter.status)}`} meta={[row.caseId, row.letter.templateName ?? row.letter.templateFileName ?? "Vorlage", formatStoredDate(row.letter.createdAt)].join(" · ")} href={`/cases/${row.caseId}`} />
          ))}
        </ListSection>

        <ListSection icon={<ClipboardList size={18} />} title="Aufgaben" empty="Keine Aufgaben in verknüpften Fällen.">
          {taskRows.slice(0, 8).map((row) => (
            <MiniRow key={`${row.caseId}:${row.task.id}`} title={row.task.title} meta={[row.caseId, taskTypeLabel(row.task.type), taskStatusLabel(row.task.status), row.task.dueAt ? formatStoredDate(row.task.dueAt) : ""].filter(Boolean).join(" · ")} href={`/cases/${row.caseId}`} />
          ))}
        </ListSection>

        <ListSection icon={<CalendarDays size={18} />} title="Termine" empty="Keine Termine in verknüpften Fällen.">
          {calendarRows.map((event) => (
            <MiniRow key={event.id} title={event.title} meta={[event.caseNumber, calendarTypeLabel(event.type), event.location, formatStoredDate(event.startAt)].filter(Boolean).join(" · ")} href={`/cases/${event.caseId}`} />
          ))}
        </ListSection>
      </section>

      {contact && editOpen && (
        <CRMContactFormModal
          title="Kontakt bearbeiten"
          initial={contact}
          cases={scopeRecords}
          organizations={allOrganizations}
          onClose={() => setEditOpen(false)}
          onSubmit={saveContactEdit}
        />
      )}
      {organization && editOpen && (
        <CRMOrganizationFormModal
          title="Organisation bearbeiten"
          initial={organization}
          cases={scopeRecords}
          onClose={() => setEditOpen(false)}
          onSubmit={saveOrganizationEdit}
        />
      )}
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="-m-4 min-h-[calc(100vh-4rem)] bg-slate-950 p-4 text-slate-100 md:-m-6 md:p-6">
      <div className="space-y-5">
        <Link href="/clients" className="inline-flex h-9 items-center gap-2 rounded-md border border-slate-800 px-3 text-sm font-bold text-slate-300 transition hover:border-blue-400 hover:text-blue-200">
          <ArrowLeft size={16} />
          Zurück zu Kontakte & Mandanten
        </Link>
        {children}
      </div>
    </div>
  );
}

function Header({ eyebrow, title, subtitle, icon, onEdit }: { eyebrow: string; title: string; subtitle: string; icon: React.ReactNode; onEdit: () => void }) {
  return (
    <header className="rounded-lg border border-slate-800 bg-slate-900/80 p-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-start gap-4">
          <div className="grid h-12 w-12 place-items-center rounded-lg border border-blue-400/30 bg-blue-500/10 text-blue-200">{icon}</div>
          <div>
            <div className="text-xs font-bold uppercase tracking-wide text-blue-300">{eyebrow}</div>
            <h1 className="mt-1 text-2xl font-extrabold text-white">{title}</h1>
            <p className="mt-1 text-sm font-semibold text-slate-400">{subtitle}</p>
          </div>
        </div>
        <button type="button" onClick={onEdit} className="inline-flex h-10 items-center justify-center gap-2 rounded-md bg-blue-600 px-4 text-sm font-bold text-white transition hover:bg-blue-500">
          <Edit3 size={16} />
          Bearbeiten
        </button>
      </div>
    </header>
  );
}

function InfoSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-lg border border-slate-800 bg-slate-900/80 p-4">
      <h2 className="text-sm font-extrabold uppercase tracking-wide text-slate-300">{title}</h2>
      <div className="mt-4 grid gap-3">{children}</div>
    </section>
  );
}

function ListSection({ icon, title, empty, children }: { icon: React.ReactNode; title: string; empty: string; children: React.ReactNode[] }) {
  return (
    <section className="rounded-lg border border-slate-800 bg-slate-900/80 p-4">
      <div className="flex items-center gap-2 text-sm font-extrabold uppercase tracking-wide text-slate-300">
        {icon}
        {title}
      </div>
      <div className="mt-4 grid gap-2">{children.length > 0 ? children : <Muted text={empty} />}</div>
    </section>
  );
}

function Field({ label, value, href }: { label: string; value?: string; href?: string }) {
  const renderedValue = value && value !== "-" ? value : "Nicht angegeben";
  return (
    <div className="rounded-md border border-slate-800 bg-slate-950/60 p-3">
      <div className="text-xs font-bold uppercase tracking-wide text-slate-500">{label}</div>
      {href && value ? (
        <Link href={href} className="mt-1 block text-sm font-bold text-blue-300 hover:text-blue-200">{renderedValue}</Link>
      ) : (
        <div className="mt-1 text-sm font-semibold text-slate-200">{renderedValue}</div>
      )}
    </div>
  );
}

function MiniRow({ title, meta, href }: { title: string; meta?: string; href?: string }) {
  const content = (
    <div className="rounded-md border border-slate-800 bg-slate-950/60 p-3 transition hover:border-slate-700">
      <div className="text-sm font-extrabold text-white">{title}</div>
      {meta && <div className="mt-1 text-xs font-semibold text-slate-500">{meta}</div>}
    </div>
  );
  return href ? <Link href={href}>{content}</Link> : content;
}

function Muted({ text }: { text: string }) {
  return <div className="rounded-md border border-slate-800 bg-slate-950/60 p-3 text-sm font-semibold text-slate-500">{text}</div>;
}

function EmptyDetail({ title, description }: { title: string; description: string }) {
  return (
    <section className="rounded-lg border border-slate-800 bg-slate-900/80 p-10 text-center">
      <UserRound className="mx-auto text-slate-500" size={36} />
      <div className="mt-4 text-xl font-extrabold text-white">{title}</div>
      <p className="mt-2 text-sm text-slate-400">{description}</p>
    </section>
  );
}

function resolveContactDetail(id: string, contacts: CRMContact[], links: CRMCaseLink[], visibleCaseIds: Set<string>, isAdmin: boolean): ContactDetail | null {
  const base = getContact(id) ?? contacts.find((contact) => contact.id === id);
  if (!base) return null;
  const key = normalizeContactKey(base);
  const relatedContacts = contacts.filter((contact) => contact.id === base.id || (key && normalizeContactKey(contact) === key));
  const contactIds = new Set(relatedContacts.map((contact) => contact.id));
  const caseIds = unique([...relatedContacts.flatMap((contact) => contact.linkedCaseIds ?? []), ...links.filter((link) => link.contactId && contactIds.has(link.contactId)).map((link) => link.caseId)]);
  if (!isAdmin && !caseIds.some((caseId) => visibleCaseIds.has(caseId))) return null;
  return { ...mergeContactGroup(relatedContacts), caseIds: isAdmin ? caseIds : caseIds.filter((caseId) => visibleCaseIds.has(caseId)), sourceLabel: getSourceLabel(Boolean(getContact(id)), relatedContacts.length > 1) };
}

function resolveOrganizationDetail(id: string, organizations: CRMOrganization[], links: CRMCaseLink[], visibleCaseIds: Set<string>, isAdmin: boolean): OrganizationDetail | null {
  const base = getOrganization(id) ?? organizations.find((organization) => organization.id === id);
  if (!base) return null;
  const key = normalizeOrganizationKey(base);
  const relatedOrganizations = organizations.filter((organization) => organization.id === base.id || (key && normalizeOrganizationKey(organization) === key));
  const organizationIds = new Set(relatedOrganizations.map((organization) => organization.id));
  const caseIds = unique([...relatedOrganizations.flatMap((organization) => organization.linkedCaseIds ?? []), ...links.filter((link) => link.organizationId && organizationIds.has(link.organizationId)).map((link) => link.caseId)]);
  if (!isAdmin && !caseIds.some((caseId) => visibleCaseIds.has(caseId))) return null;
  return { ...mergeOrganizationGroup(relatedOrganizations), caseIds: isAdmin ? caseIds : caseIds.filter((caseId) => visibleCaseIds.has(caseId)), sourceLabel: getSourceLabel(Boolean(getOrganization(id)), relatedOrganizations.length > 1) };
}

function mergeContacts(contacts: CRMContact[]) {
  const byKey = new Map<string, CRMContact>();
  for (const contact of contacts) {
    const key = normalizeContactKey(contact) || contact.id;
    const existing = byKey.get(key);
    byKey.set(key, existing ? mergeContactGroup([existing, contact]) : contact);
  }
  return [...byKey.values()];
}

function mergeOrganizations(organizations: CRMOrganization[]) {
  const byKey = new Map<string, CRMOrganization>();
  for (const organization of organizations) {
    const key = normalizeOrganizationKey(organization) || organization.id;
    const existing = byKey.get(key);
    byKey.set(key, existing ? mergeOrganizationGroup([existing, organization]) : organization);
  }
  return [...byKey.values()];
}

function mergeContactGroup(contacts: CRMContact[]): CRMContact {
  const [base, ...rest] = contacts;
  return rest.reduce((current, contact) => ({
    ...current,
    ...filled(current, contact),
    tags: unique([...(current.tags ?? []), ...(contact.tags ?? [])]),
    linkedCaseIds: unique([...(current.linkedCaseIds ?? []), ...(contact.linkedCaseIds ?? [])]),
  }), base);
}

function mergeOrganizationGroup(organizations: CRMOrganization[]): CRMOrganization {
  const [base, ...rest] = organizations;
  return rest.reduce((current, organization) => ({
    ...current,
    ...filled(current, organization),
    tags: unique([...(current.tags ?? []), ...(organization.tags ?? [])]),
    linkedCaseIds: unique([...(current.linkedCaseIds ?? []), ...(organization.linkedCaseIds ?? [])]),
  }), base);
}

function isContactLinkedToOrganization(contact: CRMContact, organization: OrganizationDetail) {
  if (contact.organizationId === organization.id || organization.primaryContactId === contact.id) return true;
  const sharedCase = (contact.linkedCaseIds ?? []).some((caseId) => organization.caseIds.includes(caseId));
  if (!sharedCase) return false;
  if (organization.tags?.includes("vertretung")) return contact.type === "representation";
  if (organization.tags?.includes("vermieter")) return contact.type === "landlord";
  if (organization.tags?.includes("antragsgegner")) return contact.type === "opponent";
  return contact.type !== "tenant";
}

function collectCommunicationRows(records: SavedCaseRecord[]) {
  return records.flatMap((record) =>
    (record.communicationThreads ?? []).flatMap((thread) => {
      const messages = thread.messages ?? [];
      if (messages.length === 0) return [{ caseId: record.id, thread, message: undefined as CommunicationMessage | undefined }];
      return messages.map((message) => ({ caseId: record.id, thread, message }));
    }),
  ).sort((a, b) => new Date(b.message?.createdAt ?? b.thread.lastMessageAt).getTime() - new Date(a.message?.createdAt ?? a.thread.lastMessageAt).getTime());
}

function collectLetterRows(records: SavedCaseRecord[]) {
  return records.flatMap((record) => (record.generatedLetters ?? []).map((letter) => ({ caseId: record.id, letter }))).sort((a, b) => new Date(b.letter.createdAt).getTime() - new Date(a.letter.createdAt).getTime());
}

function collectTaskRows(records: SavedCaseRecord[]) {
  return records.flatMap((record) => (record.caseTasks ?? []).map((task) => ({ caseId: record.id, task }))).sort((a, b) => new Date(b.task.updatedAt).getTime() - new Date(a.task.updatedAt).getTime());
}

function dedupeLinks(links: CRMCaseLink[]) {
  return Array.from(new Map(links.map((link) => [[link.caseId, link.role, link.contactId ?? "", link.organizationId ?? ""].join("|"), link])).values());
}

function filled(existing: object, incoming: object) {
  const existingValues = existing as Record<string, unknown>;
  return Object.fromEntries(Object.entries(incoming as Record<string, unknown>).filter(([key, value]) => key !== "id" && key !== "createdAt" && key !== "updatedAt" && isFilled(value) && !isFilled(existingValues[key])));
}

function isFilled(value: unknown) {
  if (value === undefined || value === null || value === "") return false;
  if (Array.isArray(value)) return value.length > 0;
  return true;
}

function unique(values: Array<string | undefined>) {
  return Array.from(new Set(values.filter(Boolean) as string[]));
}

function getSourceLabel(stored: boolean, hasFallback: boolean) {
  if (stored && hasFallback) return "CRM + Fall";
  if (stored) return "CRM";
  return "Aus Fall abgeleitet";
}

function formatAddress(item: { address?: string; postalCode?: string; city?: string }) {
  return [item.address, [item.postalCode, item.city].filter(Boolean).join(" ")].filter(Boolean).join(", ") || "-";
}

function contactTypeLabel(type: CRMContactType) {
  const labels: Record<CRMContactType, string> = {
    tenant: "Mieter",
    landlord: "Vermieter",
    opponent: "Gegner",
    representation: "Vertretung",
    internal: "Intern",
    other: "Sonstige",
  };
  return labels[type];
}

function organizationTypeLabel(type: CRMOrganizationType) {
  const labels: Record<CRMOrganizationType, string> = {
    landlord_company: "Vermieter-Firma",
    law_firm: "Kanzlei",
    property_management: "Hausverwaltung",
    court: "Gericht",
    company: "Firma",
    other: "Sonstige",
  };
  return labels[type];
}

function letterStatusLabel(status: GeneratedLetterVersion["status"]) {
  const labels: Record<GeneratedLetterVersion["status"], string> = {
    draft: "Entwurf",
    generated: "Generiert",
    review: "Prüfung",
    ready: "Bereit",
    sent: "Versendet",
    archived: "Archiviert",
    outdated: "Veraltet",
  };
  return labels[status] ?? status;
}

function taskTypeLabel(type: CaseTask["type"]) {
  const labels: Record<CaseTask["type"], string> = {
    task: "Aufgabe",
    reminder: "Erinnerung",
    deadline: "Frist",
    follow_up: "Follow-up",
    appointment: "Termin",
    hearing: "Verhandlung",
    visit: "Besichtigung",
  };
  return labels[type];
}

function taskStatusLabel(status: CaseTask["status"]) {
  const labels: Record<CaseTask["status"], string> = {
    open: "Offen",
    in_progress: "In Bearbeitung",
    done: "Erledigt",
    dismissed: "Verworfen",
    overdue: "Überfällig",
    archived: "Archiviert",
  };
  return labels[status];
}

function calendarTypeLabel(type: "appointment" | "hearing" | "visit") {
  if (type === "hearing") return "Verhandlung";
  if (type === "visit") return "Besichtigung";
  return "Termin";
}

function activityTypeLabel(type: string) {
  if (type.includes("communication")) return "Kommunikation";
  if (type.includes("letter")) return "Schreiben";
  if (type.includes("calendar")) return "Termin";
  if (type.includes("task")) return "Aufgabe";
  return "Hinweis";
}
