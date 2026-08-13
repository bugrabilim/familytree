"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Modal from "./ui/Modal";
import Button from "./ui/Button";
import Avatar from "./ui/Avatar";
import { fullName } from "@/lib/name";
import { lifeSpan } from "@/lib/date";
import { useT } from "@/lib/i18n";
import type { Person } from "@/types/family";

/**
 * İki olası-kopya kişiyi tek kişide birleştirme onayı. Kullanıcı hangi kaydın
 * ANA (korunacak) olacağını seçer; diğeri ona katılır (bağlar/veri taşınır,
 * kayıpsız). Onaydan sonra sayfa tazelenir.
 */
export default function MergeDialog({
  a,
  b,
  onClose,
  onMerged,
}: {
  a: Person;
  b: Person;
  onClose: () => void;
  onMerged?: () => void;
}) {
  const t = useT();
  const router = useRouter();
  const [keepId, setKeepId] = useState(a.id);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const dropId = keepId === a.id ? b.id : a.id;

  const submit = async () => {
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/family/merge", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ keepId, dropId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error ?? t("merge.failed"));
      onMerged?.();
      onClose();
      router.refresh();
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  };

  return (
    <Modal title={t("merge.title")} subtitle={t("merge.subtitle")} onClose={onClose}>
      <div className="space-y-4">
        <div className="flex gap-3">
          <MergeCard p={a} selected={keepId === a.id} onPick={() => setKeepId(a.id)} />
          <MergeCard p={b} selected={keepId === b.id} onPick={() => setKeepId(b.id)} />
        </div>
        <p className="text-[11px] text-text-subtle leading-relaxed">{t("merge.note")}</p>
        {error && <p className="text-xs text-danger bg-danger-soft px-3 py-2.5 rounded-xl">{error}</p>}
        <div className="flex justify-end gap-2">
          <Button variant="ghost" size="sm" onClick={onClose} disabled={busy}>
            {t("merge.cancel")}
          </Button>
          <Button size="sm" onClick={submit} disabled={busy}>
            {busy ? t("merge.working") : t("merge.confirm")}
          </Button>
        </div>
      </div>
    </Modal>
  );
}

function MergeCard({ p, selected, onPick }: { p: Person; selected: boolean; onPick: () => void }) {
  const t = useT();
  return (
    <button
      type="button"
      onClick={onPick}
      className={`flex-1 text-left rounded-xl border p-3 transition-colors ${
        selected ? "border-primary bg-primary-soft" : "border-border bg-surface hover:bg-surface-2"
      }`}
    >
      <div className="flex items-center gap-2.5 mb-2">
        <Avatar person={p} size="md" />
        <div className="min-w-0">
          <p className="text-sm font-medium text-text truncate">{fullName(p)}</p>
          <p className="text-[11px] text-text-subtle tabular-nums">{lifeSpan(p.birthDate, p.deathDate) || "—"}</p>
        </div>
      </div>
      <div className="space-y-0.5 text-[11px] text-text-muted">
        {p.birthPlace && <p className="truncate">📍 {p.birthPlace}</p>}
        {p.occupation && <p className="truncate">💼 {p.occupation}</p>}
        <p className="text-text-subtle">{t("merge.code", { code: p.code ?? "—" })}</p>
      </div>
      <p className={`mt-2 text-[11px] font-medium ${selected ? "text-primary" : "text-text-subtle"}`}>
        {selected ? t("merge.willKeep") : t("merge.willMerge")}
      </p>
    </button>
  );
}
