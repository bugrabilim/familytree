"use client";

import { useCallback, useEffect, useState } from "react";
import { useT } from "@/lib/i18n";
import { mutationHeaders, setBaseVersion } from "@/lib/actions";
import Modal from "./ui/Modal";
import Button from "./ui/Button";
import { useAuthority } from "./AuthorityContext";

/**
 * DEĞİŞİKLİK ÖNERİLERİ — kuyruk ve karar (madde 35/C).
 *
 * Katkı verici var olan kayda dokunamıyor; önerdiği değişiklikler buraya
 * düşüyor ve düzenleyici burada karar veriyor.
 *
 * ## Neden hem öneren hem karar veren aynı ekranı görüyor
 *
 * Katkı verici KENDİ önerilerini görüyor (durumlarıyla birlikte), karar
 * veren HEPSİNİ. Ayrı ekranlara bölünseydi, öneren kişi yazdığı şeyin ne
 * olduğunu — onaylandı mı, reddedildi mi, hâlâ bekliyor mu — hiç
 * öğrenemezdi. Görmediği bir kuyruğa yazmak, boşluğa yazmaktır.
 *
 * Süzme sunucuda (`visibleTo`); burası yalnız geleni çiziyor.
 *
 * ## Onay ve geri çekme İKİ ADIMLI (madde 35/D)
 *
 * Onay ağacı hemen değiştiriyor ve kuyrukta kartlar alt alta; yanlış karta
 * basmak tek tıklık bir kaza. Doğrulama satırı kartın KENDİ içinde açılıyor
 * — `window.confirm` kullanılmadı: metni çevrilemiyor ve bazı tarayıcılarda
 * hiç çıkmıyor, yani koruma sessizce yok olabilirdi.
 */

interface Change {
  from: unknown;
  to: unknown;
}

interface Proposal {
  id: string;
  /** Yokluğu "alan" demek — tür eklenmeden önce yazılmış öneriler. */
  kind?: "alan" | "ekleme" | "silme" | "icerik";
  personId: string;
  personName: string;
  changes: Record<string, Change>;
  /** "ekleme" türünde önerilen kişinin alanları. */
  person?: Record<string, unknown>;
  /** "icerik" türünde eklenecek kayıt ve deposu (tarif/etkinlik/mektup). */
  content?: { store: string; item: Record<string, unknown> };
  note?: string;
  by: string;
  byName: string;
  at: string;
  status: "bekliyor" | "onaylandi" | "reddedildi" | "geri-cekildi";
  decidedByName?: string;
  decidedAt?: string;
  /** Onayın geri alındığı an — kart bunu "bir kez onaylanmıştı" diye gösteriyor. */
  undoneAt?: string;
}

/**
 * Alanın okunur adı.
 *
 * Sözlükte form etiketleri `form.<alan>` altında ama BÜTÜN alanlar için
 * yok. Eksik anahtarda `translate` anahtarın kendisini döndürüyor; o hâliyle
 * ekrana "form.someField" yazardı. Karşılaştırıp düşüyoruz: çeviri yoksa ham
 * alan adı görünüyor — teknik ama en azından doğru.
 */
function alanAdi(t: (k: string) => string, key: string): string {
  const cev = t(`form.${key}`);
  return cev === `form.${key}` ? key : cev;
}

/** Değeri okunur kılar. Nesne/dizi alanlar için ham JSON'dan iyisi yok. */
function goster(v: unknown): string {
  if (v === null || v === undefined || v === "") return "—";
  if (typeof v === "string") return v;
  if (typeof v === "number" || typeof v === "boolean") return String(v);
  return JSON.stringify(v);
}

export default function ProposalsDialog({ onClose, onApplied }: {
  onClose: () => void;
  /** Onay ağacı değiştirdiği için çağıran tazeliyor. */
  onApplied?: () => void;
}) {
  const t = useT();
  const { canDecide, authorId } = useAuthority();
  const [list, setList] = useState<Proposal[] | null>(null);
  const [hata, setHata] = useState("");
  const [busy, setBusy] = useState("");
  const [stale, setStale] = useState<Record<string, string[]>>({});
  /** Doğrulama bekleyen işlem: hangi kart, hangi eylem. */
  const [onay, setOnay] = useState<{ id: string; ne: "onaylandi" | "geri-cekildi" | "geri-al" } | null>(null);
  /** Toplu işlem için seçilen öneriler. */
  const [secili, setSecili] = useState<Set<string>>(new Set());
  /** Toplu onay doğrulama satırı açık mı. */
  const [topluOnay, setTopluOnay] = useState(false);
  /** Toplu işlemin özeti — kaç tanesi geçti. */
  const [ozet, setOzet] = useState("");

  const yukle = useCallback(async () => {
    try {
      const res = await fetch("/api/family/proposals", { cache: "no-store" });
      const d = await res.json();
      if (!res.ok) throw new Error(d?.error ?? "Yüklenemedi.");
      setList(d.proposals as Proposal[]);
    } catch (e) {
      setHata((e as Error).message);
    }
  }, []);

  /*
   * İlk yükleme, `yukle`yi doğrudan çağırmıyor: bileşen sökülmüşken
   * setState çağırmamak için `alive` bayrağıyla sarmalanıyor — depodaki
   * öbür diyaloglarla aynı kalıp.
   */
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const res = await fetch("/api/family/proposals", { cache: "no-store" });
        const d = await res.json();
        if (!alive) return;
        if (!res.ok) throw new Error(d?.error ?? "Yüklenemedi.");
        setList(d.proposals as Proposal[]);
      } catch (e) {
        if (alive) setHata((e as Error).message);
      }
    })();
    return () => { alive = false; };
  }, []);

  const karar = async (id: string, decision: "onaylandi" | "reddedildi") => {
    setBusy(id);
    setHata("");
    setOnay(null);
    try {
      const res = await fetch("/api/family/proposals", {
        method: "PATCH",
        headers: mutationHeaders(),
        body: JSON.stringify({ id, decision }),
      });
      const d = await res.json();
      if (!res.ok) {
        /*
         * BAYAT ÖNERİ ayrı gösteriliyor. Genel bir hata satırı, "bu öneri
         * yazıldığından beri alan değişti" ile "sunucu düştü"yü aynı şeye
         * çevirirdi; oysa ilkinde kullanıcının yapabileceği bir şey var.
         */
        if (Array.isArray(d?.stale)) setStale((s) => ({ ...s, [id]: d.stale as string[] }));
        throw new Error(d?.error ?? "İşlem başarısız.");
      }
      /*
       * TABAN SÜRÜM hemen güncelleniyor. `router.refresh()` beklenmiyor ve
       * beklenemez de; onaylar arka arkaya veriliyor ve ikinci tıklama, kendi
       * az önceki onayının değiştirdiği sürüm yüzünden "başka bir yerde
       * değişti" 409'u yiyordu. Kuyruğun asıl kullanımı arka arkaya onay.
       */
      if (typeof d?.version === "string") setBaseVersion(d.version);
      if (decision === "onaylandi") onApplied?.();
      await yukle();
    } catch (e) {
      setHata((e as Error).message);
    } finally {
      setBusy("");
    }
  };

  /**
   * Kendi önerini geri çek.
   *
   * AYRI uca gidiyor (`/proposals/withdraw`), karar ucuna değil: karar
   * `canEdit` istiyor, geri çekme ise önerinin sahibi olmayı. Ayrıca ağacı
   * değiştirmediği için ne taban sürüm güncelleniyor ne de `onApplied`
   * çağrılıyor — bekleyen bir öneri ağaca hiç uygulanmamıştı.
   */
  const geriCek = async (id: string) => {
    setBusy(id);
    setHata("");
    setOnay(null);
    try {
      const res = await fetch("/api/family/proposals/withdraw", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d?.error ?? "İşlem başarısız.");
      await yukle();
    } catch (e) {
      setHata((e as Error).message);
    } finally {
      setBusy("");
    }
  };

  /**
   * TOPLU karar.
   *
   * Tek uca `ids` ile gidiyor, öneri başına ayrı istek atmıyor: sunucu
   * hepsini AYNI anlık görüntüye uygulayıp ağacı bir kez yazıyor. İstek
   * başına gitseydi her yazma sürüm damgasını ilerletir ve ikinci istek
   * kendi öncekinin damgası yüzünden 409 yerdi.
   *
   * Kısmi başarı normal: bayat ya da kişisi silinmiş öneriler düşüyor,
   * gerekçeleri kendi kartlarında görünüyor.
   */
  const topluKarar = async (decision: "onaylandi" | "reddedildi") => {
    const ids = [...secili];
    if (ids.length === 0) return;
    setBusy("toplu");
    setHata("");
    setOzet("");
    setTopluOnay(false);
    try {
      const res = await fetch("/api/family/proposals", {
        method: "PATCH",
        headers: mutationHeaders(),
        body: JSON.stringify({ ids, decision }),
      });
      const d = await res.json();
      const sonuclar = Array.isArray(d?.results)
        ? (d.results as Array<{ id: string; ok: boolean; error?: string; stale?: string[] }>)
        : [];
      /* Bayat alanlar kart kart gösteriliyor — toplu bir hata satırı hangi öneride ne olduğunu söylemezdi. */
      const yeniStale: Record<string, string[]> = {};
      for (const r of sonuclar) if (Array.isArray(r.stale)) yeniStale[r.id] = r.stale;
      if (Object.keys(yeniStale).length) setStale((s) => ({ ...s, ...yeniStale }));
      if (!res.ok && sonuclar.length === 0) throw new Error(d?.error ?? "İşlem başarısız.");

      if (typeof d?.version === "string") setBaseVersion(d.version);
      const done = Number(d?.done ?? 0);
      const failed = Number(d?.failed ?? 0);
      setOzet(
        failed > 0
          ? t("proposal.bulkPartial", { done, failed })
          : t("proposal.bulkDone", { done })
      );
      if (done > 0 && decision === "onaylandi") onApplied?.();
      setSecili(new Set());
      await yukle();
    } catch (e) {
      setHata((e as Error).message);
    } finally {
      setBusy("");
    }
  };

  /**
   * Onayı geri al.
   *
   * Ağacı DEĞİŞTİRİYOR (onayın tersini uyguluyor), bu yüzden geri çekmenin
   * aksine taban sürüm güncelleniyor ve çağıran tazeleniyor. Öneri kuyruğa
   * "bekliyor" olarak dönüyor.
   */
  const geriAl = async (id: string) => {
    setBusy(id);
    setHata("");
    setOnay(null);
    try {
      const res = await fetch("/api/family/proposals/undo", {
        method: "POST",
        headers: mutationHeaders(),
        body: JSON.stringify({ id }),
      });
      const d = await res.json();
      if (!res.ok) {
        if (Array.isArray(d?.stale)) setStale((s) => ({ ...s, [id]: d.stale as string[] }));
        throw new Error(d?.error ?? "İşlem başarısız.");
      }
      if (typeof d?.version === "string") setBaseVersion(d.version);
      onApplied?.();
      await yukle();
    } catch (e) {
      setHata((e as Error).message);
    } finally {
      setBusy("");
    }
  };

  const secimDegistir = (id: string) =>
    setSecili((s) => {
      const y = new Set(s);
      if (y.has(id)) y.delete(id);
      else y.add(id);
      return y;
    });

  /** Karara bağlanmış önerinin durum etiketi. */
  const durumAdi = (st: Proposal["status"]): string =>
    st === "onaylandi" ? t("proposal.approved")
      : st === "geri-cekildi" ? t("proposal.withdrawn")
      : t("proposal.rejected");

  const bekleyen = (list ?? []).filter((p) => p.status === "bekliyor");
  const gecmis = (list ?? []).filter((p) => p.status !== "bekliyor");

  return (
    <Modal onClose={onClose} title={canDecide ? t("proposal.title") : t("proposal.mine")}>
      <div className="space-y-3">
        {hata && <p className="text-xs text-danger bg-danger-soft px-3 py-2.5 rounded-xl">{hata}</p>}
        {!list && <p className="text-sm text-text-muted">…</p>}
        {ozet && <p className="text-xs text-text-muted bg-primary-soft px-3 py-2.5 rounded-xl">{ozet}</p>}
        {list && bekleyen.length === 0 && gecmis.length === 0 && (
          <p className="text-sm text-text-muted">{t("proposal.empty")}</p>
        )}

        {/*
          * TOPLU İŞLEM ÇUBUĞU — yalnız karar verebilende ve bekleyen öneri
          * varken. Kuyruğun asıl kullanımı "hepsini gözden geçir, onayla";
          * elli öneriyi tek tek onaylatmak özelliği pratikte kullanılmaz
          * kılıyordu.
          */}
        {canDecide && bekleyen.length > 0 && (
          <div className="rounded-xl border border-border bg-surface-2 px-3 py-2.5 space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <Button
                size="sm"
                variant="ghost"
                onClick={() =>
                  setSecili((s) =>
                    s.size === bekleyen.length ? new Set() : new Set(bekleyen.map((p) => p.id))
                  )
                }
              >
                {secili.size === bekleyen.length ? t("proposal.clearSel") : t("proposal.selectAll")}
              </Button>
              {secili.size > 0 && (
                <span className="text-[11px] text-text-muted">
                  {t("proposal.selected", { count: secili.size })}
                </span>
              )}
            </div>

            {secili.size > 0 &&
              (topluOnay ? (
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-[11px] text-text-muted">
                    {t("proposal.confirmBulk", { count: secili.size })}
                  </span>
                  <Button size="sm" disabled={busy === "toplu"} onClick={() => topluKarar("onaylandi")}>
                    {t("proposal.confirmYes")}
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => setTopluOnay(false)}>
                    {t("proposal.cancel")}
                  </Button>
                </div>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {/* Toplu onay da doğrulamadan geçiyor — tek onaydan daha çok şey değiştiriyor. */}
                  <Button size="sm" disabled={busy === "toplu"} onClick={() => setTopluOnay(true)}>
                    {t("proposal.approveSel")}
                  </Button>
                  <Button
                    size="sm"
                    variant="secondary"
                    disabled={busy === "toplu"}
                    onClick={() => topluKarar("reddedildi")}
                  >
                    {t("proposal.rejectSel")}
                  </Button>
                </div>
              ))}
          </div>
        )}

        {[...bekleyen, ...gecmis].map((p) => (
          <article key={p.id} className="rounded-xl border border-border p-3 space-y-2">
            <div className="flex items-start gap-2">
              {canDecide && p.status === "bekliyor" && (
                <input
                  type="checkbox"
                  className="mt-1 accent-primary"
                  aria-label={p.personName || "—"}
                  checked={secili.has(p.id)}
                  onChange={() => secimDegistir(p.id)}
                />
              )}
              <div>
              <p className="text-sm font-medium text-text">{p.personName || "—"}</p>
              <p className="text-[11px] text-text-subtle">
                {p.byName ? `${p.byName} · ` : ""}
                {p.at.slice(0, 16).replace("T", " ")}
                {p.status !== "bekliyor" && ` · ${durumAdi(p.status)}`}
                {p.status === "bekliyor" && p.undoneAt && ` · ${t("proposal.wasUndone")}`}
              </p>
              </div>
            </div>

            {/*
              * TÜRÜ OLAN ÖNERİ DE GÖRÜNMELİ. Kart yalnız `changes`i
              * çiziyordu; "ekleme" ve "silme" önerilerinde o alan boş
              * olduğu için kartta addan başka hiçbir şey görünmüyor, karar
              * veren neyi onayladığını bilmeden onaylıyordu.
              */}
            {(p.kind === "ekleme" || p.kind === "silme" || p.kind === "icerik") && (
              <p className="text-[11px] font-medium text-text-muted">
                {p.kind === "ekleme"
                  ? t("proposal.kindAdd")
                  : p.kind === "silme"
                    ? t("proposal.kindDelete")
                    : `${t("proposal.kindContent")} · ${t(`proposal.store.${p.content?.store ?? ""}`)}`}
              </p>
            )}

            <div className="space-y-1">
              {p.kind === "icerik" || p.kind === "ekleme"
                ? Object.entries(p.kind === "icerik" ? (p.content?.item ?? {}) : (p.person ?? {})).map(([k, v]) => (
                    <div key={k} className="text-[11px] leading-relaxed">
                      <span className="text-text-subtle">{alanAdi(t, k)}: </span>
                      <span className="text-text">{goster(v)}</span>
                    </div>
                  ))
                : Object.entries(p.changes).map(([k, c]) => (
                    <div key={k} className="text-[11px] leading-relaxed">
                      <span className="text-text-subtle">{alanAdi(t, k)}: </span>
                      <span className="text-text-muted line-through">{goster(c.from)}</span>
                      <span className="text-text-subtle"> → </span>
                      <span className="text-text">{goster(c.to)}</span>
                    </div>
                  ))}
            </div>

            {p.note && <p className="text-[11px] text-text-muted italic">{p.note}</p>}

            {stale[p.id] && (
              <p className="text-[11px] text-danger bg-danger-soft px-3 py-2 rounded-xl leading-relaxed">
                {t("proposal.stale")}
                <br />
                {/* Aynı ekranda iki dil olmasın: üstteki liste zaten çevriliyor. */}
                {t("proposal.staleFields")}: {stale[p.id].map((k) => alanAdi(t, k)).join(", ")}
              </p>
            )}

            {/*
              * DOĞRULAMA SATIRI. Onay ağacı hemen değiştiriyor, geri çekme
              * ise kendi önerini kuyruktan düşürüyor; ikisi de tek tıkla
              * olmamalı. Ret bilerek tek adımlı: geri alınabilir bir karar
              * ve kuyruğun asıl işi.
              */}
            {onay?.id === p.id ? (
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-[11px] text-text-muted">
                  {onay.ne === "onaylandi"
                    ? t("proposal.confirmApprove")
                    : onay.ne === "geri-al"
                      ? t("proposal.confirmUndo")
                      : t("proposal.confirmWithdraw")}
                </span>
                <Button
                  size="sm"
                  variant={onay.ne === "onaylandi" ? "primary" : "secondary"}
                  disabled={busy === p.id}
                  onClick={() =>
                    onay.ne === "onaylandi"
                      ? karar(p.id, "onaylandi")
                      : onay.ne === "geri-al"
                        ? geriAl(p.id)
                        : geriCek(p.id)
                  }
                >
                  {t("proposal.confirmYes")}
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setOnay(null)}>
                  {t("proposal.cancel")}
                </Button>
              </div>
            ) : p.status === "onaylandi" ? (
              /*
               * ONAYI GERİ AL — yalnız karar verende. Öneriyi yazana açık
               * olsaydı, üye onaylanmış bir değişikliği tek başına ağaçtan
               * çıkarabilirdi; yani yazma kapısının etrafından dolaşırdı.
               */
              canDecide && (
                <Button size="sm" variant="ghost" disabled={busy === p.id} onClick={() => setOnay({ id: p.id, ne: "geri-al" })}>
                  {t("proposal.undo")}
                </Button>
              )
            ) : (
              p.status === "bekliyor" && (
                <div className="flex flex-wrap gap-2">
                  {canDecide && (
                    <>
                      <Button size="sm" onClick={() => setOnay({ id: p.id, ne: "onaylandi" })} disabled={busy === p.id}>
                        {t("proposal.approve")}
                      </Button>
                      <Button size="sm" variant="secondary" onClick={() => karar(p.id, "reddedildi")} disabled={busy === p.id}>
                        {t("proposal.reject")}
                      </Button>
                    </>
                  )}
                  {/*
                    * GERİ ÇEKME yalnız ÖNERENDE. Yöneticinin başkasının
                    * önerisini geri çekmesi yok — onun aracı ret; geri
                    * çekmek "vazgeçtim" demek ve ondan ancak öneren
                    * vazgeçebilir. Sunucu da aynı kuralı ayrıca uyguluyor;
                    * burası yalnız gereksiz düğmeyi göstermiyor.
                    */}
                  {!!p.by && p.by === authorId && (
                    <Button size="sm" variant="ghost" onClick={() => setOnay({ id: p.id, ne: "geri-cekildi" })} disabled={busy === p.id}>
                      {t("proposal.withdraw")}
                    </Button>
                  )}
                </div>
              )
            )}
          </article>
        ))}
      </div>
    </Modal>
  );
}
