import type { StoredFileMeta } from "@/types/storage";

export type CompanyProfile = {
  companyName: string;
  legalForm: string;
  ownerName: string;
  logoText: string;
  address: string;
  postalCode: string;
  city: string;
  country: string;
  email: string;
  phone: string;
  website: string;
  managingDirector: string;
  iban: string;
  bic: string;
  uid: string;
  fn: string;
  uidFn: string;
  taxNumber: string;
  bankName: string;
  logoDataUrl?: string;
  signatureDataUrl?: string;
  letterheadDataUrl?: string;
  logoStorage?: StoredFileMeta;
  signatureStorage?: StoredFileMeta;
  letterheadStorage?: StoredFileMeta;
  defaultComparisonRate?: number;
  defaultReminderDays?: number;
  defaultCurrency?: string;
  billingEmail?: string;
  invoicePrefix?: string;
  invoiceNote?: string;
  createdAt: string;
  updatedAt: string;
};

export const defaultCompanyProfile: CompanyProfile = {
  companyName: "",
  legalForm: "",
  ownerName: "",
  logoText: "",
  address: "",
  postalCode: "",
  city: "",
  country: "Österreich",
  email: "",
  phone: "",
  website: "",
  managingDirector: "",
  iban: "",
  bic: "",
  uid: "",
  fn: "",
  uidFn: "",
  taxNumber: "",
  bankName: "",
  logoDataUrl: undefined,
  signatureDataUrl: undefined,
  letterheadDataUrl: undefined,
  logoStorage: undefined,
  signatureStorage: undefined,
  letterheadStorage: undefined,
  defaultComparisonRate: 30,
  defaultReminderDays: 14,
  defaultCurrency: "EUR",
  billingEmail: "",
  invoicePrefix: "MAWA",
  invoiceNote: "",
  createdAt: "",
  updatedAt: "",
};

const companyProfileKey = "mietpilot-company-profile";

export function getCompanyProfile(): CompanyProfile {
  if (typeof window === "undefined") return withTimestamps(defaultCompanyProfile);

  try {
    const raw = window.localStorage.getItem(companyProfileKey);
    if (!raw) return withTimestamps(defaultCompanyProfile);

    const parsed = JSON.parse(raw) as Partial<CompanyProfile>;
    return normalizeCompanyProfile(parsed);
  } catch {
    return withTimestamps(defaultCompanyProfile);
  }
}

export function saveCompanyProfile(profile: Partial<CompanyProfile>): CompanyProfile {
  const now = new Date().toISOString();
  const current = getCompanyProfile();
  const next = normalizeCompanyProfile({
    ...current,
    ...profile,
    createdAt: current.createdAt || now,
    updatedAt: now,
  });

  if (typeof window !== "undefined") {
    window.localStorage.setItem(companyProfileKey, JSON.stringify(next));
    window.dispatchEvent(new Event("mietpilot-company-profile-changed"));
  }

  return next;
}

export function resetCompanyProfile(): CompanyProfile {
  const next = withTimestamps(defaultCompanyProfile);
  if (typeof window !== "undefined") {
    window.localStorage.removeItem(companyProfileKey);
    window.dispatchEvent(new Event("mietpilot-company-profile-changed"));
  }
  return next;
}

function normalizeCompanyProfile(profile: Partial<CompanyProfile>): CompanyProfile {
  const merged: CompanyProfile = {
    ...withTimestamps(defaultCompanyProfile),
    ...profile,
    defaultComparisonRate: toOptionalNumber(profile.defaultComparisonRate ?? defaultCompanyProfile.defaultComparisonRate),
    defaultReminderDays: toOptionalNumber(profile.defaultReminderDays ?? defaultCompanyProfile.defaultReminderDays),
  };

  merged.uidFn = merged.uidFn || [merged.uid, merged.fn].filter(Boolean).join(" / ");
  merged.billingEmail = merged.billingEmail || merged.email;
  merged.logoText = merged.logoText || merged.companyName;

  return merged;
}

function withTimestamps(profile: CompanyProfile): CompanyProfile {
  const now = new Date().toISOString();
  return {
    ...profile,
    createdAt: profile.createdAt || now,
    updatedAt: profile.updatedAt || now,
  };
}

function toOptionalNumber(value: unknown) {
  if (value === "" || value === undefined || value === null) return undefined;
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : undefined;
}
