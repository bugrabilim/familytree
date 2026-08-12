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
    };
  }

  interface User {
    role?: TreeRole;
    treeName?: string;
  }
}
