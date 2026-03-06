"use client";

import {
  createContext,
  useCallback,
  useContext,
  type ReactNode,
} from "react";
import { useSession, signIn as nextAuthSignIn, signOut as nextAuthSignOut } from "next-auth/react";

export interface User {
  id: string;
  email: string;
  name: string;
  isSuperadmin: boolean;
}

interface AuthContextType {
  user: User | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<{ error: Error | null }>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const { data: session, status } = useSession();
  const loading = status === "loading";

  const user: User | null = session?.user
    ? {
        id: session.user.id,
        email: session.user.email,
        name: session.user.name,
        isSuperadmin: session.user.isSuperadmin,
      }
    : null;

  const signIn = useCallback(
    async (email: string, password: string): Promise<{ error: Error | null }> => {
      const normalizedEmail = email.toLowerCase().trim();
      if (!normalizedEmail || !password) {
        return { error: new Error("Email and password are required") };
      }

      const result = await nextAuthSignIn("credentials", {
        email: normalizedEmail,
        password,
        redirect: false,
      });

      if (result?.error) {
        return { error: new Error("Invalid credentials") };
      }
      return { error: null };
    },
    [],
  );

  const signOut = useCallback(async () => {
    await nextAuthSignOut({ redirect: false });
  }, []);

  return (
    <AuthContext.Provider value={{ user, loading, signIn, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (ctx === undefined) {
    throw new Error("useAuth must be used within AuthProvider");
  }
  return ctx;
}
