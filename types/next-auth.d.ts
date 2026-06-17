import type { DefaultSession } from "next-auth";

// Add our user id to the session and JWT so server code can read session.user.id.
declare module "next-auth" {
  interface Session {
    user: { id: string } & DefaultSession["user"];
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    id?: string;
  }
}
