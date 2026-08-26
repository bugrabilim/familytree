"use client";

import { useMemo } from "react";
import type { Person } from "@/types/family";
import Avatar from "./ui/Avatar";
import { fullName } from "@/lib/name";
import { usePrivacy } from "./PrivacyContext";

/**
 * Merkez (kök) kişi seçici — Soy ve Yelpaze görünümlerinde aynı denetim (#2).
 * Avatar + üstte açıklama etiketi + tüm kişileri (ad · doğum yılı) listeleyen
 * açılır kutu. Kişiler ada/soyada göre sıralanır.
 */
export default function RootSelect({
  people,
  root,
  onSetRoot,
  label,
  id = "kok-secici",
}: {
  people: Person[];
  root: Person;
  onSetRoot: (id: string) => void;
  label: string;
  id?: string;
}) {
  const { view } = usePrivacy();

  const sirali = useMemo(() => {
    const coll = new Intl.Collator("tr");
    return [...people].sort(
      (a, b) => coll.compare(a.firstName, b.firstName) || coll.compare(a.lastName, b.lastName)
    );
  }, [people]);

  return (
    <div className="flex items-center gap-2 min-w-0">
      <Avatar person={root} size="sm" />
      <div className="min-w-0">
        <label className="text-xs text-text-subtle leading-tight block" htmlFor={id}>
          {label}
        </label>
        <select
          id={id}
          value={root.id}
          onChange={(e) => onSetRoot(e.target.value)}
          className="max-w-[16rem] sm:max-w-xs h-7 -ml-1 px-1 rounded-lg bg-transparent hover:bg-surface-2 border border-transparent hover:border-border text-sm font-medium text-text cursor-pointer focus:outline-none focus:border-primary transition-colors"
        >
          {sirali.map((p) => {
            const mp = view(p);
            return (
              <option key={p.id} value={p.id}>
                {fullName(p)}
                {mp.birthDate ? ` · ${mp.birthDate.slice(0, 4)}` : ""}
              </option>
            );
          })}
        </select>
      </div>
    </div>
  );
}
