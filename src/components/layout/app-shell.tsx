"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect } from "react";
import { Bell, Menu, Plus } from "lucide-react";
import { Sidebar } from "@/components/layout/sidebar";
import { Button } from "@/components/ui/button";
import { appBranding } from "@/lib/branding";
import { useAuth } from "@/lib/use-auth";

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { user, loaded } = useAuth();
  const isLogin = pathname === "/login";

  useEffect(() => {
    if (!loaded) return;
    if (!user && !isLogin) router.replace("/login");
    if (user && isLogin) router.replace("/dashboard");
  }, [isLogin, loaded, router, user]);

  if (isLogin) return <>{children}</>;
  if (!loaded || !user) return null;

  return (
    <div className="flex min-h-screen">
      <Sidebar />
      <div className="min-w-0 flex-1">
        <header className="sticky top-0 z-20 flex h-16 items-center justify-between border-b border-slate-200 bg-white/90 px-4 backdrop-blur md:px-6">
          <div className="flex items-center gap-3">
            <button className="grid h-10 w-10 place-items-center rounded-md border border-slate-200 text-navy-800 lg:hidden" aria-label="Menü öffnen">
              <Menu size={20} />
            </button>
            <div>
              <div className="text-sm font-semibold text-navy-900">{appBranding.name}</div>
              <div className="hidden text-xs text-slate-500 sm:block">{appBranding.subtitle}</div>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <button className="relative grid h-10 w-10 place-items-center rounded-md border border-slate-200 text-navy-800" aria-label="Benachrichtigungen">
              <Bell size={18} />
              <span className="absolute right-2 top-2 h-2.5 w-2.5 rounded-full bg-red-500" />
            </button>
            <Button asChild className="hidden sm:inline-flex">
              <Link href="/cases/new">
                <Plus size={17} />
                Neuer Fall
              </Link>
            </Button>
          </div>
        </header>
        <main className="legal-grid min-h-[calc(100vh-4rem)] p-4 md:p-6">{children}</main>
      </div>
    </div>
  );
}
