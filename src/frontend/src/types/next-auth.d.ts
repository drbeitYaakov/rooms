import NextAuth from "next-auth";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      name: string;
      email: string;
      role: string;
      mfaEnabled?: boolean;
    };
  }

  interface User {
    role: string;
    mfaEnabled?: boolean;
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    role: string;
    mfaEnabled?: boolean;
  }
}
