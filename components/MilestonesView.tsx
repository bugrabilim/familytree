"use client";

import { useMemo } from "react";
import type { Person } from "@/types/family";
import { milestones, nextMilestones } from "@/lib/milestones";
import { urgentPeople } from "@/lib/urgency";
import { fullName } from "@/lib/name";
import { useT } from "@/lib/i18n";
import { usePrivacy } from "./PrivacyContext";
import Avatar from "./ui/Avatar";

/**
 * Kilometre taşları ve gerçek aciliyet uyarıları.
 *
 * Puan, seviye, seri ve liderlik tablosu YOK — gerekçesi `lib/milestones.ts`
 * başında. Burada gösterilen her şey ağaç hakkında doğru bir cümledir.
 */
export default function MilestonesView({
  people,
  onSelect,
}: {
  people: Person[];
  onSelect: (id: string) => void;
}) {
  const t = useT();
  const { view } = usePrivacy();

  const ulasilan = useMemo(() => milestones(people).filter((m) => m.reached), [people]);
  const siradaki = useMemo(() => nextMilestones(people, 3), [people]);
  const acil = useMemo(() => urgentPeople(people, new Date(), 4), [people]);
  const byId = useMemo(() => new Map(people.map((p) => [p.id, p])), [people]);

  return (
    <div className="space-y-4">
      {/* Aciliyet — en üstte, çünkü zamana bağlı tek bölüm bu. */}
      {acil.length > 0 && (
        <section className="space-y-1.5">
          <h4 className="text-[11px] font-semibold uppercase tracking-wide text-text-subtle">
            {t("urgency.heading")}
          </h4>
          <ul className="space-y-1">
            {acil.map((u) => {
              const p = byId.get(u.personId);
              if (!p) return null;
              const mp = view(p);
              return (
                <li key={`${u.personId}-${u.kind}`}>
                  <button
                    onClick={() => onSelect(u.personId)}
                    className="w-full flex items-center gap-3 px-2 py-2 -mx-2 rounded-xl hover:bg-surface-2 transition-colors text-left"
                  >
                    <Avatar person={mp} size="sm" />
                    <span className="min-w-0 flex-1 text-sm text-text leading-snug">
                      {/*
                        Olgu cümlesi, tehdit değil: "Nine 91 yaşında ve henüz
                        bir anısı kaydedilmemiş." Geri sayım ve ölüm tahmini
                        yok; kullanıcı kendi çıkarımını yapar.
                      */}
                      {t(u.key, { name: fullName(mp), age: u.age ?? 0 })}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {/* Sıradaki hedefler */}
      {siradaki.length > 0 && (
        <section className="space-y-1.5">
          <h4 className="text-[11px] font-semibold uppercase tracking-wide text-text-subtle">
            {t("milestone.next")}
          </h4>
          <ul className="space-y-2">
            {siradaki.map((m) => (
              <li key={m.id} className="space-y-1">
                <div className="flex items-baseline justify-between gap-2">
                  <span className="text-sm text-text">{t(m.key)}</span>
                  <span className="text-[11px] tabular-nums text-text-subtle shrink-0">
                    {m.value}/{m.target}
                  </span>
                </div>
                <div className="h-1.5 rounded-full bg-surface-2 overflow-hidden">
                  <div
                    className="h-full rounded-full bg-primary"
                    style={{ width: `${Math.min(100, (m.value / m.target) * 100)}%` }}
                  />
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* Ulaşılanlar */}
      <section className="space-y-1.5">
        <h4 className="text-[11px] font-semibold uppercase tracking-wide text-text-subtle">
          {t("milestone.reached")}
        </h4>
        {ulasilan.length === 0 ? (
          <p className="text-xs text-text-subtle">{t("milestone.none")}</p>
        ) : (
          <ul className="flex flex-wrap gap-1.5">
            {/*
              Etiketler NÖTR isim öbeği ("Yedi göbek"), geçmiş zaman değil.
              İlk taslakta "Yedi göbek tamamlandı" yazıyordu ve aynı etiket
              "Sıradaki" listesinde 5/7 ilerlemeyle birlikte çıkıyordu:
              henüz ulaşılmamış bir hedef "tamamlandı" diye okunuyordu.
              Ulaşılmışlık artık işaretle anlatılıyor.
            */}
            {ulasilan.map((m) => (
              <li
                key={m.id}
                className="px-2.5 py-1 rounded-full bg-primary-soft border border-primary/30 text-[11px] text-primary"
              >
                ✓ {t(m.key)}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
