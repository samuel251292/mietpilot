export const storageBuckets = {
  caseDocuments: "case-documents",
  generatedLetters: "generated-letters",
  calculationReports: "calculation-reports",
  communicationAttachments: "communication-attachments",
  templates: "templates",
  companyAssets: "company-assets",
  exports: "exports",
} as const;

export type StorageBucketName = (typeof storageBuckets)[keyof typeof storageBuckets];

export const storageBucketLabels: Record<StorageBucketName, string> = {
  "case-documents": "Falldokumente",
  "generated-letters": "Generierte Schreiben",
  "calculation-reports": "Berechnungsberichte",
  "communication-attachments": "Kommunikationsanhänge",
  templates: "Word-Vorlagen",
  "company-assets": "Unternehmensassets",
  exports: "Exporte",
};

export const storageBucketList = Object.values(storageBuckets);
