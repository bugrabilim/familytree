import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { compare } from "bcryptjs";
import { findUserByFamilyName } from "@/lib/users";
import { findMemberByPassword } from "@/lib/members";
import { prepareDemoAccount } from "@/lib/demo-account";
import type { TreeRole } from "@/types/user";

export const { handlers, auth, signIn, signOut } = NextAuth({
  providers: [
    Credentials({
      name: "credentials",
      credentials: {
        familyName: { label: "Ağaç adı", type: "text" },
        password: { label: "Şifre", type: "password" },
      },
      async authorize(credentials) {
        const familyName = credentials?.familyName as string | undefined;
        const password = credentials?.password as string | undefined;
        if (!familyName || !password) return null;

        const user = await findUserByFamilyName(familyName);
        if (!user) return null;

        // Founder (ağacı kuran) → admin. Kimlik = treeId (veri blob'u buna bağlı).
        if (await compare(password, user.passwordHash)) {
          return { id: user.id, name: user.familyName, role: "admin", treeName: user.familyName, isFounder: true };
        }

        // Aksi hâlde: aynı ağaca davetle katılmış bir üye mi? (rol üyeden gelir)
        const member = await findMemberByPassword(user.id, password);
        if (member) {
          return { id: user.id, name: member.displayName, role: member.role, treeName: user.familyName, isFounder: false };
        }

        return null;
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
        // Demo ortak oyun alanı: ziyaretçiler serbestçe ekler/düzenler → admin.
        return { id: user.id, name: user.familyName, role: "admin", treeName: user.familyName, isFounder: true };
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
        // Girişte rol + ağaç adı + founder bilgisi jetona işlenir.
        const u = user as { role?: TreeRole; treeName?: string; isFounder?: boolean };
        token.role = u.role ?? "admin";
        token.treeName = u.treeName ?? (user.name as string | undefined);
        token.isFounder = u.isFounder ?? true;
      }
      return token;
    },
    async session({ session, token }) {
      if (token.id) session.user.id = token.id as string;
      if (token.name) session.user.name = token.name as string;
      // Eski jetonlar (bu değişiklikten önce giriş yapanlar) rol taşımaz;
      // onlar zaten ağaç şifresiyle giren founder'lardı → admin varsayılır.
      session.user.role = (token.role as TreeRole | undefined) ?? "admin";
      session.user.treeName = (token.treeName as string | undefined) ?? session.user.name ?? undefined;
      // Eski jetonda yoksa founder varsay (ağaç şifresiyle girenler).
      session.user.isFounder = (token.isFounder as boolean | undefined) ?? true;
      return session;
    },
  },
});
