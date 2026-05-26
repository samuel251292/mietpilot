"use client";

import { useEffect, useState } from "react";
import type { PublicUser } from "@/lib/auth";
import { AppAuthService } from "@/lib/auth/auth-service";

export function useAuth() {
  const [user, setUser] = useState<PublicUser | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let mounted = true;

    const load = async () => {
      try {
        const currentUser = await AppAuthService.getCurrentUser();
        if (!mounted) return;
        setUser(currentUser);
      } catch {
        if (!mounted) return;
        setUser(null);
      } finally {
        if (mounted) setLoaded(true);
      }
    };

    void load();
    const handleAuthChange = () => void load();
    window.addEventListener("mietpilot-auth-changed", handleAuthChange);
    window.addEventListener("storage", handleAuthChange);
    return () => {
      mounted = false;
      window.removeEventListener("mietpilot-auth-changed", handleAuthChange);
      window.removeEventListener("storage", handleAuthChange);
    };
  }, []);

  return { user, loaded };
}
