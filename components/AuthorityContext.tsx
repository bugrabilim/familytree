"use client";

import { createContext, useContext, useMemo } from "react";
import { canContribute, canEdit, canEditPerson } from "@/lib/roles";
import type { TreeRole } from "@/types/user";

/**
 * KİM NE YAPABİLİR — arayüz tarafı (madde 35).
 *
 * `ReadOnlyContext`ten AYRI ve ayrı olması bilinçli: orası kullanıcının kendi
 * TERCİHİ (göz atarken kazara değiştirmemek için salt-okunur), burası ise
 * sunucunun verdiği YETKİ. Biri kapatılabilir, öbürü kapatılamaz; tek bayrağa
 * indirilseydi kullanıcı kendi yetkisini "açabilir" sanırdı.
 *
 * Buradaki hiçbir şey GÜVENLİK SINIRI DEĞİL — asıl kapı sunucuda
 * (`lib/roles.ts` + rota kapıları). Bu katmanın işi, kullanıcıya
 * yapamayacağı bir düğme göstermemek: 403 yiyen bir arayüz, yetkisi
 * olmadığını söylemeyen bir arayüzden daha kötüdür.
 */

interface AuthorityValue {
  role: TreeRole;
  /** Bu oturumun kayıt sahipliği kimliği (`ctx.authorId`). */
  authorId: string;
  /** Yeni kayıt ekleyebilir mi? */
  canAdd: boolean;
  /** Var olanı doğrudan değiştirebilir/silebilir mi? */
  canEditAll: boolean;
  /** Öneri onaylayabilir mi? */
  canDecide: boolean;
  /** Katkı verici mi — yani doğrudan değil, ÖNEREREK mi değiştiriyor? */
  proposes: boolean;
  /** Bu kişiyi doğrudan düzenleyebilir mi? (kural `lib/roles.ts`te) */
  canEditPerson: (person: { addedBy?: string } | undefined | null) => boolean;
}

const AuthorityContext = createContext<AuthorityValue | null>(null);

export function AuthorityProvider({
  children,
  role = "admin",
  authorId = "",
}: {
  children: React.ReactNode;
  role?: TreeRole;
  authorId?: string;
}) {
  const value = useMemo<AuthorityValue>(
    () => ({
      role,
      authorId,
      canAdd: canContribute(role),
      canEditAll: canEdit(role),
      canDecide: canEdit(role),
      proposes: canContribute(role) && !canEdit(role),
      canEditPerson: (person) => canEditPerson(role, authorId, person),
    }),
    [role, authorId]
  );
  return <AuthorityContext.Provider value={value}>{children}</AuthorityContext.Provider>;
}

/**
 * Sağlayıcı YOKSA tam yetki varsayılıyor.
 *
 * Depodaki her ekran bu sağlayıcının altında değil (yazdırma, kitap, genel
 * paylaşım kendi ağaçlarını kuruyor) ve orada rolü bilmemek "yetkisiz" demek
 * değil. Kısıtlama gereken yerlerde zaten kendi kapıları var; buradaki
 * varsayılan yalnız arayüzü bozmamak için.
 */
export function useAuthority(): AuthorityValue {
  const ctx = useContext(AuthorityContext);
  return (
    ctx ?? {
      role: "admin",
      authorId: "",
      canAdd: true,
      canEditAll: true,
      canDecide: true,
      proposes: false,
      canEditPerson: () => true,
    }
  );
}
