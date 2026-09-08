import { exportGedcom } from "../lib/gedcom.ts";
import type { Person } from "../types/family.ts";

let ok = 0, fail = 0;
const check = (cond: boolean, msg: string) => { if (cond) ok++; else { fail++; console.log(`✗ ${msg}`); } };

/**
 * GEDCOM dışa aktarımında KAYBOLAN alanlar.
 *
 * Test ÇALIŞTIRILARAK yazıldı, kaynağa bakarak değil — ve bu fark bir hata
 * yakaladı: sesli anıları medya listesine anı döngüsünde ekliyordum, oysa
 * `OBJE` satırları o noktadan çok önce yazılıyor. Kaynağa bakan bir kapı
 * "ses ekleniyor" derdi; üretilen dosyada ses YOKTU.
 *
 * Eksiklerin ortak yanı sessizlik: dışa aktarım başarıyla bitiyor, dosya
 * geçerli, ve kullanıcı ağacını başka bir programa taşıyana kadar hiçbir şey
 * söylemiyor.
 */

const kisi = (over: Partial<Person> = {}): Person => ({
  id: "p1", firstName: "Mehmed", lastName: "", gender: "male",
  parentIds: [], spouseIds: [], ...over,
});

for (const v7 of [false, true]) {
  const s = v7 ? "7.0" : "5.5.1";
  const cikti = exportGedcom([kisi({
    code: "SOY-1927",
    nickname: "Kara Mehmed",
    patronymic: "Şaban",
    birthDate: "1910",
    birthPlace: "Sivas",
    birthCoords: { lat: 39.75, lng: 37.02 },
    burialPlace: "Sivas Mezarlığı",
    burialCoords: { lat: -12.5, lng: -70.25 },
    religion: "İslam",
    nationality: "Türkiye",
    photos: ["https://ornek/foto.jpg"],
    videos: ["https://ornek/roportaj.mp4"],
    documents: ["https://ornek/nufus.pdf"],
    sources: [{ id: "s1", title: "1927 Nüfus Sayımı", kind: "kayit", url: "https://ornek/kaynak" }],
    memories: [{ id: "m1", prompt: "En eski anın?", text: "Bahçedeki dut ağacı", audio: "https://ornek/ses.mp3" }],
  })], { version: v7 ? "7.0" : "5.5.1" } as never);

  /* --- Ad: bu uygulamanın çekirdek durumu --------------------------- */
  /*
   * 1934 öncesi kuşakta soyadı YOK. Yalnız `1 NAME Mehmed //` yazıldığında
   * kişi başka bir programda kimliksiz kalıyordu.
   */
  check(cikti.includes("2 NICK Kara Mehmed"), `${s}: lakap NICK olarak yazılıyor`);
  check(/_PATRONYM Şaban/.test(cikti), `${s}: baba adı taşınıyor (standart etiketi yok)`);

  /* --- Medya: tablo bekliyordu, döngü göndermiyordu ------------------ */
  check(cikti.includes("roportaj.mp4"), `${s}: VİDEO dışa aktarılıyor`);
  check(cikti.includes("nufus.pdf"), `${s}: BELGE dışa aktarılıyor`);
  check(cikti.includes("ses.mp3"), `${s}: sesli anı dışa aktarılıyor`);
  check(cikti.includes("foto.jpg"), `${s}: fotoğraf (eskiden beri) duruyor`);

  /* --- Kaynaklar: genealojide en değerli veri ----------------------- */
  check(/0 @S0001@ SOUR/.test(cikti), `${s}: üst düzey kaynak kaydı var`);
  check(cikti.includes("1 TITL 1927 Nüfus Sayımı"), `${s}: kaynak başlığı yazılıyor`);
  check(/1 SOUR @S0001@/.test(cikti), `${s}: kişi kaynağa ATIF veriyor`);

  /* --- Mezar, din, uyruk, referans --------------------------------- */
  check(cikti.includes("1 BURI"), `${s}: mezar olayı yazılıyor`);
  check(cikti.includes("2 PLAC Sivas Mezarlığı"), `${s}: mezar yeri yazılıyor`);
  check(cikti.includes("1 RELI İslam"), `${s}: din yazılıyor`);
  check(cikti.includes("1 NATI Türkiye"), `${s}: uyruk yazılıyor`);
  check(cikti.includes("1 REFN SOY-1927"), `${s}: kalıcı kimlik REFN olarak yazılıyor`);

  /* --- Koordinat: işaret HARFLE ------------------------------------- */
  /*
   * Eksi işaretli ondalık yaygın bir hata; okuyucuların çoğu onu sessizce
   * atıyor, yani koordinat "gönderilmiş" görünüp hiçbir yerde belirmiyor.
   */
  check(/4 LATI N39\.750000/.test(cikti), `${s}: kuzey enlem N ile`);
  check(/4 LONG E37\.020000/.test(cikti), `${s}: doğu boylam E ile`);
  check(/4 LATI S12\.500000/.test(cikti), `${s}: güney enlem S ile (eksi değil)`);
  check(/4 LONG W70\.250000/.test(cikti), `${s}: batı boylam W ile (eksi değil)`);
  check(!/LATI -/.test(cikti) && !/LONG -/.test(cikti), `${s}: eksi işaretli koordinat YOK`);

  /* --- Anı metni ---------------------------------------------------- */
  check(/1 NOTE En eski anın\? — Bahçedeki dut ağacı/.test(cikti), `${s}: anı metni NOTE olarak`);
}

/* --- Aynı kaynağı gösteren iki kişi TEK kayıt paylaşıyor ------------- */
/*
 * Kaynağın kendi `id`si kişiye özel; anahtar olsaydı on kişinin atfettiği
 * tek nüfus sayımı dosyada on ayrı kaynak olurdu.
 */
{
  const k = { title: "1927 Nüfus Sayımı", kind: "kayit" };
  const cikti = exportGedcom([
    kisi({ id: "a", firstName: "A", sources: [{ id: "s1", ...k }] }),
    kisi({ id: "b", firstName: "B", sources: [{ id: "s2", ...k }] }),
  ], {} as never);
  const kayitlar = (cikti.match(/^0 @S\d+@ SOUR$/gm) ?? []).length;
  check(kayitlar === 1, `aynı kaynak tek kayıt (${kayitlar} bulundu)`);
  const atiflar = (cikti.match(/^1 SOUR @S0001@$/gm) ?? []).length;
  check(atiflar === 2, `iki kişi de aynı kayda atıf veriyor (${atiflar})`);
}

/* --- Boş alanlar satır ÜRETMİYOR ------------------------------------- */
{
  const cikti = exportGedcom([kisi()], {} as never);
  for (const etiket of ["1 BURI", "1 RELI", "1 NATI", "1 REFN", "2 NICK", "_PATRONYM", "SOUR @S"]) {
    check(!cikti.includes(etiket), `boş alan için ${etiket} yazılmıyor`);
  }
}

console.log(`\n${ok}/${ok + fail} geçti${fail ? `, ${fail} başarısız` : " ✓"}`);
if (fail) process.exit(1);
