import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { compare } from "bcryptjs";
import { createAdminClient } from "@/lib/supabase/admin";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      email: string;
      name: string;
      isSuperadmin: boolean;
    };
  }

  interface User {
    id: string;
    email: string;
    name: string;
    isSuperadmin: boolean;
  }
}

declare module "@auth/core/jwt" {
  interface JWT {
    id: string;
    email: string;
    name: string;
    isSuperadmin: boolean;
  }
}

export const { handlers, signIn, signOut, auth } = NextAuth({
  providers: [
    Credentials({
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        const email =
          typeof credentials?.email === "string"
            ? credentials.email.trim().toLowerCase()
            : "";
        const password =
          typeof credentials?.password === "string"
            ? credentials.password
            : "";

        if (!email || !password) return null;

        const admin = createAdminClient();
        const { data: profile, error } = await admin
          .from("users")
          .select("id, email, full_name, password, is_activated, is_superadmin")
          .eq("email", email)
          .maybeSingle();

        if (error || !profile) return null;
        if (!profile.is_activated) return null;
        if (!profile.password) return null;

        const passwordMatch = await compare(password, profile.password);
        if (!passwordMatch) return null;

        return {
          id: profile.id,
          email: profile.email,
          name: profile.full_name ?? email.split("@")[0],
          isSuperadmin: profile.is_superadmin ?? false,
        };
      },
    }),
  ],
  session: { strategy: "jwt" },
  pages: {
    signIn: "/login",
  },
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id!;
        token.email = user.email!;
        token.name = user.name!;
        token.isSuperadmin = user.isSuperadmin;
      }
      return token;
    },
    async session({ session, token }) {
      session.user = {
        ...session.user,
        id: token.id,
        email: token.email,
        name: token.name,
        isSuperadmin: token.isSuperadmin,
      };
      return session;
    },
  },
});
