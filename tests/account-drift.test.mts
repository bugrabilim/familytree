import { compareAccounts, hasAccountDrift, KARSILASTIRILAN } from "../lib/account-drift.ts";
import type { User } from "../types/user.ts";

let ok = 0, fail = 0;
const check = (cond: boolean, msg: string) => { if (cond) ok++; else { fail++; console.log(`✗ ${msg}`); } };

/**
 * KİMLİK KAYMASI karşılaştırması.
 *
 * Faz 4'ün kalan parçası okuma yolunu Postgres'e çeviriyor; ayna yanlışsa o
 * an hesabın KENDİSİ yanlış olur. Bu yüzden karşılaştırma alan düzeyinde:
 * eksiklik satır düzeyinde görünmüyor. `session_epoch` boş bir satır
 * "eksik" değil, "çağ yok" diye okunur ve şifre sıfırlamanın oturum düşürme
 * koruması sessizce ölür.
 */

const u = (over: Partial<User> = {}): User => ({
  id: "a1", familyName: "bilim", passwordHash: "$2b$12$x",
  recoveryCodeHash: "h", createdAt: "2026-08-06T13:52:47.606Z", ...over,
});

/* --- 1. Aynı satır temiz ---------------------------------------------- */
{
  const k = compareAccounts([u()], [u()]);
  check(k.length === 1 && k[0].ayrisan.length === 0, "birebir aynı satır temiz");
  check(hasAccountDrift(k) === false, "özet: kayma yok");
}

/* --- 2. Alan ayrışması yakalanıyor ------------------------------------ */
{
  const k = compareAccounts([u({ sessionEpoch: "2026-09-08T10:00:00.000Z" })], [u()]);
  check(k[0].ayrisan.includes("sessionEpoch"), "boş ayna alanı KAYMA sayılıyor");
  check(hasAccountDrift(k), "özet: kayma var");
}
{
  const k = compareAccounts([u({ passwordHash: "$2b$12$yeni" })], [u()]);
  check(k[0].ayrisan.includes("passwordHash"), "eski şifre özeti yakalanıyor");
}

/* --- 3. "Yok" biçimleri EŞİT sayılıyor -------------------------------- */
/*
 * Blob `undefined` kullanıyor (alan hiç yazılmamış), Postgres `null` (sütun
 * boş). İkisi AYNI ŞEYİ söylüyor; eşitlemeseydik her dolmamış alan sahte bir
 * kayma olurdu — ve sahte kayma, gerçek kaymayı gürültüde boğar.
 */
{
  const blob = u({ authEmail: undefined });
  const ayna = { ...u(), authEmail: null } as unknown as User;
  check(compareAccounts([blob], [ayna])[0].ayrisan.length === 0, "undefined ile null eşit");
}
{
  const blob = u({ notifyEmail: "" });
  const ayna = { ...u(), notifyEmail: null } as unknown as User;
  check(compareAccounts([blob], [ayna])[0].ayrisan.length === 0, "boş dize ile null eşit");
}

/* --- 4. Zaman damgaları BİÇİMDEN bağımsız ----------------------------- */
/*
 * Blob ISO-8601 saklıyor, Postgres `timestamptz`i `2026-09-08 11:11:00+00`
 * diye veriyor. Aynı an, farklı dize — ham karşılaştırma HER damgayı kayma
 * sayardı ve kapı hiç yeşile dönmezdi.
 */
{
  const blob = u({ createdAt: "2026-08-06T13:52:47.606Z" });
  const ayna = u({ createdAt: "2026-08-06 13:52:47.606+00" });
  check(compareAccounts([blob], [ayna])[0].ayrisan.length === 0, "aynı an, farklı biçim eşit");
}
{
  const blob = u({ createdAt: "2026-08-06T13:52:47.606Z" });
  const ayna = u({ createdAt: "2026-08-07T13:52:47.606Z" });
  check(compareAccounts([blob], [ayna])[0].ayrisan.includes("createdAt"), "gerçek zaman farkı yakalanıyor");
}
{
  // Ayrıştırılamayan damga sessizce "eşit" sayılmamalı.
  const blob = u({ sessionEpoch: "bozuk" });
  const ayna = u({ sessionEpoch: "2026-09-08T10:00:00.000Z" });
  check(compareAccounts([blob], [ayna])[0].ayrisan.includes("sessionEpoch"),
    "ayrıştırılamayan damga dizgeye düşüyor, yutulmuyor");
}

/* --- 5. Boolean alanlar ------------------------------------------------ */
{
  const blob = u({ authEmailVerified: true });
  const ayna = u({ authEmailVerified: false });
  check(compareAccounts([blob], [ayna])[0].ayrisan.includes("authEmailVerified"), "boolean farkı yakalanıyor");
}
{
  const blob = u({ notifyReminders: false });
  const ayna = { ...u(), notifyReminders: null } as unknown as User;
  // `false` ile "hiç ayarlanmamış" AYNI ŞEY DEĞİL: biri kullanıcının kapatma
  // kararı, öteki kararsızlık. Onay kaydında bu fark anlamlı.
  check(compareAccounts([blob], [ayna])[0].ayrisan.includes("notifyReminders"),
    "false ile boş ayırt ediliyor (onay kaydı)");
}

/* --- 6. Satır yokluğu, iki yönde de --------------------------------- */
{
  const k = compareAccounts([u()], []);
  check(k[0].aynadaVar === false, "aynada satır yok bildiriliyor");
  check(hasAccountDrift(k), "satır yokluğu kayma sayılıyor");
}
{
  /*
   * Aynada olup Blob'da OLMAYAN satır da bulgu: silinmiş bir kimliğin aynada
   * yaşaması, okuma Postgres'e döndüğünde onu GERİ DİRİLTİR. Demo satırında
   * tam olarak bu oldu.
   */
  const k = compareAccounts([], [u({ id: "hayalet" })]);
  check(k.length === 1 && k[0].accountId === "hayalet", "fazla ayna satırı raporlanıyor");
  check(hasAccountDrift(k), "fazla satır kayma sayılıyor");
}

/* --- 7. Kapsam: kimlik taşıyan her alan karşılaştırılıyor -------------- */
/*
 * Liste elle yazılmış; unutulan bir alan sessizce "hep temiz" görünürdü.
 * `User` tipini kaynak sayıp farkı burada gösteriyoruz.
 */
{
  const beklenen = [
    "familyName", "passwordHash", "recoveryCodeHash", "recoveryCodeIndex", "createdAt",
    "sessionEpoch", "deletedAt", "authEmail", "authEmailVerified",
    "emailTokenHash", "emailTokenExpires", "resetTokenHash", "resetTokenExpires",
    "notifyEmail", "notifyReminders", "notifyMemorials", "notifyNewsletter",
  ];
  for (const alan of beklenen)
    check(KARSILASTIRILAN.includes(alan as keyof User), `karşılaştırılıyor: ${alan}`);
  check(!KARSILASTIRILAN.includes("id"), "kimliğin kendisi karşılaştırılmıyor (eşleşme anahtarı)");
}

console.log(`\n${ok}/${ok + fail} geçti${fail ? `, ${fail} başarısız` : " ✓"}`);
if (fail) process.exit(1);
