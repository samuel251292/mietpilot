"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { Building2, Copy, Eye, Filter, Link2, Plus, Search, UserRound, UsersRound } from "lucide-react";
import { CRMContactFormModal, CRMOrganizationFormModal, type CRMContactFormValues, type CRMOrganizationFormValues } from "@/components/clients/crm-form-modal";
import { visibleCases } from "@/lib/auth";
import { CaseService, CaseServiceAsync } from "@/lib/case-service";
import {
  buildCaseLinksFromCase,
  buildContactsFromCase,
  buildOrganizationsFromCase,
  createContact,
  createOrganization,
  linkContactToCase,
  linkOrganizationToCase,
  listCaseLinks,
  listContacts,
  listOrganizations,
  normalizeContactKey,
  normalizeOrganizationKey,
} from "@/lib/crm/crm-service";
import { useAuth } from "@/lib/use-auth";
import type { SavedCaseRecord } from "@/types/case";
import type { CRMCaseLink, CRMContact, CRMContactType, CRMOrganization, CRMOrganizationType } from "@/types/crm";

type TabKey = "contacts" | "organizations" | "links";

type ContactFilter = "all" | CRMContactType;
type OrganizationFilter = "all" | CRMOrganizationType;

type ContactRow = CRMContact & {
  caseIds: string[];
  source: "crm" | "derived" | "mixed";
};

type OrganizationRow = CRMOrganization & {
  caseIds: string[];
  source: "crm" | "derived" | "mixed";
};

const contactFilters: Array<{ value: ContactFilter; label: string }> = [
  { value: "all", label: "Alle Kontakte" },
  { value: "tenant", label: "Mieter" },
  { value: "landlord", label: "Vermieter" },
  { value: "opponent", label: "Gegner" },
  { value: "representation", label: "Vertretung" },
  { value: "internal", label: "Intern" },
  { value: "other", label: "Sonstige" },
];

const organizationFilters: Array<{ value: OrganizationFilter; label: string }> = [
  { value: "all", label: "Alle Organisationen" },
  { value: "property_management", label: "Hausverwaltung" },
  { value: "law_firm", label: "Kanzlei" },
  { value: "company", label: "Firma" },
  { value: "landlord_company", label: "Vermieter-Firma" },
  { value: "court", label: "Gericht" },
  { value: "other", label: "Sonstige" },
];

export default function ClientsPage() {
  const { user, loaded } = useAuth();
  const [records, setRecords] = useState<SavedCaseRecord[]>([]);
  const [storedContacts, setStoredContacts] = useState<CRMContact[]>([]);
  const [storedOrganizations, setStoredOrganizations] = useState<CRMOrganization[]>([]);
  const [storedLinks, setStoredLinks] = useState<CRMCaseLink[]>([]);
  const [activeTab, setActiveTab] = useState<TabKey>("contacts");
  const [query, setQuery] = useState("");
  const [contactFilter, setContactFilter] = useState<ContactFilter>("all");
  const [organizationFilter, setOrganizationFilter] = useState<OrganizationFilter>("all");
  const [onlyLinked, setOnlyLinked] = useState(false);
  const [onlyMissingEmail, setOnlyMissingEmail] = useState(false);
  const [onlyMissingPhone, setOnlyMissingPhone] = useState(false);
  const [expandedRow, setExpandedRow] = useState<string | null>(null);
  const [contactFormOpen, setContactFormOpen] = useState(false);
  const [organizationFormOpen, setOrganizationFormOpen] = useState(false);
  const [loadingRecords, setLoadingRecords] = useState(true);
  const [loadError, setLoadError] = useState("");

  useEffect(() => {
    let cancelled = false;

    const refreshCrmState = () => {
      setStoredContacts(listContacts());
      setStoredOrganizations(listOrganizations());
      setStoredLinks(listCaseLinks());
    };

    const load = async () => {
      setLoadingRecords(true);
      setLoadError("");
      try {
        const asyncRecords = await CaseServiceAsync.list();
        if (!cancelled) {
          setRecords(asyncRecords);
          refreshCrmState();
        }
      } catch (error) {
        console.warn("Async-CRM-Fälle konnten nicht geladen werden. LocalStorage-Fallback wird genutzt.", error);
        const fallbackRecords = CaseService.list();
        if (!cancelled) {
          setRecords(fallbackRecords);
          refreshCrmState();
          setLoadError("CRM-Falldaten konnten nicht aus dem vorbereiteten Online-Repository geladen werden. Lokale Daten werden angezeigt.");
        }
      } finally {
        if (!cancelled) setLoadingRecords(false);
      }
    };

    void load();
    window.addEventListener("mietpilot-cases-changed", load);
    window.addEventListener("mietpilot-crm-changed", load);
    window.addEventListener("storage", load);
    return () => {
      cancelled = true;
      window.removeEventListener("mietpilot-cases-changed", load);
      window.removeEventListener("mietpilot-crm-changed", load);
      window.removeEventListener("storage", load);
    };
  }, []);

  const scopeRecords = useMemo(() => visibleCases(user, records), [records, user]);
  const scopeCaseIds = useMemo(() => new Set(scopeRecords.map((record) => record.id)), [scopeRecords]);
  const caseMap = useMemo(() => new Map(scopeRecords.map((record) => [record.id, record])), [scopeRecords]);

  const derivedContacts = useMemo(() => mergeContacts(scopeRecords.flatMap(buildContactsFromCase).map((contact) => ({ ...contact, source: "derived" as const }))), [scopeRecords]);
  const derivedOrganizations = useMemo(() => mergeOrganizations(scopeRecords.flatMap(buildOrganizationsFromCase).map((organization) => ({ ...organization, source: "derived" as const }))), [scopeRecords]);
  const derivedLinks = useMemo(() => scopeRecords.flatMap(buildCaseLinksFromCase), [scopeRecords]);

  const contactRows = useMemo(() => {
    const links = storedLinks.length > 0 ? [...storedLinks, ...derivedLinks] : derivedLinks;
    const sourceContacts = storedContacts.length > 0 ? [...storedContacts.map((contact) => ({ ...contact, source: "crm" as const })), ...derivedContacts] : derivedContacts;
    return mergeContacts(sourceContacts)
      .map((contact) => ({ ...contact, caseIds: resolveContactCases(contact, links) }))
      .filter((contact) => isVisibleCrmRow(user?.role === "admin", contact.caseIds, scopeCaseIds))
      .sort(sortContactRows);
  }, [derivedContacts, derivedLinks, scopeCaseIds, storedContacts, storedLinks, user?.role]);

  const organizationRows = useMemo(() => {
    const links = storedLinks.length > 0 ? [...storedLinks, ...derivedLinks] : derivedLinks;
    const sourceOrganizations =
      storedOrganizations.length > 0 ? [...storedOrganizations.map((organization) => ({ ...organization, source: "crm" as const })), ...derivedOrganizations] : derivedOrganizations;
    return mergeOrganizations(sourceOrganizations)
      .map((organization) => ({ ...organization, caseIds: resolveOrganizationCases(organization, links) }))
      .filter((organization) => isVisibleCrmRow(user?.role === "admin", organization.caseIds, scopeCaseIds))
      .sort(sortOrganizationRows);
  }, [derivedLinks, derivedOrganizations, scopeCaseIds, storedLinks, storedOrganizations, user?.role]);

  const linkRows = useMemo(() => {
    const contactsById = new Map(contactRows.map((contact) => [contact.id, contact]));
    const organizationsById = new Map(organizationRows.map((organization) => [organization.id, organization]));
    return dedupeLinks([...(storedLinks.length > 0 ? storedLinks : []), ...derivedLinks])
      .filter((link) => scopeCaseIds.has(link.caseId))
      .map((link) => ({ link, contact: link.contactId ? contactsById.get(link.contactId) : undefined, organization: link.organizationId ? organizationsById.get(link.organizationId) : undefined, caseRecord: caseMap.get(link.caseId) }))
      .filter((row) => row.caseRecord && (row.contact || row.organization))
      .sort((a, b) => `${a.caseRecord?.id ?? ""}${roleLabel(a.link.role)}`.localeCompare(`${b.caseRecord?.id ?? ""}${roleLabel(b.link.role)}`));
  }, [caseMap, contactRows, derivedLinks, organizationRows, scopeCaseIds, storedLinks]);

  const filteredContacts = useMemo(
    () => contactRows.filter((contact) => matchesContact(contact, { query, contactFilter, onlyLinked, onlyMissingEmail, onlyMissingPhone })),
    [contactFilter, contactRows, onlyLinked, onlyMissingEmail, onlyMissingPhone, query],
  );
  const filteredOrganizations = useMemo(
    () => organizationRows.filter((organization) => matchesOrganization(organization, { query, organizationFilter, onlyLinked, onlyMissingEmail, onlyMissingPhone })),
    [organizationFilter, organizationRows, onlyLinked, onlyMissingEmail, onlyMissingPhone, query],
  );
  const filteredLinks = useMemo(
    () =>
      linkRows.filter(({ link, contact, organization, caseRecord }) => {
        const haystack = [caseRecord?.id, caseRecord?.tenant, caseRecord?.address, contact?.displayName, contact?.email, organization?.name, organization?.email, roleLabel(link.role)].join(" ").toLowerCase();
        return !query.trim() || haystack.includes(query.trim().toLowerCase());
      }),
    [linkRows, query],
  );

  const stats = useMemo(
    () => ({
      contacts: contactRows.length,
      organizations: organizationRows.length,
      tenants: contactRows.filter((contact) => contact.type === "tenant").length,
      opponents: contactRows.filter((contact) => contact.type === "landlord" || contact.type === "opponent").length + organizationRows.filter((organization) => organization.tags?.some((tag) => tag === "vermieter" || tag === "antragsgegner")).length,
      representations: contactRows.filter((contact) => contact.type === "representation").length + organizationRows.filter((organization) => organization.type === "law_firm" || organization.type === "property_management").length,
      linkedCases: new Set([...contactRows.flatMap((contact) => contact.caseIds), ...organizationRows.flatMap((organization) => organization.caseIds)]).size,
    }),
    [contactRows, organizationRows],
  );

  if (!loaded) return null;

  function refreshCrm() {
    setStoredContacts(listContacts());
    setStoredOrganizations(listOrganizations());
    setStoredLinks(listCaseLinks());
  }

  function ensureCanCreateWithCase(linkedCaseId?: string) {
    if (user?.role === "admin") return true;
    if (linkedCaseId && scopeCaseIds.has(linkedCaseId)) return true;
    window.alert("Mitarbeiter können CRM-Einträge in dieser Phase nur mit einem sichtbaren Fall verknüpft erstellen.");
    return false;
  }

  function createManualContact(values: CRMContactFormValues) {
    if (!ensureCanCreateWithCase(values.linkedCaseId)) return;
    const contact = createContact({
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
      linkedCaseIds: values.linkedCaseId ? [values.linkedCaseId] : [],
    });
    if (values.linkedCaseId && values.linkRole) linkContactToCase(contact.id, values.linkedCaseId, values.linkRole, "manual");
    refreshCrm();
    setContactFormOpen(false);
  }

  function createManualOrganization(values: CRMOrganizationFormValues) {
    if (!ensureCanCreateWithCase(values.linkedCaseId)) return;
    const organization = createOrganization({
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
      linkedCaseIds: values.linkedCaseId ? [values.linkedCaseId] : [],
    });
    if (values.linkedCaseId && values.linkRole) linkOrganizationToCase(organization.id, values.linkedCaseId, values.linkRole, "manual");
    refreshCrm();
    setOrganizationFormOpen(false);
  }

  return (
    <div className="-m-4 min-h-[calc(100vh-4rem)] bg-slate-950 p-4 text-slate-100 md:-m-6 md:p-6">
      <div className="space-y-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="text-xs font-bold uppercase tracking-wide text-blue-300">MAWA CRM</div>
            <h1 className="mt-1 text-2xl font-extrabold text-white">Kontakte & Mandanten</h1>
            <p className="mt-1 text-sm text-slate-400">Echte CRM-Kontakte, Organisationen und Fallverknüpfungen aus sichtbaren Fällen.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={() => setContactFormOpen(true)} className="inline-flex h-10 items-center justify-center gap-2 rounded-md bg-blue-600 px-4 text-sm font-bold text-white transition hover:bg-blue-500">
              <Plus size={16} />
              Neuer Kontakt
            </button>
            <button type="button" onClick={() => setOrganizationFormOpen(true)} className="inline-flex h-10 items-center justify-center gap-2 rounded-md border border-slate-700 px-4 text-sm font-bold text-slate-100 transition hover:border-blue-400 hover:text-blue-200">
              <Plus size={16} />
              Neue Organisation
            </button>
          </div>
        </div>

        {loadingRecords && (
          <div className="rounded-lg border border-slate-800 bg-slate-900/70 px-4 py-3 text-sm font-semibold text-slate-300">
            CRM-Daten werden geladen ...
          </div>
        )}
        {loadError && (
          <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm font-semibold text-amber-100">
            {loadError}
          </div>
        )}

        <section className="grid gap-3 min-[520px]:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
          <Kpi title="Kontakte" value={stats.contacts} tone="blue" />
          <Kpi title="Organisationen" value={stats.organizations} tone="violet" />
          <Kpi title="Mieter" value={stats.tenants} tone="green" />
          <Kpi title="Vermieter/Gegner" value={stats.opponents} tone="amber" />
          <Kpi title="Vertretungen" value={stats.representations} tone="cyan" />
          <Kpi title="Verknüpfte Fälle" value={stats.linkedCases} tone="slate" />
        </section>

        <section className="rounded-lg border border-slate-800 bg-slate-900/70 p-4">
          <div className="mb-3 flex items-center gap-2 text-sm font-extrabold text-white">
            <Filter size={16} />
            Filter
          </div>
          <div className="grid gap-3 xl:grid-cols-[1.5fr_220px_220px_auto_auto_auto]">
            <label className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" size={16} />
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Name, E-Mail, Telefon, Adresse suchen"
                className="h-10 w-full rounded-md border border-slate-700 bg-slate-950 pl-9 pr-3 text-sm font-semibold text-white outline-none focus:border-blue-500"
              />
            </label>
            <select value={contactFilter} onChange={(event) => setContactFilter(event.target.value as ContactFilter)} className="h-10 rounded-md border border-slate-700 bg-slate-950 px-3 text-sm font-semibold text-white">
              {contactFilters.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
            </select>
            <select value={organizationFilter} onChange={(event) => setOrganizationFilter(event.target.value as OrganizationFilter)} className="h-10 rounded-md border border-slate-700 bg-slate-950 px-3 text-sm font-semibold text-white">
              {organizationFilters.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
            </select>
            <Checkbox checked={onlyLinked} onChange={setOnlyLinked} label="Nur mit Fällen" />
            <Checkbox checked={onlyMissingEmail} onChange={setOnlyMissingEmail} label="Ohne E-Mail" />
            <Checkbox checked={onlyMissingPhone} onChange={setOnlyMissingPhone} label="Ohne Telefon" />
          </div>
        </section>

        <div className="flex flex-wrap gap-2">
          <TabButton active={activeTab === "contacts"} onClick={() => setActiveTab("contacts")} icon={<UserRound size={16} />} label={`Kontakte (${filteredContacts.length})`} />
          <TabButton active={activeTab === "organizations"} onClick={() => setActiveTab("organizations")} icon={<Building2 size={16} />} label={`Organisationen (${filteredOrganizations.length})`} />
          <TabButton active={activeTab === "links"} onClick={() => setActiveTab("links")} icon={<Link2 size={16} />} label={`Fallverknüpfungen (${filteredLinks.length})`} />
        </div>

        {contactRows.length === 0 && organizationRows.length === 0 ? (
          <EmptyState />
        ) : (
          <>
            {activeTab === "contacts" && (
              <>
                <DesktopContactTable rows={filteredContacts} caseMap={caseMap} expandedRow={expandedRow} onExpand={setExpandedRow} />
                <MobileContactCards rows={filteredContacts} caseMap={caseMap} expandedRow={expandedRow} onExpand={setExpandedRow} />
              </>
            )}
            {activeTab === "organizations" && (
              <>
                <DesktopOrganizationTable rows={filteredOrganizations} caseMap={caseMap} expandedRow={expandedRow} onExpand={setExpandedRow} />
                <MobileOrganizationCards rows={filteredOrganizations} caseMap={caseMap} expandedRow={expandedRow} onExpand={setExpandedRow} />
              </>
            )}
            {activeTab === "links" && <CaseLinksView rows={filteredLinks} />}
          </>
        )}
        {contactFormOpen && (
          <CRMContactFormModal
            title="Neuer Kontakt"
            cases={scopeRecords}
            organizations={organizationRows}
            onClose={() => setContactFormOpen(false)}
            onSubmit={createManualContact}
          />
        )}
        {organizationFormOpen && (
          <CRMOrganizationFormModal
            title="Neue Organisation"
            cases={scopeRecords}
            onClose={() => setOrganizationFormOpen(false)}
            onSubmit={createManualOrganization}
          />
        )}
      </div>
    </div>
  );
}

function DesktopContactTable({ rows, caseMap, expandedRow, onExpand }: { rows: ContactRow[]; caseMap: Map<string, SavedCaseRecord>; expandedRow: string | null; onExpand: (id: string | null) => void }) {
  return (
    <section className="hidden overflow-hidden rounded-lg border border-slate-800 bg-slate-900/80 xl:block">
      <table className="w-full text-left text-sm">
        <thead className="bg-slate-950 text-xs uppercase tracking-wide text-slate-500">
          <tr>
            {["Name", "Typ", "E-Mail", "Telefon", "Adresse", "Verknüpfte Fälle", "Tags", "Aktionen"].map((head) => (
              <th key={head} className="px-4 py-3 font-extrabold">{head}</th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-800">
          {rows.map((contact) => (
            <tr key={contact.id} className="align-top">
              <td className="px-4 py-4">
                <div className="font-extrabold text-white">{contact.displayName}</div>
                <div className="mt-1 text-xs font-semibold text-slate-500">{sourceLabel(contact.source)}</div>
              </td>
              <td className="px-4 py-4"><Pill label={contactTypeLabel(contact.type)} tone={contactTone(contact.type)} /></td>
              <td className="px-4 py-4 text-slate-300">{contact.email || "-"}</td>
              <td className="px-4 py-4 text-slate-300">{contact.phone || contact.mobile || "-"}</td>
              <td className="max-w-[260px] px-4 py-4 text-slate-400">{formatAddress(contact)}</td>
              <td className="px-4 py-4 text-slate-300">{contact.caseIds.length}</td>
              <td className="px-4 py-4"><TagList tags={contact.tags} /></td>
              <td className="px-4 py-4"><RowActions id={contact.id} detailHref={`/clients/contacts/${encodeURIComponent(contact.id)}`} text={formatContactCopy(contact)} caseIds={contact.caseIds} caseMap={caseMap} expandedRow={expandedRow} onExpand={onExpand} /></td>
            </tr>
          ))}
        </tbody>
      </table>
      {rows.length === 0 && <NoFilterResults />}
    </section>
  );
}

function DesktopOrganizationTable({ rows, caseMap, expandedRow, onExpand }: { rows: OrganizationRow[]; caseMap: Map<string, SavedCaseRecord>; expandedRow: string | null; onExpand: (id: string | null) => void }) {
  return (
    <section className="hidden overflow-hidden rounded-lg border border-slate-800 bg-slate-900/80 xl:block">
      <table className="w-full text-left text-sm">
        <thead className="bg-slate-950 text-xs uppercase tracking-wide text-slate-500">
          <tr>
            {["Name", "Typ", "E-Mail", "Telefon", "Adresse", "Verknüpfte Fälle", "Aktionen"].map((head) => (
              <th key={head} className="px-4 py-3 font-extrabold">{head}</th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-800">
          {rows.map((organization) => (
            <tr key={organization.id} className="align-top">
              <td className="px-4 py-4">
                <div className="font-extrabold text-white">{organization.name}</div>
                <div className="mt-1 text-xs font-semibold text-slate-500">{sourceLabel(organization.source)}</div>
              </td>
              <td className="px-4 py-4"><Pill label={organizationTypeLabel(organization.type)} tone={organizationTone(organization.type)} /></td>
              <td className="px-4 py-4 text-slate-300">{organization.email || "-"}</td>
              <td className="px-4 py-4 text-slate-300">{organization.phone || "-"}</td>
              <td className="max-w-[260px] px-4 py-4 text-slate-400">{formatAddress(organization)}</td>
              <td className="px-4 py-4 text-slate-300">{organization.caseIds.length}</td>
              <td className="px-4 py-4"><RowActions id={organization.id} detailHref={`/clients/organizations/${encodeURIComponent(organization.id)}`} text={formatOrganizationCopy(organization)} caseIds={organization.caseIds} caseMap={caseMap} expandedRow={expandedRow} onExpand={onExpand} /></td>
            </tr>
          ))}
        </tbody>
      </table>
      {rows.length === 0 && <NoFilterResults />}
    </section>
  );
}

function MobileContactCards({ rows, caseMap, expandedRow, onExpand }: { rows: ContactRow[]; caseMap: Map<string, SavedCaseRecord>; expandedRow: string | null; onExpand: (id: string | null) => void }) {
  return (
    <section className="grid gap-3 xl:hidden">
      {rows.map((contact) => (
        <div key={contact.id} className="rounded-lg border border-slate-800 bg-slate-900/80 p-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="font-extrabold text-white">{contact.displayName}</div>
              <div className="mt-1 text-sm text-slate-400">{contact.email || "Keine E-Mail"}</div>
              <div className="mt-1 text-xs font-semibold text-slate-500">{formatAddress(contact)}</div>
            </div>
            <Pill label={contactTypeLabel(contact.type)} tone={contactTone(contact.type)} />
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            <TagList tags={contact.tags} />
            <Pill label={`${contact.caseIds.length} Fall${contact.caseIds.length === 1 ? "" : "e"}`} tone="slate" />
          </div>
          <div className="mt-4"><RowActions id={contact.id} detailHref={`/clients/contacts/${encodeURIComponent(contact.id)}`} text={formatContactCopy(contact)} caseIds={contact.caseIds} caseMap={caseMap} expandedRow={expandedRow} onExpand={onExpand} /></div>
        </div>
      ))}
      {rows.length === 0 && <NoFilterResults />}
    </section>
  );
}

function MobileOrganizationCards({ rows, caseMap, expandedRow, onExpand }: { rows: OrganizationRow[]; caseMap: Map<string, SavedCaseRecord>; expandedRow: string | null; onExpand: (id: string | null) => void }) {
  return (
    <section className="grid gap-3 xl:hidden">
      {rows.map((organization) => (
        <div key={organization.id} className="rounded-lg border border-slate-800 bg-slate-900/80 p-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="font-extrabold text-white">{organization.name}</div>
              <div className="mt-1 text-sm text-slate-400">{organization.email || "Keine E-Mail"}</div>
              <div className="mt-1 text-xs font-semibold text-slate-500">{formatAddress(organization)}</div>
            </div>
            <Pill label={organizationTypeLabel(organization.type)} tone={organizationTone(organization.type)} />
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            <TagList tags={organization.tags} />
            <Pill label={`${organization.caseIds.length} Fall${organization.caseIds.length === 1 ? "" : "e"}`} tone="slate" />
          </div>
          <div className="mt-4"><RowActions id={organization.id} detailHref={`/clients/organizations/${encodeURIComponent(organization.id)}`} text={formatOrganizationCopy(organization)} caseIds={organization.caseIds} caseMap={caseMap} expandedRow={expandedRow} onExpand={onExpand} /></div>
        </div>
      ))}
      {rows.length === 0 && <NoFilterResults />}
    </section>
  );
}

function CaseLinksView({ rows }: { rows: Array<{ link: CRMCaseLink; contact?: ContactRow; organization?: OrganizationRow; caseRecord?: SavedCaseRecord }> }) {
  return (
    <section className="rounded-lg border border-slate-800 bg-slate-900/80">
      <div className="grid gap-3 p-4">
        {rows.map(({ link, contact, organization, caseRecord }) => (
          <div key={link.id} className="rounded-lg border border-slate-800 bg-slate-950/60 p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <div className="font-extrabold text-white">{contact?.displayName || organization?.name}</div>
                <div className="mt-1 text-sm text-slate-400">{roleLabel(link.role)} · Quelle: {sourceLabel(link.source)}</div>
                <div className="mt-1 text-xs font-semibold text-slate-500">{caseRecord?.tenant || "Fall"} · {caseRecord?.address || "-"}</div>
              </div>
              {caseRecord && (
                <Link href={`/cases/${caseRecord.id}`} className="inline-flex h-9 items-center justify-center gap-2 rounded-md border border-slate-700 px-3 text-sm font-bold text-slate-100 transition hover:border-blue-400 hover:text-blue-200">
                  <Eye size={15} />
                  Zum Fall
                </Link>
              )}
            </div>
          </div>
        ))}
        {rows.length === 0 && <NoFilterResults />}
      </div>
    </section>
  );
}

function RowActions({ id, detailHref, text, caseIds, caseMap, expandedRow, onExpand }: { id: string; detailHref?: string; text: string; caseIds: string[]; caseMap: Map<string, SavedCaseRecord>; expandedRow: string | null; onExpand: (id: string | null) => void }) {
  const visibleCasesForRow = caseIds.map((caseId) => caseMap.get(caseId)).filter(Boolean) as SavedCaseRecord[];
  const singleCase = visibleCasesForRow.length === 1 ? visibleCasesForRow[0] : undefined;
  const expanded = expandedRow === id;
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        {detailHref && (
          <Link href={detailHref} className="inline-flex h-8 items-center justify-center gap-1 rounded-md border border-slate-700 px-2.5 text-xs font-bold text-slate-100 transition hover:border-blue-400 hover:text-blue-200">
            <Eye size={14} />
            Öffnen
          </Link>
        )}
        {singleCase ? (
          <Link href={`/cases/${singleCase.id}`} className="inline-flex h-8 items-center justify-center gap-1 rounded-md border border-slate-700 px-2.5 text-xs font-bold text-slate-100 transition hover:border-blue-400 hover:text-blue-200">
            <Eye size={14} />
            Zum Fall
          </Link>
        ) : visibleCasesForRow.length > 1 ? (
          <button type="button" onClick={() => onExpand(expanded ? null : id)} className="inline-flex h-8 items-center justify-center gap-1 rounded-md border border-slate-700 px-2.5 text-xs font-bold text-slate-100 transition hover:border-blue-400 hover:text-blue-200">
            <UsersRound size={14} />
            Fälle anzeigen
          </button>
        ) : null}
        <button type="button" onClick={() => void navigator.clipboard?.writeText(text)} className="inline-flex h-8 items-center justify-center gap-1 rounded-md border border-slate-700 px-2.5 text-xs font-bold text-slate-100 transition hover:border-slate-500 hover:text-white">
          <Copy size={14} />
          Kopieren
        </button>
      </div>
      {expanded && visibleCasesForRow.length > 1 && (
        <div className="grid gap-1 rounded-md border border-slate-800 bg-slate-950 p-2">
          {visibleCasesForRow.map((record) => (
            <Link key={record.id} href={`/cases/${record.id}`} className="text-xs font-bold text-blue-300 hover:text-blue-200">
              {record.id} · {record.tenant || "Fall"}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

function Kpi({ title, value, tone }: { title: string; value: number; tone: "blue" | "violet" | "green" | "amber" | "cyan" | "slate" }) {
  const toneClass = {
    blue: "from-blue-500/15 to-blue-500/5 text-blue-200",
    violet: "from-violet-500/15 to-violet-500/5 text-violet-200",
    green: "from-emerald-500/15 to-emerald-500/5 text-emerald-200",
    amber: "from-amber-500/15 to-amber-500/5 text-amber-200",
    cyan: "from-cyan-500/15 to-cyan-500/5 text-cyan-200",
    slate: "from-slate-500/15 to-slate-500/5 text-slate-200",
  }[tone];
  return (
    <div className={`rounded-lg border border-slate-800 bg-gradient-to-br ${toneClass} p-4`}>
      <div className="text-2xl font-extrabold text-white">{value}</div>
      <div className="mt-1 text-xs font-bold uppercase tracking-wide">{title}</div>
    </div>
  );
}

function TabButton({ active, onClick, icon, label }: { active: boolean; onClick: () => void; icon: ReactNode; label: string }) {
  return (
    <button type="button" onClick={onClick} className={`inline-flex h-10 items-center gap-2 rounded-md border px-4 text-sm font-extrabold transition ${active ? "border-blue-500 bg-blue-500/15 text-blue-100" : "border-slate-800 bg-slate-900 text-slate-300 hover:border-slate-700 hover:text-white"}`}>
      {icon}
      {label}
    </button>
  );
}

function Checkbox({ checked, onChange, label }: { checked: boolean; onChange: (checked: boolean) => void; label: string }) {
  return (
    <label className="flex h-10 items-center gap-2 rounded-md border border-slate-700 px-3 text-sm font-bold text-slate-200">
      <input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} />
      {label}
    </label>
  );
}

function Pill({ label, tone }: { label: string; tone: "blue" | "green" | "amber" | "violet" | "cyan" | "slate" | "red" }) {
  const classes = {
    blue: "border-blue-400/30 bg-blue-500/10 text-blue-200",
    green: "border-emerald-400/30 bg-emerald-500/10 text-emerald-200",
    amber: "border-amber-400/30 bg-amber-500/10 text-amber-200",
    violet: "border-violet-400/30 bg-violet-500/10 text-violet-200",
    cyan: "border-cyan-400/30 bg-cyan-500/10 text-cyan-200",
    slate: "border-slate-600 bg-slate-800 text-slate-300",
    red: "border-red-400/30 bg-red-500/10 text-red-200",
  }[tone];
  return <span className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-extrabold ${classes}`}>{label}</span>;
}

function TagList({ tags }: { tags?: string[] }) {
  if (!tags?.length) return <span className="text-xs font-semibold text-slate-500">-</span>;
  return (
    <div className="flex flex-wrap gap-1">
      {tags.slice(0, 3).map((tag) => <Pill key={tag} label={tag} tone="slate" />)}
      {tags.length > 3 && <Pill label={`+${tags.length - 3}`} tone="slate" />}
    </div>
  );
}

function EmptyState() {
  return (
    <section className="rounded-lg border border-slate-800 bg-slate-900/80 p-10 text-center">
      <UsersRound className="mx-auto text-slate-500" size={36} />
      <div className="mt-4 text-xl font-extrabold text-white">Noch keine Kontakte vorhanden</div>
      <p className="mt-2 text-sm text-slate-400">Kontakte werden aus Fällen abgeleitet oder können später manuell angelegt werden.</p>
      <Link href="/cases/new" className="mt-5 inline-flex h-10 items-center justify-center rounded-md bg-blue-600 px-4 text-sm font-bold text-white transition hover:bg-blue-500">
        Neuen Fall erstellen
      </Link>
    </section>
  );
}

function NoFilterResults() {
  return <div className="rounded-lg border border-slate-800 bg-slate-900/80 p-8 text-center text-sm font-semibold text-slate-400">Keine Einträge passen zu den Filtern.</div>;
}

function mergeContacts<T extends CRMContact & { source?: "crm" | "derived" | "mixed" }>(contacts: T[]): ContactRow[] {
  const byKey = new Map<string, ContactRow>();
  for (const contact of contacts) {
    const key = normalizeContactKey(contact) || contact.id;
    const existing = byKey.get(key);
    if (!existing) {
      byKey.set(key, { ...contact, caseIds: contact.linkedCaseIds ?? [], source: contact.source ?? "crm" });
      continue;
    }
    byKey.set(key, {
      ...existing,
      ...filled(existing, contact),
      tags: unique([...(existing.tags ?? []), ...(contact.tags ?? [])]),
      linkedCaseIds: unique([...(existing.linkedCaseIds ?? []), ...(contact.linkedCaseIds ?? [])]),
      caseIds: unique([...(existing.caseIds ?? []), ...(contact.linkedCaseIds ?? [])]),
      source: existing.source === contact.source ? existing.source : "mixed",
    });
  }
  return [...byKey.values()];
}

function mergeOrganizations<T extends CRMOrganization & { source?: "crm" | "derived" | "mixed" }>(organizations: T[]): OrganizationRow[] {
  const byKey = new Map<string, OrganizationRow>();
  for (const organization of organizations) {
    const key = normalizeOrganizationKey(organization) || organization.id;
    const existing = byKey.get(key);
    if (!existing) {
      byKey.set(key, { ...organization, caseIds: organization.linkedCaseIds ?? [], source: organization.source ?? "crm" });
      continue;
    }
    byKey.set(key, {
      ...existing,
      ...filled(existing, organization),
      tags: unique([...(existing.tags ?? []), ...(organization.tags ?? [])]),
      linkedCaseIds: unique([...(existing.linkedCaseIds ?? []), ...(organization.linkedCaseIds ?? [])]),
      caseIds: unique([...(existing.caseIds ?? []), ...(organization.linkedCaseIds ?? [])]),
      source: existing.source === organization.source ? existing.source : "mixed",
    });
  }
  return [...byKey.values()];
}

function resolveContactCases(contact: CRMContact, links: CRMCaseLink[]) {
  return unique([...(contact.linkedCaseIds ?? []), ...links.filter((link) => link.contactId === contact.id).map((link) => link.caseId)]);
}

function resolveOrganizationCases(organization: CRMOrganization, links: CRMCaseLink[]) {
  return unique([...(organization.linkedCaseIds ?? []), ...links.filter((link) => link.organizationId === organization.id).map((link) => link.caseId)]);
}

function isVisibleCrmRow(isAdmin: boolean, caseIds: string[], scopeCaseIds: Set<string>) {
  if (isAdmin) return true;
  return caseIds.some((caseId) => scopeCaseIds.has(caseId));
}

function matchesContact(contact: ContactRow, options: { query: string; contactFilter: ContactFilter; onlyLinked: boolean; onlyMissingEmail: boolean; onlyMissingPhone: boolean }) {
  if (options.contactFilter !== "all" && contact.type !== options.contactFilter) return false;
  if (options.onlyLinked && contact.caseIds.length === 0) return false;
  if (options.onlyMissingEmail && contact.email) return false;
  if (options.onlyMissingPhone && (contact.phone || contact.mobile)) return false;
  const haystack = [contact.displayName, contact.email, contact.phone, contact.mobile, contact.address, contact.postalCode, contact.city, ...(contact.tags ?? [])].join(" ").toLowerCase();
  return !options.query.trim() || haystack.includes(options.query.trim().toLowerCase());
}

function matchesOrganization(organization: OrganizationRow, options: { query: string; organizationFilter: OrganizationFilter; onlyLinked: boolean; onlyMissingEmail: boolean; onlyMissingPhone: boolean }) {
  if (options.organizationFilter !== "all" && organization.type !== options.organizationFilter) return false;
  if (options.onlyLinked && organization.caseIds.length === 0) return false;
  if (options.onlyMissingEmail && organization.email) return false;
  if (options.onlyMissingPhone && organization.phone) return false;
  const haystack = [organization.name, organization.email, organization.phone, organization.address, organization.postalCode, organization.city, ...(organization.tags ?? [])].join(" ").toLowerCase();
  return !options.query.trim() || haystack.includes(options.query.trim().toLowerCase());
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

function sortContactRows(a: ContactRow, b: ContactRow) {
  return `${contactTypeLabel(a.type)} ${a.displayName}`.localeCompare(`${contactTypeLabel(b.type)} ${b.displayName}`);
}

function sortOrganizationRows(a: OrganizationRow, b: OrganizationRow) {
  return `${organizationTypeLabel(a.type)} ${a.name}`.localeCompare(`${organizationTypeLabel(b.type)} ${b.name}`);
}

function formatAddress(item: { address?: string; postalCode?: string; city?: string }) {
  return [item.address, [item.postalCode, item.city].filter(Boolean).join(" ")].filter(Boolean).join(", ") || "-";
}

function formatContactCopy(contact: CRMContact) {
  return [contact.displayName, contact.email, contact.phone || contact.mobile, formatAddress(contact)].filter((value) => value && value !== "-").join("\n");
}

function formatOrganizationCopy(organization: CRMOrganization) {
  return [organization.name, organization.email, organization.phone, formatAddress(organization)].filter((value) => value && value !== "-").join("\n");
}

function sourceLabel(source?: string) {
  if (source === "crm") return "CRM";
  if (source === "derived") return "Aus Fall abgeleitet";
  if (source === "mixed") return "CRM + Fall";
  if (source === "manual") return "Manuell";
  if (source === "communication") return "Kommunikation";
  if (source === "letter") return "Schreiben";
  if (source === "extracted") return "Extraktion";
  return "CRM";
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

function roleLabel(role: CRMCaseLink["role"]) {
  const labels: Record<CRMCaseLink["role"], string> = {
    tenant: "Mieter",
    landlord: "Vermieter",
    opponent: "Gegner",
    representation: "Vertretung",
    recipient: "Empfänger",
    witness: "Zeuge",
    internal_owner: "Sachbearbeitung",
  };
  return labels[role];
}

function contactTone(type: CRMContactType): "blue" | "green" | "amber" | "violet" | "cyan" | "slate" | "red" {
  if (type === "tenant") return "green";
  if (type === "landlord") return "amber";
  if (type === "opponent") return "red";
  if (type === "representation") return "violet";
  if (type === "internal") return "cyan";
  return "slate";
}

function organizationTone(type: CRMOrganizationType): "blue" | "green" | "amber" | "violet" | "cyan" | "slate" | "red" {
  if (type === "law_firm") return "violet";
  if (type === "property_management") return "cyan";
  if (type === "landlord_company") return "amber";
  if (type === "court") return "blue";
  if (type === "company") return "green";
  return "slate";
}
