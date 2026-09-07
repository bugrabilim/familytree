import { CAKISMA_DENEME, mutateStore, type DamgaliKutu } from "../lib/store-mutate.ts";

let ok = 0, fail = 0;
function check(cond: boolean, msg: string) { if (cond) ok++; else { fail++; console.log(`✗ ${msg}`); } }

/**
 * KAYIP YAZMA KORUMASI (denetim A10).
 *
 * Gerçek bir blob deposuna karşı sınanamayacak tek şey tam olarak bu:
 * ARADA BAŞKASININ YAZMASI. Bu yüzden G/Ç sahte ve zamanlama testin
 * elinde — `oku` çağrıları arasında dışarıdan damga değiştirilebiliyor.
 */

interface Kutu extends DamgaliKutu { items: string[] }

/** Sahte depo: okuma sayısını sayıyor ve dışarıdan değiştirilebiliyor. */
function depo(baslangic: Kutu) {
  const durum = { kutu: structuredClone(baslangic), okuma: 0, yazma: 0 };
  return {
    durum,
    oku: async () => { durum.okuma++; return structuredClone(durum.kutu); },
    yaz: async (k: Kutu) => { durum.yazma++; durum.kutu = { ...structuredClone(k), updatedAt: `y${durum.yazma}` }; },
  };
}

/* ── Çakışma yokken tek turda yazıyor ────────────────────────────────────── */
{
  const d = depo({ items: ["a"], updatedAt: "t0" });
  const r = await mutateStore<Kutu, number>(d.oku, d.yaz, (k) => {
    k.items.push("b");
    return { yaz: true, sonuc: k.items.length };
  }, "test");
  check(r === 2, "sonuç çağırana dönüyor");
  check(d.durum.kutu.items.join(",") === "a,b", "değişiklik yazıldı");
  check(d.durum.yazma === 1, "tek yazma");
  /* İki okuma: biri değiştirmek için, biri yazmadan hemen önce doğrulamak için. */
  check(d.durum.okuma === 2, `yazmadan önce yeniden okundu (${d.durum.okuma})`);
}

/* ── ASIL KURAL: araya giren yazma kaybolmuyor ──────────────────────────── */
{
  /*
   * İki kişi aynı anda ekliyor. Birinci `oku` ile ikinci `oku` arasında
   * başkası yazıyor: koruma olmasaydı onun eklediği silinirdi.
   */
  const d = depo({ items: ["a"], updatedAt: "t0" });
  let ilk = true;
  const okuAraliyla = async () => {
    const k = await d.oku();
    if (ilk && d.durum.okuma === 2) {
      /* Doğrulama okumasından SONRA, ama yazmadan ÖNCE araya biri girdi. */
      ilk = false;
      d.durum.kutu = { items: ["a", "baskasi"], updatedAt: "t-baska" };
      return { items: ["a", "baskasi"], updatedAt: "t-baska" };
    }
    return k;
  };
  const r = await mutateStore<Kutu, string[]>(okuAraliyla, d.yaz, (k) => {
    k.items.push("benim");
    return { yaz: true, sonuc: k.items };
  }, "test");
  check(d.durum.kutu.items.includes("baskasi"), "ARADA GİREN yazma korunuyor");
  check(d.durum.kutu.items.includes("benim"), "kendi değişikliğim de yazıldı");
  check(r.includes("baskasi"), "sonuç, baştan alınan turdan geliyor");
  check(d.durum.yazma === 1, "yalnız bir kez yazıldı (ikinci tur temiz geçti)");
}

/* ── Yazma yoksa çakışma denetimi de yok ─────────────────────────────────── */
{
  const d = depo({ items: [], updatedAt: "t0" });
  const r = await mutateStore<Kutu, boolean>(d.oku, d.yaz, () => ({ yaz: false, sonuc: false }), "test");
  check(r === false, "sonuç dönüyor");
  check(d.durum.yazma === 0, "hiç yazılmadı");
  /*
   * TEK okuma: "bulunamadı" gibi sonuçlar için ikinci bir doğrulama okuması
   * yapmak, hiçbir şey yazmayan bir işlemi ağ trafiğine çevirirdi.
   */
  check(d.durum.okuma === 1, `tek okuma (${d.durum.okuma})`);
}

/* ── Denemeler tükenince SESSİZCE BAŞARILI DÖNMÜYOR ─────────────────────── */
{
  /*
   * Sürekli çakışma. `true` ya da boş bir sonuç dönmek, tam olarak önlemeye
   * çalıştığımız arızayı üretirdi: kullanıcı yazdığını sanır, yazılmamıştır.
   */
  let n = 0;
  const oku = async () => ({ items: [], updatedAt: `hep-degisiyor-${n++}` }) as Kutu;
  const yaz = async () => { throw new Error("buraya HİÇ gelinmemeli"); };
  let hata: Error | null = null;
  try {
    await mutateStore<Kutu, boolean>(oku, yaz, (k) => { k.items.push("x"); return { yaz: true, sonuc: true }; }, "tarif");
  } catch (e) { hata = e as Error; }
  check(!!hata, "denemeler tükenince FIRLATIYOR");
  check(!!hata && hata.message.includes("tarif"), "hata mesajı hangi depo olduğunu söylüyor");
  check(!!hata && /tekrar dene/.test(hata.message), "mesaj eyleme dönük");
  /* Her tur iki okuma yapıyor. */
  check(n === CAKISMA_DENEME * 2, `deneme sayısı sınırlı (${n / 2} tur)`);
}

/* ── Deneme sayısı çağıranca ayarlanabiliyor (test için) ─────────────────── */
{
  let n = 0;
  const oku = async () => ({ items: [], updatedAt: `d${n++}` }) as Kutu;
  const yaz = async () => {};
  let hata = false;
  try {
    await mutateStore<Kutu, boolean>(oku, yaz, (k) => { k.items.push("x"); return { yaz: true, sonuc: true }; }, "x", 1);
  } catch { hata = true; }
  check(hata && n === 2, "tek deneme istendiğinde tek tur koşuyor");
}

/* ── Değiştirici ASENKRON olabiliyor ────────────────────────────────────── */
/*
 * Erişim kaydı (`lib/members.ts`) karar verirken `await` istiyor: davet
 * kabulünde şifre çakışması `bcrypt.compare` ile denetleniyor. Senkron
 * zorunluluğu o depoyu korumanın DIŞINDA bırakırdı.
 *
 * Asenkron gövde pencereyi genişletmiyor: doğrulama okuması gövdeden SONRA,
 * yazmadan hemen önce yapılıyor. Aşağıdaki senaryo tam da bunu sınıyor —
 * gövde beklerken araya biri giriyor ve yine de kimse kaybolmuyor.
 */
{
  const d = depo({ items: ["a"], updatedAt: "t0" });
  let girdi = false;
  const r = await mutateStore<Kutu, number>(d.oku, d.yaz, async (k) => {
    /* Gövde "yavaş": bu sırada başkası yazıyor. */
    await new Promise((res) => setTimeout(res, 0));
    if (!girdi) {
      girdi = true;
      d.durum.kutu = { items: ["a", "baskasi"], updatedAt: "t-baska" };
    }
    k.items.push("benim");
    return { yaz: true, sonuc: k.items.length };
  }, "test");
  check(typeof r === "number", "asenkron gövdenin sonucu dönüyor");
  check(d.durum.kutu.items.includes("baskasi"), "yavaş gövde sırasında giren yazma korunuyor");
  check(d.durum.kutu.items.includes("benim"), "kendi değişikliğim de yazıldı");
}

console.log(`\n${ok}/${ok + fail} geçti${fail ? `, ${fail} başarısız` : " ✓"}`);
if (fail > 0) process.exit(1);
