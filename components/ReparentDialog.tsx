"use client";

import { useMemo, useState } from "react";
import type { Person } from "@/types/family";
import { applyReparent, planReparent, summarize, type ReparentError } from "@/lib/reparent";
import { fullName } from "@/lib/name";
import { updatePerson } from "@/lib/actions";
import { useT } from "@/lib/i18n";
import Modal from "./ui/Modal";
import Button from "./ui/Button";

/**
 * Ebeveyn değişikliği ONAY penceresi.
 *
 * Bu pencerenin varlık sebebi: tuvalde bir kartı yanlış yere bırakmak
 * kolaydır ve soy bağı değişikliği GÖRÜNMEZ bir hatadır. Kişi kartı aynı
 * görünür, ama akrabalık hesabı, kuşak sayımı, kan derecesi ve kitap
 * sessizce yanlışlanır. Bu yüzden bırakma doğrudan yazmıyor: ne olacağı
 * ADLARLA yazılıyor, kopan bağ varsa ayrıca uyarılıyor.
 */
export default function ReparentDialog({
  childId,
  parentId,
  people,
  onClose,
  onSaved,
}: {
  childId: string;
  parentId: string;
  people: Person[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const t = useT();
  const [replace, setReplace] = useState<string>("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const result = useMemo(
    () => planReparent(childId, parentId, people, replace ? { replace } : {}),
    [childId, parentId, people, replace]
  );

  const adOf = (id: string) => {
    const p = people.find((x) => x.id === id);
    return p ? fullName(p) : id;
  };

  const kaydet = async () => {
    if (!result.ok) return;
    const child = people.find((p) => p.id === childId);
    if (!child) return;
    setBusy(true);
    setError("");
    try {
      /*
       * `PersonPayload` kimlik alanlarını zorunlu tutuyor (rota PUT'ta
       * `?? existing` ile birleştirdiği için çalışma zamanında gerekmezdi,
       * ama tipi bu iş için gevşetmek yanlış olur). Kişinin kendi
       * değerlerini aynen geri gönderiyoruz: değişen tek şey soy bağı.
       */
      await updatePerson(childId, {
        firstName: child.firstName,
        lastName: child.lastName,
        gender: child.gender,
        ...applyReparent(child, result.plan),
      });
      onSaved();
      onClose();
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  };

  /* Reddedilen bırakmalar: neden olmadığını söyle, sessizce kapanma. */
  if (!result.ok && result.error !== "secim") {
    return (
      <Modal title={t("reparent.title")} onClose={onClose}>
        <div className="space-y-3">
          <p className="text-sm text-text">{t(`reparent.error.${result.error as ReparentError}`)}</p>
          <Button variant="secondary" size="sm" onClick={onClose}>
            {t("reparent.close")}
          </Button>
        </div>
      </Modal>
    );
  }

  const ozet = result.ok ? summarize(result.plan, people, fullName) : null;

  return (
    <Modal title={t("reparent.title")} onClose={onClose}>
      <div className="space-y-4">
        {!result.ok && result.error === "secim" ? (
          <>
            {/*
              İki ebeveyn dolu. ÜÇÜNCÜSÜNÜ eklemek modeli bozar, birini
              sessizce atmak da tam olarak korkulan şey. Kullanıcı seçer.
            */}
            <p className="text-sm text-text leading-snug">
              {t("reparent.chooseBody", { child: adOf(childId), parent: adOf(parentId) })}
            </p>
            <ul className="space-y-1.5">
              {(result.current ?? []).map((pid) => (
                <li key={pid}>
                  <label className="flex items-center gap-2.5 p-2.5 rounded-xl bg-surface-2 border border-border cursor-pointer">
                    <input
                      type="radio"
                      name="reparent-replace"
                      checked={replace === pid}
                      onChange={() => setReplace(pid)}
                    />
                    <span className="text-sm text-text">{adOf(pid)}</span>
                  </label>
                </li>
              ))}
            </ul>
            <Button variant="secondary" size="sm" onClick={onClose}>
              {t("reparent.cancel")}
            </Button>
          </>
        ) : (
          ozet && (
            <>
              <p className="text-sm text-text leading-snug">
                {t("reparent.body", { child: ozet.childName, parent: ozet.parentName })}
              </p>
              {ozet.removedName && (
                <p className="text-[13px] text-amber-700 dark:text-amber-300 leading-snug">
                  {t("reparent.removes", { name: ozet.removedName })}
                </p>
              )}
              <div className="flex gap-2">
                <Button size="sm" onClick={kaydet} disabled={busy}>
                  {busy ? t("reparent.saving") : t("reparent.confirm")}
                </Button>
                <Button variant="secondary" size="sm" onClick={onClose} disabled={busy}>
                  {t("reparent.cancel")}
                </Button>
              </div>
            </>
          )
        )}

        {error && <p className="text-xs text-danger">{error}</p>}
      </div>
    </Modal>
  );
}
