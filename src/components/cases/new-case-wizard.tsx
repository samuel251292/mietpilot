"use client";

import { useEffect, useMemo, useState, type DragEvent, type ReactNode } from "react";
import {
  ArrowLeft,
  ArrowRight,
  AlertTriangle,
  Check,
  CheckCircle2,
  Download,
  FileCheck2,
  FileText,
  PlusCircle,
  RefreshCcw,
  Save,
  Trash2,
  UploadCloud,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { LetterDocumentPreview } from "@/components/cases/letter-document-preview";
import { buildCalculationInputFromExtracted, buildCalculationReport, calculateSettlement, deriveRichtwertCalculation, parseEuroValue, resolveAllowedRentBasis } from "@/lib/calculation";
import { CaseService } from "@/lib/case-service";
import { createLetterEmailDraft } from "@/lib/communication/communication-service";
import { dataUrlToFile } from "@/lib/documents/data-url";
import { extractPdfText } from "@/lib/extraction/pdf-text";
import { createPendingExtractedChanges, mergePendingExtractedChanges } from "@/lib/extraction/pending-changes";
import { buildSavedCaseDocumentFromFile } from "@/lib/storage/document-storage";
import { buildStorageReadyGeneratedFile } from "@/lib/storage/generated-file-storage";
import { fileToBlob } from "@/lib/storage/file-resolver";
import { deriveRecipientMapping, sanitizeExtractedData } from "@/lib/recipient";
import { buildLetterTemplateDataFromWizardData, getLetterPlaceholderCatalog, toDocxTemplateData, type LetterTemplateData } from "@/lib/letters/letter-data";
import { appendGeneratedLetterVersion, createGeneratedLetterVersion, getNextLetterVersion, hasLetterOutdatedReason, markOutdatedGeneratedLetters } from "@/lib/letters/letter-versioning";
import { buildLetterAttachments } from "@/lib/letters/legal-letter-structure";
import { buildLetterReview } from "@/lib/letters/letter-review";
import { defaultTemplate, renderTemplateFromValues } from "@/lib/template";
import { formatCurrency } from "@/lib/utils";
import { useAuth } from "@/lib/use-auth";
import {
  createDocxFromTemplate,
  downloadBlob,
  loadActiveStoredWordTemplate,
  type StoredWordTemplate,
} from "@/lib/word-templates";
import type { DocumentExtractionResult, ExtractApiResponse, ExtractionIssue } from "@/lib/extraction/types";
import type { CaseRecord, CaseStatus, ExtractedData, GeneratedLetterVersion, LetterAttachment, LetterReview, PendingExtractedChange, SavedCaseDocument, SavedCaseRecord } from "@/types/case";

const steps = [
  "Dokumente hochladen",
  "Datenextraktion",
  "Erkannte Daten prüfen",
  "Berechnung",
  "Vergleichsschreiben",
  "Word/PDF Export",
];

const requiredDocxPlaceholders: string[] = getLetterPlaceholderCatalog().filter((entry) => entry.required).map((entry) => entry.placeholder);

const largeLocalDocumentBytes = 10 * 1024 * 1024;

type WizardData = {
  tenantName: string;
  address: string;
  tenantStreet: string;
  tenantDoor: string;
  tenantPostalCode: string;
  tenantCity: string;
  tenantFullAddress: string;
  phone: string;
  recipientName: string;
  recipientAddress: string;
  recipientPostalCity: string;
  opposingParty: string;
  representation: string;
  caseWorker: string;
  landlordName: string;
  landlordAddress: string;
  landlordPostalCity: string;
  currentRent: number;
  aktuelle_miete: number;
  brutto_miete: number;
  hauptmietzins: number;
  betriebskosten: number;
  umsatzsteuer: number;
  sonstige_zuschlaege: number;
  pauschalmietzins: number;
  pauschalmiete: boolean;
  gesamtmiete_brutto: number;
  allowedRent: number;
  contractArea: number;
  area: number;
  nutzflaeche_laut_vertrag: number;
  nutzflaeche_nachgemessen: number;
  category: string;
  fixedTerm: boolean;
  guidelineRentPerSqm: number;
  guidelineRentTotal: number;
  operatingCostPerSqm: number;
  operatingCosts: number;
  vat: number;
  netRent: number;
  allowedGrossRentFixedTerm: number;
  equipment: string;
  bathToiletSameRoom: boolean;
  corridorKitchen: boolean;
  noiseImpact: boolean;
  intercom: boolean;
  cellar: boolean;
  leaseStart: string;
  endDate: string;
  bereits_rueckerstattet: number;
  paidDeductions: number;
  vergleichsquote: number;
  reductionPercent: number;
  zukunftsreduktion_prozent: number;
  zukuenftiger_mietzins: number;
  manualOverrides: Record<string, unknown>;
  overriddenFields: string[];
};

type UploadDocumentType = "Datenblatt" | "Mietvertrag" | "Richtwert" | "Gutachten" | "Weitere Dokumente";

type UploadedDocument = {
  id: string;
  fileName: string;
  file?: File;
  uploadedAt: string;
  mimeType?: string;
  size?: number;
  dataUrl?: string;
  storage?: SavedCaseDocument["storage"];
  storageStatus?: SavedCaseDocument["storageStatus"];
  extractionStatus?: SavedCaseDocument["extractionStatus"];
  extractionSummary?: string;
  source?: SavedCaseDocument["source"];
  extractedTextLength?: number;
  extractedFields?: Record<string, unknown>;
  extractionWarnings?: string[];
  extractionError?: string;
  extractedAt?: string;
};

type UploadState = Record<UploadDocumentType, UploadedDocument | null>;

type GeneratedFile = {
  fileName: string;
  mimeType: string;
  base64: string;
};

type GenerateLetterResponse = {
  docx: GeneratedFile;
  pdf: GeneratedFile | null;
  pdfError?: string;
  error?: string;
};

export function NewCaseWizard({ record, editMode = false }: { record: CaseRecord | SavedCaseRecord; editMode?: boolean }) {
  const extracted = sanitizeExtractedData(record.extracted);
  const initialRecipient = deriveRecipientMapping(extracted);
  const { user } = useAuth();
  const [caseId] = useState(() => (editMode ? record.id : CaseService.createId()));
  const [currentStep, setCurrentStep] = useState(0);
  const [uploads, setUploads] = useState<UploadState>({
    Datenblatt: getSavedDocument(record, "Datenblatt"),
    Mietvertrag: getSavedDocument(record, "Mietvertrag"),
    Richtwert: getSavedDocument(record, "Richtwert"),
    Gutachten: getSavedDocument(record, "Gutachten"),
    "Weitere Dokumente": getSavedDocument(record, "Weitere Dokumente"),
  });
  const [documentsChanged, setDocumentsChanged] = useState(false);
  const [dataChanged, setDataChanged] = useState(false);
  const [data, setData] = useState<WizardData>({
    tenantName: record.tenant,
    address: record.address,
    tenantStreet: extracted.tenantStreet,
    tenantDoor: extracted.tenantDoor,
    tenantPostalCode: extracted.tenantPostalCode,
    tenantCity: extracted.tenantCity,
    tenantFullAddress: extracted.tenantFullAddress,
    phone: extracted.phone,
    recipientName: initialRecipient.recipientName,
    recipientAddress: initialRecipient.recipientAddress,
    recipientPostalCity: initialRecipient.recipientPostalCity,
    opposingParty: extracted.opposingParty,
    representation: extracted.representation || extracted.landlordRepresentedBy,
    caseWorker: extracted.caseWorker,
    landlordName: initialRecipient.landlordName,
    landlordAddress: initialRecipient.landlordAddress,
    landlordPostalCity: initialRecipient.landlordPostalCity,
    currentRent: record.calculation.currentGrossRent,
    aktuelle_miete: extracted.aktuelle_miete || record.calculation.currentGrossRent,
    brutto_miete: extracted.brutto_miete || record.calculation.currentGrossRent,
    hauptmietzins: record.calculation.hauptmietzins ?? extracted.hauptmietzins,
    betriebskosten: record.calculation.betriebskosten ?? extracted.operatingCosts ?? 0,
    umsatzsteuer: record.calculation.umsatzsteuer ?? extracted.vat ?? 0,
    sonstige_zuschlaege: record.calculation.sonstige_zuschlaege ?? 0,
    pauschalmietzins: record.calculation.pauschalmietzins ?? record.calculation.currentGrossRent,
    pauschalmiete: record.calculation.pauschalmiete ?? false,
    gesamtmiete_brutto: record.calculation.gesamtmiete_brutto ?? record.calculation.currentGrossRent,
    allowedRent: record.calculation.allowedGrossRent,
    contractArea: extracted.nutzflaeche_laut_vertrag || extracted.contractArea,
    area: extracted.nutzflaeche_nachgemessen || extracted.measuredArea,
    nutzflaeche_laut_vertrag: extracted.nutzflaeche_laut_vertrag || extracted.contractArea,
    nutzflaeche_nachgemessen: extracted.nutzflaeche_nachgemessen || extracted.measuredArea,
    category: extracted.category,
    fixedTerm: extracted.fixedTerm,
    guidelineRentPerSqm: extracted.guidelineRentPerSqm ?? 0,
    guidelineRentTotal: extracted.guidelineRentTotal ?? 0,
    operatingCostPerSqm: extracted.operatingCostPerSqm ?? 0,
    operatingCosts: extracted.operatingCosts ?? 0,
    vat: extracted.vat ?? 0,
    netRent: extracted.netRent ?? 0,
    allowedGrossRentFixedTerm: extracted.allowedGrossRentFixedTerm ?? 0,
    equipment: extracted.equipment,
    bathToiletSameRoom: extracted.bathToiletSameRoom,
    corridorKitchen: extracted.corridorKitchen,
    noiseImpact: extracted.noiseImpact,
    intercom: extracted.intercom,
    cellar: extracted.cellar,
    leaseStart: extracted.leaseStart,
    endDate: record.calculation.endDate || getTodayInputDate(),
    bereits_rueckerstattet: record.calculation.bereits_rueckerstattet ?? record.calculation.paidDeductions,
    paidDeductions: record.calculation.paidDeductions,
    vergleichsquote: record.calculation.vergleichsquote ?? Math.max(100 - record.calculation.settlementReductionPercent, 0),
    reductionPercent: record.calculation.settlementReductionPercent,
    zukunftsreduktion_prozent: record.calculation.zukunftsreduktion_prozent ?? record.calculation.settlementReductionPercent,
    zukuenftiger_mietzins: record.calculation.zukuenftiger_mietzins ?? record.calculation.futureAcceptedRent,
    manualOverrides: record.calculation.manualOverrides ?? {},
    overriddenFields: record.calculation.overriddenFields ?? [],
  });
  const [automaticCalculationData] = useState(() => createAutomaticCalculationSnapshot(data));
  const [changedCalculationFields, setChangedCalculationFields] = useState<string[]>([]);
  const [letterText, setLetterText] = useState(() =>
    "letterText" in record ? record.letterText : renderTemplateFromValues(defaultTemplate, buildLetterTemplateDataFromWizardData(data, record.calculation)),
  );
  const [letterTouched, setLetterTouched] = useState(false);
  const [activeWordTemplate, setActiveWordTemplate] = useState<StoredWordTemplate | undefined>();
  const [wordBlob, setWordBlob] = useState<Blob | null>(null);
  const [wordFileName, setWordFileName] = useState("");
  const [pdfBlob, setPdfBlob] = useState<Blob | null>(null);
  const [pdfFileName, setPdfFileName] = useState("");
  const [letterGeneratedAt, setLetterGeneratedAt] = useState("");
  const [isCreatingWord, setIsCreatingWord] = useState(false);
  const [isCreatingPdf, setIsCreatingPdf] = useState(false);
  const [notice, setNotice] = useState("");
  const [isExtracting, setIsExtracting] = useState(false);
  const [extractionCompleted, setExtractionCompleted] = useState(false);
  const [extractionError, setExtractionError] = useState("");
  const [extractionDocuments, setExtractionDocuments] = useState<DocumentExtractionResult[]>([]);
  const [extractionIssues, setExtractionIssues] = useState<ExtractionIssue[]>([]);
  const [manualReviewRequired, setManualReviewRequired] = useState(false);
  const [pendingExtractedChanges, setPendingExtractedChanges] = useState<PendingExtractedChange[]>(() => ("pendingExtractedChanges" in record ? record.pendingExtractedChanges ?? [] : []));

  const calculation = useMemo(
    () => {
      const calculationInput = buildCalculationInputFromExtracted(data);
      return calculateSettlement(calculationInput);
    },
    [data],
  );
  const calculationReport = useMemo(() => buildCalculationReport(buildCalculationInputFromExtracted(data), calculation, createExtractedDataFromWizard(data), { generatedBy: user?.name }), [calculation, data, user?.name]);

  const requiredDocumentsUploaded = Boolean(uploads.Datenblatt && uploads.Mietvertrag && uploads.Richtwert);
  const canGoNext = currentStep < steps.length - 1;
  const canGoBack = currentStep > 0;
  const canReviewExtractedData =
    !extractionCompleted ||
    (getDocumentExtraction(extractionDocuments, "Datenblatt")?.success === true && getDocumentExtraction(extractionDocuments, "Richtwert")?.success === true);
  const templateValues = useMemo(
    () => buildLetterTemplateDataFromWizardData({ ...data, pendingExtractedChanges }, calculation),
    [data, calculation, pendingExtractedChanges],
  );
  const letterAttachments = useMemo(
    () => buildLetterAttachments({ documents: uploadsToSavedDocuments(uploads, new Date().toISOString(), extractionDocuments), calculationReport, calculationReportGeneratedAt: calculationReport.generatedAt, calculationReportVersion: "4.8" }),
    [uploads, extractionDocuments, calculationReport],
  );
  const letterReview = useMemo(
    () => buildLetterReview({ letterAttachments }, templateValues, letterText),
    [letterAttachments, templateValues, letterText],
  );
  const exportPossiblyOutdated = editMode && hasOutdatedExport(record as SavedCaseRecord, documentsChanged || dataChanged);
  const hasPendingExtractedChanges = pendingExtractedChanges.some((change) => change.changed);
  const nextLetterVersion = getNextLetterVersion("generatedLetters" in record ? record.generatedLetters ?? [] : []);
  const latestSavedLetter = "generatedLetters" in record ? record.generatedLetters?.[0] : undefined;

  useEffect(() => {
    if (!letterTouched) {
      setLetterText(renderTemplateFromValues(defaultTemplate, templateValues));
    }
  }, [letterTouched, templateValues]);

  useEffect(() => {
    setActiveWordTemplate(loadActiveStoredWordTemplate());
  }, []);

  useEffect(() => {
    if (!editMode || !("generatedWord" in record)) return;

    if (record.generatedWord) {
      setWordFileName(record.generatedWord.fileName);
      fileToBlob(record.generatedWord).then((blob) => {
        if (blob) setWordBlob(blob);
      }).catch(() => undefined);
    }
    if (record.generatedPdf) {
      setPdfFileName(record.generatedPdf.fileName);
      fileToBlob(record.generatedPdf).then((blob) => {
        if (blob) setPdfBlob(blob);
      }).catch(() => undefined);
    }
  }, [editMode, record]);

  useEffect(() => {
    if (currentStep !== 1 || extractionCompleted || isExtracting) return;
    if (editMode) return;
    const hasFreshPdf = Object.values(uploads).some((upload) => upload?.file);
    if (!hasFreshPdf) return;

    void runExtraction();
  }, [currentStep, editMode, extractionCompleted, isExtracting, uploads]);

  function update<K extends keyof WizardData>(key: K, value: WizardData[K]) {
    setNotice("");
    if (editMode) setDataChanged(true);
    setData((current) => {
      if (key === "currentRent" && typeof value === "number") {
        return { ...current, currentRent: value, aktuelle_miete: value, brutto_miete: value, gesamtmiete_brutto: value, pauschalmietzins: value };
      }
      if (key === "contractArea" && typeof value === "number") {
        return { ...current, contractArea: value, nutzflaeche_laut_vertrag: value };
      }
      if (key === "area" && typeof value === "number") {
        return { ...current, area: value, nutzflaeche_nachgemessen: value };
      }

      return { ...current, [key]: value };
    });
  }

  function updateManual<K extends keyof WizardData>(key: K, value: WizardData[K]) {
    const field = String(key);
    if (key === "reductionPercent" && typeof value === "number") {
      update("vergleichsquote", Math.max(100 - value, 0));
    }
    if (key === "vergleichsquote" && typeof value === "number") {
      update("reductionPercent", Math.max(100 - value, 0));
    }
    update(key, value);
    setChangedCalculationFields((current) => Array.from(new Set([...current, field])));
    setData((current) => ({
      ...current,
      manualOverrides: { ...current.manualOverrides, [field]: value },
      overriddenFields: Array.from(new Set([...current.overriddenFields, field])),
    }));
  }

  function resetCalculationSection(section: "rent" | "refund" | "settlement") {
    const fields = getCalculationSectionFields(section);
    setData((current) => {
      const manualOverrides = { ...current.manualOverrides };
      for (const field of fields) delete manualOverrides[field];
      return {
        ...current,
        ...pickWizardFields(automaticCalculationData, fields),
        manualOverrides,
        overriddenFields: current.overriddenFields.filter((field) => !fields.includes(field as keyof WizardData)),
      };
    });
    setChangedCalculationFields((current) => Array.from(new Set([...current, ...fields])));
    if (editMode) setDataChanged(true);
  }

  async function runExtraction() {
    const readableUploads = (Object.entries(uploads) as Array<[UploadDocumentType, UploadedDocument | null]>).filter(([type, upload]) => type !== "Weitere Dokumente" && (upload?.file || upload?.dataUrl));
    const skippedLegacy = (Object.entries(uploads) as Array<[UploadDocumentType, UploadedDocument | null]>).filter(([type, upload]) => type !== "Weitere Dokumente" && upload && !upload.dataUrl).length;
    if (readableUploads.length === 0) {
      setManualReviewRequired(true);
      setNotice("Gespeicherte Dokumente enthalten nur Dateinamen. Bitte laden Sie ein PDF erneut hoch, um Daten neu auszulesen.");
      return;
    }

    setIsExtracting(true);
    setExtractionError("");
    setExtractionDocuments([]);
    setExtractionIssues([]);
    CaseService.addActivity(caseId, CaseService.buildActivity("extraction_started", "Datenextraktion gestartet", { actor: user }));

    try {
      const formData = new FormData();

      for (const [type, upload] of readableUploads) {
        if (!upload) continue;
        const filePart = upload.file ?? (upload.dataUrl ? await dataUrlToFile(upload.dataUrl, upload.fileName, upload.mimeType) : undefined);
        if (filePart) {
          formData.append(type, filePart, upload.fileName);
          const textResult = await extractPdfText(filePart);
          formData.append(`${type}__text`, textResult.text);
          formData.append(`${type}__pages`, String(textResult.pages));
        }
      }

      const response = await fetch("/api/extract", {
        method: "POST",
        body: formData,
      });
      const result = await readExtractionResponse(response);

      const documentResults = normalizeExtractionDocuments(result);

      if (!response.ok || !result.success) {
        setExtractionDocuments(documentResults);
        setExtractionIssues(result.issues ?? []);
        const extractedAt = new Date().toISOString();
        const uploadsWithExtraction = mergeExtractionIntoUploads(uploads, documentResults, extractedAt);
        setUploads(uploadsWithExtraction);
        if (editMode) persistExtractionResults(uploadsWithExtraction, extractedAt, pendingExtractedChanges);
        throw new Error(result.error || "Die Datenextraktion ist fehlgeschlagen.");
      }

      setExtractionDocuments(documentResults);
      setExtractionIssues(result.issues);
      setExtractionCompleted(true);
      const extractedAt = new Date().toISOString();
      const uploadsWithExtraction = mergeExtractionIntoUploads(uploads, documentResults, extractedAt);
      const detectedChanges = createPendingExtractedChanges(createReviewValuesFromWizard(data), result.mergedData ?? result.data ?? {}, documentResults, uploadsToSavedDocuments(uploadsWithExtraction, extractedAt, documentResults));
      const nextPendingChanges = mergePendingExtractedChanges(pendingExtractedChanges, detectedChanges);
      setUploads(uploadsWithExtraction);
      setPendingExtractedChanges(nextPendingChanges);
      CaseService.addActivity(
        caseId,
        CaseService.buildActivity("extraction_completed", "Datenextraktion abgeschlossen", {
          actor: user,
          description: "Erkannte Werte wurden zur Prüfung bereitgestellt.",
          metadata: { partial: Boolean(result.partial), warnings: result.warnings ?? [], pendingChanges: detectedChanges.length },
        }),
      );
      if (editMode) {
        persistExtractionResults(uploadsWithExtraction, extractedAt, nextPendingChanges);
        setManualReviewRequired(true);
        setNotice(`${documentResults.length} Dokument(e) erneut analysiert. ${skippedLegacy} Legacy-Dokument(e) übersprungen. ${detectedChanges.length} Änderung(en) erkannt.`);
        return;
      }

      setManualReviewRequired(detectedChanges.length > 0);
      setNotice(result.partial || (result.warnings ?? []).length > 0 ? "" : `${documentResults.length} Dokument(e) analysiert. ${detectedChanges.length} Wert(e) zur Prüfung bereitgestellt.`);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Die Datenextraktion ist fehlgeschlagen.";
      setExtractionError(message);
      setNotice("");
      CaseService.addActivity(caseId, CaseService.buildActivity("extraction_completed", "Datenextraktion fehlgeschlagen", { actor: user, description: message }));
    } finally {
      setIsExtracting(false);
    }
  }

  function persistExtractionResults(nextUploads: UploadState, updatedAt: string, pendingChanges: PendingExtractedChange[]) {
    const existing = CaseService.get(record.id);
    if (!existing) return;

    CaseService.save(
      {
        ...existing,
        updatedAt,
        updatedBy: user?.id ?? existing.updatedBy,
        lastActivity: new Intl.DateTimeFormat("de-AT", { dateStyle: "short", timeStyle: "short" }).format(new Date(updatedAt)),
        documents: uploadsToSavedDocuments(nextUploads, updatedAt),
        pendingExtractedChanges: pendingChanges,
      },
      {
        actor: user,
        skipAutoActivity: true,
      },
    );
  }

  function acceptPendingChange(change: PendingExtractedChange) {
    const nextData = applyPendingChangeToWizard(data, change);
    const nextChanges = pendingExtractedChanges.filter((item) => item.field !== change.field);
    setData(nextData);
    setPendingExtractedChanges(nextChanges);
    persistReviewState(nextData, nextChanges);
    setDataChanged(true);
    CaseService.addActivity(
      caseId,
      CaseService.buildActivity("updated", "Erkannter Wert übernommen", {
        actor: user,
        description: change.label,
        metadata: { field: change.field, previousValue: change.currentValue, newValue: change.newValue, sourceDocumentName: change.sourceDocumentName },
      }),
    );
  }

  function ignorePendingChange(change: PendingExtractedChange) {
    const nextChanges = pendingExtractedChanges.filter((item) => item.field !== change.field);
    setPendingExtractedChanges(nextChanges);
    persistReviewState(data, nextChanges);
    CaseService.addActivity(
      caseId,
      CaseService.buildActivity("note", "Erkannter Wert verworfen", {
        actor: user,
        description: change.label,
        metadata: { field: change.field, newValue: change.newValue, sourceDocumentName: change.sourceDocumentName },
      }),
    );
  }

  function acceptAllPendingChanges() {
    const nextData = pendingExtractedChanges.reduce((next, change) => applyPendingChangeToWizard(next, change), data);
    setData(nextData);
    setPendingExtractedChanges([]);
    persistReviewState(nextData, []);
    setDataChanged(true);
    CaseService.addActivity(
      caseId,
      CaseService.buildActivity("updated", "Alle erkannten Werte übernommen", {
        actor: user,
        metadata: { count: pendingExtractedChanges.length },
      }),
    );
  }

  function ignoreAllPendingChanges() {
    const count = pendingExtractedChanges.length;
    setPendingExtractedChanges([]);
    persistReviewState(data, []);
    CaseService.addActivity(
      caseId,
      CaseService.buildActivity("note", "Alle erkannten Werte verworfen", {
        actor: user,
        metadata: { count },
      }),
    );
  }

  function persistReviewState(nextData: WizardData, nextPendingChanges: PendingExtractedChange[]) {
    if (!editMode) return;
    const existing = CaseService.get(record.id);
    if (!existing) return;

    const now = new Date().toISOString();
    const nextCalculation = calculateSettlement(buildCalculationInputFromExtracted(nextData));

    CaseService.save(
      {
        ...existing,
        tenant: nextData.tenantName,
        address: nextData.tenantFullAddress || nextData.address,
        claimAmount: nextCalculation.settlementAmount,
        extracted: createExtractedDataFromWizard(nextData),
        calculation: nextCalculation,
        calculationReport: buildCalculationReport(buildCalculationInputFromExtracted(nextData), nextCalculation, createExtractedDataFromWizard(nextData), { generatedBy: user?.name }),
        calculationReportGeneratedAt: now,
        calculationReportVersion: "4.8",
        pendingExtractedChanges: nextPendingChanges,
        updatedAt: now,
        updatedBy: user?.id ?? existing.updatedBy,
        lastActivity: new Intl.DateTimeFormat("de-AT", { dateStyle: "short", timeStyle: "short" }).format(new Date(now)),
      },
      { actor: user, skipAutoActivity: true },
    );
  }

  function goNext() {
    if (currentStep === 0 && !requiredDocumentsUploaded) {
      setNotice("Bitte laden Sie Datenblatt, Mietvertrag und Richtwert hoch.");
      return;
    }
    if (currentStep === 2 && !data.recipientName.trim()) {
      setNotice("Empfänger konnte nicht eindeutig erkannt werden. Bitte prüfen.");
    }
    if (currentStep === 2 && !data.tenantPostalCode.trim()) {
      setNotice("Postleitzahl des Mieters fehlt. Bitte prüfen.");
    }
    if (canGoNext) setCurrentStep((step) => step + 1);
  }

  function goBack() {
    if (canGoBack) setCurrentStep((step) => step - 1);
  }

  async function createPdfFromWordDocument() {
    if (!activeWordTemplate?.dataUrl) {
      setNotice("Keine aktive Word-Vorlage vorhanden. Bitte laden Sie unter Vorlagen eine Vorlage hoch und setzen Sie sie als aktiv.");
      return;
    }
    if (!data.recipientName.trim()) {
      setNotice("Empfänger konnte nicht eindeutig erkannt werden. Bitte prüfen.");
      return;
    }
    if (!data.tenantPostalCode.trim()) {
      setNotice("Postleitzahl des Mieters fehlt. Bitte prüfen.");
      return;
    }

    setIsCreatingPdf(true);
    setNotice("");

    try {
      const response = await fetch("/api/letters/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          templateDataUrl: activeWordTemplate.dataUrl,
          values: toDocxTemplateData(templateValues),
          fileBaseName: `Vergleichsschreiben_${sanitizeFileName(data.tenantName)}`,
        }),
      });
      const result = (await response.json()) as GenerateLetterResponse;

      if (!response.ok) {
        throw new Error(result.error || "Word/PDF-Dokumente konnten nicht erstellt werden.");
      }

      const nextWordBlob = base64ToBlob(result.docx.base64, result.docx.mimeType);
      setWordBlob(nextWordBlob);
      setWordFileName(result.docx.fileName);
      setLetterGeneratedAt(new Date().toISOString());

      if (result.pdf) {
        setPdfBlob(base64ToBlob(result.pdf.base64, result.pdf.mimeType));
        setPdfFileName(result.pdf.fileName);
        setNotice("Word- und PDF-Dokument erfolgreich aus der Word-Vorlage erstellt.");
        return;
      }

      setPdfBlob(null);
      setPdfFileName("");
      setNotice(result.pdfError || "PDF-Service ist noch nicht konfiguriert.");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "PDF aus Word konnte nicht erstellt werden.");
    } finally {
      setIsCreatingPdf(false);
    }
  }

  async function createWordDocument() {
    if (!activeWordTemplate) {
      setNotice("Keine aktive Word-Vorlage vorhanden. Bitte laden Sie unter Vorlagen eine Vorlage hoch und setzen Sie sie als aktiv.");
      return;
    }

    setIsCreatingWord(true);
    setNotice("");

    try {
      const blob = await createDocxFromTemplate(activeWordTemplate, toDocxTemplateData(templateValues));
      const fileName = `vergleichsschreiben_${sanitizeFileName(data.tenantName)}.docx`;
      setWordBlob(blob);
      setWordFileName(fileName);
      setLetterGeneratedAt(new Date().toISOString());
      setNotice("Word-Dokument erfolgreich erstellt.");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Word-Dokument konnte nicht erstellt werden.");
    } finally {
      setIsCreatingWord(false);
    }
  }

  function downloadWordDocument() {
    if (!wordBlob || !wordFileName) return;
    downloadBlob(wordBlob, wordFileName);
  }

  function downloadPdfDocument() {
    if (!pdfBlob || !pdfFileName) return;
    downloadBlob(pdfBlob, pdfFileName);
  }

  function createEmailDraftFromLatestLetter() {
    const currentRecord = CaseService.get(record.id);
    const latestLetter = currentRecord?.generatedLetters?.[0] ?? latestSavedLetter;
    if (!currentRecord || !latestLetter) {
      setNotice("Bitte speichern oder generieren Sie zuerst eine Schreiben-Version.");
      return;
    }

    const nextRecord = createLetterEmailDraft(currentRecord, latestLetter, { actor: user });
    CaseService.save(nextRecord, { actor: user, skipAutoActivity: true });
    setNotice(`E-Mail-Entwurf fuer Schreiben Version ${latestLetter.version} wurde erstellt.`);
  }

  async function saveDraft(status: CaseStatus = editMode ? record.status : getStatusForStep(currentStep)) {
    const now = new Date().toISOString();
    const existing = CaseService.get(record.id);
    const nextStatus = editMode && documentsChanged ? "Dokumente hochgeladen" : status;
    const nextLetterVersionForStorage = getNextLetterVersion(existing?.generatedLetters ?? []);
    const generatedWord = wordBlob && wordFileName
      ? await buildStorageReadyGeneratedFile({
          caseId,
          kind: "letter",
          fileName: wordFileName,
          mimeType: wordBlob.type || "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
          blob: wordBlob,
          generatedAt: letterGeneratedAt || now,
          generatedBy: user?.name,
          ownerId: user?.id,
          letterVersion: nextLetterVersionForStorage,
        })
      : existing?.generatedWord;
    const generatedPdf = pdfBlob && pdfFileName
      ? await buildStorageReadyGeneratedFile({
          caseId,
          kind: "letter",
          fileName: pdfFileName,
          mimeType: pdfBlob.type || "application/pdf",
          blob: pdfBlob,
          generatedAt: letterGeneratedAt || now,
          generatedBy: user?.name,
          ownerId: user?.id,
          letterVersion: nextLetterVersionForStorage,
        })
      : existing?.generatedPdf;
    const documents = uploadsToSavedDocuments(uploads, now, extractionDocuments);
    const savedCase: SavedCaseRecord = {
      id: caseId,
      tenant: data.tenantName,
      address: data.tenantFullAddress || data.address,
      status: nextStatus,
      lastActivity: new Intl.DateTimeFormat("de-AT", { dateStyle: "short", timeStyle: "short" }).format(new Date()),
      claimAmount: calculation.settlementAmount,
      ownerId: record.ownerId ?? user?.id,
      ownerName: record.ownerName ?? user?.name,
      sharedWith: record.sharedWith ?? [],
      createdBy: record.createdBy ?? user?.id,
      updatedBy: user?.id,
      extracted: createExtractedDataFromWizard(data),
      calculation,
      calculationReport,
      calculationReportGeneratedAt: calculationReport.generatedAt,
      calculationReportVersion: "4.8",
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
      documents,
      generatedWord,
      generatedPdf,
      generatedLetters: existing?.generatedLetters ?? [],
      letterAttachments: buildLetterAttachments({
        documents,
        calculationReport: calculationReport,
        calculationReportGeneratedAt: calculationReport.generatedAt,
        calculationReportVersion: "4.8",
      }),
      letterReview,
      letterText,
      pendingExtractedChanges,
    };

    const changedCalculationCount = new Set(changedCalculationFields).size;
    const shouldMarkLettersOutdated = hasLetterOutdatedReason({
      calculationChanged: changedCalculationCount > 0,
      documentsChanged,
      dataChanged,
      hasPendingChanges: hasPendingExtractedChanges,
    });
    const letterVersionCreated = Boolean(letterGeneratedAt && (generatedWord || generatedPdf));
    const recordWithLetterState = letterVersionCreated
      ? appendGeneratedLetterVersion(
          savedCase,
          createGeneratedLetterVersion({
            record: savedCase,
            createdAt: letterGeneratedAt || now,
            createdBy: user?.name,
            template: activeWordTemplate,
            letterText,
            docx: generatedWord,
            pdf: generatedPdf,
            attachments: savedCase.letterAttachments,
            review: letterReview,
            placeholdersUsed: Object.keys(templateValues),
            warnings: calculation.calculationWarnings,
            calculationReportAttached: Boolean(calculationReport),
          }),
        )
      : shouldMarkLettersOutdated
        ? markOutdatedGeneratedLetters(savedCase, "Falldaten oder Berechnung wurden geändert")
        : savedCase;
    const activity = editMode
      ? [
          CaseService.buildActivity("updated", "Fall bearbeitet", { actor: user }),
          ...(changedCalculationCount > 0
            ? [CaseService.buildActivity("calculation_updated", "Berechnung aktualisiert", { actor: user, description: `${changedCalculationCount} Feld(er) geändert`, metadata: { changedFields: Array.from(new Set(changedCalculationFields)) } })]
            : []),
          ...(letterVersionCreated
            ? [
                CaseService.buildActivity("letter_generated", `Schreiben Version ${getNextLetterVersion(savedCase.generatedLetters)} erstellt`, { actor: user, metadata: { version: getNextLetterVersion(savedCase.generatedLetters), fileName: generatedWord?.fileName, reviewStatus: letterReview.status } }),
                ...((letterReview.warnings?.length ?? 0) > 0 ? [CaseService.buildActivity("letter_generated", "Schreiben mit Warnungen generiert", { actor: user, description: letterReview.warnings?.join("; ") })] : []),
                ...((letterReview.unresolvedPlaceholders?.length ?? 0) > 0 ? [CaseService.buildActivity("letter_generated", "Nicht ersetzte Platzhalter erkannt", { actor: user, description: letterReview.unresolvedPlaceholders?.join(", ") })] : []),
              ]
            : shouldMarkLettersOutdated
              ? [CaseService.buildActivity("letter_generated", "Schreiben als veraltet markiert", { actor: user, description: "Dieses Schreiben basiert auf älteren Berechnungs-/Falldaten." })]
              : []),
        ]
      : letterVersionCreated
        ? [
            CaseService.buildActivity("letter_generated", `Schreiben Version ${getNextLetterVersion(savedCase.generatedLetters)} erstellt`, { actor: user, metadata: { version: getNextLetterVersion(savedCase.generatedLetters), fileName: generatedWord?.fileName, reviewStatus: letterReview.status } }),
            ...((letterReview.warnings?.length ?? 0) > 0 ? [CaseService.buildActivity("letter_generated", "Schreiben mit Warnungen generiert", { actor: user, description: letterReview.warnings?.join("; ") })] : []),
            ...((letterReview.unresolvedPlaceholders?.length ?? 0) > 0 ? [CaseService.buildActivity("letter_generated", "Nicht ersetzte Platzhalter erkannt", { actor: user, description: letterReview.unresolvedPlaceholders?.join(", ") })] : []),
          ]
        : undefined;

    CaseService.save(recordWithLetterState, {
      actor: user,
      activity,
      skipAutoActivity: editMode && (changedCalculationCount > 0 || letterVersionCreated || shouldMarkLettersOutdated),
    });
    setDocumentsChanged(false);
    setDataChanged(false);
    setChangedCalculationFields([]);
    setLetterGeneratedAt("");
    setNotice(editMode ? "Änderungen wurden gespeichert." : "Fall wurde gespeichert.");
  }

  function closeCase() {
    void saveDraft("Abgeschlossen");
  }

  return (
    <div className="space-y-6">
      <WizardProgress currentStep={currentStep} />

      <Card>
        <CardContent className="p-6 md:p-8">
          {editMode && (
            <div className="mb-5 rounded-lg border border-blue-400/20 bg-blue-500/10 p-4 text-sm leading-6 text-blue-100">
              <div className="font-extrabold">Edit-Modus aktiv</div>
              <div>Gespeicherte Falldaten, Dokumentnamen, Freigaben und Exportdateien werden weitergeführt. Neue Extraktion überschreibt manuell geprüfte Daten nicht automatisch.</div>
            </div>
          )}
          {exportPossiblyOutdated && (
            <div className="mb-5 rounded-lg border border-amber-400/30 bg-amber-500/10 p-4 text-sm font-semibold leading-6 text-amber-900">
              Export wurde vor den letzten Änderungen erstellt. Bitte neu generieren.
            </div>
          )}
          {hasPendingExtractedChanges && (
            <div className="mb-5 rounded-lg border border-amber-400/30 bg-amber-500/10 p-4 text-sm font-semibold leading-6 text-amber-900">
              Es gibt ungeprüfte erkannte Änderungen. Bitte im Prüfschritt übernehmen oder ignorieren.
            </div>
          )}
          <div className="mb-7 flex flex-wrap items-start justify-between gap-4">
            <div>
              <div className="text-sm font-bold uppercase tracking-wide text-gold-500">Schritt {currentStep + 1} von {steps.length}</div>
              <h2 className="mt-1 text-2xl font-extrabold text-navy-950">{steps[currentStep]}</h2>
            </div>
            {notice && <div className="rounded-md bg-emerald-50 px-3 py-2 text-sm font-semibold text-emerald-700">{notice}</div>}
          </div>

          {currentStep === 0 && <DocumentsStep uploads={uploads} setUploads={setUploads} caseId={caseId} ownerId={user?.id} editMode={editMode} pendingExtractedChanges={pendingExtractedChanges} onFilesChanged={() => {
            setExtractionCompleted(false);
            setDocumentsChanged(true);
            setManualReviewRequired(false);
          }} />}
          {currentStep === 1 && <ExtractionStep uploads={uploads} documents={extractionDocuments} isExtracting={isExtracting} error={extractionError} editMode={editMode} manualReviewRequired={manualReviewRequired} onRunExtraction={() => void runExtraction()} />}
          {currentStep === 2 && (
            <ReviewDataStep
              data={data}
              update={update}
              extractionIssues={extractionIssues}
              pendingExtractedChanges={pendingExtractedChanges}
              onAcceptChange={acceptPendingChange}
              onIgnoreChange={ignorePendingChange}
              onAcceptAll={acceptAllPendingChanges}
              onIgnoreAll={ignoreAllPendingChanges}
            />
          )}
          {currentStep === 3 && <CalculationStep data={data} update={updateManual} calculation={calculation} report={calculationReport} onResetSection={resetCalculationSection} />}
          {currentStep === 4 && (
            <LetterStep
              letterText={letterText}
              recipientMissing={!data.recipientName.trim()}
              tenantPostalCodeMissing={!data.tenantPostalCode.trim()}
              activeTemplate={activeWordTemplate}
              nextVersion={nextLetterVersion}
              review={letterReview}
              attachments={letterAttachments}
              missingTemplatePlaceholders={getMissingTemplatePlaceholders(activeWordTemplate)}
              emptyDataWarnings={getEmptyDataWarnings(templateValues)}
              isCreatingWord={isCreatingWord}
              isCreatingPdf={isCreatingPdf}
              wordReady={Boolean(wordBlob)}
              pdfReady={Boolean(pdfBlob)}
              onCreateWord={createWordDocument}
              onCreatePdf={createPdfFromWordDocument}
              onDownloadWord={downloadWordDocument}
              onDownloadPdf={downloadPdfDocument}
              latestLetter={latestSavedLetter}
              onCreateEmailDraft={createEmailDraftFromLatestLetter}
              setLetterText={(value) => {
                setLetterTouched(true);
                setLetterText(value);
              }}
              onRegenerate={() => {
                setLetterTouched(false);
                setLetterText(renderTemplateFromValues(defaultTemplate, templateValues));
                setNotice("Schreiben wurde mit den aktuellen Werten aktualisiert.");
              }}
            />
          )}
          {currentStep === 5 && (
            <ExportStep
              recordId={caseId}
              tenantName={data.tenantName}
              recipientMissing={!data.recipientName.trim()}
              tenantPostalCodeMissing={!data.tenantPostalCode.trim()}
              wordReady={Boolean(wordBlob)}
              pdfReady={Boolean(pdfBlob)}
              isCreatingPdf={isCreatingPdf}
              editMode={editMode}
              hasPendingExtractedChanges={hasPendingExtractedChanges}
              review={letterReview}
              onCreatePdf={createPdfFromWordDocument}
              onDownloadWord={downloadWordDocument}
              onDownloadPdf={downloadPdfDocument}
              onSave={() => void saveDraft()}
              onClose={closeCase}
            />
          )}
        </CardContent>
      </Card>

      <div className="flex flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-between">
        <Button variant="secondary" onClick={goBack} disabled={!canGoBack}>
          <ArrowLeft size={16} />
          Zurück
        </Button>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          {editMode && (
            <Button variant="secondary" onClick={() => void saveDraft()}>
              <Save size={16} />
              Änderungen speichern
            </Button>
          )}
          {canGoNext ? (
            <Button onClick={goNext} disabled={(currentStep === 0 && !requiredDocumentsUploaded) || (currentStep === 1 && (isExtracting || !canReviewExtractedData))}>
              {currentStep === 1 ? "Daten prüfen" : "Weiter"}
              <ArrowRight size={16} />
            </Button>
          ) : (
            <Button onClick={closeCase}>
              <CheckCircle2 size={16} />
              Fall abschließen
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

function WizardProgress({ currentStep }: { currentStep: number }) {
  return (
    <Card>
      <CardContent className="p-4 md:p-5">
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
          {steps.map((step, index) => {
            const done = index < currentStep;
            const active = index === currentStep;

            return (
              <div key={step} className="min-w-0">
                <div className="mb-2 h-1.5 overflow-hidden rounded-full bg-slate-100">
                  <div className={done || active ? "h-full rounded-full bg-blue-700" : "h-full w-0"} />
                </div>
                <div className="flex items-center gap-2">
                  <span
                    className={
                      done
                        ? "grid h-8 w-8 shrink-0 place-items-center rounded-full bg-emerald-600 text-white"
                        : active
                          ? "grid h-8 w-8 shrink-0 place-items-center rounded-full bg-blue-700 text-sm font-bold text-white"
                          : "grid h-8 w-8 shrink-0 place-items-center rounded-full bg-slate-100 text-sm font-bold text-slate-500"
                    }
                  >
                    {done ? <Check size={16} /> : index + 1}
                  </span>
                  <span className={active ? "truncate text-sm font-extrabold text-navy-950" : "truncate text-sm font-semibold text-slate-500"}>{step}</span>
                </div>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}

function BaseDataStep({ data, update }: { data: WizardData; update: <K extends keyof WizardData>(key: K, value: WizardData[K]) => void }) {
  return (
    <div className="grid gap-5 lg:grid-cols-[1fr_340px]">
      <div className="grid gap-4 md:grid-cols-2">
        <TextField label="Mietername" value={data.tenantName} onChange={(value) => update("tenantName", value)} />
        <TextField label="Telefonnummer" value={data.phone} onChange={(value) => update("phone", value)} />
        <TextField className="md:col-span-2" label="Wohnungsadresse" value={data.address} onChange={(value) => update("address", value)} />
        <TextField label="Mietbeginn" type="date" value={data.leaseStart} onChange={(value) => update("leaseStart", value)} />
        <NumberField label="Aktuelle Bruttomiete" value={data.currentRent} onChange={(value) => update("currentRent", value)} />
      </div>
      <div className="rounded-lg border border-gold-400/30 bg-gold-400/10 p-5">
        <div className="mb-3 grid h-11 w-11 place-items-center rounded-lg bg-white text-gold-500">
          <FileCheck2 size={22} />
        </div>
        <h3 className="font-extrabold text-navy-950">Interne Prüfung</h3>
        <p className="mt-2 text-sm leading-6 text-slate-600">
          Der Wizard unterstützt die Berechnung und Dokumentenerstellung. Vor dem PDF-Export bleiben alle Werte manuell prüfbar.
        </p>
      </div>
    </div>
  );
}

function DocumentsStep({
  uploads,
  setUploads,
  caseId,
  ownerId,
  onFilesChanged,
  editMode,
  pendingExtractedChanges,
}: {
  uploads: UploadState;
  setUploads: (value: UploadState | ((current: UploadState) => UploadState)) => void;
  caseId: string;
  ownerId?: string;
  onFilesChanged: () => void;
  editMode: boolean;
  pendingExtractedChanges: PendingExtractedChange[];
}) {
  const uploadCards = [
    { title: "Datenblatt" as const, description: "Mieter- und Objektdaten", tone: "text-blue-700", required: true },
    { title: "Mietvertrag" as const, description: "Mietbeginn, Parteien, Kaution", tone: "text-red-600", required: true },
    { title: "Richtwert" as const, description: "Kategorie, Richtwertzins, Abschläge", tone: "text-emerald-700", required: true },
    { title: "Gutachten" as const, description: "Optionales Zusatzdokument", tone: "text-amber-700", required: false },
    { title: "Weitere Dokumente" as const, description: "Optionaler Nachtrag oder Korrespondenz", tone: "text-violet-700", required: false },
  ];
  const ready = Boolean(uploads.Datenblatt && uploads.Mietvertrag && uploads.Richtwert);

  return (
    <div className="space-y-5">
      <div className={ready ? "rounded-md bg-emerald-50 px-3 py-2 text-sm font-semibold text-emerald-700" : "rounded-md bg-amber-50 px-3 py-2 text-sm font-semibold text-amber-800"}>
        {ready ? "Alle erforderlichen Dokumente sind hochgeladen." : "Datenblatt, Mietvertrag und Richtwert sind erforderlich. Gutachten und weitere Dokumente sind optional."}
      </div>
      {editMode && (
        <div className="rounded-md bg-blue-50 px-3 py-2 text-sm font-semibold leading-6 text-blue-900">
          Pflichtdokumente können ersetzt, aber nicht gelöscht werden. Neue Uploads markieren den Export als möglicherweise veraltet.
        </div>
      )}
      <div className="rounded-md bg-slate-50 px-3 py-2 text-xs font-semibold leading-5 text-slate-500">
        MVP-Hinweis: Dokumente werden aktuell lokal im Browser gespeichert. Große Dateien können den Speicher belasten.
      </div>
      <div className="grid gap-5 lg:grid-cols-5">
        {uploadCards.map((card) => (
          <UploadCard
            key={card.title}
            {...card}
            upload={uploads[card.title]}
            hasPendingChanges={pendingExtractedChanges.some((change) => change.sourceDocumentType === card.title)}
            onUpload={async (file) => {
              onFilesChanged();
              const document = await createUploadedDocument(file, card.title, caseId, ownerId);
              setUploads((current) => ({ ...current, [card.title]: document }));
            }}
            onRemove={
              !card.required && uploads[card.title]
                ? () => {
                    onFilesChanged();
                    setUploads((current) => ({ ...current, [card.title]: null }));
                  }
                : undefined
            }
          />
        ))}
      </div>
    </div>
  );
}

function UploadCard({
  title,
  description,
  tone,
  required,
  upload,
  hasPendingChanges,
  onUpload,
  onRemove,
}: {
  title: keyof UploadState;
  description: string;
  tone: string;
  required: boolean;
  upload: UploadedDocument | null;
  hasPendingChanges: boolean;
  onUpload: (file: File) => void | Promise<void>;
  onRemove?: () => void;
}) {
  const [dragging, setDragging] = useState(false);

  function handleDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setDragging(false);
    const file = event.dataTransfer.files?.[0];
    if (file) void onUpload(file);
  }

  return (
    <div
      onDragOver={(event) => {
        event.preventDefault();
        setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={handleDrop}
      className={
        dragging
          ? "flex min-h-[280px] cursor-pointer flex-col rounded-lg border-2 border-blue-600 bg-blue-50 p-6 transition"
          : "flex min-h-[280px] cursor-pointer flex-col rounded-lg border border-slate-200 bg-white p-6 transition hover:border-blue-200 hover:bg-blue-50/30"
      }
    >
      <div className="flex items-start justify-between gap-3">
        <div className={`grid h-12 w-12 place-items-center rounded-lg bg-slate-50 ${tone}`}>
          <FileText size={25} />
        </div>
        {upload && (
          <span className="inline-flex items-center gap-1 rounded-md bg-emerald-50 px-2 py-1 text-xs font-bold text-emerald-700">
            <CheckCircle2 size={14} />
            Hochgeladen
          </span>
        )}
      </div>
      <div className="mt-6">
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="text-lg font-extrabold text-navy-950">{title}</h3>
          <span className={required ? "rounded-md bg-blue-50 px-2 py-1 text-xs font-bold text-blue-700" : "rounded-md bg-slate-100 px-2 py-1 text-xs font-bold text-slate-600"}>
            {required ? "Erforderlich" : "Optional"}
          </span>
        </div>
        <p className="mt-1 text-sm text-slate-500">{description}</p>
      </div>
      <div className="mt-auto rounded-lg border border-dashed border-slate-300 bg-slate-50 p-5 text-center">
        <UploadCloud className="mx-auto text-slate-400" size={30} />
        <div className="mt-2 text-sm font-bold text-navy-900">{upload?.fileName ?? "Datei hier ablegen"}</div>
        <div className="mt-1 text-xs text-slate-500">{upload?.uploadedAt ? `Upload: ${formatWizardDate(upload.uploadedAt)}` : upload ? "Upload-Datum nicht gespeichert" : "PDF auswählen"}</div>
        {required && !upload && (
          <div className="mt-2 rounded-md bg-red-50 px-2 py-1 text-xs font-bold text-red-700">Pflichtdokument fehlt</div>
        )}
        {upload && !upload.dataUrl && (
          <div className="mt-2 rounded-md bg-amber-50 px-2 py-1 text-xs font-bold text-amber-800">Legacy: Dateiinhalt nicht gespeichert</div>
        )}
        {upload?.size && upload.size > largeLocalDocumentBytes && (
          <div className="mt-2 rounded-md bg-amber-50 px-2 py-1 text-xs font-bold text-amber-800">Große Datei - lokale Speicherung kann langsam sein.</div>
        )}
        {upload?.extractionWarnings?.some((warning) => /ocr\s+wurde\s+verwendet/i.test(warning)) && (
          <div className="mt-2 rounded-md bg-amber-50 px-2 py-1 text-xs font-bold text-amber-800">OCR verwendet, bitte prüfen</div>
        )}
        {hasPendingChanges && (
          <div className="mt-2 rounded-md bg-blue-50 px-2 py-1 text-xs font-bold text-blue-800">Neue erkannte Werte prüfen</div>
        )}
      </div>
      <div className="mt-4 grid gap-2">
        <label className="inline-flex h-9 cursor-pointer items-center justify-center gap-2 rounded-md bg-blue-700 px-3 text-xs font-bold text-white transition hover:bg-blue-800">
          <UploadCloud size={14} />
          {upload ? "Ersetzen" : "PDF hochladen"}
          <input
            className="sr-only"
            type="file"
            accept=".pdf,application/pdf"
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) void onUpload(file);
              event.currentTarget.value = "";
            }}
          />
        </label>
        {!required && (
          <label className="inline-flex h-9 cursor-pointer items-center justify-center gap-2 rounded-md border border-slate-200 px-3 text-xs font-bold text-slate-700 transition hover:bg-slate-50">
            <PlusCircle size={14} />
            Zusätzliches Dokument hinzufügen
            <input
              className="sr-only"
              type="file"
              accept=".pdf,application/pdf"
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) void onUpload(file);
                event.currentTarget.value = "";
              }}
            />
          </label>
        )}
        {onRemove && (
          <button type="button" onClick={onRemove} className="inline-flex h-9 items-center justify-center gap-2 rounded-md border border-red-200 px-3 text-xs font-bold text-red-700 transition hover:bg-red-50">
            <Trash2 size={14} />
            Entfernen
          </button>
        )}
      </div>
    </div>
  );
}

function ExtractionStep({
  uploads,
  documents: extractionDocuments,
  isExtracting,
  error,
  editMode,
  manualReviewRequired,
  onRunExtraction,
}: {
  uploads: UploadState;
  documents: DocumentExtractionResult[];
  isExtracting: boolean;
  error: string;
  editMode: boolean;
  manualReviewRequired: boolean;
  onRunExtraction: () => void;
}) {
  const documentCards: Array<{ title: keyof UploadState; description: string; required: boolean }> = [
    { title: "Datenblatt", description: "Antragsgegner, Vertretung, Mieter, Adresse und Sachbearbeiter", required: true },
    { title: "Mietvertrag", description: "Vermieter, vertreten durch, Mietobjekt-Adresse, Mieter und Mietbeginn", required: true },
    { title: "Richtwert", description: "Anschrift, Bezirk/PLZ/Ort, Kategorie und Richtwerte", required: true },
    { title: "Gutachten", description: "Optionale Zusatzinformationen zur Wohnung", required: false },
    { title: "Weitere Dokumente", description: "Optionale Zusatzdokumente werden gelistet, aber nicht automatisch interpretiert", required: false },
  ];

  return (
    <div className="space-y-5">
      <div className="rounded-lg border border-blue-100 bg-blue-50 p-5">
        <div className="flex items-start gap-3">
          <div className="grid h-11 w-11 shrink-0 place-items-center rounded-lg bg-white text-blue-700">
            <FileCheck2 size={22} />
          </div>
          <div>
            <h3 className="font-extrabold text-navy-950">Datenextraktion</h3>
            <p className="mt-1 text-sm leading-6 text-slate-600">
              {editMode
                ? "Die App kann vorhandene und neue Dokumente erneut auslesen. Bestehende manuell geprüfte Daten werden dabei nicht automatisch überschrieben."
                : "Die App liest die hochgeladenen Dokumente aus und übernimmt erkannte Daten zur Prüfung."}
            </p>
            {editMode && (
              <Button type="button" className="mt-4" onClick={onRunExtraction} disabled={isExtracting}>
                <RefreshCcw size={16} />
                {isExtracting ? "Wird ausgelesen..." : "Daten aus Dokumenten neu auslesen"}
              </Button>
            )}
          </div>
        </div>
      </div>

      {manualReviewRequired && (
	        <div className="rounded-md bg-amber-50 px-3 py-2 text-sm font-semibold leading-6 text-amber-800">
	          Bestehende Daten wurden nicht automatisch überschrieben. Bitte prüfen.
	        </div>
	      )}

      {error && (
        <div className="rounded-md bg-red-50 px-3 py-2 text-sm font-semibold text-red-700">
          {error} Sie können die Daten trotzdem manuell eintragen.
        </div>
      )}

      <div className="grid gap-4 md:grid-cols-2">
        {documentCards.map((document) => {
	          const uploaded = Boolean(uploads[document.title]);
	          const upload = uploads[document.title];
	          const result = getDocumentExtraction(extractionDocuments, document.title);
	          const textLength = result?.extractedTextLength ?? upload?.extractedTextLength ?? 0;
	          const fieldCount = countExtractedFields(result?.data ?? upload?.extractedFields);
	          const warnings = getExtractionWarnings(upload, result);
	          const status = result?.status ?? (uploaded && isExtracting ? "Wird analysiert" : document.required ? "Prüfung erforderlich" : "Optional / nicht hochgeladen");
          const statusClass =
            status === "Daten erkannt"
              ? "bg-emerald-50 text-emerald-700"
              : status === "Text erkannt"
                ? "bg-blue-50 text-blue-700"
                : status === "Wird analysiert"
                  ? "bg-slate-100 text-slate-700"
                  : status === "OCR erforderlich"
                    ? "bg-amber-50 text-amber-800"
                    : status === "Prüfung erforderlich"
                ? "bg-amber-50 text-amber-800"
                : "bg-slate-100 text-slate-600";
          const warningClass = result?.requiresOCR ? "mt-2 rounded-md bg-amber-50 px-2 py-1 text-xs font-bold text-amber-800" : "mt-2 text-xs font-bold text-amber-700";

          return (
            <div key={document.title} className="rounded-lg border border-slate-200 bg-white p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
	                  <div className="font-extrabold text-navy-950">{document.title}</div>
	                  <div className="mt-1 text-sm text-slate-500">{document.description}</div>
	                  <div className="mt-2 text-xs font-semibold text-slate-500">{upload?.fileName ?? "Keine Datei hochgeladen"}</div>
	                  {result?.message && <div className={warningClass}>{result.message}</div>}
	                  {upload && !upload.dataUrl && <div className="mt-2 rounded-md bg-amber-50 px-2 py-1 text-xs font-bold text-amber-800">Dateiinhalt nicht gespeichert - erneute Analyse nicht möglich</div>}
	                  <div className="mt-3 grid gap-1 text-xs font-semibold text-slate-500">
	                    <div>{textLength > 0 ? `${textLength.toLocaleString("de-AT")} Zeichen Text erkannt` : "Keine Textlänge gespeichert"}</div>
	                    <div>{fieldCount > 0 ? `${fieldCount.toLocaleString("de-AT")} Feld(er) erkannt` : "Keine Felder gespeichert"}</div>
	                    {(result?.requiresOCR || warnings.some((warning) => /ocr/i.test(warning))) && <div className="font-bold text-amber-700">OCR erforderlich</div>}
	                  </div>
	                  {warnings.length > 0 && (
	                    <div className="mt-2 grid gap-1">
	                      {warnings.slice(0, 3).map((warning) => (
	                        <div key={warning} className="rounded-md bg-amber-50 px-2 py-1 text-xs font-bold text-amber-800">{warning}</div>
	                      ))}
	                    </div>
	                  )}
	                </div>
                <span className={`rounded-md px-2.5 py-1 text-xs font-extrabold ${statusClass}`}>{status}</span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function ReviewDataStep({
  data,
  update,
  extractionIssues,
  pendingExtractedChanges,
  onAcceptChange,
  onIgnoreChange,
  onAcceptAll,
  onIgnoreAll,
}: {
  data: WizardData;
  update: <K extends keyof WizardData>(key: K, value: WizardData[K]) => void;
  extractionIssues: ExtractionIssue[];
  pendingExtractedChanges: PendingExtractedChange[];
  onAcceptChange: (change: PendingExtractedChange) => void;
  onIgnoreChange: (change: PendingExtractedChange) => void;
  onAcceptAll: () => void;
  onIgnoreAll: () => void;
}) {
  const recipientMissing = !data.recipientName.trim();
  const recipientAddressMissing = Boolean(data.recipientName.trim()) && (!data.recipientAddress.trim() || !data.recipientPostalCity.trim());
  const recipientDiffersFromLandlord =
    Boolean(data.landlordName.trim()) && data.recipientName.trim() !== data.landlordName.trim();

  return (
    <div className="space-y-7">
      {extractionIssues.length > 0 && (
        <div className="rounded-md bg-amber-50 px-3 py-2 text-sm font-semibold text-amber-800">
          {extractionIssues.length} Feld(er) konnten nicht sicher erkannt werden. Bitte prüfen.
        </div>
      )}

      {pendingExtractedChanges.length > 0 && (
        <PendingExtractedChangesPanel
          changes={pendingExtractedChanges}
          onAcceptChange={onAcceptChange}
          onIgnoreChange={onIgnoreChange}
          onAcceptAll={onAcceptAll}
          onIgnoreAll={onIgnoreAll}
        />
      )}

      <section>
        <h3 className="mb-3 text-lg font-extrabold text-navy-950">Mieterdaten</h3>
        <div className="grid gap-4 md:grid-cols-2">
          <TextField label="Mietername" value={data.tenantName} onChange={(value) => update("tenantName", value)} />
          <TextField label="Telefonnummer" value={data.phone} onChange={(value) => update("phone", value)} />
          <TextField label="Straße/Hausnummer" value={data.tenantStreet} onChange={(value) => update("tenantStreet", value)} />
          <TextField label="Tür" value={data.tenantDoor} onChange={(value) => update("tenantDoor", value)} />
          <TextField label="PLZ" value={data.tenantPostalCode} onChange={(value) => update("tenantPostalCode", value)} />
          <TextField label="Ort" value={data.tenantCity} onChange={(value) => update("tenantCity", value)} />
          <TextField className="md:col-span-2" label="Vollständige Wohnungsadresse" value={data.tenantFullAddress} onChange={(value) => update("tenantFullAddress", value)} />
          <TextField label="Mietbeginn" type="date" value={data.leaseStart} onChange={(value) => update("leaseStart", value)} />
          <NumberField label="Aktuelle Bruttomiete" value={data.currentRent} onChange={(value) => update("currentRent", value)} />
          {!data.tenantPostalCode.trim() && (
            <div className="rounded-md bg-amber-50 px-3 py-2 text-sm font-semibold text-amber-800 md:col-span-2">
              Postleitzahl des Mieters fehlt. Bitte prüfen.
            </div>
          )}
        </div>
      </section>

      <section>
        <h3 className="mb-3 text-lg font-extrabold text-navy-950">Empfänger/Vermieter</h3>
        {recipientMissing && (
          <div className="mb-4 rounded-md bg-amber-50 px-3 py-2 text-sm font-semibold text-amber-800">
            Empfänger konnte nicht eindeutig erkannt werden. Bitte prüfen.
          </div>
        )}
        {recipientDiffersFromLandlord && (
          <div className="mb-4 rounded-md bg-amber-50 px-3 py-2 text-sm font-semibold text-amber-800">
            Empfänger weicht vom Vermieter laut Mietvertrag ab. Bitte prüfen.
          </div>
        )}
        {recipientAddressMissing && (
          <div className="mb-4 rounded-md bg-amber-50 px-3 py-2 text-sm font-semibold text-amber-800">
            Empfängeradresse konnte nicht sicher erkannt werden. Bitte prüfen.
          </div>
        )}
        <div className="grid gap-4 md:grid-cols-2">
          <TextField label="Empfänger des Schreibens" value={data.recipientName} onChange={(value) => update("recipientName", value)} />
          <TextField label="Empfängeradresse" value={data.recipientAddress} onChange={(value) => update("recipientAddress", value)} />
          <TextField label="PLZ/Ort" value={data.recipientPostalCity} onChange={(value) => update("recipientPostalCity", value)} />
          <TextField label="Vermieter laut Mietvertrag" value={data.landlordName} onChange={(value) => update("landlordName", value)} />
          <TextField label="Vermieteradresse laut Mietvertrag" value={data.landlordAddress} onChange={(value) => update("landlordAddress", value)} />
          <TextField label="Vermieter PLZ/Ort laut Mietvertrag" value={data.landlordPostalCity} onChange={(value) => update("landlordPostalCity", value)} />
          <TextField label="Antragsgegner laut Datenblatt" value={data.opposingParty} onChange={(value) => update("opposingParty", value)} />
          <TextField label="Vertretung / Hausverwaltung" value={data.representation} onChange={(value) => update("representation", value)} />
        </div>
        <p className="mt-3 rounded-md bg-blue-50 px-3 py-2 text-sm font-semibold text-blue-900">
          Der Empfänger wird standardmäßig aus dem Vermieter laut Mietvertrag gebildet. Der Antragsgegner wird nur als Fallback verwendet; die Vertretung nie.
        </p>
      </section>

      <section>
        <h3 className="mb-3 text-lg font-extrabold text-navy-950">Wohnungsdaten</h3>
        <div className="grid gap-4 md:grid-cols-2">
          <NumberField label="Nutzfläche laut Vertrag" value={data.contractArea} onChange={(value) => update("contractArea", value)} />
          <NumberField label="Nutzfläche nachgemessen" value={data.area} onChange={(value) => update("area", value)} />
          <NumberField label="Erlaubte Miete" value={data.allowedRent} onChange={(value) => update("allowedRent", value)} />
          <TextField label="Kategorie" value={data.category} onChange={(value) => update("category", value)} />
          <NumberField label="Richtwertzins pro m²" value={data.guidelineRentPerSqm} onChange={(value) => update("guidelineRentPerSqm", value)} />
          <TextField className="md:col-span-2" label="Ausstattung" value={data.equipment} onChange={(value) => update("equipment", value)} />
          <CheckboxField label="Befristung" checked={data.fixedTerm} onChange={(value) => update("fixedTerm", value)} />
          <CheckboxField label="Bad/WC ein Raum" checked={data.bathToiletSameRoom} onChange={(value) => update("bathToiletSameRoom", value)} />
          <CheckboxField label="Gangküche" checked={data.corridorKitchen} onChange={(value) => update("corridorKitchen", value)} />
          <CheckboxField label="Lärmbeeinträchtigung" checked={data.noiseImpact} onChange={(value) => update("noiseImpact", value)} />
          <CheckboxField label="Gegensprechanlage" checked={data.intercom} onChange={(value) => update("intercom", value)} />
          <CheckboxField label="Kellerabteil" checked={data.cellar} onChange={(value) => update("cellar", value)} />
        </div>
      </section>
    </div>
  );
}

function PendingExtractedChangesPanel({
  changes,
  onAcceptChange,
  onIgnoreChange,
  onAcceptAll,
  onIgnoreAll,
}: {
  changes: PendingExtractedChange[];
  onAcceptChange: (change: PendingExtractedChange) => void;
  onIgnoreChange: (change: PendingExtractedChange) => void;
  onAcceptAll: () => void;
  onIgnoreAll: () => void;
}) {
  return (
    <section className="rounded-lg border border-amber-200 bg-amber-50 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-lg font-extrabold text-navy-950">Neu erkannte Werte prüfen</h3>
          <p className="mt-1 text-sm font-semibold text-amber-800">Bestehende Werte werden nicht automatisch überschrieben.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button type="button" onClick={onAcceptAll} className="h-9 px-3 text-xs">
            <Check size={14} />
            Alle übernehmen
          </Button>
          <Button type="button" variant="secondary" onClick={onIgnoreAll} className="h-9 px-3 text-xs">
            Alle ignorieren
          </Button>
        </div>
      </div>
      <div className="mt-4 overflow-x-auto rounded-md border border-amber-200 bg-white">
        <table className="min-w-full divide-y divide-slate-200 text-sm">
          <thead className="bg-slate-50 text-left text-xs font-extrabold uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-3 py-2">Feld</th>
              <th className="px-3 py-2">Aktueller Wert</th>
              <th className="px-3 py-2">Neuer Wert</th>
              <th className="px-3 py-2">Dokument</th>
              <th className="px-3 py-2 text-right">Aktion</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {changes.map((change) => (
              <tr key={change.field}>
                <td className="px-3 py-3 font-extrabold text-navy-950">{change.label}</td>
                <td className={`px-3 py-3 font-semibold ${isEmptyReviewValue(change.currentValue) ? "text-amber-700" : "text-slate-600"}`}>
                  {formatReviewValue(change.currentValue) || "Leer"}
                </td>
                <td className="px-3 py-3 font-extrabold text-emerald-700">{formatReviewValue(change.newValue)}</td>
                <td className="px-3 py-3 text-slate-500">
                  {[change.sourceDocumentType, change.sourceDocumentName].filter(Boolean).join(" · ") || "Extraktion"}
                </td>
                <td className="px-3 py-3">
                  <div className="flex justify-end gap-2">
                    <Button type="button" onClick={() => onAcceptChange(change)} className="h-8 px-2 text-xs">
                      Übernehmen
                    </Button>
                    <Button type="button" variant="secondary" onClick={() => onIgnoreChange(change)} className="h-8 px-2 text-xs">
                      Behalten
                    </Button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function CalculationStep({
  data,
  update,
  calculation,
  report,
  onResetSection,
}: {
  data: WizardData;
  update: <K extends keyof WizardData>(key: K, value: WizardData[K]) => void;
  calculation: ReturnType<typeof calculateSettlement>;
  report: ReturnType<typeof buildCalculationReport>;
  onResetSection: (section: "rent" | "refund" | "settlement") => void;
}) {
  const rentValuesMissing = (parseEuroValue(data.currentRent) ?? 0) <= 0 || (parseEuroValue(data.allowedRent) ?? 0) <= 0;
  const richtwert = deriveRichtwertCalculation(data);
  const warnings = calculation.calculationWarnings ?? [];

  return (
    <div className="space-y-6">
      {rentValuesMissing && (
        <div className="rounded-md bg-amber-50 px-3 py-2 text-sm font-semibold text-amber-800">
          Mietwerte fehlen. Bitte in Schritt 3 prüfen.
        </div>
      )}

      <div className="grid gap-4 xl:grid-cols-3">
        <EditableCalculationSection title="Mietzusammensetzung" onReset={() => onResetSection("rent")}>
          <NumberField label="Hauptmietzins" value={data.hauptmietzins} onChange={(value) => update("hauptmietzins", value)} />
          <NumberField label="Betriebskosten" value={data.betriebskosten} onChange={(value) => update("betriebskosten", value)} />
          <NumberField label="Umsatzsteuer" value={data.umsatzsteuer} onChange={(value) => update("umsatzsteuer", value)} />
          <NumberField label="Sonstige Zuschläge" value={data.sonstige_zuschlaege} onChange={(value) => update("sonstige_zuschlaege", value)} />
          <NumberField label="Gesamtmiete brutto / aktuelle Miete" value={data.currentRent} onChange={(value) => update("currentRent", value)} />
          <CheckboxField label="Pauschalmiete" checked={data.pauschalmiete} onChange={(value) => update("pauschalmiete", value)} />
        </EditableCalculationSection>
        <EditableCalculationSection title="Rückforderung" onReset={() => onResetSection("refund")}>
          <TextField label="Rückforderung Start" type="date" value={data.leaseStart} onChange={(value) => update("leaseStart", value)} />
          <TextField label="Rückforderung Ende" type="date" value={data.endDate} onChange={(value) => update("endDate", value)} />
          <NumberField label="Bereits rückerstattet" value={data.bereits_rueckerstattet} onChange={(value) => update("bereits_rueckerstattet", value)} />
          <NumberField label="Abschlagszahlungen" value={data.paidDeductions} onChange={(value) => update("paidDeductions", value)} />
          <NumberField label="Richtwertzins pro m²" value={data.guidelineRentPerSqm} onChange={(value) => update("guidelineRentPerSqm", value)} />
          <NumberField label="Fläche" value={data.area} onChange={(value) => update("area", value)} />
        </EditableCalculationSection>
        <EditableCalculationSection title="Vergleich & Zukunft" onReset={() => onResetSection("settlement")}>
          <NumberField label="Erlaubte Miete" value={data.allowedRent} onChange={(value) => update("allowedRent", value)} />
          <NumberField label="Befristete erlaubte Bruttomiete" value={data.allowedGrossRentFixedTerm} onChange={(value) => update("allowedGrossRentFixedTerm", value)} />
          <NumberField label="Vergleichsquote %" value={data.vergleichsquote} onChange={(value) => update("vergleichsquote", value)} />
          <NumberField label="Vergleichsreduktion %" value={data.reductionPercent} onChange={(value) => update("reductionPercent", value)} />
          <NumberField label="Zukunftsreduktion %" value={data.zukunftsreduktion_prozent} onChange={(value) => update("zukunftsreduktion_prozent", value)} />
          <NumberField label="Zukünftiger Mietzins" value={data.zukuenftiger_mietzins} onChange={(value) => update("zukuenftiger_mietzins", value)} />
        </EditableCalculationSection>
      </div>

      {warnings.length > 0 && (
        <WarningCard warnings={warnings} />
      )}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        <StatCard title="Aktuelle Miete" value={formatCalculationMoney(calculation.currentGrossRent, "Fehlt")} />
        <StatCard title="Erlaubte Miete" value={formatCalculationMoney(calculation.allowedGrossRent, "Fehlt")} />
        <StatCard title="Monatliche Überschreitung" value={formatCalculationMoney(calculation.monthlyExcess, "Nicht berechnet")} tone="danger" />
        <StatCard title="Zeitraum" value={calculation.months > 0 ? `${calculation.months} Monate` : "Nicht berechnet"} />
        <StatCard title="Gesamtüberschreitung" value={formatCalculationMoney(calculation.totalExcess, "Nicht berechnet")} />
        <StatCard title="Vergleichsreduktion" value={`${formatNumber(calculation.settlementReductionPercent)} %`} />
        <StatCard title="Abschlagszahlungen" value={formatCalculationMoney(calculation.paidDeductions, "Fehlt")} />
        <StatCard title="Vergleichsbetrag" value={formatCalculationMoney(calculation.settlementAmount, "Nicht berechnet")} tone="success" />
        <StatCard title="Zukünftiger Mietzins" value={formatCalculationMoney(calculation.futureAcceptedRent, "Nicht berechnet")} />
      </div>

      <div className="grid gap-4 xl:grid-cols-3">
        <CalculationBasisCard
          title="Mietzusammensetzung"
          rows={[
            ["Hauptmietzins", formatCalculationMoney(calculation.hauptmietzins, "Fehlt")],
            ["Betriebskosten", formatCalculationMoney(calculation.betriebskosten, "Fehlt")],
            ["Umsatzsteuer", formatCalculationMoney(calculation.umsatzsteuer, "Fehlt")],
            ["Zuschläge", formatCalculationMoney(calculation.sonstige_zuschlaege, "Fehlt")],
            ["Pauschalmiete", calculation.pauschalmiete ? "Ja" : "Nein"],
            ["Gesamtmiete brutto", formatCalculationMoney(calculation.gesamtmiete_brutto, "Fehlt")],
          ]}
        />
        <CalculationBasisCard
          title="Rückforderung"
          rows={[
            ["Zeitraum", calculation.months > 0 ? `${calculation.months} Monate` : "Nicht berechnet"],
            ["Monatliche Überzahlung", formatCalculationMoney(calculation.monatliche_ueberzahlung, "Nicht berechnet")],
            ["Gesamtüberzahlung", formatCalculationMoney(calculation.gesamte_ueberzahlung, "Nicht berechnet")],
            ["Bereits rückerstattet", formatCalculationMoney(calculation.bereits_rueckerstattet, "Fehlt")],
            ["Offene Forderung", formatCalculationMoney(calculation.offene_forderung, "Nicht berechnet")],
          ]}
        />
        <CalculationBasisCard
          title="Vergleich & Zukunft"
          rows={[
            ["Vergleichsquote", `${formatNumber(calculation.vergleichsquote)} %`],
            ["Vergleichsbetrag", formatCalculationMoney(calculation.vergleichsbetrag, "Nicht berechnet")],
            ["Zukünftiger Mietzins", formatCalculationMoney(calculation.zukuenftiger_mietzins, "Nicht berechnet")],
            ["Zukünftige Ersparnis", formatCalculationMoney(calculation.zukuenftige_monatliche_ersparnis, "Nicht berechnet")],
          ]}
        />
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
        <SourceCard
          sources={[
            ["Quelle aktuelle Miete", getCalculationBasisLabel(calculation, "currentRent")],
            ["Quelle erlaubte Miete", getCalculationBasisLabel(calculation, "allowedRent")],
            ["Quelle Nutzfläche", getCalculationBasisLabel(calculation, "area")],
            ["Quelle Zeitraum", getCalculationBasisLabel(calculation, "period")],
          ]}
        />
        <CalculationBasisCard
          title="Berechnungsbasis"
          rows={[
            ["Nutzfläche laut Vertrag", formatArea(calculation.contractArea)],
            ["Nutzfläche nachgemessen", formatArea(calculation.measuredArea)],
            ["Verwendete Nutzfläche", formatArea(calculation.nutzflaeche)],
            ["Richtwertzins/m²", formatCalculationMoney(richtwert.guidelineRentPerSqm, "Fehlt")],
            ["Befristet", calculation.fixedTerm ? "Ja" : "Nein"],
            ["Verwendete erlaubte Bruttomiete", formatCalculationMoney(calculation.allowedGrossRent, "Fehlt")],
            ["Berechnungsart", describeAllowedRentSource(richtwert.selectedAllowedGrossRentSource)],
          ]}
        />
      </div>

      <CalculationReportView report={report} />
    </div>
  );
}

function StatCard({ title, value, tone = "default" }: { title: string; value: string; tone?: "default" | "danger" | "success" }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
      <div className="text-sm font-semibold text-slate-500">{title}</div>
      <div className={tone === "danger" ? "mt-3 text-2xl font-extrabold text-red-600" : tone === "success" ? "mt-3 text-2xl font-extrabold text-emerald-700" : "mt-3 text-2xl font-extrabold text-navy-950"}>
        {value}
      </div>
    </div>
  );
}

function WarningCard({ warnings }: { warnings: string[] }) {
  return (
    <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-amber-900">
      <div className="text-sm font-extrabold">Berechnung prüfen</div>
      <ul className="mt-2 list-disc space-y-1 pl-5 text-sm font-semibold">
        {warnings.map((warning) => <li key={warning}>{warning}</li>)}
      </ul>
    </div>
  );
}

function EditableCalculationSection({ title, children, onReset }: { title: string; children: ReactNode; onReset: () => void }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div className="text-sm font-extrabold text-navy-950">{title}</div>
        <Button type="button" variant="secondary" className="h-8 px-2 text-xs" onClick={onReset}>
          Automatisch erkannte Werte wiederherstellen
        </Button>
      </div>
      <div className="grid gap-3">
        {children}
      </div>
    </div>
  );
}

function SourceCard({ sources }: { sources: Array<[string, string]> }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
      <div className="text-sm font-extrabold text-navy-950">Quellen</div>
      <div className="mt-3 grid gap-2">
        {sources.map(([label, value]) => (
          <div key={label} className="rounded-md bg-slate-50 px-3 py-2">
            <div className="text-[11px] font-extrabold uppercase tracking-wide text-slate-500">{label}</div>
            <div className="mt-1 text-sm font-bold text-navy-950">{value}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

function CalculationBasisCard({ title, rows }: { title: string; rows: Array<[string, string]> }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
      <div className="text-sm font-extrabold text-navy-950">{title}</div>
      <div className="mt-3 grid gap-2 sm:grid-cols-2">
        {rows.map(([label, value]) => (
          <div key={label} className="rounded-md bg-slate-50 px-3 py-2">
            <div className="text-[11px] font-extrabold uppercase tracking-wide text-slate-500">{label}</div>
            <div className={value === "Fehlt" || value === "Nicht berechnet" ? "mt-1 text-sm font-bold text-slate-500" : "mt-1 text-sm font-bold text-navy-950"}>{value}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

function CalculationReportView({ report }: { report: ReturnType<typeof buildCalculationReport> }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="text-sm font-extrabold text-navy-950">Berechnungsbericht</div>
          <div className="mt-1 text-xs font-semibold text-slate-500">Erstellt {formatReportDate(report.generatedAt)}</div>
        </div>
        {report.warnings && report.warnings.length > 0 && <span className="rounded-md bg-amber-50 px-2.5 py-1 text-xs font-extrabold text-amber-700">{report.warnings.length} Warnung(en)</span>}
      </div>
      <div className="mt-4 grid gap-3 xl:grid-cols-2">
        {report.sections.map((section) => (
          <div key={section.title} className="rounded-md border border-slate-200 bg-slate-50 p-3">
            <div className="text-xs font-extrabold uppercase tracking-wide text-slate-500">{section.title}</div>
            <div className="mt-3 space-y-2">
              {section.entries.map((entry) => (
                <div key={`${section.title}-${entry.label}`} className="flex items-start justify-between gap-3 rounded-md bg-white px-3 py-2 text-sm">
                  <div>
                    <div className="font-bold text-navy-950">{entry.label}</div>
                    {entry.source && <div className="mt-0.5 text-xs font-semibold text-slate-500">{entry.overridden ? "Manuell angepasst" : entry.source}</div>}
                  </div>
                  <div className={entry.warning ? "text-right font-extrabold text-amber-700" : "text-right font-extrabold text-navy-950"}>{entry.formattedValue ?? String(entry.value ?? "Fehlt")}</div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function LetterStep({
  letterText,
  recipientMissing,
  tenantPostalCodeMissing,
  activeTemplate,
  nextVersion,
  review,
  attachments,
  missingTemplatePlaceholders,
  emptyDataWarnings,
  isCreatingWord,
  isCreatingPdf,
  wordReady,
  pdfReady,
  onCreateWord,
  onCreatePdf,
  onDownloadWord,
  onDownloadPdf,
  latestLetter,
  onCreateEmailDraft,
  setLetterText,
  onRegenerate,
}: {
  letterText: string;
  recipientMissing: boolean;
  tenantPostalCodeMissing: boolean;
  activeTemplate?: StoredWordTemplate;
  nextVersion: number;
  review: LetterReview;
  attachments: LetterAttachment[];
  missingTemplatePlaceholders: string[];
  emptyDataWarnings: string[];
  isCreatingWord: boolean;
  isCreatingPdf: boolean;
  wordReady: boolean;
  pdfReady: boolean;
  onCreateWord: () => void;
  onCreatePdf: () => void;
  onDownloadWord: () => void;
  onDownloadPdf: () => void;
  latestLetter?: GeneratedLetterVersion;
  onCreateEmailDraft: () => void;
  setLetterText: (value: string) => void;
  onRegenerate: () => void;
}) {
  return (
    <div className="grid gap-5 xl:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
      <div>
        <div className="mb-4 rounded-lg border border-slate-200 bg-white p-4">
          <div className="text-sm font-bold text-navy-950">Aktive Word-Vorlage</div>
          <div className="mt-1 text-xs font-semibold text-slate-500">Neue Version wird erstellt: Version {nextVersion}</div>
          {activeTemplate ? (
            <div className="mt-2 flex flex-wrap items-center justify-between gap-3">
              <div>
                <div className="font-extrabold text-navy-950">{activeTemplate.fileName}</div>
                <div className="text-xs text-slate-500">{activeTemplate.placeholders.length} Platzhalter erkannt</div>
              </div>
              <span className="rounded-md bg-emerald-50 px-2.5 py-1 text-xs font-extrabold text-emerald-700">Aktiv</span>
            </div>
          ) : (
            <div className="mt-2 rounded-md bg-amber-50 px-3 py-2 text-sm font-semibold text-amber-800">
              Keine aktive Word-Vorlage vorhanden. Bitte laden Sie unter Vorlagen eine Vorlage hoch und setzen Sie sie als aktiv.
            </div>
          )}
          {missingTemplatePlaceholders.length > 0 && (
            <div className="mt-3 rounded-md bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-800">
              Vorlage enthaelt nicht alle empfohlenen Platzhalter: {missingTemplatePlaceholders.slice(0, 6).join(", ")}
              {missingTemplatePlaceholders.length > 6 ? " ..." : ""}
            </div>
          )}
          {emptyDataWarnings.length > 0 && (
            <div className="mt-3 rounded-md bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-800">
              Leere oder zu pruefende Daten: {emptyDataWarnings.slice(0, 6).join(", ")}
              {emptyDataWarnings.length > 6 ? " ..." : ""}
            </div>
          )}
          <LetterReviewSummary review={review} attachments={attachments} />
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <Button type="button" onClick={onCreateWord} disabled={isCreatingWord}>
              <FileCheck2 size={16} />
              {isCreatingWord ? "Wird erstellt..." : "Word erstellen"}
            </Button>
            <Button type="button" onClick={onCreatePdf} disabled={isCreatingPdf || !activeTemplate}>
              <FileCheck2 size={16} />
              {isCreatingPdf ? "PDF wird erstellt..." : "PDF aus Word erstellen"}
            </Button>
            <Button type="button" variant="secondary" onClick={onDownloadWord} disabled={!wordReady}>
              <Download size={16} />
              Word herunterladen
            </Button>
            <Button type="button" variant="secondary" onClick={onDownloadPdf} disabled={!pdfReady}>
              <Download size={16} />
              PDF herunterladen
            </Button>
            {latestLetter && (
              <Button type="button" variant="secondary" onClick={onCreateEmailDraft}>
                <FileText size={16} />
                E-Mail-Entwurf erstellen
              </Button>
            )}
          </div>
          {wordReady && (
            <div className="mt-3 rounded-md bg-emerald-50 px-3 py-2 text-sm font-semibold text-emerald-700">
              Word-Dokument erfolgreich erstellt
            </div>
          )}
          {pdfReady && (
            <div className="mt-3 rounded-md bg-emerald-50 px-3 py-2 text-sm font-semibold text-emerald-700">
              PDF wurde aus dem fertigen Word-Dokument erstellt
            </div>
          )}
        </div>

        <label>
          <div className="mb-2 flex flex-wrap items-center justify-between gap-3">
            <span className="block text-sm font-bold text-navy-950">Text bearbeiten</span>
            <Button type="button" variant="secondary" className="h-9 px-3" onClick={onRegenerate}>
              Aktuelle Werte einsetzen
            </Button>
          </div>
        {recipientMissing && (
          <div className="mb-3 rounded-md bg-amber-50 px-3 py-2 text-sm font-semibold text-amber-800">
            Empfänger des Schreibens fehlt. Bitte prüfen Sie die erkannten Daten.
          </div>
        )}
        {tenantPostalCodeMissing && (
          <div className="mb-3 rounded-md bg-amber-50 px-3 py-2 text-sm font-semibold text-amber-800">
            Postleitzahl des Mieters fehlt. Bitte prüfen.
          </div>
        )}
        <textarea
          value={letterText}
          onChange={(event) => setLetterText(event.target.value)}
          className="min-h-[560px] w-full rounded-lg border border-slate-200 bg-white p-5 text-sm leading-7 outline-none focus:border-blue-700 focus:ring-2 focus:ring-blue-100"
        />
        </label>
      </div>
      <div>
        <div className="mb-2 text-sm font-bold text-navy-950">PDF-Vorschau</div>
        <LetterDocumentPreview content={letterText} className="max-h-[760px] overflow-auto" />
      </div>
    </div>
  );
}

function LetterReviewSummary({ review, attachments }: { review: LetterReview; attachments: LetterAttachment[] }) {
  const tone = review.status === "ready" || review.status === "approved" ? "bg-emerald-50 text-emerald-700" : review.status === "review_required" ? "bg-red-50 text-red-700" : "bg-amber-50 text-amber-800";

  return (
    <div className="mt-4 rounded-lg border border-slate-200 bg-slate-50 p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="text-sm font-extrabold text-navy-950">Review</div>
        <span className={`rounded-md px-2.5 py-1 text-xs font-extrabold ${tone}`}>{reviewStatusLabel(review.status)}</span>
      </div>
      <div className="mt-2 text-xs font-semibold text-slate-500">
        {review.status === "ready" || review.status === "approved" ? "Bereit zur Freigabe" : "Prüfung erforderlich"}
      </div>
      <ReviewList title="Warnungen" values={review.warnings} />
      <ReviewList title="Fehlende Felder" values={review.missingFields} />
      <ReviewList title="Nicht ersetzte Platzhalter" values={review.unresolvedPlaceholders} />
      <div className="mt-3">
        <div className="text-xs font-extrabold uppercase tracking-wide text-slate-500">Anlagen</div>
        {attachments.length > 0 ? (
          <div className="mt-2 grid gap-1 text-xs font-semibold text-slate-600">
            {attachments.map((attachment) => <div key={attachment.id}>{attachment.label}{attachment.fileName ? ` · ${attachment.fileName}` : ""}</div>)}
          </div>
        ) : (
          <div className="mt-2 text-xs font-semibold text-amber-700">Keine Anlagen erkannt.</div>
        )}
      </div>
    </div>
  );
}

function ReviewList({ title, values }: { title: string; values?: string[] }) {
  if (!values?.length) return null;
  return (
    <div className="mt-3">
      <div className="text-xs font-extrabold uppercase tracking-wide text-slate-500">{title}</div>
      <ul className="mt-1 list-disc space-y-1 pl-4 text-xs font-semibold text-amber-800">
        {values.map((value) => <li key={value}>{value}</li>)}
      </ul>
    </div>
  );
}

function reviewStatusLabel(status: LetterReview["status"]) {
  if (status === "approved") return "Freigegeben";
  if (status === "ready") return "Ready";
  if (status === "warning") return "Warning";
  if (status === "review_required") return "Review erforderlich";
  return "Entwurf";
}

function ExportStep({
  recordId,
  tenantName,
  recipientMissing,
  tenantPostalCodeMissing,
  wordReady,
  pdfReady,
  isCreatingPdf,
  editMode,
  hasPendingExtractedChanges,
  review,
  onCreatePdf,
  onDownloadWord,
  onDownloadPdf,
  onSave,
  onClose,
}: {
  recordId: string;
  tenantName: string;
  recipientMissing: boolean;
  tenantPostalCodeMissing: boolean;
  wordReady: boolean;
  pdfReady: boolean;
  isCreatingPdf: boolean;
  editMode: boolean;
  hasPendingExtractedChanges: boolean;
  review: LetterReview;
  onCreatePdf: () => void;
  onDownloadWord: () => void;
  onDownloadPdf: () => void;
  onSave: () => void;
  onClose: () => void;
}) {
  return (
    <div className="grid gap-5 lg:grid-cols-[1fr_360px]">
      <div className="rounded-lg border border-slate-200 bg-white p-6">
        <div className="mb-6 grid h-14 w-14 place-items-center rounded-lg bg-emerald-50 text-emerald-700">
          <FileCheck2 size={28} />
        </div>
        <h3 className="text-2xl font-extrabold text-navy-950">Word/PDF Export</h3>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">
          Der Entwurf für {tenantName} wird aus der aktiven Word-Vorlage erzeugt. Das finale PDF entsteht direkt aus derselben befüllten DOCX-Datei.
        </p>
        {recipientMissing && (
          <div className="mt-4 rounded-md bg-amber-50 px-3 py-2 text-sm font-semibold text-amber-800">
            Empfänger des Schreibens fehlt. Bitte prüfen Sie die erkannten Daten.
          </div>
        )}
        {tenantPostalCodeMissing && (
          <div className="mt-4 rounded-md bg-amber-50 px-3 py-2 text-sm font-semibold text-amber-800">
            Postleitzahl des Mieters fehlt. Bitte prüfen.
          </div>
        )}
        {hasPendingExtractedChanges && (
          <div className="mt-4 rounded-md bg-amber-50 px-3 py-2 text-sm font-semibold text-amber-800">
            Es gibt ungeprüfte erkannte Änderungen.
          </div>
        )}
        {(review.unresolvedPlaceholders?.length ?? 0) > 0 && (
          <div className="mt-4 rounded-md bg-red-50 px-3 py-2 text-sm font-semibold text-red-700">
            Das Schreiben enthält nicht ersetzte Platzhalter: {review.unresolvedPlaceholders?.join(", ")}
          </div>
        )}
        <div className="mt-7 grid gap-3 sm:grid-cols-4">
          <Button onClick={onDownloadWord} disabled={!wordReady}>
            <Download size={16} />
            Word herunterladen
          </Button>
          <Button onClick={onCreatePdf} disabled={isCreatingPdf}>
            <FileCheck2 size={16} />
            {isCreatingPdf ? "PDF wird erstellt..." : "PDF aus Word erstellen"}
          </Button>
          <Button onClick={onDownloadPdf} disabled={!pdfReady}>
            <Download size={16} />
            PDF herunterladen
          </Button>
          <Button variant="secondary" onClick={onSave}>
            <Save size={16} />
            {editMode ? "Änderungen speichern" : "Speichern"}
          </Button>
          <Button variant="secondary" onClick={onClose}>
            <CheckCircle2 size={16} />
            Fall abschließen
          </Button>
        </div>
      </div>
      <div className="rounded-lg bg-navy-950 p-6 text-white">
        <div className="text-sm font-semibold text-gold-400">Exportpaket</div>
        <div className="mt-4 space-y-3 text-sm">
          <ExportRow label="Fall" value={recordId} />
          <ExportRow label="Format" value="Word / PDF" />
          <ExportRow label="Status" value={pdfReady ? "Word und PDF erstellt" : wordReady ? "Word erstellt" : "Word noch nicht erstellt"} />
        </div>
      </div>
    </div>
  );
}

function ExportRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between border-b border-white/10 pb-3">
      <span className="text-slate-300">{label}</span>
      <span className="font-bold">{value}</span>
    </div>
  );
}

function TextField({
  label,
  value,
  onChange,
  type = "text",
  className = "",
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: string;
  className?: string;
}) {
  return (
    <label className={className}>
      <span className="mb-1.5 block text-xs font-bold uppercase tracking-wide text-slate-500">{label}</span>
      <input
        type={type}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="h-12 w-full rounded-md border border-slate-200 bg-white px-3 text-sm outline-none focus:border-blue-700 focus:ring-2 focus:ring-blue-100"
      />
    </label>
  );
}

function NumberField({ label, value, onChange }: { label: string; value: number; onChange: (value: number) => void }) {
  return (
    <label>
      <span className="mb-1.5 block text-xs font-bold uppercase tracking-wide text-slate-500">{label}</span>
      <input
        type="number"
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
        className="h-12 w-full rounded-md border border-slate-200 bg-white px-3 text-sm outline-none focus:border-blue-700 focus:ring-2 focus:ring-blue-100"
      />
    </label>
  );
}

function CheckboxField({ label, checked, onChange }: { label: string; checked: boolean; onChange: (value: boolean) => void }) {
  return (
    <label className="flex h-12 items-center gap-3 rounded-md border border-slate-200 bg-white px-3 text-sm font-semibold text-navy-900">
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
        className="h-4 w-4 rounded border-slate-300 text-blue-700"
      />
      {label}
    </label>
  );
}

function createExtractedDataFromWizard(data: WizardData): ExtractedData {
  return {
    tenantName: data.tenantName,
    tenantAddress: data.tenantFullAddress,
    tenantStreet: data.tenantStreet,
    tenantDoor: data.tenantDoor,
    tenantPostalCode: data.tenantPostalCode,
    tenantCity: data.tenantCity,
    tenantFullAddress: data.tenantFullAddress,
    phone: data.phone,
    moveInDate: data.leaseStart,
    grossRent: data.currentRent,
    aktuelle_miete: data.aktuelle_miete,
    brutto_miete: data.brutto_miete,
    hauptmietzins: data.hauptmietzins,
    contractArea: data.contractArea,
    measuredArea: data.area,
    nutzflaeche_laut_vertrag: data.nutzflaeche_laut_vertrag,
    nutzflaeche_nachgemessen: data.nutzflaeche_nachgemessen,
    category: data.category,
    equipment: data.equipment,
    balcony: false,
    bathToiletSameRoom: data.bathToiletSameRoom,
    corridorKitchen: data.corridorKitchen,
    noiseImpact: data.noiseImpact,
    cellar: data.cellar,
    intercom: data.intercom,
    fixedTerm: data.fixedTerm,
    recipientName: data.recipientName,
    recipientAddress: data.recipientAddress,
    recipientPostalCity: data.recipientPostalCity,
    opposingParty: data.opposingParty,
    representation: data.representation,
    caseWorker: data.caseWorker,
    landlord: data.landlordName,
    landlordAddress: data.landlordAddress,
    landlordPostalCity: data.landlordPostalCity,
    landlordRepresentedBy: data.representation,
    birthDate: "",
    leaseStart: data.leaseStart,
    leaseEnd: "",
    deposit: 0,
    guidelineRentPerSqm: data.guidelineRentPerSqm,
    guidelineRentTotal: data.guidelineRentTotal,
    operatingCostPerSqm: data.operatingCostPerSqm,
    netRent: data.netRent,
    allowedGrossRent: data.allowedRent,
    allowedGrossRentFixedTerm: data.allowedGrossRentFixedTerm,
    operatingCosts: data.betriebskosten || data.operatingCosts,
    vat: data.umsatzsteuer || data.vat,
    adjustments: data.equipment,
  };
}

function formatWizardDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("de-AT").format(date);
}

function getStatusForStep(step: number): CaseStatus {
  if (step >= 5) return "Schreiben erstellt";
  if (step >= 4) return "Berechnung abgeschlossen";
  if (step >= 3) return "Daten geprüft";
  if (step >= 1) return "Dokumente hochgeladen";
  return "Entwurf";
}

function createReviewValuesFromWizard(data: WizardData) {
  return {
    tenantName: data.tenantName,
    tenantFullAddress: data.tenantFullAddress || data.address,
    tenantPostalCode: data.tenantPostalCode,
    tenantCity: data.tenantCity,
    currentRent: data.currentRent,
    allowedRent: data.allowedRent,
    contractArea: data.contractArea,
    area: data.area,
    landlordName: data.landlordName,
    recipientName: data.recipientName,
    representation: data.representation,
    leaseStart: data.leaseStart,
    category: data.category,
    fixedTerm: data.fixedTerm,
  };
}

function applyPendingChangeToWizard(data: WizardData, change: PendingExtractedChange): WizardData {
  const value = change.newValue;

  if (change.field === "tenantName" && typeof value === "string") return { ...data, tenantName: value };
  if (change.field === "tenantFullAddress" && typeof value === "string") return { ...data, address: value, tenantFullAddress: value };
  if (change.field === "tenantPostalCode" && typeof value === "string") return { ...data, tenantPostalCode: value };
  if (change.field === "tenantCity" && typeof value === "string") return { ...data, tenantCity: value };
  if (change.field === "currentRent") {
    const parsed = parseEuroValue(value) ?? data.currentRent;
    return { ...data, currentRent: parsed, aktuelle_miete: parsed, brutto_miete: parsed };
  }
  if (change.field === "allowedRent") return { ...data, allowedRent: parseEuroValue(value) ?? data.allowedRent };
  if (change.field === "contractArea") {
    const parsed = parseEuroValue(value) ?? data.contractArea;
    return { ...data, contractArea: parsed, nutzflaeche_laut_vertrag: parsed };
  }
  if (change.field === "area") {
    const parsed = parseEuroValue(value) ?? data.area;
    return { ...data, area: parsed, nutzflaeche_nachgemessen: parsed };
  }
  if (change.field === "landlordName" && typeof value === "string") return { ...data, landlordName: value };
  if (change.field === "recipientName" && typeof value === "string") return { ...data, recipientName: value };
  if (change.field === "representation" && typeof value === "string") return { ...data, representation: value };
  if (change.field === "leaseStart" && typeof value === "string") return { ...data, leaseStart: value };
  if (change.field === "category" && typeof value === "string") return { ...data, category: value };
  if (change.field === "fixedTerm" && typeof value === "boolean") return { ...data, fixedTerm: value };

  return data;
}

function formatReviewValue(value: unknown) {
  if (typeof value === "boolean") return value ? "Ja" : "Nein";
  if (typeof value === "number") return new Intl.NumberFormat("de-AT", { maximumFractionDigits: 2 }).format(value);
  return String(value ?? "").trim();
}

function isEmptyReviewValue(value: unknown) {
  return value === undefined || value === null || value === "" || value === 0;
}

function getSavedDocument(record: CaseRecord | SavedCaseRecord, type: keyof UploadState): UploadedDocument | null {
  const document = "documents" in record ? record.documents.find((item) => item.type === type) : undefined;
  return document
    ? {
        id: document.id,
        fileName: document.fileName,
        uploadedAt: document.uploadedAt,
        mimeType: document.mimeType,
        size: document.size,
        dataUrl: document.dataUrl,
        storage: document.storage,
        storageStatus: document.storageStatus,
        extractionStatus: document.extractionStatus,
        extractionSummary: document.extractionSummary,
        extractedTextLength: document.extractedTextLength,
        extractedFields: document.extractedFields,
        extractionWarnings: document.extractionWarnings,
        extractionError: document.extractionError,
        extractedAt: document.extractedAt,
        source: document.source ?? (document.dataUrl ? "upload" : "legacy"),
      }
    : null;
}

function getTodayInputDate() {
  return new Date().toISOString().slice(0, 10);
}

function hasOutdatedExport(record: SavedCaseRecord, hasUnsavedChanges: boolean) {
  const generatedAt = record.generatedPdf?.generatedAt ?? record.generatedWord?.generatedAt;
  if (!generatedAt) return false;
  if (hasUnsavedChanges) return true;
  return new Date(generatedAt).getTime() < new Date(record.updatedAt).getTime();
}

function getDocumentExtraction(documents: DocumentExtractionResult[], type: keyof UploadState) {
  return documents.find((document) => document.type === type);
}

function uploadsToSavedDocuments(uploads: UploadState, fallbackDate: string, extractionDocuments: DocumentExtractionResult[] = []): SavedCaseDocument[] {
  return Object.entries(uploads)
    .filter((entry): entry is [keyof UploadState, UploadedDocument] => Boolean(entry[1]))
    .map(([type, upload]) => {
      const extraction = getDocumentExtraction(extractionDocuments, type);
      const extractionStatus = getSavedExtractionStatus(type, upload, extraction);

      return {
        id: upload.id,
        type,
        fileName: upload.fileName,
        uploadedAt: upload.uploadedAt ?? fallbackDate,
        mimeType: upload.mimeType,
        size: upload.size,
        dataUrl: upload.dataUrl,
        storage: upload.storage,
        storageStatus: upload.storageStatus,
        extractionStatus,
        extractionSummary: extraction?.message ?? upload.extractionSummary,
        source: upload.source ?? upload.storage?.source ?? (upload.dataUrl ? "upload" : "legacy"),
        extractedTextLength: extraction?.extractedTextLength ?? upload.extractedTextLength,
        extractedFields: extraction?.data ?? upload.extractedFields,
        extractionWarnings: extraction ? createExtractionWarnings(extraction) : upload.extractionWarnings,
        extractionError: extraction?.error ?? upload.extractionError,
        extractedAt: extraction ? fallbackDate : upload.extractedAt,
      };
    });
}

function mergeExtractionIntoUploads(uploads: UploadState, documents: DocumentExtractionResult[], extractedAt: string): UploadState {
  const next = { ...uploads };

  for (const extraction of documents) {
    const upload = next[extraction.type];
    if (!upload) continue;

    next[extraction.type] = {
      ...upload,
      extractionStatus: extraction.success ? "success" : "failed",
      extractionSummary: extraction.message,
      extractedTextLength: extraction.extractedTextLength,
      extractedFields: extraction.data,
      extractionWarnings: createExtractionWarnings(extraction),
      extractionError: extraction.error,
      extractedAt,
    };
  }

  return next;
}

function createExtractionWarnings(result: DocumentExtractionResult) {
  return [
    ...(result.warnings ?? []),
    ...result.issues.map((issue) => `${issue.field}: ${issue.message}`),
    ...(result.requiresOCR ? ["OCR erforderlich"] : []),
    ...(result.message ? [result.message] : []),
  ].filter((warning, index, warnings) => warning && warnings.indexOf(warning) === index);
}

function getExtractionWarnings(upload?: UploadedDocument | null, result?: DocumentExtractionResult) {
  if (result) return createExtractionWarnings(result);
  return upload?.extractionWarnings ?? [];
}

function countExtractedFields(fields?: Partial<ExtractedData> | Record<string, unknown>) {
  if (!fields) return 0;
  return Object.values(fields).filter((value) => value !== undefined && value !== null && value !== "" && value !== 0).length;
}

async function createUploadedDocument(file: File, type: keyof UploadState, caseId: string, ownerId?: string): Promise<UploadedDocument> {
  const document = await buildSavedCaseDocumentFromFile(caseId, type, file, { ownerId });

  return {
    ...document,
    file,
  };
}

function getSavedExtractionStatus(type: keyof UploadState, upload: UploadedDocument, extraction?: DocumentExtractionResult): SavedCaseDocument["extractionStatus"] {
  if (type === "Weitere Dokumente") return "not_applicable";
  if (!upload.dataUrl) return "not_applicable";
  if (extraction) return extraction.success ? "success" : "failed";
  return upload.extractionStatus ?? (upload.dataUrl ? "pending" : undefined);
}

function applyExtractedDataToWizard(current: WizardData, extracted: Partial<ExtractedData>): WizardData {
  const landlordName = extracted.landlord ?? current.landlordName;
  const opposingParty = extracted.opposingParty ?? current.opposingParty;
  const recipientName = landlordName || opposingParty || current.recipientName;
  const currentRent =
    parsePositiveEuroValue(extracted.aktuelle_miete) ??
    parsePositiveEuroValue(extracted.brutto_miete) ??
    parsePositiveEuroValue(extracted.hauptmietzins) ??
    parsePositiveEuroValue(extracted.grossRent) ??
    current.currentRent;
  const fixedTerm = extracted.fixedTerm ?? current.fixedTerm;
  const nextDataForRent = {
    ...current,
    area: parsePositiveEuroValue(extracted.nutzflaeche_nachgemessen) ?? parsePositiveEuroValue(extracted.measuredArea) ?? current.area,
    fixedTerm,
    guidelineRentPerSqm: parsePositiveEuroValue(extracted.guidelineRentPerSqm) ?? current.guidelineRentPerSqm,
    guidelineRentTotal: parsePositiveEuroValue(extracted.guidelineRentTotal) ?? current.guidelineRentTotal,
    operatingCostPerSqm: parsePositiveEuroValue(extracted.operatingCostPerSqm) ?? current.operatingCostPerSqm,
    operatingCosts: parsePositiveEuroValue(extracted.operatingCosts) ?? current.operatingCosts,
    vat: parsePositiveEuroValue(extracted.vat) ?? current.vat,
    netRent: parsePositiveEuroValue(extracted.netRent) ?? current.netRent,
    allowedRent: parsePositiveEuroValue(extracted.allowedGrossRent) ?? current.allowedRent,
    allowedGrossRentFixedTerm: parsePositiveEuroValue(extracted.allowedGrossRentFixedTerm) ?? current.allowedGrossRentFixedTerm,
  };
  const allowedRent = resolveAllowedRentBasis(nextDataForRent)?.value ?? current.allowedRent;

  return {
    ...current,
    tenantName: extracted.tenantName ?? current.tenantName,
    address: extracted.tenantFullAddress ?? extracted.tenantAddress ?? current.address,
    tenantStreet: extracted.tenantStreet ?? current.tenantStreet,
    tenantDoor: extracted.tenantDoor ?? current.tenantDoor,
    tenantPostalCode: extracted.tenantPostalCode ?? current.tenantPostalCode,
    tenantCity: extracted.tenantCity ?? current.tenantCity,
    tenantFullAddress: extracted.tenantFullAddress ?? extracted.tenantAddress ?? current.tenantFullAddress,
    phone: extracted.phone ?? current.phone,
    recipientName,
    recipientAddress: extracted.landlordAddress ?? current.recipientAddress,
    recipientPostalCity: extracted.landlordPostalCity ?? current.recipientPostalCity,
    opposingParty,
    representation: extracted.representation ?? extracted.landlordRepresentedBy ?? current.representation,
    caseWorker: extracted.caseWorker ?? current.caseWorker,
    landlordName,
    landlordAddress: extracted.landlordAddress ?? current.landlordAddress,
    landlordPostalCity: extracted.landlordPostalCity ?? current.landlordPostalCity,
    currentRent,
    aktuelle_miete: currentRent,
    brutto_miete: parsePositiveEuroValue(extracted.brutto_miete) ?? current.brutto_miete,
    hauptmietzins: parsePositiveEuroValue(extracted.hauptmietzins) ?? current.hauptmietzins,
    betriebskosten: parsePositiveEuroValue(extracted.operatingCosts) ?? current.betriebskosten,
    umsatzsteuer: parsePositiveEuroValue(extracted.vat) ?? current.umsatzsteuer,
    gesamtmiete_brutto: currentRent,
    pauschalmietzins: currentRent,
    allowedRent,
    contractArea: parsePositiveEuroValue(extracted.nutzflaeche_laut_vertrag) ?? parsePositiveEuroValue(extracted.contractArea) ?? current.contractArea,
    area: nextDataForRent.area,
    nutzflaeche_laut_vertrag: parsePositiveEuroValue(extracted.nutzflaeche_laut_vertrag) ?? parsePositiveEuroValue(extracted.contractArea) ?? current.nutzflaeche_laut_vertrag,
    nutzflaeche_nachgemessen: nextDataForRent.area,
    category: extracted.category ?? current.category,
    fixedTerm,
    guidelineRentPerSqm: nextDataForRent.guidelineRentPerSqm,
    guidelineRentTotal: nextDataForRent.guidelineRentTotal,
    operatingCostPerSqm: nextDataForRent.operatingCostPerSqm,
    operatingCosts: nextDataForRent.operatingCosts,
    vat: nextDataForRent.vat,
    netRent: nextDataForRent.netRent,
    allowedGrossRentFixedTerm: nextDataForRent.allowedGrossRentFixedTerm,
    equipment: extracted.equipment ?? extracted.adjustments ?? current.equipment,
    bathToiletSameRoom: extracted.bathToiletSameRoom ?? current.bathToiletSameRoom,
    corridorKitchen: extracted.corridorKitchen ?? current.corridorKitchen,
    noiseImpact: extracted.noiseImpact ?? current.noiseImpact,
    intercom: extracted.intercom ?? current.intercom,
    cellar: extracted.cellar ?? current.cellar,
    leaseStart: extracted.leaseStart ?? extracted.moveInDate ?? current.leaseStart,
  };
}

function formatNumber(value: number | undefined) {
  return new Intl.NumberFormat("de-AT", { maximumFractionDigits: 2 }).format(Number(value) || 0);
}

function formatReportDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("de-AT", { dateStyle: "short", timeStyle: "short" }).format(date);
}

function formatCalculationMoney(value: number | undefined, missing: string) {
  if (!value || Number(value) <= 0) return missing;
  return formatCurrency(value);
}

function formatArea(value: number | undefined) {
  if (!value || Number(value) <= 0) return "Fehlt";
  return `${formatNumber(value)} m²`;
}

function getCalculationBasisLabel(calculation: ReturnType<typeof calculateSettlement>, key: "currentRent" | "allowedRent" | "area" | "period") {
  const basis = calculation.calculationBasis?.[key];
  if (!isBasisRecord(basis)) return "Fehlt";
  return `${basis.label} (${basis.source})`;
}

function describeAllowedRentSource(source: string | undefined) {
  if (!source) return "Fehlt";
  if (source === "richtwert.allowedGrossRent" || source === "richtwert.allowedGrossRentFixedTerm") return "Richtwert-PDF";
  if (source.startsWith("calculated.")) return "Intern hergeleitet";
  if (source.startsWith("manual.")) return "Manuell";
  return source;
}

function isBasisRecord(value: unknown): value is { label: string; source: string } {
  return Boolean(value && typeof value === "object" && "label" in value && "source" in value);
}

function createAutomaticCalculationSnapshot(data: WizardData): Partial<WizardData> {
  return pickWizardFields(data, [...getCalculationSectionFields("rent"), ...getCalculationSectionFields("refund"), ...getCalculationSectionFields("settlement")]);
}

function getCalculationSectionFields(section: "rent" | "refund" | "settlement"): Array<keyof WizardData> {
  if (section === "rent") return ["hauptmietzins", "betriebskosten", "umsatzsteuer", "sonstige_zuschlaege", "currentRent", "aktuelle_miete", "brutto_miete", "gesamtmiete_brutto", "pauschalmietzins", "pauschalmiete"];
  if (section === "refund") return ["leaseStart", "endDate", "bereits_rueckerstattet", "paidDeductions", "guidelineRentPerSqm", "area", "nutzflaeche_nachgemessen"];
  return ["allowedRent", "allowedGrossRentFixedTerm", "vergleichsquote", "reductionPercent", "zukunftsreduktion_prozent", "zukuenftiger_mietzins"];
}

function pickWizardFields(data: Partial<WizardData>, fields: Array<keyof WizardData>): Partial<WizardData> {
  return Object.fromEntries(fields.map((field) => [field, data[field]])) as Partial<WizardData>;
}

function parsePositiveEuroValue(value: unknown) {
  const parsed = parseEuroValue(value);
  return parsed !== null && parsed > 0 ? parsed : null;
}

async function readExtractionResponse(response: Response): Promise<ExtractApiResponse> {
  const contentType = response.headers.get("content-type") ?? "";

  if (contentType.includes("application/json")) {
    return (await response.json()) as ExtractApiResponse;
  }

  console.error("Extraktions-API hat kein JSON zurückgegeben.", {
    status: response.status,
    contentType,
    body: await response.text(),
  });

  return {
    success: false,
    error: "Die Extraktions-API hat keine gültige JSON-Antwort geliefert.",
    documents: {},
    documentResults: [],
    data: {},
    mergedData: {},
    issues: [],
    warnings: ["Die Extraktions-API hat keine gültige JSON-Antwort geliefert."],
  };
}

function normalizeExtractionDocuments(result: ExtractApiResponse): DocumentExtractionResult[] {
  if (result.documentResults) return result.documentResults;
  return Object.values(result.documents).filter((document): document is DocumentExtractionResult => Boolean(document));
}

function base64ToBlob(base64: string, mimeType: string) {
  const binary = window.atob(base64);
  const bytes = new Uint8Array(binary.length);

  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }

  return new Blob([bytes], { type: mimeType });
}

function sanitizeFileName(value: string) {
  return value
    .trim()
    .replace(/\s+/g, "_")
    .replace(/[^a-zA-Z0-9_-]/g, "")
    .toLowerCase();
}

function getMissingTemplatePlaceholders(template?: StoredWordTemplate) {
  if (!template) return [];
  return requiredDocxPlaceholders.filter((placeholder) => !template.placeholders.includes(placeholder));
}

function getEmptyDataWarnings(values: LetterTemplateData) {
  return Object.entries(values)
    .filter(([key, value]) => requiredDocxPlaceholders.includes(key) && (!value.trim() || value.includes("Bitte pruefen")))
    .map(([key]) => key);
}
