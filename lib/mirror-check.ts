import { normalizeStamp } from "./version-stamp.ts";

/**
 * AYNA DENETİMİ — Blob (kaynak) ile Postgres (ayna) hâlâ aynı mı?
 *
 * ## Neden ucuz bir denetim gerekiyordu
 *
 * Tam kayma denetimi (`lib/drift.ts`) kayıt kayıt, alan alan karşılaştırıyor
 * ve doğru aracın ta kendisi — ama üç sınırı var: yalnız ELLE çalışıyor,
 * yalnız giriş yapmış founder'ın KENDİ ağaçlarına bakıyor, ve o düğmeyi
 * kimse görmüyor. Yani ayrışma varsa da kimsenin haberi olmuyor.
 *
 * Bu dosya onun yerine geçmiyor; eksiğini kapatıyor. Sorduğu soru daha
 * kaba ama günlük olarak, BÜTÜN hesaplar için sorulabilecek kadar ucuz:
 * "sayılar tutuyor mu, damgalar tutuyor mu?" Yanıt hayırsa insan gelip
 * asıl aracı çalıştırır.
 *
 * Kaba denetimin kaçırdığı tek şey, sayının ve damganın aynı kalıp içeriğin
 * değişmesi. Onu yakalayan `lib/drift.ts`; buranın işi, o aracın hiç
 * çalıştırılmadığı durumu ortadan kaldırmak.
 *
 * ## Neden "ileride" de bir arıza
 *
 * Aynanın kaynaktan İLERİDE olması, ilk bakışta zararsız görünür. Değil:
 * yazma yolu iki yere birden yazıyor, yani ayna ilerideyse bir yazma
 * Postgres'e ulaşmış ama Blob'a ulaşmamış demektir. Kaynak artık kaynak
 * değil ve okuma yolu Postgres'i öne aldığı için bu FARK EDİLMEZ — ta ki
 * Postgres'ten okunamayan bir gün gelene kadar.
 *
 * Saf ve bağımlılıksız — birim testi koşulabilsin.
 */

export type MirrorStatus =
  /** Sayılar ve damgalar tutuyor. */
  | "esit"
  /** Ağacın Postgres'te satırı yok — hiç göç etmemiş ya da satır silinmiş. */
  | "yok"
  /** Kişi sayıları farklı. */
  | "sayi-farkli"
  /** Sayı aynı ama aynanın damgası kaynaktan eski. */
  | "geride"
  /** Sayı aynı ama aynanın damgası kaynaktan yeni (yukarıdaki gerekçe). */
  | "ileride";

export interface MirrorInput {
  treeId: string;
  name: string;
  /** Postgres'te ağaç satırı var mı? */
  inDb: boolean;
  /** Blob'da veri dosyası okunabildi mi? Okunamadıysa denetim YAPILMAZ. */
  blobRead: boolean;
  blobPeople: number;
  dbPeople: number;
  blobStamp?: unknown;
  dbStamp?: unknown;
}

export interface MirrorVerdict {
  treeId: string;
  name: string;
  status: MirrorStatus;
  blobPeople: number;
  dbPeople: number;
  /** Günlüğe yazılacak tek satırlık açıklama. */
  detail: string;
}

/**
 * Tek ağacın kararı.
 *
 * KAYNAK OKUNAMADIYSA KARAR VERİLMEZ — çağıran o ağacı hiç sormamalı.
 * "Blob boş" ile "Blob okunamadı" karıştırılırsa denetim, aynayı fazlalıkla
 * dolu sanır ve insanı Postgres'i boşaltmaya davet eder. `lib/drift.ts` aynı
 * tuzağı `blobMissing` ile ayırıyor; burada `blobRead` ile.
 */
export function checkMirror(i: MirrorInput): MirrorVerdict {
  const bas = { treeId: i.treeId, name: i.name, blobPeople: i.blobPeople, dbPeople: i.dbPeople };

  if (!i.blobRead) {
    return { ...bas, status: "yok", detail: "kaynak (Blob) okunamadı — karşılaştırma yapılmadı" };
  }
  if (!i.inDb) {
    return { ...bas, status: "yok", detail: `Postgres'te ağaç satırı yok (Blob'da ${i.blobPeople} kişi)` };
  }
  if (i.blobPeople !== i.dbPeople) {
    return {
      ...bas,
      status: "sayi-farkli",
      detail: `kişi sayısı ayrışmış — Blob ${i.blobPeople}, Postgres ${i.dbPeople}`,
    };
  }

  const b = normalizeStamp(i.blobStamp);
  const d = normalizeStamp(i.dbStamp);
  /*
   * Damgalardan biri okunamıyorsa (boş dizge) karşılaştırma yapılmıyor:
   * boş dizge her ISO damgadan küçüktür ve "geride" yanlış alarmı üretirdi.
   * Sayılar tuttuğu için "eşit" demek burada dürüst olan.
   */
  if (b && d) {
    if (d < b) return { ...bas, status: "geride", detail: `ayna geride — Blob ${b}, Postgres ${d}` };
    if (d > b) return { ...bas, status: "ileride", detail: `ayna ileride — Blob ${b}, Postgres ${d}` };
  }
  return { ...bas, status: "esit", detail: `${i.blobPeople} kişi, damgalar tutuyor` };
}

export interface MirrorSummary {
  checked: number;
  clean: number;
  problems: MirrorVerdict[];
  /** Günlüğe yazılacak tek satır. */
  line: string;
}

/**
 * Koşunun özeti.
 *
 * Sorunlular listeleniyor, temizler yalnız sayılıyor: günlüğe yazılacak
 * satırın uzunluğu ağaç sayısıyla değil ARIZA sayısıyla büyümeli, yoksa
 * satır okunamaz olur ve okunamayan uyarı, uyarı değildir.
 */
export function mirrorSummary(verdicts: readonly MirrorVerdict[]): MirrorSummary {
  const problems = verdicts.filter((v) => v.status !== "esit");
  const clean = verdicts.length - problems.length;
  const line = problems.length
    ? `${verdicts.length} ağaç bakıldı, ${problems.length} AYRIŞMA: ` +
      problems.map((p) => `${p.name} (${p.treeId}) — ${p.detail}`).join(" | ")
    : `${verdicts.length} ağaç bakıldı, ayrışma yok`;
  return { checked: verdicts.length, clean, problems, line };
}
