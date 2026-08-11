import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { compare } from "bcryptjs";
import { findUserByFamilyName } from "@/lib/users";
import { prepareDemoAccount } from "@/lib/demo-account";

export const { handlers, auth, signIn, signOut } = NextAuth({
  providers: [
    Credentials({
      name: "credentials",
      credentials: {
        familyName: { label: "Soyisim", type: "text" },
        password: { label: "Şifre", type: "password" },
      },
      async authorize(credentials) {
        const familyName = credentials?.familyName as string | undefined;
        const password = credentials?.password as string | undefined;
        if (!familyName || !password) return null;

        const user = await findUserByFamilyName(familyName);
        if (!user) return null;

        const valid = await compare(password, user.passwordHash);
        if (!valid) return null;

        return { id: user.id, name: user.familyName };
      },
    }),

    /**
     * Şifresiz demo girişi.
     *
     * Ayrı bir sağlayıcı olması bilinçli: normal giriş yolunda şifre
     * denetimini gevşetmek yerine, demo tamamen kendi kapısından geçer.
     * Yalnızca sunucu tarafından `signIn("demo")` ile çağrılabilir.
     */
    Credentials({
      id: "demo",
      name: "demo",
      credentials: {},
      async authorize() {
        const user = await prepareDemoAccount();
        return { id: user.id, name: user.familyName };
      },
    }),
  ],
  pages: {
    signIn: "/login",
  },
  session: {
    strategy: "jwt",
    maxAge: 30 * 24 * 60 * 60,
  },
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id;
        token.name = user.name;
      }
      return token;
    },
    async session({ session, token }) {
      if (token.id) session.user.id = token.id as string;
      if (token.name) session.user.name = token.name as string;
      return session;
    },
  },
});
