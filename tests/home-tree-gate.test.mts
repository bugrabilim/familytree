import { readFileSync } from "node:fs";

let ok = 0, fail = 0;
function check(cond: boolean, msg: string) { if (cond) ok++; else { fail++; console.log(`✗ ${msg}`); } }

/**
 * KAPI: EV AĞACININ Postgres satırı hesapla birlikte açılır.
 *
 * ## Neden bu bir kapı testi
 *
 * `supabase/schema.sql`te `people.tree_id` → `trees(id)` yabancı anahtarı var.
 * Ağaç satırı yoksa o ağacın HİÇBİR kişisi yazılamaz. Ve ayna bilerek
 * "best-effort": hata yalnız `console.warn`a düşüyor, kullanıcı akışını
 * bozmuyor. İkisi birleşince ortaya en kötü tür hata çıkıyordu — hesabın
 * aynası tamamen ölü, üstelik hiçbir yerde görünmeden.
 *
 * Gerçekten oldu: ev ağacının satırını hiçbir yol açmıyordu. `lib/trees.ts`
 * `createTree` yalnız EK ağaçlar için (`isHome: false`), tek diğer yer de
 * yönetim göç ucuydu. Canlıda kaydolmuş bir hesabın Blob'unda kişiler vardı,
 * Postgres'te sıfır satır.
 *
 * Bu yüzden kilitlenen şey bir davranış değil bir EŞLEŞME: hesabı yaratan
 * yol, ev ağacını da yaratmalı. `lib/users.ts` çalışma zamanında `@/` değer
 * importları taşıdığı için birim testi koşulamıyor; kilit kaynak düzeyinde.
 */

const src = readFileSync(new URL("../lib/users.ts", import.meta.url), "utf8");

const iCreate = src.indexOf("export async function createUser");
check(iCreate > 0, "createUser bulundu");

const govdeCreate = src.slice(iCreate, src.indexOf("\nexport ", iCreate + 10));

/* --- Hesap açılırken ev ağacı da açılıyor ------------------------------- */
check(/await dbUpsertTree\(/.test(govdeCreate), "createUser ev ağacı satırını açıyor");
check(/isHome:\s*true/.test(govdeCreate), "ev ağacı `isHome: true` ile açılıyor");
/*
 * `treeId === accountId` bu deponun temel değişmezi (`lib/tree-context.ts`).
 * Ağaç satırı başka bir kimlikle açılırsa `resolveActiveTree`in çözdüğü ağaç
 * ile Postgres'teki satır ayrışır ve ayna yine ölür — bu sefer sessizce
 * YANLIŞ yere yazarak.
 */
check(/treeId:\s*user\.id/.test(govdeCreate), "ağacın kimliği hesabın kimliği");
check(/ownerAccount:\s*user\.id/.test(govdeCreate), "ağacın sahibi hesabın kendisi");

// Hesap satırından SONRA gelmeli: `trees.owner_account` hesabı işaret ediyor.
const iHesap = govdeCreate.indexOf("dbUpsertAccount(");
const iAgac = govdeCreate.indexOf("dbUpsertTree(");
check(iHesap > 0 && iAgac > iHesap, "ağaç satırı hesap satırından sonra yazılıyor");

/*
 * Ayna yazımı kullanıcı akışını BOZMAMALI. Blob kaynak doğruluğu; Postgres
 * ulaşılamıyorsa kayıt yine tamamlanmalı, yoksa ayna bir bağımlılığa dönüşür.
 */
check(/catch \(e\) \{\s*console\.warn\(`\[cift-yazma\] ev agaci/.test(govdeCreate),
  "ev ağacı yazımı best-effort (kayıt akışını bozmuyor)");

/* --- Yabancı anahtar gerçekten var mı ----------------------------------- */
/*
 * Testin GEREKÇESİ şemadaki FK. FK kalkarsa bu kapı gereksizleşir; kalmaya
 * devam ederse gerekçesi de dosyada dursun.
 */
const schema = readFileSync(new URL("../supabase/schema.sql", import.meta.url), "utf8");
check(/tree_id\s+text not null references public\.trees\(id\)/.test(schema),
  "people.tree_id hâlâ trees(id)'ye bağlı (bu kapının gerekçesi)");

console.log(`\n${ok}/${ok + fail} geçti${fail ? `, ${fail} başarısız` : " ✓"}`);
if (fail > 0) process.exit(1);
