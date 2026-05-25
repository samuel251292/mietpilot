export type CRMContactType = "tenant" | "landlord" | "opponent" | "representation" | "internal" | "other";

export type CRMOrganizationType = "landlord_company" | "law_firm" | "property_management" | "court" | "company" | "other";

export type CRMCaseLinkRole = "tenant" | "landlord" | "opponent" | "representation" | "recipient" | "witness" | "internal_owner";

export type CRMCaseLinkSource = "extracted" | "manual" | "communication" | "letter";

export type CRMContact = {
  id: string;
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
  notes?: string;
  tags?: string[];
  linkedCaseIds?: string[];
  createdAt: string;
  updatedAt: string;
};

export type CRMOrganization = {
  id: string;
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
  primaryContactId?: string;
  notes?: string;
  tags?: string[];
  linkedCaseIds?: string[];
  createdAt: string;
  updatedAt: string;
};

export type CRMCaseLink = {
  id: string;
  caseId: string;
  contactId?: string;
  organizationId?: string;
  role: CRMCaseLinkRole;
  source: CRMCaseLinkSource;
  primary?: boolean;
  createdAt: string;
};
