import { readFileSync } from "node:fs";
import { applyPublicVisibility } from "../lib/public-visibility.ts";
import { viewAll } from "../lib/privacy.ts";
import type { Person } from "../types/family.ts";

let ok = 0, fail = 0;
function check(cond: boolean, msg: string) {
  if (cond) ok++; else { fail++; console.log(`✗ ${msg}`); }
}

/**
 * KAPI: girişsiz paylaşım sayfası kişi kısıtını gerçekten uyguluyor mu, ve
 * DOĞRU SIRADA mı?
 *
 * `applyPublicVisibility` doğru çalışıyor mu — `tests/public-visibility.test.mts`
 * ölçüyor. Buradaki soru başka: çağrılıyor mu, sunucuda mı, ve maskeden ÖNCE mi?
 */

const share = readFileSync(new URL("../app/g/[token]/page.tsx", import.meta.url), "utf8");

check(share.includes("applyPublicVisibility"), "paylaşım sayfası kişi kısıtını uyguluyor");

// Sıra: applyPublicVisibility, viewAll'ın İÇİNDE (yani önce) çağrılmalı.
{
  const i = share.indexOf("const safePeople");
  const ifade = share.slice(i, share.indexOf(";", share.indexOf("viewAll", i)));
  const iv = ifade.indexOf("viewAll");
  const ia = ifade.indexOf("applyPublicVisibility");
  check(iv >= 0 && ia > iv, "kısıt `viewAll`ın argümanında — yani maskeden ÖNCE uygulanıyor");
}

// Sunucu bileşeni olmalı: "use client" varsa ham veri tarayıcıya giderdi.
check(!/^\s*"use client"/m.test(share), "paylaşım sayfası sunucu bileşeni");

/* --- Davranış: sıra gerçekten fark ediyor mu? --------------------------- */
{
  const P = (id: string, extra: Partial<Person> = {}): Person => ({
    id, firstName: `Ad-${id}`, lastName: "S", gender: "male",
    parentIds: [], spouseIds: [], ...extra,
  });
  const list = [
    P("gizli", { publicVisibility: "gizli", birthDate: "2000-01-01" }),
    P("cocuk", { parentIds: ["gizli"] }),
  ];

  // DOĞRU sıra: önce kısıt, sonra maske.
  const dogru = viewAll(applyPublicVisibility(list), true);
  check(!JSON.stringify(dogru).includes('"gizli"'), "doğru sırada gizlenenin kimliği hiç geçmiyor");

  /*
   * TERS sıra neden yanlış: maskeleme kimlikleri KORUR (`maskPerson`
   * `parentIds`i bilerek taşır, ağaç bozulmasın diye). Dolayısıyla önce
   * maskeleyip sonra kısıtlamak da aslında çalışır — ama yalnız ikisi de
   * uygulanırsa. Asıl tehlike kısıtın HİÇ uygulanmaması; bu yüzden yukarıdaki
   * kaynak denetimi asıl güvencedir. Burada ölçtüğümüz, doğru sıranın
   * kimliği gerçekten sildiği.
   */
  const yalnizMaske = viewAll(list, true);
  check(JSON.stringify(yalnizMaske).includes('"gizli"'),
    "kısıt uygulanmazsa kimlik sızıyor (kapının neden gerektiğinin kanıtı)");
}

console.log(`\n${ok}/${ok + fail} geçti${fail ? `, ${fail} başarısız` : " ✓"}`);
if (fail > 0) process.exit(1);
