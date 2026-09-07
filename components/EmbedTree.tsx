"use client";

import { useState } from "react";
import type { Person } from "@/types/family";
import FamilyTree from "./FamilyTree";
import { PrivacyProvider } from "./PrivacyContext";
import { ReadOnlyProvider } from "./ReadOnlyContext";
import { fullName } from "@/lib/name";

/**
 * Gömülebilir ağaç — başka bir sitenin iframe'inde açılan sade görünüm.
 *
 * `Workspace` DEĞİL, ayrı bir bileşen. Gömme genelde dar bir kutuda (bir blog
 * yazısının içinde, 400–600 px) duruyor; oraya üst çubuğu, sekmeleri, arama
 * kutusunu ve menüleri taşımak kullanılabilir bir şey vermezdi. Burada
 * yalnız tuval, bir künye satırı ve seçilen kişinin adı var.
 *
 * Salt okunur zorlanıyor: `ReadOnlyProvider forced` + `PrivacyProvider
 * forced`. Zaten sunucuda maskelenmiş veri geliyor, ama arayüzün de düzenleme
 * düğmesi göstermemesi gerekiyor — gömülü bir sayfada basılacak bir "Sil"
 * düğmesi bulunmamalı.
 */
export default function EmbedTree({
  people,
  treeName,
  hideLiving,
  fullUrl,
  poweredBy,
}: {
  people: Person[];
  treeName?: string;
  hideLiving: boolean;
  /** Tam paylaşım sayfası — künyeden yeni sekmede açılır. */
  fullUrl: string;
  poweredBy: string;
}) {
  const [selectedId, setSelectedId] = useState<string | undefined>();
  const selected = people.find((p) => p.id === selectedId);

  return (
    <ReadOnlyProvider forced>
      <PrivacyProvider forced forcedValue={hideLiving}>
        <div className="h-dvh w-full bg-bg">
          <FamilyTree
            people={people}
            selectedId={selectedId}
            onSelect={setSelectedId}
            /*
             * Gömülü görünümde kişi ekleme yok. `onQuickAdd` boş bırakılıyor;
             * kartlardaki + düğmeleri zaten salt-okunur kipte çizilmiyor.
             */
            onQuickAdd={() => {}}
            onDeselect={() => setSelectedId(undefined)}
            /*
              Künye: gömen sitede ağacın nereden geldiği görünsün ve okur tam
              sayfaya gidebilsin. `target="_blank"` zorunlu — iframe içinde
              aynı sekmede açmak, gömen sayfanın içinde sıkışmış bir gezinti
              olurdu. `rel="noopener"` ile açılan sayfa `window.opener`a
              erişemiyor.

              Denetim satırında, tuvalin üstünde DEĞİL: künye `absolute
              bottom-2 right-2` ile duruyordu ve tıklamayı yutuyordu, yani
              o köşeye denk gelen kişi kartı açılamıyordu. Gömme kutusu
              genelde 400-600px; orada kaybedilen bir köşe pahalı. Satırda
              ayrıca daha iyi bir iş görüyor: seçilen kişinin adını gösterdiği
              için gömülü görünümün tek durum satırı zaten oydu.
            */
            toolbar={
              <a
                href={fullUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="shrink-0 max-w-[60%] truncate px-2.5 py-1.5 rounded-lg border border-border bg-surface text-[11px] text-text-muted hover:text-text"
              >
                {selected ? fullName(selected) : (treeName ?? poweredBy)}
                <span aria-hidden> ↗</span>
              </a>
            }
          />
        </div>
      </PrivacyProvider>
    </ReadOnlyProvider>
  );
}
