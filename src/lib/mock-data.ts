import { calculateSettlement } from "@/lib/calculation";
import { parseTenantAddress } from "@/lib/address";
import type { CaseRecord } from "@/types/case";

// Demo seed data for static placeholder pages only. Real CRM case/calculation views use CaseService.
const imadAddress = parseTenantAddress("Hütteldorfer Straße 157 Tür 21, 1140 Wien");

const baseExtracted = {
  tenantName: "Imad Khalil",
  tenantAddress: imadAddress.fullAddress,
  tenantStreet: imadAddress.street,
  tenantDoor: imadAddress.door,
  tenantPostalCode: imadAddress.postalCode,
  tenantCity: imadAddress.city,
  tenantFullAddress: imadAddress.fullAddress,
  phone: "+43 660 1234567",
  moveInDate: "2023-12-15",
  grossRent: 480,
  aktuelle_miete: 480,
  brutto_miete: 480,
  hauptmietzins: 0,
  contractArea: 31,
  measuredArea: 28,
  nutzflaeche_laut_vertrag: 31,
  nutzflaeche_nachgemessen: 28,
  category: "C",
  equipment: "Gangküche, Bad/WC gemeinsam, Kellerabteil vorhanden",
  balcony: false,
  bathToiletSameRoom: true,
  corridorKitchen: true,
  noiseImpact: true,
  cellar: true,
  intercom: true,
  fixedTerm: true,
  recipientName: "",
  recipientAddress: "",
  recipientPostalCity: "",
  opposingParty: "",
  representation: "",
  caseWorker: "Alex Berger",
  landlord: "",
  landlordAddress: "",
  landlordPostalCity: "",
  landlordRepresentedBy: "",
  birthDate: "1991-04-08",
  leaseStart: "2023-12-15",
  leaseEnd: "2026-12-14",
  deposit: 1440,
  guidelineRentPerSqm: 5.55,
  guidelineRentTotal: 155.4,
  operatingCostPerSqm: 1.51,
  netRent: 197.8,
  allowedGrossRent: 155.54,
  allowedGrossRentFixedTerm: 132.21,
  operatingCosts: 42.4,
  vat: 14.14,
  adjustments: "Befristungsabschlag, Lageabschlag, Ausstattungskorrektur",
};

const imadExtracted = {
  ...baseExtracted,
  opposingParty: "Tschögl Alpha Immobilien KG",
  representation: "Vermietung & Verpachtung Emin Etükoglu",
  landlord: "Tschögl Alpha Immobilien KG",
  landlordRepresentedBy: "Vermietung & Verpachtung Emin Etükoglu",
};

export const cases: CaseRecord[] = [
  {
    id: "F-2024-00128",
    tenant: "Imad Khalil",
    address: "Hütteldorfer Straße 157 Tür 21, 1140 Wien",
    status: "Dokumente hochgeladen",
    lastActivity: "Heute, 09:42",
    claimAmount: 2244.6,
    extracted: imadExtracted,
    calculation: calculateSettlement({
      currentGrossRent: 480,
      allowedGrossRent: 155.54,
      startDate: "2023-12-15",
      endDate: "2024-10-14",
      paidDeductions: 1000,
      settlementReductionPercent: 30,
    }),
  },
  {
    id: "F-2024-00127",
    tenant: "Mustafa Al Hasan",
    address: "Brehmstraße 4/14, 1110 Wien",
    status: "Schreiben erstellt",
    lastActivity: "Gestern, 15:21",
    claimAmount: 3185.2,
    extracted: withTenantAddress("Mustafa Al Hasan", "Brehmstraße 4/14, 1110 Wien"),
    calculation: calculateSettlement({
      currentGrossRent: 620,
      allowedGrossRent: 242.7,
      startDate: "2023-05-01",
      endDate: "2024-05-01",
      paidDeductions: 1250,
      settlementReductionPercent: 30,
    }),
  },
  {
    id: "F-2024-00126",
    tenant: "Maria Schuster",
    address: "Zieglergasse 12/7, 1080 Wien",
    status: "Daten geprüft",
    lastActivity: "02.05.2024",
    claimAmount: 1480.9,
    extracted: withTenantAddress("Maria Schuster", "Zieglergasse 12/7, 1080 Wien"),
    calculation: calculateSettlement({
      currentGrossRent: 540,
      allowedGrossRent: 311.5,
      startDate: "2023-08-01",
      endDate: "2024-05-01",
      paidDeductions: 350,
      settlementReductionPercent: 30,
    }),
  },
  {
    id: "F-2024-00125",
    tenant: "Peter Novak",
    address: "Simmeringer Hauptstraße 45/10, 1110 Wien",
    status: "Abgeschlossen",
    lastActivity: "30.04.2024",
    claimAmount: 0,
    extracted: withTenantAddress("Peter Novak", "Simmeringer Hauptstraße 45/10, 1110 Wien"),
    calculation: calculateSettlement({
      currentGrossRent: 430,
      allowedGrossRent: 286,
      startDate: "2023-07-01",
      endDate: "2024-04-30",
      paidDeductions: 1008,
      settlementReductionPercent: 30,
    }),
  },
];

function withTenantAddress(tenantName: string, address: string) {
  const parsed = parseTenantAddress(address);

  return {
    ...baseExtracted,
    tenantName,
    tenantAddress: parsed.fullAddress,
    tenantStreet: parsed.street,
    tenantDoor: parsed.door,
    tenantPostalCode: parsed.postalCode,
    tenantCity: parsed.city,
    tenantFullAddress: parsed.fullAddress,
  };
}

export const dashboardStats = {
  activeCases: 28,
  letters: 15,
  totalClaims: 214680.4,
  successRate: 76,
};
