"use client";

import Modal from "./ui/Modal";
import ThemeToggle from "./ThemeToggle";
import AccountEmailSection from "./AccountEmailSection";
import DeleteAccountSection from "./DeleteAccountSection";
import NotifySection from "./NotifySection";
import LanguageSwitch from "./LanguageSwitch";
import { usePrivacy } from "./PrivacyContext";
import { useT } from "@/lib/i18n";

interface Props {
  onClose: () => void;
  /** "Arkadaşları göster" — çevre (aile-dışı) kişileri ağaçta göster/gizle. */
  showAssociates: boolean;
  onToggleAssociates: (v: boolean) => void;
  /**
   * Genogram duygusal bağ katmanı — VARSAYILAN KAPALI. Ağacın asıl işi soy
   * bağını göstermek; duygusal katman ayrı bir okuma ve isteyen açar.
   */
  showBonds: boolean;
  onToggleBonds: (v: boolean) => void;
  /** Hesabın aile adı — "Hesabı sil" teyidi buna birebir eşleşmeli. */
  familyName?: string;
  /** Hesaba bağlı ağaç sayısı ("ne kadar içerik gidecek" özeti için). */
  treeCount?: number;
  /** Aktif ağaçtaki kişi sayısı. */
  peopleCount?: number;
  /**
   * Hesap sahibi mi? Hesabı YALNIZ kurucu silebilir; davetli üyeye bölümü
   * göstermek, basınca 403 yiyeceği bir düğme göstermek olurdu.
   */
  isFounder?: boolean;
}

/**
 * Ayarlar hub'ı (⋮ → Ayarlar). Yalnız genel tercihler: yaşayanları gizle,
 * arkadaşları göster, tema, dil. Kişi verisi işlemleri "Kişiler" hub'ında.
 */
export default function SettingsDialog({
  onClose,
  showAssociates,
  onToggleAssociates,
  showBonds,
  onToggleBonds,
  familyName,
  treeCount = 1,
  peopleCount = 0,
  isFounder,
}: Props) {
  const t = useT();
  const { hideLiving, setHideLiving, forced: privacyForced } = usePrivacy();

  return (
    <Modal title={t("menu.settings")} onClose={onClose}>
      <div className="space-y-5">
        {/* Genel */}
        <section className="space-y-1">
          <h3 className="text-[11px] font-semibold uppercase tracking-wide text-text-subtle mb-1">{t("settings.general")}</h3>

          <button
            onClick={() => setHideLiving(!hideLiving)}
            disabled={privacyForced}
            aria-pressed={!hideLiving}
            className="w-full flex items-center justify-between gap-3 py-2 text-sm text-text disabled:opacity-60"
          >
            <span>{t("settings.showLiving")}</span>
            <Switch on={!hideLiving} />
          </button>

          <button
            onClick={() => onToggleAssociates(!showAssociates)}
            aria-pressed={showAssociates}
            className="w-full flex items-center justify-between gap-3 py-2 text-sm text-text"
          >
            <span>{t("settings.showAssociates")}</span>
            <Switch on={showAssociates} />
          </button>

          <button
            onClick={() => onToggleBonds(!showBonds)}
            aria-pressed={showBonds}
            className="w-full flex items-start justify-between gap-3 py-2 text-sm text-text text-left"
          >
            <span className="min-w-0">
              {t("bond.layer")}
              <span className="block text-[11px] text-text-subtle leading-snug">
                {t("bond.layerHint")}
              </span>
            </span>
            <Switch on={showBonds} />
          </button>

          <div className="w-full flex items-center justify-between gap-3 py-2 text-sm text-text">
            <span>{t("menu.theme")}</span>
            <ThemeToggle />
          </div>

          <div className="w-full flex items-center justify-between gap-3 py-2 text-sm text-text">
            <span>{t("menu.language")}</span>
            <LanguageSwitch />
          </div>
        </section>

        {/*
          Hesabın kimlik e-postası — yalnız hesap sahibine görünür. Bileşen
          uç 403 dönerse kendini hiç çizmiyor, o yüzden burada ayrıca rol
          denetimi yok.
        */}
        <AccountEmailSection />
        <NotifySection />

        {/*
          Hesabı sil — EN ALTTA ve ayrı bir tehlike kutusunda. Yukarıdaki
          zararsız tercihlerin arasına karışsaydı yanlışlıkla açılması çok
          kolay olurdu. Aile adı bilinmiyorsa bölüm hiç çizilmiyor: teyit
          metninin karşılaştırılacağı bir ad olmadan onay kutusu anlamsız,
          düğme de körlemesine basılan bir düğme olurdu.
        */}
        {isFounder && familyName && (
          <DeleteAccountSection
            familyName={familyName}
            treeCount={treeCount}
            peopleCount={peopleCount}
          />
        )}
      </div>
    </Modal>
  );
}

function Switch({ on }: { on: boolean }) {
  return (
    <span
      className={`w-9 h-5 rounded-full flex items-center px-0.5 shrink-0 transition-colors ${
        on ? "bg-primary justify-end" : "bg-surface-2 border border-border justify-start"
      }`}
    >
      <span className="w-4 h-4 rounded-full bg-white shadow-sm" />
    </span>
  );
}
