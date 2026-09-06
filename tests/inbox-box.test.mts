import { MAX_MAILS, type Mail } from "../lib/inbox.ts";
import {
  CAS_DENEME,
  bosKutu,
  mutateBox,
  normalizeBox,
  readBox,
  type Box,
  type BoxIO,
} from "../lib/inbox-box.ts";

let ok = 0, fail = 0;
function check(cond: boolean, msg: string) { if (cond) ok++; else { fail++; console.log(`✗ ${msg}`); } }

/**
 * GELEN KUTUSUNUN oku-değiştir-yaz kuralları.
 *
 * Buradaki iddiaların hepsi VERİ KAYBI hakkında ve ikisi gerçek arızalardan
 * doğdu:
 *
 *  1. Okuma başarısız olduğunda boş kutu dönülüyordu ve çağıran onun üstüne
 *     yazıyordu — tek bir geçici indirme hatası, o ana kadarki BÜTÜN
 *     postaları siliyordu. Sessizce: webhook 200 dönüyordu.
 *  2. Kilit yoktu. Aynı anda iki yazan (iki posta, ya da webhook + ekran)
 *     aynı sürümü okuyup ikisi de yazıyor, ikinci yazan birinciyi
 *     siliyordu.
 *
 * Sahte depo gerçek Blob'un davranışını taklit ediyor: sürüm damgası her
 * yazmada değişiyor, damga tutmazsa yazma REDDEDİLİYOR.
 */

const AN = new Date("2026-09-05T22:00:00Z").toISOString();
const mail = (id: string): Mail => ({
  id, from: "a@b.co", to: "bilgi@soylus.com", subject: "K", text: "M", at: AN,
});

class Cakisma extends Error {}

/** Sürüm damgası tutan sahte depo. `yok: true` → kutu hiç oluşmamış. */
function sahteDepo(baslangic: Mail[] | null) {
  const durum = {
    icerik: baslangic === null ? null : ({ mails: baslangic, updatedAt: AN } as Box),
    etag: baslangic === null ? undefined : ("v0" as string | undefined),
    sayac: 0,
    okumaHatasi: null as Error | null,
    yazma: 0,
  };
  const io: BoxIO = {
    async read() {
      if (durum.okumaHatasi) throw durum.okumaHatasi;
      if (durum.icerik === null) return null;
      return { raw: JSON.parse(JSON.stringify(durum.icerik)), etag: durum.etag };
    },
    async write(box, etag) {
      // Gerçek koşullu yazma: damga tutmazsa hiçbir şey değişmiyor.
      if (etag !== durum.etag) throw new Cakisma("sürüm tutmuyor");
      durum.icerik = JSON.parse(JSON.stringify(box)) as Box;
      durum.etag = `v${++durum.sayac}`;
      durum.yazma++;
    },
    isConflict: (e) => e instanceof Cakisma,
  };
  return { durum, io };
}

/** Kutuya posta ekleyen değişiklik. */
const ekle = (m: Mail) => (box: Box) => {
  box.mails = [m, ...box.mails];
  return { yaz: true, sonuc: m.id };
};

/* ── 1. OKUNAMAYAN kutu BOŞ kutu değildir ────────────────────────────────── */
/*
 * Bu, hattaki en pahalı hataydı: `getBox` okuma hatasında boş kutu dönüyor,
 * `storeMail` onun üstüne yazıyor ve kutudaki her şey gidiyordu.
 */
{
  const d = sahteDepo([mail("m1"), mail("m2"), mail("m3")]);
  d.durum.okumaHatasi = new Error("blob 503");
  let firlatti = false;
  try {
    await mutateBox(d.io, ekle(mail("m4")));
  } catch {
    firlatti = true;
  }
  check(firlatti, "okuma hatası YUTULMUYOR, fırlatılıyor");
  check(d.durum.yazma === 0, "okuma hatasında HİÇ yazılmıyor");
  check(d.durum.icerik!.mails.length === 3, "eski postalar duruyor (kutu silinmedi)");
}
{
  /* Kutu GERÇEKTEN yoksa boş kutuyla başlanır — ilk posta onu oluşturur. */
  const d = sahteDepo(null);
  const r = await mutateBox(d.io, ekle(mail("ilk")));
  check(r === "ilk", "kutu yokken ilk posta yazılabiliyor");
  check(d.durum.icerik!.mails.length === 1, "kutu oluşturuldu");
}
{
  const d = sahteDepo(null);
  check((await readBox(d.io)).mails.length === 0, "kutu yoksa okuma boş liste veriyor");
  d.durum.okumaHatasi = new Error("kopuk");
  let firlatti = false;
  try { await readBox(d.io); } catch { firlatti = true; }
  check(firlatti, "okuma hatasında `readBox` de fırlatıyor (boş kutu göstermiyor)");
}

/* ── 2. YARIŞ: iki yazan aynı anda ───────────────────────────────────────── */
/*
 * Gerçek dizilim: A okur, B okur, B yazar, A yazar. Koşullu yazma olmasa
 * A'nın yazması B'nin postasını SİLERDİ ve kimse fark etmezdi.
 */
{
  const d = sahteDepo([]);
  let kapiyiAc: () => void = () => {};
  const kapi = new Promise<void>((r) => (kapiyiAc = r));
  let ilkOkuma = true;
  const yavasIo: BoxIO = {
    ...d.io,
    async read() {
      const s = await d.io.read();
      // Yalnız A'nın İLK okuması bekliyor; yeniden denemesi beklemiyor.
      if (ilkOkuma) { ilkOkuma = false; await kapi; }
      return s;
    },
  };

  // Hata da bir SONUÇ: yutulursa "iki posta da kutuda" iddiası anlamını yitirir.
  const aSozu = mutateBox(yavasIo, ekle(mail("A"))).catch((e) => `hata: ${e}`);
  const bSonuc = await mutateBox(d.io, ekle(mail("B"))).catch((e) => `hata: ${e}`);
  kapiyiAc();
  const aSonuc = await aSozu;

  check(aSonuc === "A" && bSonuc === "B", `iki yazma da başarı bildiriyor (A=${aSonuc}, B=${bSonuc})`);
  const idler = d.durum.icerik!.mails.map((m) => m.id).sort();
  check(idler.join(",") === "A,B", `iki posta da kutuda (bulunan: ${idler.join(",") || "yok"})`);
  check(d.durum.yazma === 2, "iki gerçek yazma oldu (çakışan deneme sayılmıyor)");
}
{
  /* Değişiklik TAZE kutuya uygulanıyor: bayat karar yeniden hesaplanıyor. */
  const d = sahteDepo([]);
  let cagri = 0;
  await mutateBox(d.io, (box) => {
    cagri++;
    // İlk denemede araya biri girmiş gibi damgayı kaydır.
    if (cagri === 1) d.durum.etag = "araya-girdi";
    box.mails = [mail(`d${cagri}`), ...box.mails];
    return { yaz: true, sonuc: undefined };
  });
  check(cagri === 2, "çakışmada `uygula` yeniden çağrılıyor");
  check(d.durum.icerik!.mails[0].id === "d2", "yazılan, TAZE kutuya uygulanmış olan");
}
{
  /* Denemeler tükenirse SESSİZ BAŞARI yok — çağıran 500 dönebilsin. */
  const d = sahteDepo([]);
  let deneme = 0;
  const hepCakis: BoxIO = {
    ...d.io,
    async write() { deneme++; throw new Cakisma("hep çakışıyor"); },
  };
  let firlatti = false;
  try { await mutateBox(hepCakis, ekle(mail("x"))); } catch { firlatti = true; }
  check(firlatti, "denemeler tükenince hata fırlatılıyor");
  check(deneme === CAS_DENEME, `tam ${CAS_DENEME} kez denendi (${deneme})`);
}
{
  /* Çakışma OLMAYAN hata yeniden denenmiyor: aynı sonucu verir. */
  const d = sahteDepo([]);
  let deneme = 0;
  const bozuk: BoxIO = {
    ...d.io,
    async write() { deneme++; throw new Error("yetki yok"); },
  };
  let firlatti = false;
  try { await mutateBox(bozuk, ekle(mail("x"))); } catch { firlatti = true; }
  check(firlatti && deneme === 1, "çakışma olmayan hata tek denemede fırlatılıyor");
}

/* ── Değişiklik yoksa YAZILMIYOR ─────────────────────────────────────────── */
/*
 * Gereksiz sürüm üretmek yalnız israf değil: her yazma, aynı anda çalışan
 * başka bir yazana boşuna çakışma yaşatır.
 */
{
  const d = sahteDepo([mail("m1")]);
  const r = await mutateBox(d.io, () => ({ yaz: false, sonuc: "bulunamadı" }));
  check(r === "bulunamadı", "yazmayan değişiklik sonucu döndürüyor");
  check(d.durum.yazma === 0, "yaz:false iken dosyaya dokunulmuyor");
}
{
  const d = sahteDepo([mail("m1")]);
  const once = d.durum.icerik!.updatedAt;
  await mutateBox(d.io, ekle(mail("m2")));
  check(d.durum.icerik!.updatedAt !== once, "yazmada updatedAt tazeleniyor");
}

/* ── Bozuk dosya bütün kutuyu düşürmüyor ─────────────────────────────────── */
{
  check(normalizeBox(null).mails.length === 0, "null ham veri boş kutu");
  check(normalizeBox({ mails: "hayır" }).mails.length === 0, "dizi olmayan mails boş kutu");
  const k = normalizeBox({
    mails: [mail("iyi"), null, { id: 1 }, { id: "x", from: "a@b.co" }, mail("iyi2")],
    updatedAt: AN,
  });
  check(k.mails.length === 2, "tanınmayan kayıtlar düşüyor, tanınanlar kalıyor");
  const cok = normalizeBox({ mails: Array.from({ length: MAX_MAILS + 30 }, (_, i) => mail(`m${i}`)) });
  check(cok.mails.length === MAX_MAILS, "okumada da tavan uygulanıyor");
  check(bosKutu().mails.length === 0, "boş kutu boş");
}

console.log(`\n${ok}/${ok + fail} geçti${fail ? `, ${fail} başarısız` : " ✓"}`);
if (fail > 0) process.exit(1);
