"use client";

import { useState } from "react";
import type { ExtractedData } from "@/types/case";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

export function ExtractedDataForm({ data }: { data: ExtractedData }) {
  const [form, setForm] = useState(data);
  const [saved, setSaved] = useState(false);

  function update(key: keyof ExtractedData, value: string | number | boolean) {
    setSaved(false);
    setForm((current) => ({ ...current, [key]: value }));
  }

  return (
    <Card>
      <CardContent>
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <h3 className="font-bold text-navy-900">Datenprüfung</h3>
            <p className="text-sm text-slate-500">Automatisch erkannte Werte vor der PDF-Erstellung prüfen.</p>
          </div>
          {saved && <span className="rounded-md bg-emerald-50 px-2 py-1 text-xs font-semibold text-emerald-700">Gespeichert</span>}
        </div>
        <div className="grid gap-3 md:grid-cols-2">
          <Field label="Mietername" value={form.tenantName} onChange={(value) => update("tenantName", value)} />
          <Field label="Telefonnummer" value={form.phone} onChange={(value) => update("phone", value)} />
          <Field label="Adresse" value={form.tenantAddress} onChange={(value) => update("tenantAddress", value)} className="md:col-span-2" />
          <Field label="Vermieter" value={form.landlord} onChange={(value) => update("landlord", value)} />
          <Field label="Mietbeginn" value={form.leaseStart} onChange={(value) => update("leaseStart", value)} type="date" />
          <Field label="Aktuelle Bruttomiete" value={form.grossRent} onChange={(value) => update("grossRent", Number(value))} type="number" />
          <Field label="Nutzfläche gemessen" value={form.measuredArea} onChange={(value) => update("measuredArea", Number(value))} type="number" />
          <Field label="Kategorie" value={form.category} onChange={(value) => update("category", value)} />
          <Field label="Ausstattung" value={form.equipment} onChange={(value) => update("equipment", value)} />
        </div>
        <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {[
            ["Balkon", "balcony"],
            ["Bad/WC ein Raum", "bathToiletSameRoom"],
            ["Gangküche", "corridorKitchen"],
            ["Lärmbeeinträchtigung", "noiseImpact"],
            ["Kellerabteil", "cellar"],
            ["Gegensprechanlage", "intercom"],
            ["Befristung", "fixedTerm"],
          ].map(([label, key]) => (
            <label key={key} className="flex items-center gap-2 rounded-md border border-slate-200 px-3 py-2 text-sm">
              <input
                type="checkbox"
                checked={Boolean(form[key as keyof ExtractedData])}
                onChange={(event) => update(key as keyof ExtractedData, event.target.checked)}
              />
              {label}
            </label>
          ))}
        </div>
        <Button className="mt-5 w-full" onClick={() => setSaved(true)}>
          Daten prüfen & speichern
        </Button>
      </CardContent>
    </Card>
  );
}

function Field({
  label,
  value,
  onChange,
  type = "text",
  className = "",
}: {
  label: string;
  value: string | number;
  onChange: (value: string) => void;
  type?: string;
  className?: string;
}) {
  return (
    <label className={className}>
      <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</span>
      <input
        type={type}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="h-10 w-full rounded-md border border-slate-200 bg-white px-3 text-sm outline-none focus:border-blue-700 focus:ring-2 focus:ring-blue-100"
      />
    </label>
  );
}
