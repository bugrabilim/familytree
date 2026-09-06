import {
  confirmMatches,
  daysLeft,
  GRACE_DAYS,
  graceInfo,
  isPurgeDue,
  isSoftDeleted,
  purgeAt,
} from "../lib/retention.ts";
import {
  accountBlobPaths,
  ACCOUNT_BLOB_PREFIXES,
  failedPaths,
  TREE_BLOB_PREFIXES,
  treeBlobPaths,
} from "../lib/tree-storage.ts";

let ok = 0, fail = 0;
const check = (ad: string, kosul: boolean, detay = "") =>
  kosul ? ok++ : (fail++, console.log(`✗ ${ad} ${detay}`));

/**
 * Silme bekleme süresinin ve depolama envanterinin SAF kuralları.
 *
 * `GRACE_DAYS` sabiti buradan okunuyor, hiçbir yere 30 yazılmıyor: süre
 * değişince testin de değişmesi gerekseydi, o değişiklik sırasında asıl
 * kural (bekle-sonra-sil) gözden kaçardı.
 */

const GUN = 86_400_000;
const T0 = Date.parse("2026-01-01T00:00:00.000Z");
const damga = new Date(T0).toISOString();

/* ── Damga var mı yok mu ─────────────────────────────────────────────────── */
check("damgasız kayıt canlı", !isSoftDeleted({}));
check("boş nesne/null canlı", !isSoftDeleted(null) && !isSoftDeleted(undefined));
check("damgalı kayıt silinmiş", isSoftDeleted({ deletedAt: damga }));
// Bozuk damga da SİLİNMİŞ sayılır: gizlemenin güvenli yönü budur.
check("bozuk damga da silinmiş sayılır", isSoftDeleted({ deletedAt: "abc" }));

/* ── Kalıcı silme anı ────────────────────────────────────────────────────── */
check(
  "kalıcı silme GRACE_DAYS gün sonra",
  purgeAt(damga) === new Date(T0 + GRACE_DAYS * GUN).toISOString()
);
check("bozuk damgada silme anı hesaplanamaz", purgeAt("abc") === "");

/* ── Sıra geldi mi ───────────────────────────────────────────────────────── */
check("ilk gün sırası gelmemiş", !isPurgeDue(damga, T0));
check("son günden bir gün önce gelmemiş", !isPurgeDue(damga, T0 + (GRACE_DAYS - 1) * GUN));
check("bir saniye önce hâlâ gelmemiş", !isPurgeDue(damga, T0 + GRACE_DAYS * GUN - 1000));
check("tam süre dolunca geldi", isPurgeDue(damga, T0 + GRACE_DAYS * GUN));
check("sonrasında da geldi", isPurgeDue(damga, T0 + (GRACE_DAYS + 5) * GUN));
/*
 * BOZUK DAMGA ASLA SİLİNMEZ. Burada güvenli yön gizlemenin TERSİ: ne zaman
 * silindiğini bilmiyorsak veriyi yok etmek, belki de daha ilk gün silmek
 * olurdu. Kalıcı silme geri alınamaz.
 */
check("bozuk damgada kalıcı silme YOK", !isPurgeDue("abc", T0 + 999 * GUN));
check("boş damgada kalıcı silme YOK", !isPurgeDue("", T0 + 999 * GUN));

/* ── Kalan gün ───────────────────────────────────────────────────────────── */
check("silme anında tam süre kalır", daysLeft(damga, T0) === GRACE_DAYS);
check("bir gün sonra bir gün eksilir", daysLeft(damga, T0 + GUN) === GRACE_DAYS - 1);
// Yukarı yuvarlama: yarım gün kalan kullanıcıya "1 gün" denir, "0" değil —
// 0, "artık geri alamazsın" diye okunur ve yanlış olur.
check("yarım gün kalınca 1 gösterilir", daysLeft(damga, T0 + (GRACE_DAYS - 0.5) * GUN) === 1);
check("süre dolunca 0", daysLeft(damga, T0 + GRACE_DAYS * GUN) === 0);
check("süre aşılınca eksiye düşmez", daysLeft(damga, T0 + (GRACE_DAYS + 10) * GUN) === 0);

const bilgi = graceInfo(damga, T0 + 3 * GUN);
check("graceInfo üçlüsü tutarlı", bilgi.deletedAt === damga && bilgi.purgeAt === purgeAt(damga));
check("graceInfo kalan günü taşır", bilgi.daysLeft === GRACE_DAYS - 3);

/* ── Onay metni ──────────────────────────────────────────────────────────── */
check("birebir ad kabul", confirmMatches("Demirtaş", "Demirtaş"));
check("baştaki/sondaki boşluk yok sayılır", confirmMatches("  Demirtaş \n", "Demirtaş"));
check("yanlış ad reddedilir", !confirmMatches("Demirtas", "Demirtaş"));
// Büyük/küçük harf GEVŞETİLMİYOR: Türkçe'de "İ"/"ı" dönüşümü güvenilmez ve
// onay metninin işi zaten kullanıcıyı bir an durdurmak.
check("küçük harf hâli reddedilir", !confirmMatches("demirtaş", "Demirtaş"));
check("boş onay reddedilir", !confirmMatches("", "Demirtaş"));
check("dize olmayan onay reddedilir", !confirmMatches(undefined, "Demirtaş"));
check("boş aile adında her şey reddedilir", !confirmMatches("", ""));

/* ── Depolama envanteri ──────────────────────────────────────────────────── */
const yollar = treeBlobPaths("t-1");
check("her önek için bir yol", yollar.length === TREE_BLOB_PREFIXES.length);
check("yollar `<önek>-<treeId>.json`", yollar.every((p) => p.endsWith("-t-1.json")));
check("kişi verisi envanterde", yollar.includes("family-data-t-1.json"));
check("erişim kaydı envanterde", yollar.includes("tree-access-t-1.json"));
/*
 * Bu dosyanın var oluş sebebi: silme uzun süre YALNIZ bu ikisini siliyordu.
 * Ailenin kendi yazdığı içeriğin envanterde olduğunu tek tek iddia ediyoruz.
 */
for (const yan of ["recipes", "letters", "obituaries", "gatherings", "bonds", "stories", "proposals", "family-history"])
  check(`${yan} envanterde`, yollar.includes(`${yan}-t-1.json`));
check("aynı yol iki kez yok", new Set(yollar).size === yollar.length);
// Asıl veri EN SON siliniyor: yarım kalan silmede elde kalması gereken şey o.
check("family-data listenin sonunda", yollar[yollar.length - 1] === "family-data-t-1.json");
check("boş kimlikte yol üretilmez", treeBlobPaths("").length === 0 && treeBlobPaths("   ").length === 0);

const hesapYollari = accountBlobPaths("acc-1");
check("hesap kaydı ayrı envanterde", hesapYollari.includes("account-trees-acc-1.json"));
check("hesap öneki sayısı", hesapYollari.length === ACCOUNT_BLOB_PREFIXES.length);
/*
 * Ağaç silme hesabın ağaç KAYDINA dokunmamalı: kayıt hesabın kendisine ait ve
 * içinde başka ağaçlar da var. Bir gün "account-trees" ağaç envanterine
 * karışırsa, tek bir ağacın silinmesi öteki ağaçların listesini yok ederdi.
 */
check(
  "ağaç envanteri hesap kaydını KAPSAMAZ",
  !treeBlobPaths("acc-1").includes("account-trees-acc-1.json")
);

/* ── Silinemeyen yolların raporu ─────────────────────────────────────────── */
const p3 = ["a.json", "b.json", "c.json"];
const hepsiTamam: PromiseSettledResult<unknown>[] = p3.map(() => ({ status: "fulfilled", value: 1 }));
check("hepsi silindiyse liste boş", failedPaths(p3, hepsiTamam).length === 0);

const ortaHata: PromiseSettledResult<unknown>[] = [
  { status: "fulfilled", value: 1 },
  { status: "rejected", reason: new Error("olmadı") },
  { status: "fulfilled", value: 1 },
];
check("yalnız başarısız olan raporlanır", failedPaths(p3, ortaHata).join() === "b.json");
/*
 * Sonuç dizisi eksikse geri kalan yollar da BAŞARISIZ sayılıyor.
 * "Bilmiyorum"u "silindi" diye raporlamak, kullanıcıya silinmemiş bir şeyi
 * silinmiş göstermek olurdu — bu dosyadaki bütün kuralların tersi.
 */
check("eksik sonuçta kalanlar başarısız sayılır", failedPaths(p3, [ortaHata[0]]).join() === "b.json,c.json");
check("hiç sonuç yoksa hepsi başarısız", failedPaths(p3, []).length === 3);

console.log(`\n${ok}/${ok + fail} geçti${fail ? `, ${fail} başarısız` : " ✓"}`);
if (fail > 0) process.exit(1);
