"use client";

import { useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { Building2, CreditCard, ImageIcon, RotateCcw, Save, ShieldCheck, SlidersHorizontal } from "lucide-react";
import { Button } from "@/components/ui/button";
import { appBranding } from "@/lib/branding";
import {
  getCompanyProfile,
  resetCompanyProfile,
  saveCompanyProfile,
  type CompanyProfile,
} from "@/lib/company-profile";
import { attachStorageMetaToCompanyProfile, buildCompanyAssetStorageMeta, type CompanyAssetType } from "@/lib/storage/company-asset-storage";
import { useAuth } from "@/lib/use-auth";

type ProfileKey = keyof CompanyProfile;

export default function SettingsPage() {
  const { user, loaded } = useAuth();
  const [profile, setProfile] = useState<CompanyProfile>(() => getCompanyProfile());
  const [savedAt, setSavedAt] = useState<string>("");
  const [message, setMessage] = useState<string>("");

  const canEdit = user?.role === "admin";
  const statusText = useMemo(() => {
    if (!loaded) return "Profil wird geladen";
    return canEdit ? "Admin-Bearbeitung aktiv" : "Nur Lesezugriff";
  }, [canEdit, loaded]);

  useEffect(() => {
    const load = () => setProfile(getCompanyProfile());
    load();
    window.addEventListener("mietpilot-company-profile-changed", load);
    window.addEventListener("storage", load);
    return () => {
      window.removeEventListener("mietpilot-company-profile-changed", load);
      window.removeEventListener("storage", load);
    };
  }, []);

  const update = (key: ProfileKey, value: string | number | undefined) => {
    setProfile((current) => ({ ...current, [key]: value }));
  };

  const save = () => {
    if (!canEdit) return;
    const saved = saveCompanyProfile(profile);
    setProfile(saved);
    setSavedAt(saved.updatedAt);
    setMessage("Unternehmensprofil gespeichert.");
  };

  const reset = () => {
    if (!canEdit) return;
    const next = resetCompanyProfile();
    setProfile(next);
    setSavedAt(next.updatedAt);
    setMessage("Unternehmensprofil zurückgesetzt.");
  };

  const uploadAsset = async (assetType: CompanyAssetType, file?: File) => {
    if (!canEdit || !file) return;
    try {
      const dataUrl = await fileToDataUrl(file);
      const storage = await buildCompanyAssetStorageMeta(assetType, file, dataUrl, user?.id);
      const dataKey = getCompanyAssetDataKey(assetType);

      setProfile((current) => attachStorageMetaToCompanyProfile({ ...current, [dataKey]: dataUrl }, assetType, storage));
      setMessage(storage.error ? `${assetLabel(assetType)} lokal gespeichert. Storage-Hinweis: ${storage.error}` : `${assetLabel(assetType)} vorbereitet.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : `${assetLabel(assetType)} konnte nicht gelesen werden.`);
    }
  };

  const removeAsset = (assetType: CompanyAssetType) => {
    if (!canEdit) return;
    const dataKey = getCompanyAssetDataKey(assetType);
    const storageKey = getCompanyAssetStorageKey(assetType);
    setProfile((current) => ({ ...current, [dataKey]: undefined, [storageKey]: undefined }));
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h1 className="text-2xl font-extrabold text-white">Einstellungen</h1>
          <p className="mt-1 text-sm text-slate-400">Persistentes Unternehmensprofil, Branding und Billing-Basis für {appBranding.name}.</p>
        </div>
        <div className="inline-flex w-fit items-center gap-2 rounded-md border border-slate-700 bg-slate-900 px-3 py-2 text-xs font-bold text-slate-300">
          <ShieldCheck size={14} className={canEdit ? "text-emerald-300" : "text-amber-300"} />
          {statusText}
        </div>
      </div>

      {!canEdit && (
        <div className="rounded-md border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-100">
          Mitarbeiter können das Unternehmensprofil einsehen. Änderungen sind Admins vorbehalten.
        </div>
      )}

      {message && (
        <div className="rounded-md border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-100">
          {message}
        </div>
      )}

      <SettingsSection icon={<Building2 size={18} />} title="Allgemein" description="Basisdaten für Kanzlei, Unternehmen und spätere Briefköpfe.">
        <Field label="Unternehmensname" value={profile.companyName} disabled={!canEdit} onChange={(value) => update("companyName", value)} />
        <Field label="Rechtsform" value={profile.legalForm} disabled={!canEdit} onChange={(value) => update("legalForm", value)} />
        <Field label="Inhaber" value={profile.ownerName} disabled={!canEdit} onChange={(value) => update("ownerName", value)} />
        <Field label="Geschäftsführer" value={profile.managingDirector} disabled={!canEdit} onChange={(value) => update("managingDirector", value)} />
        <Field label="Logo-Text" value={profile.logoText} disabled={!canEdit} onChange={(value) => update("logoText", value)} />
        <Field label="Website" value={profile.website} type="url" disabled={!canEdit} onChange={(value) => update("website", value)} />
      </SettingsSection>

      <SettingsSection icon={<Building2 size={18} />} title="Kontakt" description="Adresse und Kontaktwege für Schreiben, Signatur und spätere Kommunikation.">
        <Field label="Adresse" value={profile.address} disabled={!canEdit} onChange={(value) => update("address", value)} />
        <Field label="PLZ" value={profile.postalCode} disabled={!canEdit} onChange={(value) => update("postalCode", value)} />
        <Field label="Ort" value={profile.city} disabled={!canEdit} onChange={(value) => update("city", value)} />
        <Field label="Land" value={profile.country} disabled={!canEdit} onChange={(value) => update("country", value)} />
        <Field label="E-Mail" value={profile.email} type="email" disabled={!canEdit} onChange={(value) => update("email", value)} />
        <Field label="Telefon" value={profile.phone} type="tel" disabled={!canEdit} onChange={(value) => update("phone", value)} />
      </SettingsSection>

      <SettingsSection icon={<CreditCard size={18} />} title="Rechnungsdaten" description="Grundlage für spätere Rechnungen, Zahlungsinformationen und Billing-Exports.">
        <Field label="UID" value={profile.uid} disabled={!canEdit} onChange={(value) => update("uid", value)} />
        <Field label="Firmenbuchnummer" value={profile.fn} disabled={!canEdit} onChange={(value) => update("fn", value)} />
        <Field label="UID/FN Kurzform" value={profile.uidFn} disabled={!canEdit} onChange={(value) => update("uidFn", value)} />
        <Field label="Steuernummer" value={profile.taxNumber} disabled={!canEdit} onChange={(value) => update("taxNumber", value)} />
        <Field label="Bankname" value={profile.bankName} disabled={!canEdit} onChange={(value) => update("bankName", value)} />
        <Field label="IBAN" value={profile.iban} disabled={!canEdit} onChange={(value) => update("iban", value)} />
        <Field label="BIC" value={profile.bic} disabled={!canEdit} onChange={(value) => update("bic", value)} />
        <Field label="Rechnungs-E-Mail" value={profile.billingEmail ?? ""} type="email" disabled={!canEdit} onChange={(value) => update("billingEmail", value)} />
        <Field label="Rechnungspräfix" value={profile.invoicePrefix ?? ""} disabled={!canEdit} onChange={(value) => update("invoicePrefix", value)} />
        <TextArea label="Standard-Rechnungshinweis" value={profile.invoiceNote ?? ""} disabled={!canEdit} onChange={(value) => update("invoiceNote", value)} />
      </SettingsSection>

      <SettingsSection icon={<SlidersHorizontal size={18} />} title="Standardwerte" description="Zentrale Vorgaben für Vergleich, Fristen und Währung.">
        <Field label="Standard Vergleichsreduktion (%)" value={profile.defaultComparisonRate ?? ""} type="number" disabled={!canEdit} onChange={(value) => update("defaultComparisonRate", toNumber(value))} />
        <Field label="Standard Frist/Reminder (Tage)" value={profile.defaultReminderDays ?? ""} type="number" disabled={!canEdit} onChange={(value) => update("defaultReminderDays", toNumber(value))} />
        <Field label="Standardwährung" value={profile.defaultCurrency ?? ""} disabled={!canEdit} onChange={(value) => update("defaultCurrency", value.toUpperCase())} />
      </SettingsSection>

      <SettingsSection icon={<ImageIcon size={18} />} title="Branding" description="Logo und Signatur bleiben als DataURL kompatibel und koennen optional Storage-Metadaten fuer spaetere DOCX/PDF-Briefkoepfe speichern.">
        <UploadField label="Logo" disabled={!canEdit} preview={profile.logoDataUrl ?? profile.logoStorage?.publicUrl} onChange={(file) => void uploadAsset("logo", file)} onRemove={() => removeAsset("logo")} />
        <UploadField label="Signatur" disabled={!canEdit} preview={profile.signatureDataUrl ?? profile.signatureStorage?.publicUrl} onChange={(file) => void uploadAsset("signature", file)} onRemove={() => removeAsset("signature")} />
        <div className="md:col-span-2">
          <div className="rounded-lg border border-slate-700 bg-slate-950 p-5">
            <div className="text-xs font-bold uppercase tracking-wide text-slate-500">Briefkopf-Vorschau</div>
            <div className="mt-4 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
              <div className="flex items-center gap-3">
                {profile.logoDataUrl || profile.logoStorage?.publicUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={profile.logoDataUrl ?? profile.logoStorage?.publicUrl} alt="Logo" className="h-14 w-14 rounded-md border border-slate-700 object-contain" />
                ) : (
                  <div className="grid h-14 w-14 place-items-center rounded-md border border-slate-700 bg-slate-900 text-xs font-black text-slate-500">Logo</div>
                )}
                <div>
                  <div className="text-base font-extrabold text-white">{profile.companyName || "Unternehmensname"}</div>
                  <div className="mt-1 text-sm text-slate-400">{[profile.address, profile.postalCode, profile.city].filter(Boolean).join(", ") || "Adresse"}</div>
                </div>
              </div>
              <div className="text-sm text-slate-400">
                <div>{profile.email || "E-Mail"}</div>
                <div>{profile.phone || "Telefon"}</div>
                <div>{profile.iban || "IBAN"}</div>
              </div>
            </div>
          </div>
        </div>
      </SettingsSection>

      <div className="flex flex-col gap-3 rounded-lg border border-slate-800 bg-slate-900 p-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="text-sm text-slate-400">
          <div>Erstellt: {formatDateTime(profile.createdAt)}</div>
          <div>Zuletzt geändert: {formatDateTime(savedAt || profile.updatedAt)}</div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="ghost" className="border-slate-700 text-slate-200 hover:bg-slate-800" disabled={!canEdit} onClick={reset}><RotateCcw size={16} />Zurücksetzen</Button>
          <Button disabled={!canEdit} onClick={save}><Save size={16} />Einstellungen speichern</Button>
        </div>
      </div>
    </div>
  );
}

function SettingsSection({ icon, title, description, children }: { icon: ReactNode; title: string; description: string; children: ReactNode }) {
  return (
    <section className="rounded-lg border border-slate-800 bg-slate-900 p-5">
      <div className="mb-5 flex items-start gap-3">
        <div className="grid h-9 w-9 place-items-center rounded-md bg-blue-500/10 text-blue-300">{icon}</div>
        <div>
          <h2 className="text-lg font-extrabold text-white">{title}</h2>
          <p className="mt-1 text-sm text-slate-400">{description}</p>
        </div>
      </div>
      <div className="grid gap-4 md:grid-cols-2">{children}</div>
    </section>
  );
}

function Field({ label, value, onChange, type = "text", disabled }: { label: string; value: string | number; onChange: (value: string) => void; type?: string; disabled?: boolean }) {
  return (
    <label>
      <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</span>
      <input
        type={type}
        value={value}
        disabled={disabled}
        onChange={(event) => onChange(event.target.value)}
        className="h-10 w-full rounded-md border border-slate-700 bg-slate-950 px-3 text-sm text-slate-100 outline-none transition placeholder:text-slate-600 focus:border-blue-500 disabled:bg-slate-900 disabled:text-slate-500"
      />
    </label>
  );
}

function TextArea({ label, value, onChange, disabled }: { label: string; value: string; onChange: (value: string) => void; disabled?: boolean }) {
  return (
    <label className="md:col-span-2">
      <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</span>
      <textarea
        value={value}
        disabled={disabled}
        onChange={(event) => onChange(event.target.value)}
        rows={3}
        className="w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 outline-none transition placeholder:text-slate-600 focus:border-blue-500 disabled:bg-slate-900 disabled:text-slate-500"
      />
    </label>
  );
}

function UploadField({ label, preview, disabled, onChange, onRemove }: { label: string; preview?: string; disabled?: boolean; onChange: (file?: File) => void; onRemove: () => void }) {
  return (
    <div className="rounded-md border border-slate-800 bg-slate-950 p-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</div>
          <div className="mt-1 text-sm text-slate-400">PNG, JPG oder SVG als lokale DataURL.</div>
        </div>
        {preview && (
          <button type="button" disabled={disabled} onClick={onRemove} className="text-xs font-bold text-red-300 disabled:text-slate-600">
            Entfernen
          </button>
        )}
      </div>
      <div className="mt-4 flex items-center gap-4">
        {preview ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={preview} alt={label} className="h-16 w-24 rounded-md border border-slate-700 object-contain" />
        ) : (
          <div className="grid h-16 w-24 place-items-center rounded-md border border-dashed border-slate-700 text-xs font-bold text-slate-600">Keine Datei</div>
        )}
        <input disabled={disabled} type="file" accept=".png,.jpg,.jpeg,.svg,image/png,image/jpeg,image/svg+xml" onChange={(event) => onChange(event.target.files?.[0])} className="block text-xs text-slate-400 file:mr-3 file:h-9 file:rounded-md file:border-0 file:bg-slate-800 file:px-3 file:text-xs file:font-bold file:text-slate-100 disabled:text-slate-600" />
      </div>
    </div>
  );
}

function toNumber(value: string) {
  if (!value.trim()) return undefined;
  const number = Number(value);
  return Number.isFinite(number) ? number : undefined;
}

function getCompanyAssetDataKey(assetType: CompanyAssetType): keyof CompanyProfile {
  if (assetType === "signature") return "signatureDataUrl";
  if (assetType === "letterhead") return "letterheadDataUrl";
  return "logoDataUrl";
}

function getCompanyAssetStorageKey(assetType: CompanyAssetType): keyof CompanyProfile {
  if (assetType === "signature") return "signatureStorage";
  if (assetType === "letterhead") return "letterheadStorage";
  return "logoStorage";
}

function assetLabel(assetType: CompanyAssetType) {
  if (assetType === "signature") return "Signatur";
  if (assetType === "letterhead") return "Briefkopf-Asset";
  return "Logo";
}

function fileToDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error("Asset konnte nicht gelesen werden."));
    reader.readAsDataURL(file);
  });
}

function formatDateTime(value?: string) {
  if (!value) return "Noch nicht gespeichert";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Noch nicht gespeichert";
  return new Intl.DateTimeFormat("de-AT", { dateStyle: "medium", timeStyle: "short" }).format(date);
}
