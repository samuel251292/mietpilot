"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  BriefcaseBusiness,
  CalendarDays,
  FileArchive,
  Home,
  LayoutTemplate,
  ListChecks,
  Mail,
  PenLine,
  PlusCircle,
  Settings,
  ShieldCheck,
  LogOut,
} from "lucide-react";
import { appBranding } from "@/lib/branding";
import { cn } from "@/lib/utils";
import { roleLabel } from "@/lib/auth";
import { AppAuthService } from "@/lib/auth/auth-service";
import { useAuth } from "@/lib/use-auth";

const nav = [
  { href: "/dashboard", label: "Dashboard", icon: Home },
  { href: "/cases", label: "Fälle", icon: BriefcaseBusiness },
  { href: "/cases/new", label: "Neuer Fall", icon: PlusCircle },
  { href: "/documents", label: "Dokumente", icon: FileArchive },
  { href: "/tasks", label: "Aufgaben", icon: ListChecks },
  { href: "/calendar", label: "Kalender", icon: CalendarDays },
  { href: "/writings", label: "Vergleichsschreiben", icon: PenLine },
  { href: "/communications", label: "Kommunikation", icon: Mail },
  { href: "/templates", label: "Vorlagen", icon: LayoutTemplate },
  { href: "/settings", label: "Einstellungen", icon: Settings },
];

export function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const { user } = useAuth();

  async function logout() {
    await AppAuthService.signOut();
    router.replace("/login");
  }

  return (
    <aside className="hidden min-h-screen w-64 shrink-0 bg-navy-950 p-4 text-white lg:flex lg:flex-col">
      <Link href="/dashboard" className="mb-8 flex items-center gap-3 px-2">
        <div className="grid h-10 w-10 place-items-center rounded-lg border border-gold-400/40 bg-gold-400/10 text-gold-400">
          <ShieldCheck size={24} />
        </div>
        <div>
          <div className="text-xl font-extrabold tracking-wide">{appBranding.name}</div>
          <div className="text-xs text-slate-300">Mietzinsprüfung</div>
        </div>
      </Link>

      <nav className="space-y-1">
        {nav.map((item) => {
          const Icon = item.icon;
          const active = pathname === item.href || (item.href !== "/dashboard" && pathname.startsWith(item.href));

          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex h-11 items-center gap-3 rounded-md px-3 text-sm font-semibold text-slate-200 transition",
                active ? "bg-blue-700 text-white" : "hover:bg-white/8 hover:text-white",
              )}
            >
              <Icon size={18} />
              {item.label}
            </Link>
          );
        })}
      </nav>

      <div className="mt-6 rounded-lg border border-white/10 bg-white/5 p-3">
        <div className="text-xs font-semibold uppercase tracking-wide text-gold-400">Workflow</div>
        <div className="mt-2 text-sm font-semibold leading-6 text-slate-100">Upload → Prüfung → Berechnung → Schreiben</div>
      </div>

      <div className="mt-auto border-t border-white/10 pt-4">
        <div className="rounded-lg bg-white/5 p-3">
          <div className="flex items-center gap-3">
          <div className="grid h-9 w-9 place-items-center rounded-full bg-gold-400 text-sm font-bold text-navy-950">{user?.name.slice(0, 2).toUpperCase() ?? "MP"}</div>
          <div className="min-w-0">
            <div className="truncate text-sm font-semibold">{user?.name}</div>
            <div className="mt-1 inline-flex rounded-md bg-white/10 px-2 py-0.5 text-xs font-bold text-slate-100">{user ? roleLabel(user.role) : ""}</div>
          </div>
          </div>
          <button onClick={logout} className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-md border border-white/10 px-3 py-2 text-xs font-bold text-slate-100 hover:bg-white/10">
            <LogOut size={14} />
            Abmelden
          </button>
        </div>
      </div>
    </aside>
  );
}
