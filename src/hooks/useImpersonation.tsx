"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { useAuth } from "@/hooks/useAuth";

const STORAGE_KEY = "impersonation";

export interface ImpersonatedUser {
  id: string;
  email: string;
  fullName: string;
}

interface ImpersonationContextType {
  /** The user currently being impersonated, or null if not impersonating. */
  impersonating: ImpersonatedUser | null;
  /** Whether the real logged-in user is a superadmin (eligible to impersonate). */
  isSuperadmin: boolean;
  /** Start impersonating a user. */
  startImpersonating: (user: ImpersonatedUser) => void;
  /** Stop impersonating and revert to the real user. */
  stopImpersonating: () => void;
}

const ImpersonationContext = createContext<ImpersonationContextType | undefined>(
  undefined,
);

export function ImpersonationProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const isSuperadmin = user?.isSuperadmin ?? false;

  const [impersonating, setImpersonating] = useState<ImpersonatedUser | null>(
    null,
  );

  useEffect(() => {
    if (!isSuperadmin) {
      setImpersonating(null);
      return;
    }
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        setImpersonating(JSON.parse(stored));
      }
    } catch {
      /* ignore */
    }
  }, [isSuperadmin]);

  // Patch global fetch to inject the impersonation header
  useEffect(() => {
    if (!impersonating) return;

    const originalFetch = window.fetch;
    window.fetch = function patchedFetch(input, init) {
      const headers = new Headers(init?.headers);
      if (!headers.has("X-Impersonate-User-Id")) {
        headers.set("X-Impersonate-User-Id", impersonating.id);
      }
      return originalFetch.call(this, input, { ...init, headers });
    };

    return () => {
      window.fetch = originalFetch;
    };
  }, [impersonating]);

  const startImpersonating = useCallback(
    (target: ImpersonatedUser) => {
      if (!isSuperadmin) return;
      setImpersonating(target);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(target));
      window.location.reload();
    },
    [isSuperadmin],
  );

  const stopImpersonating = useCallback(() => {
    setImpersonating(null);
    localStorage.removeItem(STORAGE_KEY);
    window.location.reload();
  }, []);

  return (
    <ImpersonationContext.Provider
      value={{ impersonating, isSuperadmin, startImpersonating, stopImpersonating }}
    >
      {children}
    </ImpersonationContext.Provider>
  );
}

export function useImpersonation() {
  const ctx = useContext(ImpersonationContext);
  if (ctx === undefined) {
    throw new Error(
      "useImpersonation must be used within ImpersonationProvider",
    );
  }
  return ctx;
}
