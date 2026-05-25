"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { CaseService } from "@/lib/case-service";
import { formatCurrency } from "@/lib/utils";
import type { SavedCaseRecord } from "@/types/case";

export default function CalculationsPage() {
  const [records, setRecords] = useState<SavedCaseRecord[]>([]);

  useEffect(() => {
    const load = () => setRecords(CaseService.list());
    load();
    window.addEventListener("mietpilot-cases-changed", load);
    return () => window.removeEventListener("mietpilot-cases-changed", load);
  }, []);

  const calculatedRecords = records.filter((record) => Number(record.calculation?.settlementAmount) > 0 || Number(record.calculation?.monthlyExcess) > 0);

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-extrabold text-navy-950">Berechnungen</h1>
        <p className="text-sm text-slate-500">Richtwertberechnungen und Vergleichsbeträge aus gespeicherten Fällen.</p>
      </div>
      <Card>
        <CardContent>
          {calculatedRecords.length > 0 ? (
            <div className="grid gap-3">
              {calculatedRecords.map((item) => (
                <Link key={item.id} href={`/cases/${item.id}`} className="grid gap-2 rounded-lg border border-slate-200 p-4 transition hover:border-blue-300 hover:bg-blue-50/40 md:grid-cols-4">
                  <strong>{item.id}</strong>
                  <span>{formatCurrency(item.calculation.monthlyExcess)} monatlich</span>
                  <span>{item.calculation.months} Monate</span>
                  <strong className="text-emerald-700 md:text-right">{formatCurrency(item.calculation.settlementAmount)}</strong>
                </Link>
              ))}
            </div>
          ) : (
            <div className="rounded-lg border border-dashed border-slate-200 p-8 text-center">
              <div className="font-extrabold text-navy-950">Noch keine gespeicherten Berechnungen</div>
              <p className="mt-2 text-sm text-slate-500">Sobald Fälle berechnet und gespeichert werden, erscheinen sie hier.</p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
