"use client";

import { useEffect, useState } from "react";
import { AuthService, type PublicUser } from "@/lib/auth";

export function useAuth() {
  const [user, setUser] = useState<PublicUser | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    const load = () => {
      setUser(AuthService.currentUser());
      setLoaded(true);
    };

    load();
    window.addEventListener("mietpilot-auth-changed", load);
    window.addEventListener("storage", load);
    return () => {
      window.removeEventListener("mietpilot-auth-changed", load);
      window.removeEventListener("storage", load);
    };
  }, []);

  return { user, loaded };
}
