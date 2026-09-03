import {
  canDo,
  CLAIM_MESSAGES,
  GUEST_DENIED,
  guestCan,
  isGuestAccount,
  planClaim,
  type GuestAction,
} from "../lib/guest.ts";

let ok = 0, fail = 0;
function check(cond: boolean, msg: string) { if (cond) ok++; else { fail++; console.log(`✗ ${msg}`); } }

/* ── Tanıma ──────────────────────────────────────────────────────────────── */
check(isGuestAccount({ guest: true }), "misafir tanınıyor");
check(!isGuestAccount({ guest: false }), "gerçek hesap misafir değil");
check(!isGuestAccount({}), "bayrak yoksa misafir değil");
check(!isGuestAccount(null), "null misafir değil");
check(!isGuestAccount(undefined), "undefined misafir değil");

/* ── ASIL KURAL: ölçülen her şey kapalı ──────────────────────────────────── */
/*
 * Misafir hesabı sınırsız üretilebiliyor ve bu depodaki sınırlar HESAP
 * BAŞINA. AI ya da yükleme misafire açık olsaydı, saldırgan her çağrı için
 * yeni bir hesap açıp kotayı tümüyle anlamsızlaştırırdı. Bu iki satır
 * listenin en önemli kısmı.
 */
check(!guestCan("ai"), "AI misafire KAPALI (kota hesap başına)");
check(!guestCan("upload"), "yükleme misafire KAPALI (maliyet hesap başına)");

/* ── Kendi ağacının dışına uzananlar kapalı ──────────────────────────────── */
for (const a of ["invite", "share", "pair", "gathering", "email"] as GuestAction[]) {
  check(!guestCan(a), `${a} misafire kapalı`);
}
/*
 * EK AĞAÇ açmak da kapalı ve gerekçesi 1. maddenin aynısı: her ağaç yeni bir
 * blob + Postgres satırı, yani misafirin çarpanı geri gelir. Kendi ağacını
 * yeniden adlandırmak/silmek kapsam dışı — o kendi ağacının içi.
 */
check(!guestCan("tree"), "ek ağaç açma misafire kapalı");

/* ── Kendi ağacında kalanlar açık ────────────────────────────────────────── */
for (const a of ["edit", "read", "export"] as GuestAction[]) {
  check(guestCan(a), `${a} misafire açık — denemenin anlamı burada`);
}

/* ── Gerçek hesaba hiçbir kısıt yok ──────────────────────────────────────── */
for (const a of ["ai", "upload", "invite", "share", "pair", "gathering", "email", "tree", "edit"] as GuestAction[]) {
  check(canDo(false, a), `gerçek hesapta ${a} açık`);
  check(canDo(true, a) === guestCan(a), `misafirde ${a} listeye uyuyor`);
}

/* ── Liste eksiksiz sayılmış ─────────────────────────────────────────────── */
{
  /*
   * Her eylem ya kapalı listede ya da bilerek açık. Yeni bir yüzey eklenince
   * karar vermek zorunda kalınsın diye burada tek tek sayılıyor.
   */
  const hepsi: GuestAction[] = ["ai", "upload", "invite", "share", "pair", "gathering", "email", "tree", "edit", "read", "export"];
  const acik = hepsi.filter((a) => !GUEST_DENIED.has(a));
  check(GUEST_DENIED.size === 8, `kapalı eylem sayısı 8 (${GUEST_DENIED.size})`);
  check(acik.join(",") === "edit,read,export", `açık olanlar tam olarak edit/read/export (${acik.join(",")})`);
}

/* ── Sahiplenme ──────────────────────────────────────────────────────────── */
const misafir = { guest: true };
const bos = () => false;

{
  const r = planClaim(misafir, { familyName: "  Yılmaz  ", password: "gizli123" }, bos);
  check(r.ok && r.plan.familyName === "Yılmaz", "geçerli sahiplenme, ad kırpılıyor");
}
{
  const r = planClaim({ guest: false }, { familyName: "Yılmaz", password: "gizli123" }, bos);
  check(!r.ok && r.error === "misafir-degil", "gerçek hesap yeniden sahiplenilemez");
}
/*
 * Kurallar KAYIT rotasıyla aynı: sahiplenme "arka kapıdan kayıt" olduğu için
 * ondan gevşek olamaz. Gevşek olsaydı, kayıt kurallarını atlamak için önce
 * misafir açıp sonra sahiplenmek yeterdi.
 */
{
  const r = planClaim(misafir, { familyName: "A", password: "gizli123" }, bos);
  check(!r.ok && r.error === "ad-kisa", "ad en az 2 karakter (kayıtla aynı)");
}
{
  const r = planClaim(misafir, { familyName: " ", password: "gizli123" }, bos);
  check(!r.ok && r.error === "ad-kisa", "boşluk ad sayılmıyor");
}
{
  const r = planClaim(misafir, { familyName: "Yılmaz", password: "kisa" }, bos);
  check(!r.ok && r.error === "sifre-kisa", "şifre en az 6 karakter (kayıtla aynı)");
}
{
  const r = planClaim(misafir, { familyName: "Yılmaz", password: "gizli123" }, (n) => n === "Yılmaz");
  check(!r.ok && r.error === "ad-dolu", "ad benzersizliği zorlanıyor");
}
{
  const r = planClaim(misafir, { familyName: 42, password: null }, bos);
  check(!r.ok && r.error === "ad-kisa", "tür karışıklığı çökmüyor");
}
for (const k of Object.keys(CLAIM_MESSAGES)) {
  check(CLAIM_MESSAGES[k as keyof typeof CLAIM_MESSAGES].length > 10, `${k} için mesaj yazılmış`);
}

console.log(`\n${ok}/${ok + fail} geçti${fail ? `, ${fail} başarısız` : " ✓"}`);
if (fail > 0) process.exit(1);
