import { mutateRow, CAKISMA_DENEME } from "../lib/store-mutate.ts";

let ok = 0, fail = 0;
const check = (cond: boolean, msg: string) => { if (cond) ok++; else { fail++; console.log(`✗ ${msg}`); } };

/**
 * `mutateRow` — SATIR düzeyinde karşılaştır-ve-değiştir (Faz 4 / 2c-2).
 *
 * Bu dosya kaynak taramıyor, DAVRANIŞ çalıştırıyor: sahte bir "veritabanı"
 * ile çakışma, yeniden deneme ve tükenme yolları gerçekten koşuyor. Kimlik
 * yazmalarının kayıp yazma koruması artık buna dayanıyor ve kaynak taraması
 * "koşullu güncelleme çağrılıyor" der ama "çakışmada gerçekten baştan
 * alınıyor" DEMEZ.
 */

/** Damgalı tek satır tutan sahte depo; `yaz` yalnız damga tutarsa yazar. */
function sahteDepo(baslangic: { v: number } | null, damga: string | null) {
  const d = {
    satir: baslangic,
    damga,
    okuma: 0,
    yazma: 0,
    /** Test sırasında araya girmek için: bir sonraki okumadan önce çalışır. */
    araya: null as null | (() => void),
  };
  const oku = async () => {
    if (d.araya) { d.araya(); d.araya = null; }
    d.okuma++;
    return d.satir ? { satir: { ...d.satir }, damga: d.damga } : null;
  };
  const yaz = async (satir: { v: number }, eski: string | null, yeni: string) => {
    d.yazma++;
    if (eski !== d.damga) return false; // koşul tutmadı → çakışma
    d.satir = { ...satir };
    d.damga = yeni;
    return true;
  };
  return { d, oku, yaz };
}

/* --- 1. Sakin durum: bir okuma, bir yazma ----------------------------- */
{
  const { d, oku, yaz } = sahteDepo({ v: 1 }, "A");
  const sonuc = await mutateRow<{ v: number }, string>(
    oku, yaz,
    (s) => { s!.v = 9; return { yaz: true, sonuc: "yazıldı" }; },
    "hesap"
  );
  check(sonuc === "yazıldı", "sonuç çağırana dönüyor");
  check(d.satir?.v === 9, "değişiklik uygulandı");
  check(d.okuma === 1 && d.yazma === 1, `tek tur (okuma=${d.okuma} yazma=${d.yazma})`);
  check(d.damga !== "A", "damga ilerledi");
}

/* --- 2. YAZMA YOKSA hiç yazılmıyor ------------------------------------ */
/*
 * "Bulunamadı" / "değişiklik yok" tek okumayla dönmeli; yazmayan bir işlemi
 * koşullu güncellemeye sokmak boş ağ trafiği olurdu.
 */
{
  const { d, oku, yaz } = sahteDepo({ v: 1 }, "A");
  const sonuc = await mutateRow<{ v: number }, boolean>(
    oku, yaz, () => ({ yaz: false, sonuc: false }), "hesap"
  );
  check(sonuc === false && d.yazma === 0, "yazma yoksa koşullu güncelleme hiç çağrılmıyor");
}

/* --- 3. Satır YOKSA `degistir` null alıyor ---------------------------- */
{
  const { d, oku, yaz } = sahteDepo(null, null);
  let gelen: unknown = "hiç çağrılmadı";
  const sonuc = await mutateRow<{ v: number }, string>(
    oku, yaz, (s) => { gelen = s; return { yaz: false, sonuc: "yok" }; }, "hesap"
  );
  check(gelen === null, "olmayan satır için `null` geçiliyor");
  check(sonuc === "yok" && d.yazma === 0, "bulunamadı kararı çağıranın");
}

/* --- 4. Satır yokken YAZILAMAZ ---------------------------------------- */
/*
 * Sessizce başarılı dönmek, yazılmamış bir değişikliği yazılmış göstermek
 * olurdu — korumanın önlemeye çalıştığı arızanın ta kendisi.
 */
{
  const { oku, yaz } = sahteDepo(null, null);
  let patladi = false;
  try {
    await mutateRow<{ v: number }, boolean>(oku, yaz, () => ({ yaz: true, sonuc: true }), "hesap");
  } catch { patladi = true; }
  check(patladi, "olmayan satıra yazma denemesi hata veriyor");
}

/* --- 5. ÇAKIŞMA: araya biri girdi → baştan alınıyor -------------------- */
/*
 * Asıl iddia bu. Sahte depo ilk yazmada damgayı tutmayacak (çünkü araya
 * giren biri damgayı değiştirdi); `mutateRow` yeniden okuyup TAZE değerin
 * üstüne yazmalı — eskisinin üstüne değil.
 */
{
  const { d, oku, yaz } = sahteDepo({ v: 1 }, "A");
  let ilk = true;
  const sonuc = await mutateRow<{ v: number }, number>(
    oku, yaz,
    (s) => {
      if (ilk) {
        ilk = false;
        // Bu turun okuması ile yazması ARASINDA başkası yazdı:
        d.satir = { v: 100 };
        d.damga = "B";
      }
      s!.v += 1;
      return { yaz: true, sonuc: s!.v };
    },
    "hesap"
  );
  check(d.okuma === 2, `çakışmada yeniden okundu (okuma=${d.okuma})`);
  check(d.satir?.v === 101, `araya girenin değeri korundu ve üstüne eklendi (${d.satir?.v})`);
  check(sonuc === 101, "dönen sonuç TAZE değerden hesaplandı");
}

/* --- 6. Denemeler tükenirse HATA — sessiz başarı yok ------------------ */
{
  const { d, oku, yaz } = sahteDepo({ v: 1 }, "A");
  let n = 0;
  let mesaj = "";
  try {
    await mutateRow<{ v: number }, boolean>(
      oku, yaz,
      (s) => {
        // Her turda okuma ile yazma ARASINDA başkası yazıyor → koşul hiç tutmuyor.
        d.damga = `X${n++}`;
        s!.v++;
        return { yaz: true, sonuc: true };
      },
      "şifre"
    );
  } catch (e) { mesaj = (e as Error).message; }
  check(/şifre/.test(mesaj), `etiket hata metninde ("${mesaj}")`);
  check(/tekrar dene/.test(mesaj), "mesaj eyleme dönük");
  check(d.yazma === CAKISMA_DENEME, `deneme sayısı kadar denendi (${d.yazma})`);
}

/* --- 7. Damgası OLMAYAN satır de güncellenebiliyor --------------------- */
/*
 * `updated_at` sütunu sonradan eklendi; göçten önce açılmış her hesabın
 * damgası boş. `null` bir damga çalışmasaydı o hesaplar bir daha hiç
 * güncellenemez, kullanıcı bunu ancak ilk şifre sıfırlamasında görürdü.
 */
{
  const { d, oku, yaz } = sahteDepo({ v: 5 }, null);
  await mutateRow<{ v: number }, boolean>(
    oku, yaz, (s) => { s!.v = 6; return { yaz: true, sonuc: true }; }, "hesap"
  );
  check(d.satir?.v === 6 && d.damga !== null, "boş damgalı satır yazılıp damga kazandı");
}

console.log(`\n${ok}/${ok + fail} geçti${fail ? `, ${fail} başarısız` : " ✓"}`);
if (fail) process.exit(1);
