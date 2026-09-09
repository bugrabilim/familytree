import { readFileSync } from "node:fs";

let ok = 0, fail = 0;
const check = (cond: boolean, msg: string) => { if (cond) ok++; else { fail++; console.log(`✗ ${msg}`); } };
const read = (rel: string) => readFileSync(new URL(rel, import.meta.url), "utf8");
const kodu = (src: string) => src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

const src = kodu(read("../lib/users.ts"));

/**
 * KAPI: kimlik OKUMALARI aynadan, YAZMA yolu Blob'da.
 *
 * Faz 4 / 2b-2. İkisini birlikte çevirmek, kayıp yazma korumasının
 * dayanağını da değiştirmek olurdu: `mutateUsers` Blob'un kendi damgasına
 * bakıyor. Okuma ile yazmanın ayrı adımlar olması bilerek.
 */

/* --- 1. Okuyucular aynadan besleniyor -------------------------------- */
{
  const OKUYUCULAR = [
    "findUserById", "findUserByFamilyName", "findUserByRecoveryIndex",
    "deletedAccountIds", "sessionEpochOf",
  ];
  for (const ad of OKUYUCULAR) {
    const i = src.indexOf(`function ${ad}(`);
    const govde = src.slice(i, src.indexOf("\n}\n", i) + 3);
    check(i > -1, `${ad} bulundu`);
    check(govde.includes("kimlikSatirlari()"), `${ad}: ayna öncelikli okuyucuyu kullanıyor`);
    check(!/await getUsersData\(\)/.test(govde), `${ad}: doğrudan Blob okumuyor`);
  }
}

/* --- 2. Yazma yolu Blob'da KALIYOR ----------------------------------- */
/*
 * `mutateUsers` Blob'u oku-değiştir-yaz yapıyor ve çakışma denetimi Blob'un
 * `updatedAt` damgasına dayanıyor. Aynaya çevrilseydi kilit dayanaksız
 * kalırdı.
 */
{
  const i = src.indexOf("function mutateUsers<");
  const govde = src.slice(i, src.indexOf("\n}\n", i) + 3);
  check(/mutateStore\(getUsersData, saveUsersData,/.test(govde),
    "yazma yolu hâlâ Blob'u oku-değiştir-yaz yapıyor");
}

/* --- 3. Geri düşüş: boş ayna "hesap yok" DEĞİL ----------------------- */
/*
 * Boş bir ayna "hiç hesap yok" diye okunsaydı her giriş "böyle bir ağaç yok"
 * derdi. Depodaki "boş liste temiz sayılmaz" kuralının aynısı.
 */
{
  const i = src.indexOf("async function kimlikSatirlari");
  const govde = src.slice(i, src.indexOf("\n}\n", i) + 3);
  check(i > -1, "ayna öncelikli okuyucu var");
  check(/rows\.length > 0/.test(govde), "boş ayna kabul edilmiyor");
  check(/rows\.every\(\(u\) => u\.passwordHash\)/.test(govde),
    "şifre özeti boş satır güvenilmez sayılıyor");
  check(/catch/.test(govde), "ayna okunamazsa Blob'a düşülüyor");
  check(/return \(await getUsersData\(\)\)\.users;/.test(govde), "geri düşüş Blob");
  {
    // Sıra: önce ayna denenmeli, geri düşüş SONRA.
    const ayna = govde.indexOf("dbGetAccountRows()");
    const blob = govde.indexOf("getUsersData()");
    check(ayna > -1 && blob > ayna, "ayna önce, Blob sonra");
  }
}

/* --- 4. Acil durum anahtarı ------------------------------------------ */
/*
 * Varsayılan YENİ davranış: kapatılmayan bir bayrak koruma değil süstür
 * (`AUTH_BCRYPT_FALLBACK` ile aynı kalıp). Anahtar okumayı Blob'a geri alır.
 */
{
  const i = src.indexOf("function blobKimlikZorlandiMi");
  const govde = src.slice(i, src.indexOf("\n}\n", i) + 3);
  check(i > -1, "acil durum anahtarı var");
  check(/IDENTITY_READ_BLOB/.test(govde), "anahtar adı IDENTITY_READ_BLOB");
  const k = src.indexOf("async function kimlikSatirlari");
  const kg = src.slice(k, src.indexOf("\n}\n", k) + 3);
  check(/if \(!blobKimlikZorlandiMi\(\)\)/.test(kg), "anahtar açıkken ayna HİÇ denenmiyor");
}

console.log(`\n${ok}/${ok + fail} geçti${fail ? `, ${fail} başarısız` : " ✓"}`);
if (fail) process.exit(1);
