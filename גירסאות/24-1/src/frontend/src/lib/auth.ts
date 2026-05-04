import { NextAuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";

export const authOptions: NextAuthOptions = {
  providers: [
    CredentialsProvider({
      name: "credentials",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" }
      },
      async authorize(credentials) {
        // Mock user database with different roles
        const users = [
          {
            id: "1",
            email: "admin@example.com",
            password: "password",
            name: "מנהל מערכת",
            role: "admin"
          },
          {
            id: "2", 
            email: "coordinator@example.com",
            password: "password",
            name: "רכזת שכבה",
            role: "coordinator"
          },
          {
            id: "3",
            email: "group@example.com", 
            password: "password",
            name: "רכזת הקבצות",
            role: "group_coordinator"
          },
          {
            id: "4",
            email: "teacher@example.com",
            password: "password", 
            name: "מורה",
            role: "teacher"
          }
        ];

        const user = users.find(u => 
          u.email === credentials?.email && u.password === credentials?.password
        );

        if (user) {
          return {
            id: user.id,
            email: user.email,
            name: user.name,
            role: user.role
          };
        }

        return null;
      }
    })
  ],
  pages: {
    signIn: "/login",
  },
  session: {
    strategy: "jwt",
  },
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.role = user.role;
      }
      return token;
    },
    async session({ session, token }) {
      if (token && session.user) {
        session.user.id = token.sub!;
        session.user.role = token.role;
      }
      return session;
    }
  },
  secret: process.env.NEXTAUTH_SECRET,
  debug: process.env.NODE_ENV === "development",
};
