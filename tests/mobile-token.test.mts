/*
 * Test sırrı: `lib/mobile-token.ts` artık `AUTH_SECRET` yokken FIRLATIYOR
 * (eskiden depoda yazılı bir sabite düşüyordu). Test kendi sırrını kurar;
 * yokluk hâli aşağıda ayrıca sınanıyor.
 */
process.env.AUTH_SECRET = "test-secret-yalnizca-testte";

import { isMobileTokenConfigured, signMobileToken, verifyMobileToken } from "../lib/mobile-token.ts";

let ok = 0, fail = 0;
const check = (n: string, c: boolean) => { if (c) ok++; else { fail++; console.log(`✗ ${n}`); } };

const token = await signMobileToken({ sub: "acc-123", name: "Yılmaz", role: "yonetici", isFounder: true, treeName: "Yılmaz" });
check("jeton üretildi (jwt biçimi)", typeof token === "string" && token.split(".").length === 3);

const claims = await verifyMobileToken(token);
check("doğrulama başarılı", claims !== null);
check("sub korunur", claims?.sub === "acc-123");
check("role korunur", claims?.role === "yonetici");
check("isFounder korunur", claims?.isFounder === true);
check("treeName korunur", claims?.treeName === "Yılmaz");

check("bozuk jeton → null", (await verifyMobileToken("not.a.jwt")) === null);
check("boş jeton → null", (await verifyMobileToken("")) === null);
check("kurcalanmış jeton → null", (await verifyMobileToken(token.slice(0, -3) + "xyz")) === null);

/* --- memberId: telefondan yapılan düzenleme de yazarını taşımalı ------- */
/*
 * `sub` "hangi ağaç" sorusunun yanıtı ve bir ağaçtaki HERKES için aynı.
 * Yazar kimliği ayrı taşınmazsa telefondan yapılan her düzenleme katkı
 * akışında "biri" kalırdı — web tarafında tam olarak bu oluyordu.
 */
{
  const jeton = await signMobileToken({
    sub: "agac-1", name: "Ayşe", role: "uye", isFounder: false,
    treeName: "Demir", memberId: "uye-42",
  });
  const c = await verifyMobileToken(jeton);
  check("üye kimliği jetonda gidip geliyor", c?.memberId === "uye-42");
  check("ağaç kimliği ayrı duruyor", c?.sub === "agac-1");
  check("iki kimlik birbirine karışmıyor", c?.memberId !== c?.sub);
}
{
  // Kurucuda üye kimliği yok; alan eksik olduğunda çözüm patlamamalı.
  const jeton = await signMobileToken({ sub: "agac-1", role: "yonetici", isFounder: true });
  const c = await verifyMobileToken(jeton);
  check("üye kimliksiz jeton geçerli", c !== null);
  check("kurucuda üye kimliği yok", c?.memberId === undefined);
}

/* --- SIR YOKKEN KAPALI DÜŞÜYOR ---------------------------------------- */
/*
 * Asıl kural. Eskiden `AUTH_SECRET` tanımsızken depoda YAZILI bir sabite
 * düşülüyordu; o sabiti bilen herkes istediği `sub` için geçerli bir Bearer
 * jetonu imzalayabilirdi — `proxy.ts` Bearer taşıyan isteği giriş duvarından
 * geçirdiği ve `resolveActiveTree` jetondaki `sub`u hesap kimliği saydığı
 * için kiracı yalıtımının tamamı o tek değişkenin varlığına bağlıydı.
 */
const yedek = process.env.AUTH_SECRET;
check("sır varken yapılandırılmış sayılıyor", isMobileTokenConfigured());
delete process.env.AUTH_SECRET;
check("sır yokken yapılandırılmamış", !isMobileTokenConfigured());

let firladi = false;
try {
  await signMobileToken({ sub: "x", role: "yonetici", isFounder: true });
} catch {
  firladi = true;
}
check("sır yokken jeton İMZALANMIYOR", firladi);
// Doğrulama tarafı da: sessizce kabul etmek yerine null.
check("sır yokken jeton DOĞRULANMIYOR", (await verifyMobileToken(token)) === null);

process.env.AUTH_SECRET = yedek;
check("sır geri gelince yeniden doğrulanıyor", (await verifyMobileToken(token)) !== null);

/* ── ESKİ ROL ADLARI çevriliyor ──────────────────────────────────────────── */
/*
 * Rol modeli dört kademeden ikiye indi ama TELEFONDAKİ JETONLAR eskiden
 * kalabilir: kullanıcı uygulamayı güncellemeden haftalarca kullanabilir ve
 * jetonu "admin"/"editor" taşır. Çeviri olmasaydı `normalizeRole` bilinmeyen
 * değeri en az yetkili kademeye düşürürdü — yani eski bir jetonla giren
 * KURUCU, kendi ağacında üye olurdu.
 *
 * Yön ÖNEMLİ: `admin` → `yonetici` (yetki korunuyor), geri kalan hepsi
 * `uye` (kimse yetki KAZANMIYOR).
 */
{
  for (const [eski, beklenen] of [
    ["admin", "yonetici"],
    ["editor", "uye"],
    ["contributor", "uye"],
    ["viewer", "uye"],
  ] as const) {
    const j = await signMobileToken({ sub: "agac-1", role: eski as never, isFounder: true });
    const c = await verifyMobileToken(j);
    check(`eski rol "${eski}" → "${beklenen}"`, c?.role === beklenen);
  }
  /* Tanınmayan değer en az yetkili kademeye düşer — güvenli yön. */
  const j = await signMobileToken({ sub: "agac-1", role: "uydurma" as never, isFounder: true });
  check("tanınmayan rol üyeye düşüyor", (await verifyMobileToken(j))?.role === "uye");
}

console.log(`\n${ok}/${ok + fail} geçti${fail ? `, ${fail} başarısız` : " ✓"}`);
if (fail) process.exit(1);
