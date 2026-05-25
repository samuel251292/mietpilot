"use client";

import { useMemo, useState } from "react";
import type { ReactNode } from "react";
import { X } from "lucide-react";
import type { SavedCaseRecord } from "@/types/case";
import type { CRMCaseLinkRole, CRMContact, CRMContactType, CRMOrganization, CRMOrganizationType } from "@/types/crm";

export type CRMContactFormValues = {
  type: CRMContactType;
  firstName?: string;
  lastName?: string;
  displayName: string;
  email?: string;
  phone?: string;
  mobile?: string;
  address?: string;
  postalCode?: string;
  city?: string;
  country?: string;
  organizationId?: string;
  tags?: string[];
  notes?: string;
  linkedCaseId?: string;
  linkRole?: CRMCaseLinkRole;
};

export type CRMOrganizationFormValues = {
  type: CRMOrganizationType;
  name: string;
  email?: string;
  phone?: string;
  address?: string;
  postalCode?: string;
  city?: string;
  country?: string;
  uid?: string;
  fn?: string;
  iban?: string;
  tags?: string[];
  notes?: string;
  linkedCaseId?: string;
  linkRole?: CRMCaseLinkRole;
};

const contactTypeOptions: Array<{ value: CRMContactType; label: string }> = [
  { value: "tenant", label: "Mieter" },
  { value: "landlord", label: "Vermieter" },
  { value: "opponent", label: "Gegner" },
  { value: "representation", label: "Vertretung" },
  { value: "internal", label: "Intern" },
  { value: "other", label: "Sonstige" },
];

const organizationTypeOptions: Array<{ value: CRMOrganizationType; label: string }> = [
  { value: "landlord_company", label: "Vermieter-Firma" },
  { value: "property_management", label: "Hausverwaltung" },
  { value: "law_firm", label: "Kanzlei" },
  { value: "court", label: "Gericht" },
  { value: "company", label: "Firma" },
  { value: "other", label: "Sonstige" },
];

const roleOptions: Array<{ value: CRMCaseLinkRole; label: string }> = [
  { value: "tenant", label: "Mieter" },
  { value: "landlord", label: "Vermieter" },
  { value: "opponent", label: "Gegner" },
  { value: "representation", label: "Vertretung" },
  { value: "recipient", label: "Empfänger" },
  { value: "witness", label: "Zeuge" },
  { value: "internal_owner", label: "Interner Owner" },
];

export function CRMContactFormModal({
  title,
  initial,
  cases,
  organizations,
  onClose,
  onSubmit,
}: {
  title: string;
  initial?: Partial<CRMContact>;
  cases: SavedCaseRecord[];
  organizations: CRMOrganization[];
  onClose: () => void;
  onSubmit: (values: CRMContactFormValues) => void;
}) {
  const [type, setType] = useState<CRMContactType>(initial?.type ?? "tenant");
  const [firstName, setFirstName] = useState(initial?.firstName ?? "");
  const [lastName, setLastName] = useState(initial?.lastName ?? "");
  const [displayName, setDisplayName] = useState(initial?.displayName ?? "");
  const [email, setEmail] = useState(initial?.email ?? "");
  const [phone, setPhone] = useState(initial?.phone ?? "");
  const [mobile, setMobile] = useState(initial?.mobile ?? "");
  const [address, setAddress] = useState(initial?.address ?? "");
  const [postalCode, setPostalCode] = useState(initial?.postalCode ?? "");
  const [city, setCity] = useState(initial?.city ?? "");
  const [country, setCountry] = useState(initial?.country ?? "AT");
  const [organizationId, setOrganizationId] = useState(initial?.organizationId ?? "");
  const [tags, setTags] = useState((initial?.tags ?? []).join(", "));
  const [notes, setNotes] = useState(initial?.notes ?? "");
  const [linkedCaseId, setLinkedCaseId] = useState("");
  const [linkRole, setLinkRole] = useState<CRMCaseLinkRole>(defaultRoleForContact(initial?.type ?? "tenant"));
  const resolvedDisplayName = useMemo(() => displayName.trim() || [firstName, lastName].filter(Boolean).join(" ").trim(), [displayName, firstName, lastName]);

  return (
    <Modal title={title} onClose={onClose}>
      <form
        className="grid gap-4"
        onSubmit={(event) => {
          event.preventDefault();
          if (!resolvedDisplayName) return;
          onSubmit({
            type,
            firstName: clean(firstName),
            lastName: clean(lastName),
            displayName: resolvedDisplayName,
            email: clean(email),
            phone: clean(phone),
            mobile: clean(mobile),
            address: clean(address),
            postalCode: clean(postalCode),
            city: clean(city),
            country: clean(country),
            organizationId: clean(organizationId),
            tags: parseTags(tags),
            notes: clean(notes),
            linkedCaseId: clean(linkedCaseId),
            linkRole,
          });
        }}
      >
        <div className="grid gap-3 md:grid-cols-2">
          <Select label="Typ" value={type} onChange={(value) => { setType(value as CRMContactType); setLinkRole(defaultRoleForContact(value as CRMContactType)); }} options={contactTypeOptions} />
          <Input label="Anzeigename" value={displayName} onChange={setDisplayName} placeholder="Wird aus Vor-/Nachname ergänzt" />
          <Input label="Vorname" value={firstName} onChange={setFirstName} />
          <Input label="Nachname" value={lastName} onChange={setLastName} />
          <Input label="E-Mail" value={email} onChange={setEmail} type="email" />
          <Input label="Telefon" value={phone} onChange={setPhone} />
          <Input label="Mobil" value={mobile} onChange={setMobile} />
          <Select label="Organisation" value={organizationId} onChange={setOrganizationId} options={[{ value: "", label: "Keine Organisation" }, ...organizations.map((organization) => ({ value: organization.id, label: organization.name }))]} />
          <Input label="Adresse" value={address} onChange={setAddress} className="md:col-span-2" />
          <Input label="PLZ" value={postalCode} onChange={setPostalCode} />
          <Input label="Ort" value={city} onChange={setCity} />
          <Input label="Land" value={country} onChange={setCountry} />
          <Input label="Tags" value={tags} onChange={setTags} placeholder="Kommagetrennt" />
          <Select label="Fallverknüpfung optional" value={linkedCaseId} onChange={setLinkedCaseId} options={[{ value: "", label: "Keine Fallverknüpfung" }, ...cases.map((record) => ({ value: record.id, label: `${record.id} · ${record.tenant || record.address || "Fall"}` }))]} />
          <Select label="Rolle im Fall" value={linkRole} onChange={(value) => setLinkRole(value as CRMCaseLinkRole)} options={roleOptions} />
          <Textarea label="Notizen" value={notes} onChange={setNotes} className="md:col-span-2" />
        </div>
        <ModalActions onClose={onClose} disabled={!resolvedDisplayName} />
      </form>
    </Modal>
  );
}

export function CRMOrganizationFormModal({
  title,
  initial,
  cases,
  onClose,
  onSubmit,
}: {
  title: string;
  initial?: Partial<CRMOrganization>;
  cases: SavedCaseRecord[];
  onClose: () => void;
  onSubmit: (values: CRMOrganizationFormValues) => void;
}) {
  const [type, setType] = useState<CRMOrganizationType>(initial?.type ?? "company");
  const [name, setName] = useState(initial?.name ?? "");
  const [email, setEmail] = useState(initial?.email ?? "");
  const [phone, setPhone] = useState(initial?.phone ?? "");
  const [address, setAddress] = useState(initial?.address ?? "");
  const [postalCode, setPostalCode] = useState(initial?.postalCode ?? "");
  const [city, setCity] = useState(initial?.city ?? "");
  const [country, setCountry] = useState(initial?.country ?? "AT");
  const [uid, setUid] = useState(initial?.uid ?? "");
  const [fn, setFn] = useState(initial?.fn ?? "");
  const [iban, setIban] = useState(initial?.iban ?? "");
  const [tags, setTags] = useState((initial?.tags ?? []).join(", "));
  const [notes, setNotes] = useState(initial?.notes ?? "");
  const [linkedCaseId, setLinkedCaseId] = useState("");
  const [linkRole, setLinkRole] = useState<CRMCaseLinkRole>(defaultRoleForOrganization(initial?.type ?? "company"));

  return (
    <Modal title={title} onClose={onClose}>
      <form
        className="grid gap-4"
        onSubmit={(event) => {
          event.preventDefault();
          if (!name.trim()) return;
          onSubmit({
            type,
            name: name.trim(),
            email: clean(email),
            phone: clean(phone),
            address: clean(address),
            postalCode: clean(postalCode),
            city: clean(city),
            country: clean(country),
            uid: clean(uid),
            fn: clean(fn),
            iban: clean(iban),
            tags: parseTags(tags),
            notes: clean(notes),
            linkedCaseId: clean(linkedCaseId),
            linkRole,
          });
        }}
      >
        <div className="grid gap-3 md:grid-cols-2">
          <Select label="Typ" value={type} onChange={(value) => { setType(value as CRMOrganizationType); setLinkRole(defaultRoleForOrganization(value as CRMOrganizationType)); }} options={organizationTypeOptions} />
          <Input label="Name" value={name} onChange={setName} />
          <Input label="E-Mail" value={email} onChange={setEmail} type="email" />
          <Input label="Telefon" value={phone} onChange={setPhone} />
          <Input label="Adresse" value={address} onChange={setAddress} className="md:col-span-2" />
          <Input label="PLZ" value={postalCode} onChange={setPostalCode} />
          <Input label="Ort" value={city} onChange={setCity} />
          <Input label="Land" value={country} onChange={setCountry} />
          <Input label="UID" value={uid} onChange={setUid} />
          <Input label="FN" value={fn} onChange={setFn} />
          <Input label="IBAN" value={iban} onChange={setIban} />
          <Input label="Tags" value={tags} onChange={setTags} placeholder="Kommagetrennt" />
          <Select label="Fallverknüpfung optional" value={linkedCaseId} onChange={setLinkedCaseId} options={[{ value: "", label: "Keine Fallverknüpfung" }, ...cases.map((record) => ({ value: record.id, label: `${record.id} · ${record.tenant || record.address || "Fall"}` }))]} />
          <Select label="Rolle im Fall" value={linkRole} onChange={(value) => setLinkRole(value as CRMCaseLinkRole)} options={roleOptions} />
          <Textarea label="Notizen" value={notes} onChange={setNotes} className="md:col-span-2" />
        </div>
        <ModalActions onClose={onClose} disabled={!name.trim()} />
      </form>
    </Modal>
  );
}

function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/80 p-4">
      <div className="max-h-[92vh] w-full max-w-3xl overflow-auto rounded-lg border border-slate-800 bg-slate-900 text-slate-100 shadow-2xl">
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-slate-800 bg-slate-900 px-4 py-3">
          <div className="font-extrabold text-white">{title}</div>
          <button type="button" onClick={onClose} className="grid h-8 w-8 place-items-center rounded-md border border-slate-700 text-slate-300 hover:border-slate-500 hover:text-white">
            <X size={16} />
          </button>
        </div>
        <div className="p-4">{children}</div>
      </div>
    </div>
  );
}

function ModalActions({ onClose, disabled }: { onClose: () => void; disabled?: boolean }) {
  return (
    <div className="flex flex-wrap justify-end gap-2 border-t border-slate-800 pt-4">
      <button type="button" onClick={onClose} className="h-10 rounded-md border border-slate-700 px-4 text-sm font-bold text-slate-200 hover:border-slate-500 hover:text-white">
        Abbrechen
      </button>
      <button type="submit" disabled={disabled} className="h-10 rounded-md bg-blue-600 px-4 text-sm font-bold text-white transition hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-50">
        Speichern
      </button>
    </div>
  );
}

function Input({ label, value, onChange, type = "text", placeholder, className = "" }: { label: string; value: string; onChange: (value: string) => void; type?: string; placeholder?: string; className?: string }) {
  return (
    <label className={`grid gap-1 ${className}`}>
      <span className="text-xs font-bold uppercase tracking-wide text-slate-500">{label}</span>
      <input value={value} onChange={(event) => onChange(event.target.value)} type={type} placeholder={placeholder} className="h-10 rounded-md border border-slate-700 bg-slate-950 px-3 text-sm font-semibold text-white outline-none focus:border-blue-500" />
    </label>
  );
}

function Textarea({ label, value, onChange, className = "" }: { label: string; value: string; onChange: (value: string) => void; className?: string }) {
  return (
    <label className={`grid gap-1 ${className}`}>
      <span className="text-xs font-bold uppercase tracking-wide text-slate-500">{label}</span>
      <textarea value={value} onChange={(event) => onChange(event.target.value)} rows={4} className="rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-sm font-semibold text-white outline-none focus:border-blue-500" />
    </label>
  );
}

function Select({ label, value, onChange, options }: { label: string; value: string; onChange: (value: string) => void; options: Array<{ value: string; label: string }> }) {
  return (
    <label className="grid gap-1">
      <span className="text-xs font-bold uppercase tracking-wide text-slate-500">{label}</span>
      <select value={value} onChange={(event) => onChange(event.target.value)} className="h-10 rounded-md border border-slate-700 bg-slate-950 px-3 text-sm font-semibold text-white outline-none focus:border-blue-500">
        {options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
      </select>
    </label>
  );
}

function defaultRoleForContact(type: CRMContactType): CRMCaseLinkRole {
  if (type === "tenant") return "tenant";
  if (type === "landlord") return "landlord";
  if (type === "opponent") return "opponent";
  if (type === "representation") return "representation";
  if (type === "internal") return "internal_owner";
  return "recipient";
}

function defaultRoleForOrganization(type: CRMOrganizationType): CRMCaseLinkRole {
  if (type === "law_firm" || type === "property_management") return "representation";
  if (type === "landlord_company") return "landlord";
  return "opponent";
}

function parseTags(value: string) {
  return Array.from(new Set(value.split(",").map((tag) => tag.trim()).filter(Boolean)));
}

function clean(value: string) {
  return value.trim() || undefined;
}
