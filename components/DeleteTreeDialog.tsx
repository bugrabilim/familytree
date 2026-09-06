"use client";

import { useState } from "react";
import Modal from "./ui/Modal";
import Button from "./ui/Button";
import DeleteScopeList from "./DeleteScopeList";
import { useLang, useT } from "@/lib/i18n";
import { deleteTree } from "@/lib/actions";
import { GRACE_DAYS, confirmMatches } from "@/lib/retention";

/**
 * Ağaç silme onayı.
 *
 * Silme KALICI DEĞİL: ağaç beklemeye alınır, `purgeAt` anında yok edilir.
 * Metinler bunu böyle söylüyor — "geri alınamaz" demek artık YANLIŞ bir vaat
 * olurdu ve kullanıcıyı, aslında var olan geri getirme yolunu aramamaya
 * iterdi.
 *
 * Bekleme süresi olması teyidi gereksiz kılmıyor: kullanıcı ağacın ADINI
 * yazmadan düğme etkinleşmiyor. Tek "Emin misin?" yetmez, çünkü açılır
 * menüdeki çöp kutusu simgeleri yan yana duruyor ve yanlış ağacı silmek —
 * fark edilmezse bekleme süresi dolunca kalıcı — çok kolay.
 */

interface Props {
  tree: { treeId: string; name: string };
  onClose: () => void;
  /** Silme tamamlandı — çağıran listeyi tazelesin. */
  onDeleted: () => void;
}

function tarihYaz(iso: string | undefined, lang: string): string {
  if (!iso) return "";
  try {
    return new Date(iso).toLocaleDateString(lang === "en" ? "en" : "tr", {
      day: "2-digit",
      month: "long",
      year: "numeric",
    });
  } catch {
    return iso;
  }
}

export default function DeleteTreeDialog({ tree, onClose, onDeleted }: Props) {
  const t = useT();
  const { lang } = useLang();
  const [onay, setOnay] = useState("");
  const [busy, setBusy] = useState<"" | "export" | "delete">("");
  const [hata, setHata] = useState("");
  /** Silme sonrası durum — kalıcı yok ediş anı ve (varsa) işlenemeyen veriler. */
  const [sonuc, setSonuc] = useState<{ purgeAt?: string; failed?: string[] } | null>(null);

  /*
   * Teyit: yazılan metin ağacın adıyla eşleşmeli. Karşılaştırma sunucudaki
   * kuralın TA KENDİSİ (`confirmMatches`): baştaki/sondaki boşluk atılır
   * (kopyala-yapıştır sonu boşluk taşır), harf farkı affedilmez — "Demirtaş"
   * ile "Demirtas" farklı ağaçlar olabilir. Arayüz kendi kopyasını yazsaydı
   * iki kural ayrışır, düğme etkinleşir ve sunucu reddederdi.
   */
  const eslesti = confirmMatches(onay, tree.name);

  /*
   * Yedek, ağacı DEĞİŞTİRMEDEN alınıyor: `x-tree-id` başlığı
   * `resolveActiveTree`e hangi ağacın istendiğini söylüyor. Başlık olmasaydı
   * kullanıcı önce o ağaca geçmek zorunda kalır, çoğu da geçmez ve yedeksiz
   * silerdi.
   */
  const yedekAl = async () => {
    setBusy("export");
    setHata("");
    try {
      const res = await fetch("/api/family/export?format=json", {
        headers: { "x-tree-id": tree.treeId },
      });
      if (!res.ok) throw new Error(t("treeDelete.exportFailed"));
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${tree.name}.json`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      setHata((e as Error).message);
    } finally {
      setBusy("");
    }
  };

  const sil = async () => {
    if (!eslesti) return;
    setBusy("delete");
    setHata("");
    try {
      const r = await deleteTree(tree.treeId, t("treeDelete.failed"));
      /*
       * 207 = ağaç beklemeye alındı ama bazı veriler işlenemedi. Ayrı ele
       * alınıyor: "tamam" deyip kapatmak, kullanıcıya olmamış bir şeyi
       * olmuş gibi anlatmak olurdu.
       */
      setSonuc({ purgeAt: r.purgeAt, failed: r.durum === "kismi" ? r.failed : undefined });
      onDeleted();
    } catch (e) {
      setHata((e as Error).message);
    } finally {
      setBusy("");
    }
  };

  /* --- Silindi: kalıcı yok ediş anı ve geri getirme yolu --------------- */
  if (sonuc) {
    return (
      <Modal title={t("treeDelete.title")} onClose={onClose}>
        <div className="space-y-3">
          <p className="text-sm text-text">{t("treeDelete.done", { name: tree.name })}</p>
          {sonuc.purgeAt && (
            <p className="text-sm font-medium text-text">
              {t("treeDelete.purgeAt", { date: tarihYaz(sonuc.purgeAt, lang) })}
            </p>
          )}
          <p className="text-[12px] text-text-muted leading-snug">{t("treeDelete.restoreNote")}</p>
          {sonuc.failed && sonuc.failed.length > 0 && (
            <div className="rounded-xl border border-danger/40 bg-danger-soft/50 p-3 space-y-1.5">
              <p className="text-[12px] text-danger font-medium">{t("treeDelete.partial")}</p>
              <ul className="text-[12px] text-text-muted space-y-0.5">
                {sonuc.failed.map((f) => (
                  <li key={f}>• {f}</li>
                ))}
              </ul>
            </div>
          )}
          <Button full onClick={onClose}>
            {t("treeDelete.close")}
          </Button>
        </div>
      </Modal>
    );
  }

  return (
    <Modal title={t("treeDelete.title")} subtitle={tree.name} onClose={onClose}>
      <div className="space-y-4">
        <p className="text-sm text-text leading-snug">
          {t("treeDelete.lead", { name: tree.name, days: GRACE_DAYS })}
        </p>

        {/* Ne gideceği ÖNCEDEN yazıyor: kullanıcı neyi kaybettiğini sonradan
            öğrenmemeli. */}
        <section className="rounded-xl border border-border bg-surface-2/60 p-3 space-y-1.5">
          <h4 className="text-[11px] font-semibold uppercase tracking-wide text-text-subtle">
            {t("treeDelete.scopeTitle")}
          </h4>
          <DeleteScopeList />
        </section>

        {/* Yedek teklifi silme düğmesinden ÖNCE ve aynı ekranda. */}
        <section className="space-y-1.5">
          <h4 className="text-[11px] font-semibold uppercase tracking-wide text-text-subtle">
            {t("treeDelete.backupTitle")}
          </h4>
          <p className="text-[12px] text-text-muted leading-snug">{t("treeDelete.backupHint")}</p>
          <Button variant="secondary" size="sm" onClick={yedekAl} disabled={busy !== ""}>
            {busy === "export" ? t("treeDelete.exporting") : t("treeDelete.export")}
          </Button>
        </section>

        <section className="space-y-1.5">
          <label className="block text-[12px] text-text" htmlFor="agac-silme-onay">
            {t("treeDelete.confirmLabel", { name: tree.name })}
          </label>
          <input
            id="agac-silme-onay"
            autoFocus
            value={onay}
            onChange={(e) => setOnay(e.target.value)}
            placeholder={t("treeDelete.confirmPlaceholder")}
            autoComplete="off"
            className="w-full h-9 px-3 rounded-xl bg-surface-2 border border-border text-sm text-text placeholder:text-text-subtle focus:outline-none focus:border-danger"
          />
          <p className="text-[11px] text-text-subtle leading-snug">{t("treeDelete.confirmHint")}</p>
        </section>

        {hata && <p className="text-[12px] text-danger">{hata}</p>}

        <div className="flex items-center gap-2">
          {/*
           * Düğme, ad eşleşene kadar ETKİN DEĞİL. Etkin olsaydı sunucu yine
           * silerdi — teyidin tek gerçek yeri burası.
           */}
          <Button variant="danger" onClick={sil} disabled={!eslesti || busy !== ""}>
            {busy === "delete" ? t("treeDelete.deleting") : t("treeDelete.submit")}
          </Button>
          <Button variant="ghost" onClick={onClose} disabled={busy !== ""}>
            {t("treeDelete.cancel")}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
