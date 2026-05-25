"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { LogIn, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { appBranding } from "@/lib/branding";
import { AuthService } from "@/lib/auth";

export default function LoginPage() {
  const router = useRouter();
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const user = AuthService.login(identifier, password);
    if (!user) {
      setError("E-Mail/Benutzername oder Passwort ist falsch.");
      return;
    }

    router.replace("/dashboard");
  }

  return (
    <main className="grid min-h-screen place-items-center bg-slate-50 px-4">
      <section className="w-full max-w-md rounded-lg border border-slate-200 bg-white p-8 shadow-sm">
        <div className="mb-7 flex items-center gap-3">
          <div className="grid h-11 w-11 place-items-center rounded-lg bg-navy-950 text-gold-400">
            <ShieldCheck size={24} />
          </div>
          <div>
            <h1 className="text-2xl font-extrabold text-navy-950">{appBranding.name}</h1>
            <p className="text-sm font-semibold text-slate-500">Anmelden</p>
          </div>
        </div>

        <form className="space-y-4" onSubmit={submit}>
          <label>
            <span className="mb-1.5 block text-xs font-bold uppercase tracking-wide text-slate-500">E-Mail oder Benutzername</span>
            <input
              value={identifier}
              onChange={(event) => setIdentifier(event.target.value)}
              className="h-12 w-full rounded-md border border-slate-200 px-3 text-sm outline-none focus:border-blue-700 focus:ring-2 focus:ring-blue-100"
              autoComplete="username"
            />
          </label>
          <label>
            <span className="mb-1.5 block text-xs font-bold uppercase tracking-wide text-slate-500">Passwort</span>
            <input
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              className="h-12 w-full rounded-md border border-slate-200 px-3 text-sm outline-none focus:border-blue-700 focus:ring-2 focus:ring-blue-100"
              autoComplete="current-password"
            />
          </label>
          {error && <div className="rounded-md bg-red-50 px-3 py-2 text-sm font-semibold text-red-700">{error}</div>}
          <Button className="w-full" type="submit">
            <LogIn size={17} />
            Einloggen
          </Button>
        </form>
      </section>
    </main>
  );
}
