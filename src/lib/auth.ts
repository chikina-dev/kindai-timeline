import NextAuth from "next-auth";
import Google from "next-auth/providers/google";
import { DrizzleAdapter } from "@auth/drizzle-adapter";
import { getDb } from "@/lib/db";
import {
  users,
  accounts,
  sessions,
  verificationTokens,
} from "@/lib/db/schema";

type AuthInstance = ReturnType<typeof NextAuth>;
type AuthRedirectOptions = {
  redirect?: boolean;
  redirectTo?: string;
};
type AuthAuthorizationParams =
  | string
  | URLSearchParams
  | Record<string, string>
  | string[][];

let authInstance: AuthInstance | undefined;

function getAuthInstance(): AuthInstance {
  if (!authInstance) {
    authInstance = NextAuth({
      adapter: DrizzleAdapter(getDb(), {
        usersTable: users,
        accountsTable: accounts,
        sessionsTable: sessions,
        verificationTokensTable: verificationTokens,
      }),
      providers: [
        Google({
          clientId: process.env.AUTH_GOOGLE_ID,
          clientSecret: process.env.AUTH_GOOGLE_SECRET,
        }),
      ],
      callbacks: {
        async signIn({ user }) {
          if (!user.email?.endsWith("@kindai.ac.jp")) {
            return false;
          }
          return true;
        },
        async session({ session, token }) {
          if (session.user && token.sub) {
            session.user.id = token.sub;
          }
          return session;
        },
        async jwt({ token, user }) {
          if (user) {
            token.sub = user.id;
          }
          return token;
        },
      },
      pages: {
        signIn: "/login",
        error: "/login",
      },
      session: {
        strategy: "jwt",
      },
      trustHost: true,
    });
  }

  return authInstance;
}

export const handlers: AuthInstance["handlers"] = {
  GET(...args) {
    return getAuthInstance().handlers.GET(...args);
  },
  POST(...args) {
    return getAuthInstance().handlers.POST(...args);
  },
};

export function auth() {
  return getAuthInstance().auth();
}

export function signIn(
  provider?: string,
  options?: AuthRedirectOptions,
  authorizationParams?: AuthAuthorizationParams
) {
  return getAuthInstance().signIn(provider, options, authorizationParams);
}

export function signOut(options?: AuthRedirectOptions) {
  return getAuthInstance().signOut(options);
}
