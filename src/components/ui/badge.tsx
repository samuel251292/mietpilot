import { cn } from "@/lib/utils";
import type { CaseStatus } from "@/types/case";

const statusClass: Record<CaseStatus, string> = {
  Entwurf: "bg-slate-100 text-slate-700",
  "Dokumente hochgeladen": "bg-blue-50 text-blue-700",
  "Daten geprüft": "bg-amber-50 text-amber-700",
  "Berechnung abgeschlossen": "bg-violet-50 text-violet-700",
  "Schreiben erstellt": "bg-emerald-50 text-emerald-700",
  Abgeschlossen: "bg-green-50 text-green-700",
};

export function StatusBadge({ status }: { status: CaseStatus }) {
  return <span className={cn("rounded-md px-2.5 py-1 text-xs font-semibold", statusClass[status])}>{status}</span>;
}
