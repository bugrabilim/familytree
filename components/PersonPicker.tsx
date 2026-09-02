"use client";

import { useMemo } from "react";
import type { Person } from "@/types/family";
import { fullName } from "@/lib/name";
import { usePrivacy } from "./PrivacyContext";
import { useT } from "@/lib/i18n";

/**
 * "Bir kişi seç" açılır listesi. Türkçe sıralı (İ/ı doğru yerde), doğum yılı
 * ayırt edici olarak yanında.
 *
 * Yıl `view()`den okunur: gizli bir kişinin doğum yılı listede sızmasın.
 * (Ad maskeli kopyada da durur; gizlilik modeli adı hassas saymıyor.)
 *
 * `PanelView` içinde yaşıyordu; paylaşım penceresi de aynı listeye ihtiyaç
 * duyunca buraya taşındı.
 */
export const pickerSelectCls =
  "w-full h-9 px-2.5 rounded-xl bg-surface-2 border border-border text-sm text-text focus:outline-none focus:border-primary cursor-pointer";

export default function PersonPicker({
  people,
  value,
  onChange,
}: {
  people: Person[];
  value: string;
  onChange: (id: string) => void;
}) {
  const { view } = usePrivacy();
  const t = useT();
  const sorted = useMemo(() => {
    const coll = new Intl.Collator("tr");
    return [...people].sort(
      (x, y) => coll.compare(x.firstName, y.firstName) || coll.compare(x.lastName, y.lastName)
    );
  }, [people]);
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className={pickerSelectCls}
      aria-label={t("common.choosePersonAria")}
    >
      <option value="">{t("common.choosePerson")}</option>
      {sorted.map((p) => {
        const mp = view(p);
        return (
          <option key={p.id} value={p.id}>
            {fullName(p)}
            {mp.birthDate ? ` · ${mp.birthDate.slice(0, 4)}` : ""}
          </option>
        );
      })}
    </select>
  );
}
