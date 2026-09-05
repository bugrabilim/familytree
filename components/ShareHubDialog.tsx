"use client";

import Modal from "./ui/Modal";
import { useT } from "@/lib/i18n";

interface Props {
  onClose: () => void;
  /** Yalnız yönetici (admin). Verilmezse ilgili satır gizlenir. */
  onShare?: () => void;
  onManageMembers?: () => void;
  onPair?: () => void;
  /** Aile etkinlikleri + katılım bildirimi. */
  onGatherings?: () => void;
  /** Hikâye talepleri — dışarıya soru, onay kuyruğu. */
  onStories?: () => void;
}

/**
 * Paylaş hub'ı (⋮ → Paylaş). Herkese açık paylaşım, üyeler & davetler ve bağlı
 * ağaçlar. (Yazdır artık yalnız ⋮ menüsünde.)
 */
export default function ShareHubDialog({ onClose, onShare, onManageMembers, onPair, onGatherings, onStories }: Props) {
  const t = useT();

  return (
    <Modal title={t("menu.share")} onClose={onClose}>
      <div className="space-y-1">
        {onShare && (
          <Row label={t("share.menu")} onClick={onShare} />
        )}

        {onManageMembers && <Row label={t("members.menu")} onClick={onManageMembers} />}
        {onPair && <Row label={t("pair.menu")} onClick={onPair} />}
        {/* Etkinlik davetiyesi de bir paylaşım biçimi — burası doğru yeri. */}
        {onGatherings && <Row label={t("gathering.title")} onClick={onGatherings} />}
        {/* Soru göndermek de dışarıya açılan bir yüzey — aynı hub. */}
        {onStories && <Row label={t("stories.section")} onClick={onStories} />}
      </div>
    </Modal>
  );
}

function Row({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="w-full flex items-center justify-between gap-3 py-2.5 text-sm text-text hover:text-primary transition-colors text-left"
    >
      <span>{label}</span>
      <span className="text-text-subtle">›</span>
    </button>
  );
}
