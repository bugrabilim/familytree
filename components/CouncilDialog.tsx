"use client";

import { useEffect, useState } from "react";
import { userMessage } from "@/lib/error-text";
import { useLang, useT } from "@/lib/i18n";
import type { Campaign, CouncilBox, Currency, Debt, Decision } from "@/types/council";
import { CURRENCIES } from "@/types/council";
import {
  campaignTally,
  decisionTally,
  formatMoney,
  openDebtTotals,
} from "@/lib/council";
import Modal from "./ui/Modal";
import Button from "./ui/Button";

/**
 * AİLE MECLİSİ — aidat defteri, borç-alacak defteri, karar tutanağı.
 *
 * ## Ekranın en önemli cümlesi en üstte
 *
 * "Bu uygulama para toplamaz, aktarmaz, saklamaz." Bu bir yasal uyarı
 * kutusu değil, ürünün ne olduğunu söyleyen cümle: kullanıcı buraya
 * "ödeme yapacağım" diye gelirse hem hayal kırıklığı yaşar hem de
 * açıklama alanına IBAN'ını yazmaya çalışır. Beklentiyi ilk ekranda
 * doğrulamak, sonradan hiçbir uyarının çözemeyeceği bir sorunu çözüyor.
 *
 * Gerekçenin tamamı `types/council.ts`te: uygulama içi para hareketi 6493
 * sayılı kanun kapsamında ödeme kuruluşu lisansı ister.
 *
 * ## Adlar `view()`den geçiyor
 *
 * Ağaçtan kişi seçme listesi HAM kayıttan değil, `Workspace`in gizlilik
 * katmanından geçirdiği listeden geliyor (`StoriesDialog` ile aynı desen):
 * gizli/maskeli bir kişinin adı bu seçim kutusuna düşmemeli.
 */

interface Props {
  /** Gizlilik katmanından GEÇMİŞ ad listesi. */
  people: Array<{ id: string; name: string }>;
  /** Defteri yazabilir mi (yönetici)? Oy vermek ayrı ve daha geniş. */
  canWrite: boolean;
  /** Oy verebilir mi (yönetici + üye)? */
  canVote: boolean;
  onClose: () => void;
}

type Tab = "aidat" | "borc" | "karar";

interface CampaignDraft {
  id?: string;
  title: string;
  purpose: string;
  targetText: string;
  currency: Currency;
}
interface PledgeDraft {
  campaignId: string;
  id?: string;
  name: string;
  personId: string;
  pledgedText: string;
  paidText: string;
  paidAt: string;
  note: string;
}
interface DebtDraft {
  id?: string;
  fromName: string;
  fromPersonId: string;
  toName: string;
  toPersonId: string;
  amountText: string;
  currency: Currency;
  on: string;
  note: string;
}
interface DecisionDraft {
  id?: string;
  title: string;
  detail: string;
}

const bosKampanya = (): CampaignDraft => ({ title: "", purpose: "", targetText: "", currency: "TRY" });
const bosBorc = (): DebtDraft => ({
  fromName: "", fromPersonId: "", toName: "", toPersonId: "",
  amountText: "", currency: "TRY", on: "", note: "",
});
const bosKarar = (): DecisionDraft => ({ title: "", detail: "" });

export default function CouncilDialog({ people, canWrite, canVote, onClose }: Props) {
  const t = useT();
  const { lang } = useLang();
  const [box, setBox] = useState<CouncilBox | null>(null);
  const [tab, setTab] = useState<Tab>("aidat");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const [kampanyaDraft, setKampanyaDraft] = useState<CampaignDraft | null>(null);
  const [katkiDraft, setKatkiDraft] = useState<PledgeDraft | null>(null);
  const [borcDraft, setBorcDraft] = useState<DebtDraft | null>(null);
  const [kararDraft, setKararDraft] = useState<DecisionDraft | null>(null);

  /*
   * Yükleme doğrudan effect'in İÇİNDE — deponun öbür pencereleriyle aynı
   * biçim (`GatheringsDialog`, `StoriesDialog`); ayrı bir `useCallback`i
   * effect'ten çağırmak lint kuralının eş zamanlı setState saydığı desen.
   */
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const res = await fetch("/api/family/council", { cache: "no-store" });
        const data = await res.json();
        if (!alive) return;
        if (!res.ok) throw new Error(data?.error ?? t("err.generic"));
        setBox(data as CouncilBox);
      } catch (e) {
        if (!alive) return;
        setError(userMessage(e, t("err.generic")));
      }
    })();
    return () => { alive = false; };
  }, [t]);

  /**
   * Her yazma, defterin OKUNDUĞU sürümü `x-base-version` ile geri gönderir.
   *
   * Ağacın sürümü değil MECLİS DEFTERİNİN sürümü: iki ayrı dosya, iki ayrı
   * damga. Sunucu uyuşmazlıkta 409 dönüyor ve kullanıcıdan yenilemesini
   * istiyoruz — sessizce üstüne yazmak, birinin oyunu ya da katkı satırını
   * yok etmek olurdu.
   */
  const gonder = async (method: "POST" | "PUT" | "DELETE", govde: unknown) => {
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/family/council", {
        method,
        headers: {
          "Content-Type": "application/json",
          ...(box?.updatedAt ? { "x-base-version": box.updatedAt } : {}),
        },
        body: JSON.stringify(govde),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error ?? t("err.generic"));
      setBox(data as CouncilBox);
      return true;
    } catch (e) {
      setError(userMessage(e, t("err.generic")));
      return false;
    } finally {
      setBusy(false);
    }
  };

  const para = (k: number, c: Currency) => formatMoney(k, c, lang);

  return (
    <Modal title={t("council.title")} onClose={onClose} size="lg">
      <div className="space-y-4">
        {/*
          PARA UYARISI EN ÜSTTE ve her sekmede görünür. Aşağıya konsaydı
          uzun bir defterde ekran dışında kalırdı — ve bu cümle, kullanıcının
          ürünü yanlış anlamasını engelleyen tek cümle.
        */}
        <p className="text-xs text-text bg-primary-soft px-3 py-2.5 rounded-xl leading-snug">
          {t("council.noMoney")}
        </p>

        {error && <p className="text-xs text-danger bg-danger-soft px-3 py-2.5 rounded-xl">{error}</p>}

        <div className="flex gap-1 border-b border-border">
          {(["aidat", "borc", "karar"] as const).map((k) => (
            <button
              key={k}
              onClick={() => setTab(k)}
              className={`px-3 py-2 text-xs -mb-px border-b-2 transition-colors ${
                tab === k ? "border-primary text-text font-medium" : "border-transparent text-text-muted hover:text-text"
              }`}
            >
              {t(`council.tab.${k}`)}
            </button>
          ))}
        </div>

        {error ? null : box === null ? (
          <p className="text-xs text-text-muted">{t("council.loading")}</p>
        ) : (
          <>
            {tab === "aidat" && (
              <Aidat
                box={box} canWrite={canWrite} busy={busy} people={people} para={para}
                draft={kampanyaDraft} setDraft={setKampanyaDraft}
                katki={katkiDraft} setKatki={setKatkiDraft}
                gonder={gonder} t={t}
              />
            )}
            {tab === "borc" && (
              <Borclar
                box={box} canWrite={canWrite} busy={busy} people={people} para={para}
                draft={borcDraft} setDraft={setBorcDraft} gonder={gonder} t={t}
              />
            )}
            {tab === "karar" && (
              <Kararlar
                box={box} canWrite={canWrite} canVote={canVote} busy={busy}
                draft={kararDraft} setDraft={setKararDraft} gonder={gonder} t={t}
              />
            )}
          </>
        )}

        {!canWrite && <p className="text-[11px] text-text-muted">{t("council.readOnly")}</p>}
      </div>
    </Modal>
  );
}

/* ── Ortak küçük parçalar ─────────────────────────────────────────────── */

type TFn = (k: string, p?: Record<string, string | number>) => string;
type Gonder = (m: "POST" | "PUT" | "DELETE", b: unknown) => Promise<boolean>;

function Alan({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block space-y-1">
      <span className="text-[11px] text-text-muted">{label}</span>
      {children}
    </label>
  );
}

const girdiSinif =
  "w-full h-9 px-2.5 rounded-xl bg-surface border border-border text-sm text-text focus:outline-none focus:border-primary";

/**
 * Ağaçtan kişi seçimi — ad alanını DOLDURUR, yerine geçmez.
 *
 * Kişi id'si de saklanıyor ki defter satırı ağaçtaki kayda bağlansın; ama
 * ad da yazılıyor, çünkü kişi sonradan silinse bile defterin okunabilir
 * kalması gerekir. Ağaçta olmayan biri (komşu, dünür) için seçim boş
 * bırakılıp ad elle yazılır.
 */
function KisiSecici({
  people, value, onPick, label,
}: {
  people: Array<{ id: string; name: string }>;
  value: string;
  onPick: (id: string, name: string) => void;
  label: string;
}) {
  return (
    <Alan label={label}>
      <select
        value={value}
        onChange={(e) => {
          const p = people.find((x) => x.id === e.target.value);
          onPick(p?.id ?? "", p?.name ?? "");
        }}
        className={girdiSinif}
      >
        <option value="">—</option>
        {people.map((p) => (
          <option key={p.id} value={p.id}>{p.name}</option>
        ))}
      </select>
    </Alan>
  );
}

function ParaBirimi({ value, onChange, label }: { value: Currency; onChange: (c: Currency) => void; label: string }) {
  return (
    <Alan label={label}>
      <select value={value} onChange={(e) => onChange(e.target.value as Currency)} className={girdiSinif}>
        {CURRENCIES.map((c) => <option key={c} value={c}>{c}</option>)}
      </select>
    </Alan>
  );
}

/* ── Sekme 1: aidat / katkı defteri ───────────────────────────────────── */

function Aidat({
  box, canWrite, busy, people, para, draft, setDraft, katki, setKatki, gonder, t,
}: {
  box: CouncilBox;
  canWrite: boolean;
  busy: boolean;
  people: Array<{ id: string; name: string }>;
  para: (k: number, c: Currency) => string;
  draft: CampaignDraft | null;
  setDraft: (d: CampaignDraft | null) => void;
  katki: PledgeDraft | null;
  setKatki: (d: PledgeDraft | null) => void;
  gonder: Gonder;
  t: TFn;
}) {
  const kaydet = async () => {
    if (!draft?.title.trim()) return;
    const ok = draft.id
      ? await gonder("PUT", { kind: "kampanya", ...draft })
      : await gonder("POST", { kind: "kampanya", ...draft });
    if (ok) setDraft(null);
  };

  const katkiKaydet = async () => {
    if (!katki?.name.trim()) return;
    const ok = katki.id
      ? await gonder("PUT", { kind: "taahhut", ...katki })
      : await gonder("POST", { kind: "taahhut", ...katki });
    if (ok) setKatki(null);
  };

  return (
    <div className="space-y-3">
      {box.campaigns.length === 0 && !draft && (
        <p className="text-xs text-text-muted">{t("council.campaign.empty")}</p>
      )}

      <ul className="space-y-3">
        {box.campaigns.map((c: Campaign) => {
          const s = campaignTally(c);
          return (
            <li key={c.id} className="rounded-2xl border border-border bg-surface p-3 space-y-2">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-text truncate">
                    {c.title}
                    {c.closed && <span className="ml-2 text-[10px] text-text-muted">{t("council.campaign.closedTag")}</span>}
                  </p>
                  {c.purpose && <p className="text-[11px] text-text-muted">{c.purpose}</p>}
                </div>
                {canWrite && (
                  <span className="flex gap-2 shrink-0">
                    <button
                      onClick={() => setDraft({
                        id: c.id, title: c.title, purpose: c.purpose ?? "",
                        targetText: String(c.targetKurus), currency: c.currency,
                      })}
                      className="text-[11px] text-accent hover:underline"
                    >
                      {t("council.edit")}
                    </button>
                    <button
                      onClick={() => void gonder("PUT", { kind: "kampanya", id: c.id, closed: !c.closed })}
                      disabled={busy}
                      className="text-[11px] text-accent hover:underline disabled:opacity-50"
                    >
                      {c.closed ? t("council.campaign.reopen") : t("council.campaign.close")}
                    </button>
                    <button
                      onClick={() => {
                        if (window.confirm(t("council.campaign.deleteConfirm")))
                          void gonder("DELETE", { kind: "kampanya", id: c.id });
                      }}
                      disabled={busy}
                      className="text-[11px] text-danger hover:underline disabled:opacity-50"
                    >
                      {t("council.delete")}
                    </button>
                  </span>
                )}
              </div>

              <p className="text-[11px] text-text-muted">
                {c.targetKurus > 0
                  ? t("council.campaign.target", {
                      target: para(c.targetKurus, c.currency),
                      remaining: para(s.remainingKurus, c.currency),
                    })
                  : t("council.campaign.noTarget")}
              </p>
              <p className="text-[11px] text-text-muted">
                {t("council.campaign.summary", {
                  pledged: para(s.pledgedKurus, c.currency),
                  paid: para(s.paidKurus, c.currency),
                  outstanding: para(s.outstandingKurus, c.currency),
                  people: s.contributors,
                })}
              </p>

              <details>
                <summary className="text-[11px] text-text-muted cursor-pointer">
                  {t("council.pledge.list")} ({c.pledges.length})
                </summary>
                {c.pledges.length === 0 ? (
                  <p className="text-[11px] text-text-muted mt-1">{t("council.pledge.none")}</p>
                ) : (
                  <ul className="mt-1 space-y-1">
                    {c.pledges.map((p) => (
                      <li key={p.id} className="flex items-center gap-2 text-[11px]">
                        <span className="flex-1 min-w-0 truncate text-text">
                          {p.name} · {t("council.pledge.line", {
                            pledged: para(p.pledgedKurus, c.currency),
                            paid: para(p.paidKurus, c.currency),
                          })}
                          {p.note ? ` — ${p.note}` : ""}
                        </span>
                        {canWrite && (
                          <>
                            <button
                              onClick={() => setKatki({
                                campaignId: c.id, id: p.id, name: p.name, personId: p.personId ?? "",
                                pledgedText: String(p.pledgedKurus), paidText: String(p.paidKurus),
                                paidAt: p.paidAt ?? "", note: p.note ?? "",
                              })}
                              className="text-accent hover:underline shrink-0"
                            >
                              {t("council.edit")}
                            </button>
                            <button
                              onClick={() => void gonder("DELETE", { kind: "taahhut", campaignId: c.id, id: p.id })}
                              disabled={busy}
                              className="text-danger hover:underline shrink-0 disabled:opacity-50"
                            >
                              {t("council.delete")}
                            </button>
                          </>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
              </details>

              {canWrite && !c.closed && !katki && (
                <Button variant="secondary" size="sm" onClick={() => setKatki({
                  campaignId: c.id, name: "", personId: "", pledgedText: "",
                  paidText: "", paidAt: "", note: "",
                })}>
                  {t("council.pledge.add")}
                </Button>
              )}

              {katki && katki.campaignId === c.id && (
                <div className="space-y-2 p-3 rounded-2xl bg-surface-2 border border-border">
                  <p className="text-[11px] text-text-muted leading-snug">{t("council.pledge.hint")}</p>
                  <KisiSecici
                    people={people}
                    value={katki.personId}
                    label={t("council.pledge.field.person")}
                    onPick={(id, name) => setKatki({ ...katki, personId: id, name: name || katki.name })}
                  />
                  <Alan label={t("council.pledge.field.name")}>
                    <input value={katki.name} onChange={(e) => setKatki({ ...katki, name: e.target.value })} className={girdiSinif} />
                  </Alan>
                  <Alan label={t("council.pledge.field.pledged")}>
                    <input inputMode="decimal" value={katki.pledgedText} onChange={(e) => setKatki({ ...katki, pledgedText: e.target.value })} className={girdiSinif} />
                  </Alan>
                  <Alan label={t("council.pledge.field.paid")}>
                    <input inputMode="decimal" value={katki.paidText} onChange={(e) => setKatki({ ...katki, paidText: e.target.value })} className={girdiSinif} />
                  </Alan>
                  <Alan label={t("council.pledge.field.paidAt")}>
                    <input type="date" value={katki.paidAt} onChange={(e) => setKatki({ ...katki, paidAt: e.target.value })} className={girdiSinif} />
                  </Alan>
                  <Alan label={t("council.pledge.field.note")}>
                    <input value={katki.note} onChange={(e) => setKatki({ ...katki, note: e.target.value })} className={girdiSinif} />
                  </Alan>
                  <div className="flex gap-2">
                    <Button size="sm" onClick={katkiKaydet} disabled={busy || !katki.name.trim()}>{t("council.save")}</Button>
                    <Button variant="secondary" size="sm" onClick={() => setKatki(null)} disabled={busy}>{t("council.cancel")}</Button>
                  </div>
                </div>
              )}
            </li>
          );
        })}
      </ul>

      {canWrite && !draft && (
        <Button variant="secondary" size="sm" onClick={() => setDraft(bosKampanya())}>
          {t("council.campaign.add")}
        </Button>
      )}

      {canWrite && draft && (
        <div className="space-y-2 p-3 rounded-2xl bg-surface-2 border border-border">
          <Alan label={t("council.campaign.field.title")}>
            <input value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} className={girdiSinif} />
          </Alan>
          <Alan label={t("council.campaign.field.purpose")}>
            <textarea
              rows={2}
              value={draft.purpose}
              onChange={(e) => setDraft({ ...draft, purpose: e.target.value })}
              className="w-full p-2.5 rounded-xl bg-surface border border-border text-sm text-text focus:outline-none focus:border-primary"
            />
          </Alan>
          {/* Açıklamaya IBAN yazılmasın: sunucu da düşürüyor, ama önce SÖYLÜYORUZ. */}
          <p className="text-[11px] text-text-muted leading-snug">{t("council.campaign.purposeHint")}</p>
          <Alan label={t("council.campaign.field.target")}>
            <input inputMode="decimal" value={draft.targetText} onChange={(e) => setDraft({ ...draft, targetText: e.target.value })} className={girdiSinif} />
          </Alan>
          <ParaBirimi value={draft.currency} onChange={(c) => setDraft({ ...draft, currency: c })} label={t("council.field.currency")} />
          <div className="flex gap-2">
            <Button size="sm" onClick={kaydet} disabled={busy || !draft.title.trim()}>{t("council.save")}</Button>
            <Button variant="secondary" size="sm" onClick={() => setDraft(null)} disabled={busy}>{t("council.cancel")}</Button>
          </div>
        </div>
      )}
    </div>
  );
}

/* ── Sekme 2: borç-alacak defteri ─────────────────────────────────────── */

function Borclar({
  box, canWrite, busy, people, para, draft, setDraft, gonder, t,
}: {
  box: CouncilBox;
  canWrite: boolean;
  busy: boolean;
  people: Array<{ id: string; name: string }>;
  para: (k: number, c: Currency) => string;
  draft: DebtDraft | null;
  setDraft: (d: DebtDraft | null) => void;
  gonder: Gonder;
  t: TFn;
}) {
  const toplamlar = openDebtTotals(box.debts);

  const kaydet = async () => {
    if (!draft?.fromName.trim() || !draft.toName.trim()) return;
    const ok = draft.id
      ? await gonder("PUT", { kind: "borc", ...draft })
      : await gonder("POST", { kind: "borc", ...draft });
    if (ok) setDraft(null);
  };

  return (
    <div className="space-y-3">
      {toplamlar.length > 0 && (
        <p className="text-[11px] text-text-muted">
          {toplamlar
            .map((x) => t("council.debt.openTotal", { total: para(x.totalKurus, x.currency), count: x.count }))
            .join(" · ")}
        </p>
      )}

      {box.debts.length === 0 && !draft && <p className="text-xs text-text-muted">{t("council.debt.empty")}</p>}

      <ul className="space-y-2">
        {box.debts.map((d: Debt) => (
          <li key={d.id} className="rounded-2xl border border-border bg-surface p-3 space-y-1">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="text-sm text-text truncate">
                  {t("council.debt.line", { from: d.fromName, to: d.toName, amount: para(d.amountKurus, d.currency) })}
                </p>
                <p className="text-[11px] text-text-muted">
                  {d.on || "—"}
                  {d.settledAt ? ` · ${t("council.debt.settledTag")}` : ""}
                  {d.note ? ` · ${d.note}` : ""}
                </p>
              </div>
              {canWrite && (
                <span className="flex gap-2 shrink-0">
                  <button
                    onClick={() => void gonder("PUT", { kind: "borc", id: d.id, settled: !d.settledAt })}
                    disabled={busy}
                    className="text-[11px] text-accent hover:underline disabled:opacity-50"
                  >
                    {d.settledAt ? t("council.debt.reopen") : t("council.debt.settle")}
                  </button>
                  <button
                    onClick={() => setDraft({
                      id: d.id, fromName: d.fromName, fromPersonId: d.fromPersonId ?? "",
                      toName: d.toName, toPersonId: d.toPersonId ?? "",
                      amountText: String(d.amountKurus), currency: d.currency,
                      on: d.on ?? "", note: d.note ?? "",
                    })}
                    className="text-[11px] text-accent hover:underline"
                  >
                    {t("council.edit")}
                  </button>
                  <button
                    onClick={() => {
                      if (window.confirm(t("council.debt.deleteConfirm")))
                        void gonder("DELETE", { kind: "borc", id: d.id });
                    }}
                    disabled={busy}
                    className="text-[11px] text-danger hover:underline disabled:opacity-50"
                  >
                    {t("council.delete")}
                  </button>
                </span>
              )}
            </div>
          </li>
        ))}
      </ul>

      {canWrite && !draft && (
        <Button variant="secondary" size="sm" onClick={() => setDraft(bosBorc())}>{t("council.debt.add")}</Button>
      )}

      {canWrite && draft && (
        <div className="space-y-2 p-3 rounded-2xl bg-surface-2 border border-border">
          <KisiSecici
            people={people} value={draft.fromPersonId} label={t("council.debt.field.fromPerson")}
            onPick={(id, name) => setDraft({ ...draft, fromPersonId: id, fromName: name || draft.fromName })}
          />
          <Alan label={t("council.debt.field.from")}>
            <input value={draft.fromName} onChange={(e) => setDraft({ ...draft, fromName: e.target.value })} className={girdiSinif} />
          </Alan>
          <KisiSecici
            people={people} value={draft.toPersonId} label={t("council.debt.field.toPerson")}
            onPick={(id, name) => setDraft({ ...draft, toPersonId: id, toName: name || draft.toName })}
          />
          <Alan label={t("council.debt.field.to")}>
            <input value={draft.toName} onChange={(e) => setDraft({ ...draft, toName: e.target.value })} className={girdiSinif} />
          </Alan>
          <Alan label={t("council.debt.field.amount")}>
            <input inputMode="decimal" value={draft.amountText} onChange={(e) => setDraft({ ...draft, amountText: e.target.value })} className={girdiSinif} />
          </Alan>
          <ParaBirimi value={draft.currency} onChange={(c) => setDraft({ ...draft, currency: c })} label={t("council.field.currency")} />
          <Alan label={t("council.debt.field.on")}>
            <input type="date" value={draft.on} onChange={(e) => setDraft({ ...draft, on: e.target.value })} className={girdiSinif} />
          </Alan>
          <Alan label={t("council.debt.field.note")}>
            <input value={draft.note} onChange={(e) => setDraft({ ...draft, note: e.target.value })} className={girdiSinif} />
          </Alan>
          <div className="flex gap-2">
            <Button size="sm" onClick={kaydet} disabled={busy || !draft.fromName.trim() || !draft.toName.trim()}>
              {t("council.save")}
            </Button>
            <Button variant="secondary" size="sm" onClick={() => setDraft(null)} disabled={busy}>{t("council.cancel")}</Button>
          </div>
        </div>
      )}
    </div>
  );
}

/* ── Sekme 3: karar ve oylama tutanağı ────────────────────────────────── */

function Kararlar({
  box, canWrite, canVote, busy, draft, setDraft, gonder, t,
}: {
  box: CouncilBox;
  canWrite: boolean;
  canVote: boolean;
  busy: boolean;
  draft: DecisionDraft | null;
  setDraft: (d: DecisionDraft | null) => void;
  gonder: Gonder;
  t: TFn;
}) {
  const kaydet = async () => {
    if (!draft?.title.trim()) return;
    const ok = draft.id
      ? await gonder("PUT", { kind: "karar", ...draft })
      : await gonder("POST", { kind: "karar", ...draft });
    if (ok) setDraft(null);
  };

  return (
    <div className="space-y-3">
      {box.decisions.length === 0 && !draft && <p className="text-xs text-text-muted">{t("council.decision.empty")}</p>}

      <ul className="space-y-3">
        {box.decisions.map((d: Decision) => {
          const s = decisionTally(d.ballots);
          const donmus = !!d.closedAt;
          return (
            <li key={d.id} className="rounded-2xl border border-border bg-surface p-3 space-y-2">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-text truncate">{d.title}</p>
                  {d.detail && <p className="text-[11px] text-text-muted whitespace-pre-wrap">{d.detail}</p>}
                </div>
                {/* DONMUŞ TUTANAKTA düzenle/sil DÜĞMESİ YOK — sunucu da reddediyor. */}
                {canWrite && !donmus && (
                  <span className="flex gap-2 shrink-0">
                    <button
                      onClick={() => setDraft({ id: d.id, title: d.title, detail: d.detail ?? "" })}
                      className="text-[11px] text-accent hover:underline"
                    >
                      {t("council.edit")}
                    </button>
                    <button
                      onClick={() => {
                        if (window.confirm(t("council.decision.closeConfirm")))
                          void gonder("PUT", { kind: "kapat", id: d.id });
                      }}
                      disabled={busy}
                      className="text-[11px] text-accent hover:underline disabled:opacity-50"
                    >
                      {t("council.decision.close")}
                    </button>
                    <button
                      onClick={() => {
                        if (window.confirm(t("council.decision.deleteConfirm")))
                          void gonder("DELETE", { kind: "karar", id: d.id });
                      }}
                      disabled={busy}
                      className="text-[11px] text-danger hover:underline disabled:opacity-50"
                    >
                      {t("council.delete")}
                    </button>
                  </span>
                )}
              </div>

              <p className="text-[11px] text-text-muted">
                {t("council.decision.tally", { yes: s.evet, no: s.hayir, abstain: s.cekimser })}
              </p>

              {donmus ? (
                <p className="text-[11px] text-text">
                  {t("council.decision.closedAt", { date: (d.closedAt ?? "").slice(0, 10) })}
                  {" · "}
                  <strong>{t(`council.outcome.${d.outcome ?? "esitlik"}`)}</strong>
                  <span className="block text-text-muted">{t("council.decision.frozen")}</span>
                </p>
              ) : canVote ? (
                <div className="flex gap-2">
                  {(["evet", "hayir", "cekimser"] as const).map((v) => (
                    <Button
                      key={v}
                      variant="secondary"
                      size="sm"
                      disabled={busy}
                      onClick={() => void gonder("POST", { kind: "oy", decisionId: d.id, vote: v })}
                    >
                      {t(`council.vote.${v}`)}
                    </Button>
                  ))}
                </div>
              ) : null}

              <details>
                <summary className="text-[11px] text-text-muted cursor-pointer">
                  {t("council.decision.ballots")} ({d.ballots.length})
                </summary>
                {d.ballots.length === 0 ? (
                  <p className="text-[11px] text-text-muted mt-1">{t("council.decision.noBallots")}</p>
                ) : (
                  <ul className="mt-1 space-y-1">
                    {d.ballots.map((b) => (
                      <li key={b.id} className="text-[11px] text-text">
                        {b.voterName || t("council.voter.unknown")} · {t(`council.vote.${b.vote}`)} · {b.at.slice(0, 10)}
                      </li>
                    ))}
                  </ul>
                )}
              </details>
            </li>
          );
        })}
      </ul>

      {canWrite && !draft && (
        <Button variant="secondary" size="sm" onClick={() => setDraft(bosKarar())}>{t("council.decision.add")}</Button>
      )}

      {canWrite && draft && (
        <div className="space-y-2 p-3 rounded-2xl bg-surface-2 border border-border">
          <p className="text-[11px] text-text-muted leading-snug">{t("council.decision.hint")}</p>
          <Alan label={t("council.decision.field.title")}>
            <input value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} className={girdiSinif} />
          </Alan>
          <Alan label={t("council.decision.field.detail")}>
            <textarea
              rows={3}
              value={draft.detail}
              onChange={(e) => setDraft({ ...draft, detail: e.target.value })}
              className="w-full p-2.5 rounded-xl bg-surface border border-border text-sm text-text focus:outline-none focus:border-primary"
            />
          </Alan>
          <div className="flex gap-2">
            <Button size="sm" onClick={kaydet} disabled={busy || !draft.title.trim()}>{t("council.save")}</Button>
            <Button variant="secondary" size="sm" onClick={() => setDraft(null)} disabled={busy}>{t("council.cancel")}</Button>
          </div>
        </div>
      )}
    </div>
  );
}
