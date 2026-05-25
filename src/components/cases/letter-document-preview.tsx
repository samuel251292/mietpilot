import { FileText } from "lucide-react";
import { defaultCompanyProfile } from "@/lib/company-profile";
import { cn } from "@/lib/utils";

export function LetterDocumentPreview({ content, className }: { content: string; className?: string }) {
  return (
    <div className={cn("rounded-lg border border-slate-200 bg-slate-100 p-3 md:p-5", className)}>
      <article className="mx-auto min-h-[620px] max-w-[760px] bg-white p-8 shadow-panel md:p-10">
        <header className="border-b-2 border-navy-900 pb-5">
          <div className="flex items-start justify-between gap-6">
            <div>
              <div className="text-xl font-extrabold tracking-wide text-navy-950">{defaultCompanyProfile.logoText}</div>
              <div className="mt-1 text-sm font-bold text-navy-900">{defaultCompanyProfile.companyName}</div>
              <div className="mt-3 text-xs leading-5 text-slate-500">
                {defaultCompanyProfile.address}
                <br />
                {defaultCompanyProfile.phone}
                <br />
                {defaultCompanyProfile.email}
              </div>
            </div>
            <div className="grid h-14 w-14 place-items-center rounded-lg border border-gold-400 bg-gold-400/10 text-gold-500">
              <FileText size={26} />
            </div>
          </div>
        </header>

        <section className="mt-8 whitespace-pre-wrap font-sans text-sm leading-7 text-slate-800">{content}</section>

        <footer className="mt-10 border-t border-slate-200 pt-4 text-[11px] leading-5 text-slate-500">
          {defaultCompanyProfile.companyName} · {defaultCompanyProfile.address} · Bankverbindung laut Schreiben
        </footer>
      </article>
    </div>
  );
}
