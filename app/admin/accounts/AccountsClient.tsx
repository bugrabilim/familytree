"use client";

import { useState } from "react";
import Link from "next/link";
import { userMessage } from "@/lib/error-text";
import { confirmMatches } from "@/lib/retention";

/**
 * OPERATÖR PANELİ — hesapları listeler, yumuşak ya da kalıcı siler.
 *
 * Diğer iki yönetim sayfasıyla (`/admin/migrate`, `/admin/drift`) aynı düzen
 * ve aynı dil; tek farkı KİMLİĞİN NEREDEN GELDİĞİ. O ikisi oturumla çalışıyor
 * (`canManage`), bu sayfa SIRLA: operatör `CRON_SECRET`i aşağıdaki alana
 * yapıştırıyor ve her istek onu `Authorization: Bearer …` başlığında
 * taşıyor. Gerekçesi uçta yazılı — özeti: bu uygulamada her kurucu kendi
 * ağacının yöneticisi, dolayısıyla oturum tabanlı bir kapı "herkes herkesin
 * hesabını silebilir" demek olurdu.
 *
 * ## SIR TARAYICI DEPOSUNA YAZILMIYOR
 *
 * Ne `localStorage` ne `sessionStorage` — yalnız React durumunda, yani
 * sekmenin belleğinde. Sebep sırrın ne olduğuyla ilgili: `CRON_SECRET` bu
 * sistemdeki EN GENİŞ yetki (her hesabı kalıcı silebilir) ve tarayıcı
 * deposuna yazılan bir değer, o makineye erişen HERKESİN eline geçer —
 * ödünç verilen dizüstü, açık bırakılan ekran, aynı profili kullanan bir
 * başkası, konsolu açan bir eklenti. Depo kalıcıdır: kullanıcı sekmeyi
 * kapatınca da, oturumu bitince de, aylar sonra da orada durur. Sırrın
 * bütün anlamı "yalnız operatörde" olması; onu diske yazmak o anlamı
 * ortadan kaldırır. Bellekte tutulan bir değer ise sekme kapanınca gider.
 *
 * Bedeli: sayfa her yenilendiğinde sır yeniden yapıştırılır. Bu bir rahatsızlık
 * değil, doğru fiyat — bu panel günde bir kez bile açılmıyor.
 */

/** GET'in döndürdüğü hesap satırı. */
type Hesap = {
  accountId: string;
  familyName: string;
  createdAt?: string;
  deletedAt: string | null;
  isDemo?: boolean;
  daysLeft?: number;
  purgeAt?: string;
  treeCount: number | null;
  treeIds: string[];
  error?: string;
};

type Kip = "soft" | "purge";

type Sonuc = {
  ok?: boolean;
  error?: string;
  accountId?: string;
  familyName?: string;
  mode?: string;
  daysLeft?: number;
  failed?: string[];
  note?: string;
};

export default function AccountsClient() {
  /* Sır YALNIZ burada — dosya başındaki gerekçe. Kalıcılaştırılmayacak. */
  const [secret, setSecret] = useState("");
  const [loading, setLoading] = useState<"" | "list" | "delete">("");
  const [hesaplar, setHesaplar] = useState<Hesap[] | null>(null);
  const [listeHatasi, setListeHatasi] = useState("");
  const [sonuc, setSonuc] = useState<Sonuc | null>(null);

  /* Açık olan silme paneli (hesap kimliği) ve o panelin durumu. */
  const [acik, setAcik] = useState("");
  const [kip, setKip] = useState<Kip>("soft");
  const [onay, setOnay] = useState("");

  const baslik = () => ({ Authorization: `Bearer ${secret}` });

  const listele = async () => {
    setLoading("list");
    setListeHatasi("");
    setSonuc(null);
    setAcik("");
    try {
      const res = await fetch("/api/admin/accounts", {
        headers: baslik(),
        cache: "no-store",
      });
      const data = await res.json();
      if (!res.ok) {
        setHesaplar(null);
        setListeHatasi(String(data?.error ?? `Liste alınamadı (HTTP ${res.status}).`));
        return;
      }
      setHesaplar(Array.isArray(data.accounts) ? (data.accounts as Hesap[]) : []);
    } catch (e) {
      setHesaplar(null);
      setListeHatasi(userMessage(e, "Liste alınamadı."));
    } finally {
      setLoading("");
    }
  };

  const paneliAc = (id: string) => {
    /* Panel her açılışta VARSAYILANA dönüyor: "30 gün beklesin" ve boş onay
       alanı. Önceki satırda seçilmiş "Hemen sil" bir sonraki satıra taşınsaydı,
       operatör kipi seçtiğini bile fark etmeden kalıcı silmeye basabilirdi. */
    setAcik((v) => (v === id ? "" : id));
    setKip("soft");
    setOnay("");
    setSonuc(null);
  };

  const sil = async (h: Hesap) => {
    setLoading("delete");
    setSonuc(null);
    try {
      const res = await fetch("/api/admin/accounts", {
        method: "POST",
        headers: { ...baslik(), "Content-Type": "application/json" },
        body: JSON.stringify({
          accountId: h.accountId,
          mode: kip,
          ...(kip === "purge" ? { confirm: onay } : {}),
        }),
      });
      const data = (await res.json()) as Sonuc;
      /*
       * 207 `res.ok` DÖNER. "Kısmen başarısız"ı tam başarı saymak, operatöre
       * "her şey silindi" demek olurdu — oysa temizlenemeyen yol elle
       * silinmeli. Bu yüzden başarı ölçüsü `res.ok` değil, `failed` boşluğu.
       */
      setSonuc(data);
      setAcik("");
      if (!data.error) await listele();
    } catch (e) {
      setSonuc({ error: userMessage(e, "Silme tamamlanamadı.") });
    } finally {
      setLoading("");
    }
  };

  /* Kalıcı silme düğmesinin kilidi: yazılan ad hedefin aile adıyla BİREBİR
     eşleşene kadar açılmıyor. Karşılaştırma sunucudakiyle AYNI işlev
     (`confirmMatches`) — iki tarafta iki farklı kural olsaydı, arayüz açıkken
     sunucunun reddettiği (ya da tersi) bir hâl çıkardı. */
  const kilitli = (h: Hesap) => kip === "purge" && !confirmMatches(onay, h.familyName);

  return (
    <main className="min-h-screen bg-bg text-text px-5 py-10">
      <div className="mx-auto max-w-3xl">
        <div className="flex items-center justify-between mb-1">
          <h1 className="font-serif text-2xl font-semibold">Hesap Yönetimi</h1>
          <Link href="/tree" className="text-sm text-text-muted hover:text-text underline">
            ← Ağaca dön
          </Link>
        </div>
        <p className="text-sm text-text-muted mb-6 leading-relaxed">
          Hesapları listeler ve siler. Bu sayfa oturumla değil <b>sırla</b> çalışır: aşağıdaki alana
          yapıştırılan <code>CRON_SECRET</code> her isteğin <code>Authorization</code> başlığında
          taşınır. Sır <b>hiçbir yere kaydedilmez</b> — yalnız bu sekmenin belleğinde durur, sayfayı
          yenilediğinizde yeniden yapıştırmanız gerekir.
        </p>

        <div className="flex flex-wrap gap-2 mb-6">
          <input
            type="password"
            value={secret}
            onChange={(e) => setSecret(e.target.value)}
            placeholder="CRON_SECRET"
            autoComplete="off"
            spellCheck={false}
            className="h-10 min-w-0 flex-1 px-3 rounded-lg border border-border bg-surface text-sm font-mono"
          />
          <button
            onClick={listele}
            disabled={!!loading || !secret}
            className="h-10 px-4 rounded-lg border border-border bg-surface hover:bg-surface-2 text-sm font-medium disabled:opacity-50"
          >
            {loading === "list" ? "Listeleniyor…" : "Listele"}
          </button>
          <Link
            href="/admin/drift"
            className="h-10 px-4 rounded-lg border border-border bg-surface hover:bg-surface-2 text-sm font-medium inline-flex items-center"
          >
            Kayma denetimi
          </Link>
        </div>

        {listeHatasi && (
          <p className="text-sm text-danger mb-4">Hata: {listeHatasi}</p>
        )}

        {hesaplar && hesaplar.length === 0 && !listeHatasi && (
          <p className="text-sm text-text-muted mb-4">Kayıtlı hesap yok.</p>
        )}

        {hesaplar && hesaplar.length > 0 && (
          <div className="rounded-xl border border-border bg-bg-elevated p-4 overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-text-muted border-b border-border">
                  <th className="py-1.5 pr-3 font-medium">Aile adı</th>
                  <th className="py-1.5 px-2 font-medium">Kimlik</th>
                  <th className="py-1.5 px-2 font-medium tabular-nums">Ağaç</th>
                  <th className="py-1.5 px-2 font-medium">Durum</th>
                  <th className="py-1.5 pl-2 font-medium" />
                </tr>
              </thead>
              <tbody>
                {hesaplar.map((h) => (
                  <FragmentRow
                    key={h.accountId}
                    h={h}
                    acik={acik === h.accountId}
                    kip={kip}
                    onay={onay}
                    kilitli={kilitli(h)}
                    calisiyor={loading === "delete"}
                    onAc={() => paneliAc(h.accountId)}
                    onKip={setKip}
                    onOnay={setOnay}
                    onSil={() => sil(h)}
                  />
                ))}
              </tbody>
            </table>
          </div>
        )}

        {sonuc && (
          <div className="mt-5 rounded-xl border border-border bg-bg-elevated p-4 text-sm">
            {sonuc.error ? (
              <p className="text-danger">Hata: {sonuc.error}</p>
            ) : (
              <>
                <p className="font-medium mb-1">
                  {sonuc.failed && sonuc.failed.length > 0
                    ? "⚠️ Silme kısmen başarısız"
                    : sonuc.mode === "purge"
                      ? "✅ Kalıcı olarak silindi"
                      : "✅ Beklemeye alındı"}
                </p>
                <p className="text-[11px] text-text-muted">
                  {sonuc.familyName ?? sonuc.accountId}
                  {sonuc.note ? ` — ${sonuc.note}` : ""}
                </p>
                {sonuc.failed && sonuc.failed.length > 0 && (
                  /* Silinemeyen yollar EKRANDA. Sessizce yutmak, operatöre
                     olmayan bir temizlik vaat etmek olurdu. */
                  <ul className="mt-2 space-y-0.5 text-[11px] text-danger font-mono">
                    {sonuc.failed.map((y) => (
                      <li key={y}>{y}</li>
                    ))}
                  </ul>
                )}
              </>
            )}
          </div>
        )}
      </div>
    </main>
  );
}

/** Bir hesap satırı + (açıksa) altındaki silme paneli. */
function FragmentRow({
  h,
  acik,
  kip,
  onay,
  kilitli,
  calisiyor,
  onAc,
  onKip,
  onOnay,
  onSil,
}: {
  h: Hesap;
  acik: boolean;
  kip: Kip;
  onay: string;
  kilitli: boolean;
  calisiyor: boolean;
  onAc: () => void;
  onKip: (k: Kip) => void;
  onOnay: (v: string) => void;
  onSil: () => void;
}) {
  return (
    <>
      <tr className="border-b border-border/60 last:border-0 align-top">
        <td className="py-1.5 pr-3">{h.familyName}</td>
        <td className="py-1.5 px-2 font-mono text-[11px] text-text-muted break-all">
          {h.accountId}
        </td>
        <td className="py-1.5 px-2 tabular-nums">
          {h.treeCount == null ? (
            <span className="text-danger" title={h.error}>?</span>
          ) : (
            h.treeCount
          )}
        </td>
        <td className="py-1.5 px-2">
          {h.deletedAt ? (
            <span className="text-text-muted">
              silinmiş · {h.daysLeft ?? "?"} gün kaldı
            </span>
          ) : (
            <span className="text-primary">canlı</span>
          )}
        </td>
        <td className="py-1.5 pl-2 text-right">
          {h.isDemo ? (
            <span className="text-[11px] text-text-muted">demo — silinemez</span>
          ) : (
            <button
              onClick={onAc}
              className="h-8 px-3 rounded-lg border border-border bg-surface hover:bg-surface-2 text-[11px] font-medium"
            >
              {acik ? "Vazgeç" : "Sil"}
            </button>
          )}
        </td>
      </tr>

      {acik && (
        <tr className="border-b border-border/60 last:border-0">
          <td colSpan={5} className="py-3">
            <div className="rounded-xl border border-border bg-surface p-3">
              {h.treeIds.length > 0 && (
                <p className="text-[11px] text-text-muted font-mono break-all mb-2">
                  Ağaçlar: {h.treeIds.join(", ")}
                </p>
              )}

              <fieldset>
                <legend className="text-[11px] text-text-muted mb-1.5">Silme kipi</legend>
                <label className="flex items-center gap-2.5 p-2 rounded-lg cursor-pointer">
                  <input
                    type="radio"
                    name={`kip-${h.accountId}`}
                    checked={kip === "soft"}
                    onChange={() => onKip("soft")}
                  />
                  <span className="text-sm">
                    30 gün beklesin{" "}
                    <span className="text-text-muted">
                      — hesap her yüzeyden düşer, veri durur, geri alınabilir.
                    </span>
                  </span>
                </label>
                <label className="flex items-center gap-2.5 p-2 rounded-lg cursor-pointer">
                  <input
                    type="radio"
                    name={`kip-${h.accountId}`}
                    checked={kip === "purge"}
                    onChange={() => onKip("purge")}
                  />
                  <span className="text-sm">
                    Hemen sil{" "}
                    <span className="text-text-muted">— beklemeden, kalıcı olarak.</span>
                  </span>
                </label>
              </fieldset>

              {kip === "purge" && (
                <div className="mt-2 rounded-lg border border-danger/40 bg-danger/5 p-3">
                  {/*
                    UYARI GÖRÜNÜR METİNDE, ipucu balonunda değil: `title`
                    yalnız fareyle üstünde durana görünür — dokunmatikte ve
                    klavyeyle gezen kullanıcıda hiç açılmaz. Geri alınamaz bir
                    işlemin uyarısı, işlemi yapan herkesin okuduğu yerde olmalı.
                  */}
                  <p className="text-sm text-danger font-medium">
                    Bu işlem geri alınamaz.
                  </p>
                  <p className="text-[11px] text-text-muted leading-snug mt-1">
                    Hesabın bütün ağaçları, kişileri, fotoğrafları, mektupları ve kayıtları
                    kalıcı olarak silinir. 30 günlük bekleme YOKTUR, geri alma bağlantısı
                    YOKTUR. Elde kalan tek şey o güne ait yedektir ve onu geri yüklemek elle
                    yapılan bir iştir.
                  </p>
                  <label className="block mt-2.5">
                    <span className="block text-[11px] text-text-muted mb-1">
                      {/*
                        AD TEYİDİ: sır "sen misin" sorusunu zaten yanıtladı;
                        bu alan "ne yaptığının farkında mısın" sorusunun yanıtı.
                        Kimlik listeden kopyalanan opak bir dize — yanlış satırı
                        kopyalamak sessiz bir hata. Adı EL İLE yazmak, operatörü
                        hangi aileyi sildiğini bir kez daha söylemeye zorluyor.
                      */}
                      Onaylamak için aile adını birebir yazın:{" "}
                      <b className="text-text">{h.familyName}</b>
                    </span>
                    <input
                      type="text"
                      value={onay}
                      onChange={(e) => onOnay(e.target.value)}
                      autoComplete="off"
                      spellCheck={false}
                      className="h-10 w-full px-3 rounded-lg border border-border bg-bg text-sm"
                    />
                  </label>
                </div>
              )}

              <div className="mt-3">
                <button
                  onClick={onSil}
                  disabled={calisiyor || kilitli}
                  /* Kalıcı silme düğmesi `danger` tonunda — depodaki
                     `Button variant="danger"` ile aynı sınıf çifti; düz
                     `text-white` iki temada birden okunmuyor. */
                  className={`h-10 px-4 rounded-lg text-sm font-medium disabled:opacity-50 ${
                    kip === "purge"
                      ? "bg-danger-soft text-danger hover:brightness-95 dark:hover:brightness-125"
                      : "bg-primary text-primary-text hover:brightness-110"
                  }`}
                >
                  {calisiyor
                    ? "Siliniyor…"
                    : kip === "purge"
                      ? "Kalıcı olarak sil"
                      : "30 günlük beklemeye al"}
                </button>
                {kilitli && (
                  <span className="ml-2 text-[11px] text-text-muted">
                    Aile adı birebir yazılana kadar kapalı.
                  </span>
                )}
              </div>
            </div>
          </td>
        </tr>
      )}
    </>
  );
}
