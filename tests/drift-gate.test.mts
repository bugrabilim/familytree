import { readFileSync } from "node:fs";
import { isPublicPath } from "../lib/public-routes.ts";

let ok = 0, fail = 0;
function check(cond: boolean, msg: string) { if (cond) ok++; else { fail++; console.log(`✗ ${msg}`); } }

/**
 * KAPI: kayma denetimi ucu.
 *
 * Bu uç iki hassas şeyi bir arada yapıyor — başka bir kaynağın verisini
 * OKUYUP karşılaştırmak ve Postgres'e YAZMAK. Test, denetimin denetim
 * kalmasını (GET hiçbir şey yazmaz) ve onarımın yönünü (Blob kaynak, Blob'a
 * asla dokunulmaz) kilitliyor.
 */

const rota = readFileSync(new URL("../app/api/admin/drift/route.ts", import.meta.url), "utf8");
const lib = readFileSync(new URL("../lib/drift.ts", import.meta.url), "utf8");
const iGet = rota.indexOf("export async function GET");
const iPost = rota.indexOf("export async function POST");
const govdeGet = rota.slice(iGet, iPost);
const govdePost = rota.slice(iPost);
check(iGet > 0 && iPost > iGet, "GET ve POST bulundu");

/* --- Yetki: üç kapı da yerinde ------------------------------------------ */
check(rota.includes("await auth()"), "oturum çözülüyor");
check(/isFounder/.test(rota), "founder denetimi var");
check(/canManage\(session\.user\.role\)/.test(rota), "yönetici denetimi var");
check(rota.includes("isSupabaseConfigured"), "Supabase yapılandırması denetleniyor");
{
  // Her iki yöntem de AYNI kapıdan geçmeli.
  for (const [ad, govde] of [["GET", govdeGet], ["POST", govdePost]] as const) {
    check(/const g = await guard\(\);/.test(govde) && /if \("error" in g\) return g\.error;/.test(govde),
      `${ad} kapıdan geçiyor`);
  }
}

/* --- DENETİM yazmaz ------------------------------------------------------ */
/*
 * "Kuru çalışma" iddiası koda bakılarak doğrulanabilir olmalı: GET gövdesinde
 * hiçbir yazma çağrısı geçmemeli. Bir denetim aracının denetlediği şeyi
 * değiştirmesi, ölçtüğü şeyi bozması demektir.
 */
for (const yazma of ["dbUpsertPeople(", "dbDeletePeople(", "dbReplacePeople(", "saveFamilyData("]) {
  check(!govdeGet.includes(yazma), `GET yazmıyor: ${yazma}`);
}

/* --- ONARIM yönü: Blob KAYNAK, Blob'a dokunulmaz ------------------------- */
check(govdePost.includes("dbUpsertPeople("), "onarım Postgres'e yazıyor");
check(govdePost.includes("dbDeletePeople("), "onarım fazla kaydı siliyor");
check(!rota.includes("saveFamilyData"), "rota Blob'a HİÇ yazmıyor");
check(!/\bput\(/.test(rota), "rota doğrudan blob `put` çağırmıyor");
check(rota.includes("getFamilyData"), "Blob yalnız OKUNUYOR");
{
  // Hedefli onarım: göçün "hepsini sil, hepsini yaz" davranışı değil.
  check(!rota.includes("dbReplacePeople"), "tam yenileme kullanılmıyor (hedefli onarım)");
}

/* --- Onarım planı KIRPILMIŞ listeden çıkarılmıyor ------------------------ */
/*
 * Ayrıntı listesi rapor okunur kalsın diye sınırlı. Onarım o sınırdan
 * hesaplanırsa sessizce eksik iş yapar ve yine de "tamam" der.
 */
check(/denetle\(t, Number\.MAX_SAFE_INTEGER\)/.test(govdePost), "onarım sınırsız denetimle çalışıyor");
check(lib.includes("partial: t.people.truncated > 0"), "kırpılmış plan işaretleniyor");

/* --- Onarım sonrası YENİDEN denetleniyor -------------------------------- */
check((govdePost.match(/await denetle\(/g) ?? []).length >= 2, "onarımdan sonra tekrar denetim var");
check(/clean: sonra\.clean/.test(govdePost), "sonuç ölçüsü onarım SONRASI durumdan geliyor");

/* --- Hata TEMİZ sayılmıyor ---------------------------------------------- */
/*
 * Bir ağaç okunamadığında sessizce atlanırsa rapor "hepsi tamam" derdi —
 * bir denetim aracının verebileceği en kötü yanıt.
 */
check(/clean: false,\s*\n\s*error:/.test(govdeGet), "GET'te hata clean:false ile dönüyor");
check(/clean: false, error:/.test(govdePost), "POST'ta hata clean:false ile dönüyor");

/* --- Kapsam: başkasının ağacına bakılamıyor ------------------------------ */
check(/listTrees\(g\.accountId/.test(rota), "kapsam giriş yapan hesabın ağaçları");
check(!/searchParams\.get\("treeId"\)/.test(rota), "ağaç kimliği dışarıdan alınmıyor");

/* --- Yol izinleri -------------------------------------------------------- */
check(!isPublicPath("/api/admin/drift"), "denetim ucu oturumsuz açık DEĞİL");

/* --- Rapor içerik sızdırmıyor ------------------------------------------- */
/*
 * Rapor yönetim ucundan çıkıyor, ekranda duruyor ve günlüğe düşebiliyor.
 * Gizli alanların değerini oraya kopyalamak, gizliliği `lib/privacy.ts`in
 * kapattığı yerden yeniden açmak olurdu.
 */
check(lib.includes("PERSON_FIELDS.filter((f) => f.privateGroup)"), "gizli alanlar kayıt defterinden geliyor");
check(/if \(opts\.redact\) return `•••/.test(lib), "maskeleme yerinde");
check(/const gizli = !!\(a\.confidential \|\| b\.confidential\)/.test(lib), "gizli kayıt her alanı maskeliyor");

console.log(`\n${ok}/${ok + fail} geçti${fail ? `, ${fail} başarısız` : " ✓"}`);
if (fail > 0) process.exit(1);
