import "next-auth";
import type { TreeRole } from "./user";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      name?: string | null;
      email?: string | null;
      image?: string | null;
      /** Ağaçtaki rol (Madde 13). Eski oturumlarda tanımsız olabilir → admin. */
      role?: TreeRole;
      /** Ağaç adı (üye girişinde kişi adından ayrı gösterim için). */
      treeName?: string;
      /** Ağacı kuran hesap mı? (üye değilse) — çoklu ağaç sahipliği için. */
      isFounder?: boolean;
    isGuest?: boolean;
      /** Misafir oturumu (Faz 3d) — kısıtlar `lib/guest.ts`te. */
      isGuest?: boolean;
      /**
       * Davetli ÜYENİN kendi kimliği (`lib/members.ts`). Kurucuda yoktur:
       * onun kimliği ağacın kimliğidir. `id` ağacı, bu alan kişiyi söyler.
       */
      memberId?: string;
    };
  }

  interface User {
    role?: TreeRole;
    treeName?: string;
    isFounder?: boolean;
    memberId?: string;
  }
}
