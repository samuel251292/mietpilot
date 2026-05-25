import { NewCaseWizard } from "@/components/cases/new-case-wizard";
import { calculateSettlement } from "@/lib/calculation";
import type { CaseRecord, ExtractedData } from "@/types/case";

export default function NewCasePage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-extrabold text-navy-950">Neuer Fall</h1>
        <p className="text-sm text-slate-500">Wizard vom Upload bis zum finalen Vergleichsschreiben.</p>
      </div>
      <NewCaseWizard record={blankCaseRecord} />
    </div>
  );
}

const blankExtractedData: ExtractedData = {
  tenantName: "",
  tenantAddress: "",
  tenantStreet: "",
  tenantDoor: "",
  tenantPostalCode: "",
  tenantCity: "",
  tenantFullAddress: "",
  phone: "",
  moveInDate: "",
  grossRent: 0,
  aktuelle_miete: 0,
  brutto_miete: 0,
  hauptmietzins: 0,
  contractArea: 0,
  measuredArea: 0,
  nutzflaeche_laut_vertrag: 0,
  nutzflaeche_nachgemessen: 0,
  category: "",
  equipment: "",
  balcony: false,
  bathToiletSameRoom: false,
  corridorKitchen: false,
  noiseImpact: false,
  cellar: false,
  intercom: false,
  fixedTerm: false,
  recipientName: "",
  recipientAddress: "",
  recipientPostalCity: "",
  opposingParty: "",
  representation: "",
  caseWorker: "",
  landlord: "",
  landlordAddress: "",
  landlordPostalCity: "",
  landlordRepresentedBy: "",
  birthDate: "",
  leaseStart: "",
  leaseEnd: "",
  deposit: 0,
  guidelineRentPerSqm: 0,
  guidelineRentTotal: 0,
  operatingCostPerSqm: 0,
  netRent: 0,
  allowedGrossRent: 0,
  allowedGrossRentFixedTerm: 0,
  operatingCosts: 0,
  vat: 0,
  adjustments: "",
};

const blankCaseRecord: CaseRecord = {
  id: "new",
  tenant: "",
  address: "",
  status: "Entwurf",
  lastActivity: "",
  claimAmount: 0,
  extracted: blankExtractedData,
  calculation: calculateSettlement({
    currentGrossRent: 0,
    allowedGrossRent: 0,
    startDate: "",
    endDate: "",
    paidDeductions: 0,
    settlementReductionPercent: 30,
  }),
};
