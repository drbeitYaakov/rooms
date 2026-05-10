import { NextAuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || "https://rooms-ma9h.onrender.com";

const buildAuthorizeError = (code: string, detail?: string) => {
  const normalizedDetail = detail?.trim();
  return normalizedDetail ? `${code}:${normalizedDetail}` : code;
};

export const authOptions: NextAuthOptions = {
  providers: [
    CredentialsProvider({
      name: "credentials",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
        mfaCode: { label: "MFA Code", type: "text" },
        mfaToken: { label: "MFA Token", type: "text" }
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) {
          throw new Error(buildAuthorizeError("AUTH_MISSING_CREDENTIALS"));
        }

        try {
          const response = await fetch(`${API_BASE_URL}/api/auth/login`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json"
            },
            body: JSON.stringify({
              email: credentials.email,
              password: credentials.password,
              mfaCode: credentials.mfaCode,
              mfaToken: credentials.mfaToken
            })
          });

          if (!response.ok) {
            const responseText = await response.text();
            console.error("NextAuth authorize failed:", response.status, responseText);
            throw new Error(buildAuthorizeError(`AUTH_${response.status}`, responseText));
          }

          const payload = await response.json();
          console.error("NextAuth authorize payload:", payload);

          if (payload?.data?.mfaRequired) {
            console.error("NextAuth authorize detected MFA requirement");
            throw new Error(buildAuthorizeError("AUTH_MFA_REQUIRED"));
          }

          const user = payload?.data?.user;
          console.error("NextAuth authorize extracted user:", user);

          if (!user?.id || !user?.email) {
            console.error("NextAuth authorize missing required user fields", {
              hasId: Boolean(user?.id),
              hasEmail: Boolean(user?.email)
            });
            throw new Error(buildAuthorizeError("AUTH_INVALID_USER_PAYLOAD"));
          }

          return {
            id: user.id,
            email: user.email,
            name: user.name,
            role: user.role,
            mfaEnabled: Boolean(user.mfaEnabled)
          };
        } catch (error) {
          console.error("NextAuth authorize error:", error);
          throw error instanceof Error
            ? error
            : new Error(buildAuthorizeError("AUTH_REQUEST_FAILED"));
        }
      }
    })
  ],
  pages: {
    signIn: "/login",
  },
  session: {
    strategy: "jwt",
    maxAge: 8 * 60 * 60,
  },
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.role = user.role;
        token.mfaEnabled = user.mfaEnabled;
      }
      return token;
    },
    async session({ session, token }) {
      if (token && session.user) {
        session.user.id = token.sub!;
        session.user.role = token.role;
        session.user.mfaEnabled = Boolean(token.mfaEnabled);
      }
      return session;
    }
  },
  secret: process.env.NEXTAUTH_SECRET,
  debug: process.env.NODE_ENV === "development",
};
