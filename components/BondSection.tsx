"use client";

import { useMemo, useState } from "react";
import type { Person } from "@/types/family";
import type { BondType } from "@/types/bond";
import { BOND_TYPES } from "@/types/bond";
import { BOND_STYLES, bondTypeKey, bondsOf, otherEnd, zigzagPoints } from "@/lib/bonds";
import { fullName } from "@/lib/name";
import { useT } from "@/lib/i18n";
import { usePrivacy } from "./PrivacyContext";
import PersonPicker, { pickerSelectCls } from "./PersonPicker";
import Avatar from "./ui/Avatar";
import type { UseBonds } from "@/lib/useBonds";

/**
 * Bir kişinin duygusal bağları — profil panelindeki bölüm.
 *
 * Düzenleme burada, ağaç tuvalinde değil. Tuvalde iki kartı birbirine
 * bağlamak "yanlış kartı sürükledim" hatasına çok açık ve bu veri hassas;
 * profilden eklemek kimin kastedildiğini belirsiz bırakmıyor.
 */

/** Tür seçeneğinin yanındaki küçük çizgi örneği — hangi biçim ne demek. */
function StyleSample({ type }: { type: BondType }) {
  const s = BOND_STYLES[type];
  const W = 44;
  const y = 9;
  const paths = (s.lines === 2 ? [-2, 2] : [0]).map((off) =>
    s.zigzag
      ? zigzagPoints(2, y + off, W - 2, y + off, 3.5, 8)
          .map(([x, yy], i) => `${i ? "L" : "M"} ${x},${yy}`)
          .join(" ")
      : `M 2,${y + off} L ${W - 2},${y + off}`
  );
  return (
    <svg width={W} height={18} viewBox={`0 0 ${W} 18`} aria-hidden className="shrink-0">
      {paths.map((d, i) => (
        <path
          key={i}
          d={d}
          fill="none"
          stroke="var(--bond-line, #c2410c)"
          strokeWidth={s.strokeWidth}
          strokeDasharray={s.dash || undefined}
          strokeLinecap="round"
        />
      ))}
    </svg>
  );
}

export default function BondSection({
  person,
  people,
  bonds,
  readOnly,
  onSelect,
}: {
  person: Person;
  people: Person[];
  bonds: UseBonds;
  readOnly: boolean;
  onSelect: (id: string) => void;
}) {
  const t = useT();
  const { view } = usePrivacy();
  const [form, setForm] = useState<{ id?: string; other: string; type: BondType; note: string } | null>(
    null
  );
  const [busy, setBusy] = useState(false);

  const byId = useMemo(() => new Map(people.map((p) => [p.id, p])), [people]);
  const mine = useMemo(() => bondsOf(bonds.bonds, person.id), [bonds.bonds, person.id]);

  // Zaten bağı olan kişiler yeni bağ listesinde çıkmasın: sunucu ikinci bağı
  // reddediyor, seçeneği göstermek boşuna bir hata ekranı olurdu.
  const bagliOlanlar = useMemo(
    () => new Set(mine.map((b) => otherEnd(b, person.id)!).filter(Boolean)),
    [mine, person.id]
  );
  const secilebilir = useMemo(
    () =>
      people.filter(
        (p) => p.id !== person.id && (form?.id ? true : !bagliOlanlar.has(p.id))
      ),
    [people, person.id, bagliOlanlar, form?.id]
  );

  const kaydet = async () => {
    if (!form || !form.other) return;
    setBusy(true);
    const ok = await bonds.save(
      form.id
        ? { id: form.id, type: form.type, note: form.note }
        : { a: person.id, b: form.other, type: form.type, note: form.note }
    );
    setBusy(false);
    if (ok) setForm(null);
  };

  const sil = async (id: string) => {
    if (!window.confirm(t("bond.deleteConfirm"))) return;
    setBusy(true);
    await bonds.remove(id);
    setBusy(false);
  };

  return (
    <div className="space-y-2">
      {bonds.loading && mine.length === 0 ? (
        <p className="text-xs text-text-subtle">…</p>
      ) : mine.length === 0 ? (
        <p className="text-xs text-text-subtle">{t("bond.empty")}</p>
      ) : (
        <ul className="space-y-1">
          {mine.map((b) => {
            const otherId = otherEnd(b, person.id);
            const other = otherId ? byId.get(otherId) : undefined;
            if (!other) return null;
            const op = view(other);
            return (
              <li key={b.id} className="flex items-center gap-2">
                <button
                  onClick={() => onSelect(other.id)}
                  className="flex-1 min-w-0 flex items-center gap-3 px-2 py-2 -mx-2 rounded-xl hover:bg-surface-2 transition-colors text-left"
                >
                  <Avatar person={op} size="sm" />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm text-text truncate leading-tight">{fullName(op)}</p>
                    {b.note && (
                      <p className="text-[11px] text-text-subtle truncate leading-tight">{b.note}</p>
                    )}
                  </div>
                  <StyleSample type={b.type} />
                  <span className="text-[11px] font-medium text-text-subtle shrink-0">
                    {t(bondTypeKey(b.type))}
                  </span>
                </button>
                {!readOnly && (
                  <span className="flex gap-1 shrink-0">
                    <button
                      onClick={() =>
                        setForm({ id: b.id, other: other.id, type: b.type, note: b.note ?? "" })
                      }
                      className="text-[11px] text-accent hover:underline"
                    >
                      {t("bond.edit")}
                    </button>
                    <button
                      onClick={() => sil(b.id)}
                      disabled={busy}
                      className="text-[11px] text-danger hover:underline disabled:opacity-50"
                    >
                      {t("bond.delete")}
                    </button>
                  </span>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {bonds.error && <p className="text-xs text-danger">{bonds.error}</p>}

      {!readOnly && !form && (
        <button
          onClick={() => setForm({ other: "", type: "yakin", note: "" })}
          className="flex items-center gap-1.5 text-xs text-accent hover:underline font-medium"
        >
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden>
            <path d="M6 2v8M2 6h8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          </svg>
          {t("bond.add")}
        </button>
      )}

      {!readOnly && form && (
        <div className="space-y-2 p-2.5 rounded-xl bg-surface-2 border border-border">
          {!form.id && (
            <label className="block">
              <span className="text-[11px] text-text-subtle">{t("bond.other")}</span>
              <PersonPicker
                people={secilebilir}
                value={form.other}
                onChange={(id) => setForm({ ...form, other: id })}
              />
            </label>
          )}
          <label className="block">
            <span className="text-[11px] text-text-subtle">{t("bond.type")}</span>
            <select
              value={form.type}
              onChange={(e) => setForm({ ...form, type: e.target.value as BondType })}
              className={pickerSelectCls}
              aria-label={t("bond.type")}
            >
              {BOND_TYPES.map((tip) => (
                <option key={tip} value={tip}>
                  {t(bondTypeKey(tip))} — {t(`${bondTypeKey(tip)}.desc`)}
                </option>
              ))}
            </select>
          </label>
          <div className="flex items-center gap-2">
            <StyleSample type={form.type} />
            <span className="text-[11px] text-text-subtle">{t(`${bondTypeKey(form.type)}.desc`)}</span>
          </div>
          <label className="block">
            <span className="text-[11px] text-text-subtle">{t("bond.note")}</span>
            <input
              value={form.note}
              onChange={(e) => setForm({ ...form, note: e.target.value })}
              placeholder={t("bond.notePlaceholder")}
              className={pickerSelectCls}
            />
          </label>
          <div className="flex gap-2">
            <button
              onClick={kaydet}
              disabled={busy || (!form.id && !form.other)}
              className="px-3 h-8 rounded-xl bg-primary text-primary-text text-xs font-medium disabled:opacity-50"
            >
              {t("bond.save")}
            </button>
            <button
              onClick={() => setForm(null)}
              className="px-3 h-8 rounded-xl bg-surface border border-border text-xs"
            >
              {t("bond.cancel")}
            </button>
          </div>
        </div>
      )}

      <p className="text-[11px] text-text-subtle leading-snug">{t("bond.private")}</p>
    </div>
  );
}
