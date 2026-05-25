import { Card, CardContent } from "@/components/ui/card";

export default function PaymentsPage() {
  return <Placeholder title="Zahlungen" text="Abschlagszahlungen, bereits bezahlte Beträge und Zahlungseingänge werden hier gepflegt." />;
}

function Placeholder({ title, text }: { title: string; text: string }) {
  return <div className="space-y-5"><div><h1 className="text-2xl font-extrabold text-navy-950">{title}</h1><p className="text-sm text-slate-500">{text}</p></div><Card><CardContent><p className="text-sm text-slate-600">MVP-Ansicht mit vorbereiteter Navigation. Die Zahlungslogik ist für die Supabase-Phase vorgesehen.</p></CardContent></Card></div>;
}
