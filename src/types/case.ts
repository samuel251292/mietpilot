import type { StoredFileMeta } from "@/types/storage";

export type CaseStatus =
  | "Entwurf"
  | "Dokumente hochgeladen"
  | "Daten geprüft"
  | "Berechnung abgeschlossen"
  | "Schreiben erstellt"
  | "Abgeschlossen";

export type UserRole = "admin" | "employee";

export type User = {
  id: string;
  name: string;
  email: string;
  password: string;
  role: UserRole;
  createdAt: string;
};

export type CaseShare = {
  userId: string;
  permission: "read" | "write";
};

export type CaseActivityType =
  | "created"
  | "updated"
  | "document_uploaded"
  | "document_replaced"
  | "document_removed"
  | "extraction_started"
  | "extraction_completed"
  | "calculation_updated"
  | "letter_generated"
  | "export_generated"
  | "communication_thread_created"
  | "communication_message_created"
  | "communication_message_archived"
  | "communication_draft_created"
  | "communication_send_failed"
  | "communication_message_received"
  | "task_created"
  | "task_updated"
  | "task_completed"
  | "task_archived"
  | "task_overdue"
  | "reminder_created"
  | "reminder_completed"
  | "follow_up_created"
  | "shared"
  | "assigned"
  | "completed"
  | "deleted"
  | "note";

export type CaseActivity = {
  id: string;
  type: CaseActivityType;
  title: string;
  description?: string;
  userId?: string;
  userName?: string;
  createdAt: string;
  metadata?: Record<string, unknown>;
};

export type ExtractedData = {
  tenantName: string;
  tenantAddress: string;
  tenantStreet: string;
  tenantDoor: string;
  tenantPostalCode: string;
  tenantCity: string;
  tenantFullAddress: string;
  phone: string;
  moveInDate: string;
  grossRent: number;
  aktuelle_miete: number;
  brutto_miete: number;
  hauptmietzins: number;
  contractArea: number;
  measuredArea: number;
  nutzflaeche_laut_vertrag: number;
  nutzflaeche_nachgemessen: number;
  category: string;
  equipment: string;
  balcony: boolean;
  bathToiletSameRoom: boolean;
  corridorKitchen: boolean;
  noiseImpact: boolean;
  cellar: boolean;
  intercom: boolean;
  fixedTerm: boolean;
  recipientName: string;
  recipientAddress: string;
  recipientPostalCity: string;
  opposingParty: string;
  representation: string;
  caseWorker: string;
  landlord: string;
  landlordAddress: string;
  landlordPostalCity: string;
  landlordRepresentedBy: string;
  birthDate: string;
  leaseStart: string;
  leaseEnd: string;
  deposit: number;
  guidelineRentPerSqm: number;
  guidelineRentTotal: number;
  operatingCostPerSqm: number;
  netRent: number;
  allowedGrossRent: number;
  allowedGrossRentFixedTerm: number;
  operatingCosts: number;
  vat: number;
  adjustments: string;
};

export type PendingExtractedChange = {
  field: string;
  label: string;
  currentValue: unknown;
  newValue: unknown;
  sourceDocumentId?: string;
  sourceDocumentType?: string;
  sourceDocumentName?: string;
  confidence?: number;
  changed: boolean;
};

export type CalculationInput = {
  currentGrossRent: number;
  aktuelle_miete?: number;
  nutzflaeche?: number;
  contractArea?: number;
  measuredArea?: number;
  fixedTerm?: boolean;
  hauptmietzins?: number;
  betriebskosten?: number;
  umsatzsteuer?: number;
  sonstige_zuschlaege?: number;
  pauschalmietzins?: number;
  pauschalmiete?: boolean;
  gesamtmiete_brutto?: number;
  mietzins_pro_m2?: number;
  richtwert_pro_m2?: number;
  befristungsabschlag_prozent?: number;
  rueckforderungszeitraum_start?: string;
  rueckforderungszeitraum_ende?: string;
  bereits_rueckerstattet?: number;
  offene_forderung?: number;
  vergleichsquote?: number;
  zukunftsreduktion_prozent?: number;
  zukuenftiger_mietzins?: number;
  manualOverrides?: Record<string, unknown>;
  overriddenFields?: string[];
  allowedGrossRent: number;
  startDate: string;
  endDate: string;
  paidDeductions: number;
  settlementReductionPercent: number;
  currentRentSource?: string;
  allowedRentSource?: string;
  areaSource?: string;
  periodSource?: string;
  calculationWarnings?: string[];
  calculationBasis?: Record<string, unknown>;
};

export type CalculationResult = CalculationInput & {
  monthlyExcess: number;
  monatliche_ueberzahlung?: number;
  months: number;
  rueckforderungszeitraum_monate?: number;
  totalExcess: number;
  gesamte_ueberzahlung?: number;
  settlementAmount: number;
  vergleichsbetrag?: number;
  futureAcceptedRent: number;
  zukuenftiger_mietzins?: number;
  zukuenftige_monatliche_ersparnis?: number;
};

export type CalculationReport = {
  generatedAt: string;
  generatedBy?: string;
  sections: Array<{
    title: string;
    entries: Array<{
      label: string;
      value: unknown;
      formattedValue?: string;
      source?: string;
      warning?: string;
      overridden?: boolean;
    }>;
  }>;
  warnings?: string[];
  summary?: {
    monthlyOverpayment?: number;
    totalOverpayment?: number;
    settlementAmount?: number;
    futureAcceptedRent?: number;
    futureMonthlySavings?: number;
  };
};

export type CaseRecord = {
  id: string;
  tenant: string;
  address: string;
  status: CaseStatus;
  lastActivity: string;
  claimAmount: number;
  ownerId?: string;
  ownerName?: string;
  sharedWith?: CaseShare[];
  createdBy?: string;
  updatedBy?: string;
  extracted: ExtractedData;
  calculation: CalculationResult;
  calculationReport?: CalculationReport;
  calculationReportGeneratedAt?: string;
  calculationReportVersion?: string;
  calculationReportLastExportedAt?: string;
};

export type SavedCaseDocument = {
  id: string;
  type: "Datenblatt" | "Mietvertrag" | "Richtwert" | "Gutachten" | "Weitere Dokumente";
  fileName: string;
  uploadedAt: string;
  mimeType?: string;
  size?: number;
  dataUrl?: string;
  storage?: StoredFileMeta;
  extractionStatus?: "pending" | "success" | "failed" | "not_applicable";
  extractionSummary?: string;
  source?: "upload" | "generated" | "legacy" | "storage";
  storageStatus?: StoredFileMeta["storageStatus"];
  extractedTextLength?: number;
  extractedFields?: Record<string, unknown>;
  extractionWarnings?: string[];
  extractionError?: string;
  extractedAt?: string;
};

export type SavedGeneratedFile = {
  fileName: string;
  mimeType: string;
  dataUrl?: string;
  storage?: StoredFileMeta;
  generatedAt?: string;
  source?: "generated" | "legacy" | "storage";
  storageStatus?: StoredFileMeta["storageStatus"];
};

export type LetterAttachment = {
  id: string;
  type: "mietvertrag" | "datenblatt" | "richtwert" | "gutachten" | "berechnungsbericht" | "sonstiges";
  label: string;
  fileName?: string;
  includedInLetter?: boolean;
  generatedAt?: string;
  sourceDocumentId?: string;
  metadata?: Record<string, unknown>;
};

export type LetterReviewStatus = "draft" | "review_required" | "ready" | "approved" | "warning";

export type LetterReview = {
  status?: LetterReviewStatus;
  reviewedAt?: string;
  reviewedBy?: string;
  warnings?: string[];
  missingFields?: string[];
  unresolvedPlaceholders?: string[];
  metadata?: Record<string, unknown>;
};

export type GeneratedLetterStatus = "draft" | "generated" | "review" | "ready" | "sent" | "archived" | "outdated";

export type GeneratedLetterVersion = {
  id: string;
  version: number;
  createdAt: string;
  createdBy?: string;
  status: GeneratedLetterStatus;
  templateId?: string;
  templateName?: string;
  templateFileName?: string;
  title?: string;
  description?: string;
  letterText?: string;
  docx?: SavedGeneratedFile;
  pdf?: SavedGeneratedFile;
  attachments?: LetterAttachment[];
  review?: LetterReview;
  calculationReportAttached?: boolean;
  reportVersion?: string;
  basedOnCalculationGeneratedAt?: string;
  outdated?: boolean;
  placeholdersUsed?: string[];
  warnings?: string[];
  approval?: {
    approvedAt?: string;
    approvedBy?: string;
    approvedByName?: string;
    approvalNote?: string;
  };
  sent?: {
    sentAt?: string;
    sentBy?: string;
    sentByName?: string;
    method?: "email" | "post" | "manual" | "other";
    note?: string;
  };
  statusHistory?: Array<{
    id: string;
    status: GeneratedLetterVersion["status"];
    changedAt: string;
    changedBy?: string;
    changedByName?: string;
    note?: string;
  }>;
  metadata?: Record<string, unknown>;
};

export type CommunicationChannel = "email" | "internal" | "manual" | "other";

export type CommunicationThreadStatus = "open" | "pending" | "closed" | "archived";

export type CommunicationMessageDirection = "outbound" | "inbound" | "internal";

export type CommunicationMessageStatus = "draft" | "ready" | "queued" | "sent" | "failed" | "received" | "archived";

export type CommunicationParticipant = {
  name?: string;
  email?: string;
  role?: string;
  type?: "tenant" | "landlord" | "representation" | "internal" | "other";
  contactId?: string;
  organizationId?: string;
};

export type CommunicationAttachment = {
  id: string;
  type: "letter_docx" | "letter_pdf" | "calculation_report" | "case_document" | "custom";
  label: string;
  fileName?: string;
  mimeType?: string;
  size?: number;
  dataUrl?: string;
  storage?: StoredFileMeta;
  storageStatus?: StoredFileMeta["storageStatus"];
  sourceDocumentId?: string;
  sourceLetterVersionId?: string;
  sourceCalculationReport?: boolean;
  source?: "reference" | "copy" | "upload" | "legacy" | "storage";
  metadata?: Record<string, unknown>;
};

export type CommunicationMessage = {
  id: string;
  threadId: string;
  caseId: string;
  direction: CommunicationMessageDirection;
  status: CommunicationMessageStatus;
  channel: CommunicationChannel;
  from: CommunicationParticipant;
  to: CommunicationParticipant[];
  cc?: CommunicationParticipant[];
  bcc?: CommunicationParticipant[];
  subject?: string;
  bodyText?: string;
  bodyHtml?: string;
  attachments?: CommunicationAttachment[];
  relatedLetterVersionId?: string;
  relatedContactIds?: string[];
  relatedOrganizationIds?: string[];
  provider?: "manual" | "smtp" | "gmail" | "outlook" | "whatsapp" | "internal" | "other";
  providerMessageId?: string;
  providerThreadId?: string;
  createdAt: string;
  sentAt?: string;
  createdBy?: string;
  createdByName?: string;
  error?: string;
  metadata?: Record<string, unknown>;
};

export type CommunicationThread = {
  id: string;
  caseId: string;
  subject: string;
  channel: CommunicationChannel;
  status: CommunicationThreadStatus;
  participants: CommunicationParticipant[];
  messages?: CommunicationMessage[];
  relatedContactIds?: string[];
  relatedOrganizationIds?: string[];
  createdAt: string;
  updatedAt: string;
  lastMessageAt: string;
  metadata?: Record<string, unknown>;
};

export type CaseTaskType = "task" | "reminder" | "deadline" | "follow_up" | "appointment" | "hearing" | "visit";

export type CaseTaskStatus = "open" | "in_progress" | "done" | "dismissed" | "overdue" | "archived";

export type CaseTaskPriority = "low" | "normal" | "high" | "urgent";

export type AppointmentStatus = "planned" | "confirmed" | "postponed" | "completed" | "cancelled";

export type CaseTaskSource = {
  type: "manual" | "communication" | "document" | "letter" | "calculation" | "case";
  id?: string;
  label?: string;
};

export type CalendarParticipant = {
  name?: string;
  email?: string;
  role?: string;
};

export type CaseTask = {
  id: string;
  caseId: string;
  title: string;
  description?: string;
  type: CaseTaskType;
  status: CaseTaskStatus;
  priority: CaseTaskPriority;
  dueAt?: string;
  remindAt?: string;
  completedAt?: string;
  startAt?: string;
  endAt?: string;
  allDay?: boolean;
  location?: string;
  participants?: CalendarParticipant[];
  timezone?: string;
  recurrence?: string;
  appointmentStatus?: AppointmentStatus;
  hearingDetails?: {
    court?: string;
    caseNumber?: string;
    room?: string;
    judge?: string;
    opponentLawyer?: string;
  };
  visitDetails?: {
    meetingPoint?: string;
    contactPerson?: string;
    accessNotes?: string;
  };
  contactId?: string;
  organizationId?: string;
  assignedTo?: string;
  assignedToName?: string;
  source?: CaseTaskSource;
  createdAt: string;
  updatedAt: string;
  createdBy?: string;
  createdByName?: string;
  metadata?: Record<string, unknown>;
};

export type TaskSuggestion = {
  id: string;
  title: string;
  description?: string;
  type: CaseTask["type"];
  priority: CaseTask["priority"];
  dueAt?: string;
  remindAt?: string;
  source: CaseTask["source"];
  reason: string;
  suggestedAt: string;
  metadata?: Record<string, unknown>;
};

export type CalendarSuggestion = {
  id: string;
  title: string;
  description?: string;
  type: "appointment" | "hearing" | "visit" | "deadline" | "follow_up";
  startAt?: string;
  endAt?: string;
  dueAt?: string;
  location?: string;
  priority?: CaseTask["priority"];
  source: {
    type: "document" | "letter" | "communication" | "calculation" | "case";
    id?: string;
    label?: string;
  };
  reason: string;
  suggestedAt: string;
  metadata?: Record<string, unknown>;
};

export type SavedCaseRecord = CaseRecord & {
  createdAt: string;
  updatedAt: string;
  documents: SavedCaseDocument[];
  generatedWord?: SavedGeneratedFile;
  generatedPdf?: SavedGeneratedFile;
  generatedLetters?: GeneratedLetterVersion[];
  letterAttachments?: LetterAttachment[];
  letterReview?: LetterReview;
  calculationReportDocx?: SavedGeneratedFile;
  calculationReportPdf?: SavedGeneratedFile;
  calculationReportDocxGeneratedAt?: string;
  calculationReportPdfGeneratedAt?: string;
  letterText: string;
  pendingExtractedChanges?: PendingExtractedChange[];
  communicationThreads?: CommunicationThread[];
  caseTasks?: CaseTask[];
  activityLog?: CaseActivity[];
};
