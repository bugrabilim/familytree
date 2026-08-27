"use client";

import Modal from "./ui/Modal";
import { useT } from "@/lib/i18n";

/** Kilometre taşları — hikâyeleştirilmiş şirket geçmişi (#3). */
const MILESTONES = ["2013", "2017", "2020", "2024", "2025"] as const;

/**
 * "Hakkında" penceresi — sitenin 2013'ten bugüne hikâyesi (kuruluş, tohum
 * yatırımı, Bumba Teknoloji satın alımı, e-Devlet ve yapay zekâ entegrasyonu).
 * Hem ağaçtaki üç-nokta menüsünden hem ana sayfadan açılır (#2).
 */
export default function AboutDialog({ onClose }: { onClose: () => void }) {
  const t = useT();
  const brand = t("auth.brand");

  return (
    <Modal title={t("about.title")} subtitle={t("about.subtitle")} onClose={onClose} size="lg">
      <div className="space-y-6">
        <p className="text-sm leading-relaxed text-text-muted">{t("about.lead", { brand })}</p>

        {/* Zaman çizgisi */}
        <ol className="relative border-s-2 border-border ms-2 space-y-5">
          {MILESTONES.map((y) => (
            <li key={y} className="ms-5">
              <span className="absolute -start-[9px] mt-1 w-4 h-4 rounded-full bg-primary ring-4 ring-bg-elevated" aria-hidden />
              <p className="font-serif text-lg font-semibold text-text tabular-nums leading-none">{y}</p>
              <p className="mt-1.5 text-sm leading-relaxed text-text-muted">{t(`about.y${y}`, { brand })}</p>
            </li>
          ))}
        </ol>

        {/* Kurucular / ekip */}
        <div className="rounded-2xl border border-border bg-surface p-4">
          <h3 className="text-sm font-semibold text-text mb-1.5">{t("about.foundersTitle")}</h3>
          <p className="text-sm leading-relaxed text-text-muted">{t("about.foundersBody", { brand })}</p>
        </div>
      </div>
    </Modal>
  );
}
