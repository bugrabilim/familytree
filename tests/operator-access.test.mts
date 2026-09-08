import { readdirSync, readFileSync } from "node:fs";
import { operatorVerdict } from "../lib/operator-access.ts";
import { DEMO_USER_ID } from "../lib/demo-id.ts";

let ok = 0, fail = 0;
const check = (cond: boolean, msg: string) => { if (cond) ok++; else { fail++; console.log(`✗ ${msg}`); } };

/**
 * KAPI + DOĞRULUK TABLOSU: operatör (yönetim) uçları.
 *
 * Bulunan hata şuydu: `/api/admin/*` uçlarının dördü de aynı üç satırı
 * kopyalamıştı (`auth()` → `isFounder` → `canManage`) ve ŞİFRESİZ DEMO
 * OTURUMU o üçünü de geçiyordu. Demo oturumu bilerek `isFounder: true` ve
 * `role: "yonetici"` taşıyor (ziyaretçi ağacı düzenleyebilsin diye), demo
 * girişi de tanıtım sayfasından tek tıklık.
 *
 * Yani internetten gelen herkes `GET /api/admin/phase4` çağırıp HER hesabın
 * kimliğini, şifre özeti olup olmadığını, Auth'ta bulunup bulunmadığını, son
 * giriş zamanını ve HER ağacın kişi sayısını okuyabiliyordu.
 *
 * Test iki katmanlı, çünkü tek katman yetmez:
 *  · Kararın kendisi ÇALIŞTIRILARAK sınanıyor (aşağıdaki tablo).
 *  · Her yönetim rotasının o kararı GERÇEKTEN çağırdığı kaynaktan
 *    denetleniyor — yoksa yarın eklenen beşinci uç yine kendi üç satırını
 *    kopyalar ve tablo yeşil kalırken kapı açık olur.
 */

/* --- 1. Doğruluk tablosu ---------------------------------------------- */

check(operatorVerdict(null).ok === false, "oturumsuz reddediliyor");
check(operatorVerdict(null).ok === false && (operatorVerdict(null) as { status: number }).status === 401,
  "oturumsuz 401");
check(operatorVerdict({ id: "", isFounder: true, role: "yonetici" }).ok === false, "boş kimlik reddediliyor");

{
  // ASIL BULGU: demo hem founder hem yönetici, yine de giremiyor.
  const v = operatorVerdict({ id: DEMO_USER_ID, isFounder: true, role: "yonetici" });
  check(v.ok === false, "DEMO oturumu reddediliyor (founder + yönetici olmasına rağmen)");
  check(v.ok === false && v.status === 403, "demo 403 alıyor");
  check(v.ok === false && /[Dd]emo/.test(v.error), "gerekçe demoyu adıyla söylüyor");
}

check(operatorVerdict({ id: "u1", isFounder: false, role: "yonetici" }).ok === false,
  "kurucu olmayan reddediliyor");
check(operatorVerdict({ id: "u1", isFounder: true, role: "uye" }).ok === false,
  "yönetici olmayan reddediliyor");

{
  const v = operatorVerdict({ id: "u1", isFounder: true, role: "yonetici" });
  check(v.ok === true, "gerçek kurucu + yönetici geçiyor");
  check(v.ok === true && v.accountId === "u1", "kimlik karardan dönüyor (rota `!` yazmak zorunda kalmasın)");
}
{
  /*
   * `isFounder` yokken `true` sayılıyor: eski oturum çerezlerinde alan
   * bulunmuyordu. Bu gevşeklik DEMOYU İÇERİ ALMAMALI — demo denetimi ondan
   * bağımsız ve önce geliyor.
   */
  check(operatorVerdict({ id: "u1", role: "yonetici" }).ok === true, "eski çerez (isFounder yok) geçiyor");
  check(operatorVerdict({ id: DEMO_USER_ID, role: "yonetici" }).ok === false,
    "eski çerez gevşekliği demoyu içeri ALMIYOR");
}

/* --- 2. Sıra: demo denetimi ÖNCE ------------------------------------- */
/*
 * Demo hem `isFounder` hem `canManage` denetiminden geçtiği için, denetim
 * sona konsaydı hiçbir şeyi değiştirmezdi.
 */
{
  const dosya = readFileSync(new URL("../lib/operator-access.ts", import.meta.url), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
  // YALNIZ işlev gövdesi: `isFounder` yukarıdaki arayüz tanımında da geçiyor
  // ve tüm dosyaya bakan bir sıralama denetimi onu yakalayıp yanılıyordu.
  const src = dosya.slice(dosya.indexOf("export function operatorVerdict"));
  const demo = src.indexOf("isDemoTree(");
  const founder = src.indexOf("isFounder");
  const yonetici = src.indexOf("canManage(");
  check(demo > -1 && founder > demo && yonetici > demo,
    "demo denetimi isFounder ve canManage'den ÖNCE");
}

/* --- 3. HER yönetim rotası ortak kapıyı kullanıyor -------------------- */
/*
 * Kopya kapının iki kusuru var: yenisi eklendiğinde unutulur, kusurlu
 * çıktığında dört yerden düzeltilir. Bu blok birincisini engelliyor.
 */
{
  const kok = new URL("../app/api/admin/", import.meta.url).pathname;
  const rotalar = readdirSync(kok, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => `${kok}${d.name}/route.ts`);
  check(rotalar.length >= 4, `yönetim rotaları bulundu (${rotalar.length})`);

  for (const yol of rotalar) {
    const ad = yol.split("/").slice(-2)[0];
    const src = readFileSync(yol, "utf8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
    /*
     * `accounts` ucu CRON_SECRET ile korunuyor — oturum hiç okumuyor,
     * dolayısıyla demo oturumu ona zaten ulaşamıyor. Gerekçesi o dosyada.
     */
    if (src.includes("CRON_SECRET")) {
      check(!src.includes("auth()"), `${ad}: sır kapısı, oturum okumuyor`);
      continue;
    }
    check(src.includes("operatorVerdict("), `${ad}: ortak operatör kapısını kullanıyor`);
    check(!src.includes("canManage("), `${ad}: kendi kopya kapısını KURMUYOR`);
  }
}

/* --- 4. /api/health'in oturum yolu da aynı kapıdan ------------------- */
{
  const src = readFileSync(new URL("../app/api/health/route.ts", import.meta.url), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
  check(src.includes("operatorVerdict("), "health oturum yolu ortak kapıdan geçiyor");
  check(!src.includes("canManage("), "health kendi kopya kapısını kurmuyor");
  // Sunucudan sunucuya yol (CRON_SECRET) korunmalı: cron bir oturum taşımaz.
  check(src.includes("CRON_SECRET"), "makine yolu (CRON_SECRET) duruyor");
}

console.log(`\n${ok}/${ok + fail} geçti${fail ? `, ${fail} başarısız` : " ✓"}`);
if (fail) process.exit(1);
