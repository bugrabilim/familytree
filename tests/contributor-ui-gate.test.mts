import { readFileSync } from "node:fs";

let ok = 0, fail = 0;
function check(cond: boolean, msg: string) { if (cond) ok++; else { fail++; console.log(`✗ ${msg}`); } }
const read = (rel: string) => readFileSync(new URL(rel, import.meta.url), "utf8");
/** Yorumları ayıkla: kuralı ANLATAN metin, kuralın kanıtı değildir. */
const kodu = (src: string) =>
  src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\{\/\*[\s\S]*?\*\/\}/g, "").replace(/^\s*\/\/.*$/gm, "");

/**
 * KAPI: katkı verici arayüzü (madde 35/C).
 *
 * Arayüz bir güvenlik sınırı DEĞİL — asıl kapı sunucuda. Ama yanlış arayüz
 * kendi başına bir arıza: kullanıcıya yapamayacağı bir düğme göstermek, onu
 * formu doldurup 403 yemeye davet etmek demek. Bu dosya, arayüzün sunucuyla
 * AYNI kuralı kullandığını kilitliyor.
 */

const form = kodu(read("../components/PersonForm.tsx"));
const drawer = kodu(read("../components/PersonDrawer.tsx"));
const ctx = kodu(read("../components/AuthorityContext.tsx"));
const dialog = kodu(read("../components/ProposalsDialog.tsx"));
const workspace = kodu(read("../app/tree/Workspace.tsx"));
const page = read("../app/tree/page.tsx");
const members = kodu(read("../components/MembersDialog.tsx"));

/* --- 1. Kural TEK YERDE -------------------------------------------------- */
/*
 * Arayüz kendi kopyasını taşısaydı sunucuyla ayrışırdı ve ayrışmanın yönü
 * kötü olurdu: ekran "kaydet" gösterir, sunucu 403 döner, kullanıcı ne
 * olduğunu anlamaz.
 */
check(/canEditPerson/.test(ctx), "yetki bağlamı ortak kuralı çağırıyor");
check(/from "@\/lib\/roles"/.test(ctx), "kural lib/roles.ts'ten geliyor");
check(!/addedBy ===/.test(form) && !/addedBy ===/.test(drawer),
  "bileşenler sahiplik karşılaştırmasının KENDİ kopyasını yazmıyor");

/* --- 2. Öneri modu ------------------------------------------------------- */
check(/const oneriModu = !!personId && !authority\.canEditPerson\(initial\)/.test(form),
  "öneri modu ortak kuraldan türüyor");
/*
 * Yeni kişi eklemek ÖNERİ DEĞİL: katkı verici ekleyebiliyor (A parçası).
 * `personId` koşulu bunu sağlıyor — düşerse yeni kişi ekleme de öneriye
 * dönüşür ve rol işlevsiz kalırdı.
 */
check(/!!personId &&/.test(form), "yeni kişi eklemek öneri değil");
{
  const i = form.indexOf("if (oneriModu)");
  check(i > -1, "öneri modunda ayrı bir yol var");
  /*
   * Pencere blokla SINIRLI. İlk hâlinde sabit 700 karakter alınıyordu ve
   * pencere bloğun dışına, hemen ardından gelen `updatePerson` çağrısına
   * taşıyordu: "öneri modunda kayıt yazılmıyor" iddiası kendi kapsamı
   * dışındaki koda bakıp sahte kırmızıya düşüyordu.
   */
  const blok = form.slice(i, form.indexOf("const saved", i));
  check(/proposeChanges\(/.test(blok), "öneri ucuna gidiyor");
  check(!/updatePerson\(/.test(blok), "öneri modunda kayıt YAZILMIYOR");
  /*
   * Gövde deftere göre süzülüyor. Süzülmeseydi `relation`/`parentIds` gibi
   * önerilemeyen alanlar gider ve sunucu isteğin TAMAMINI reddederdi —
   * kullanıcı geçerli değişikliklerinin neden gitmediğini anlayamazdı.
   */
  check(/PERSON_FIELDS\.map/.test(blok), "gövde kayıt defterine göre süzülüyor");
}
check(/t\("proposal\.hint"\)/.test(form), "ne olacağı kullanıcıya ÖNCEDEN söyleniyor");

/* --- 3. Silme katkı vericiye kapalı -------------------------------------- */
/*
 * Sunucu zaten reddediyor; burada gizlenmeseydi düğme görünür, basılır ve
 * 403 dönerdi. Sebebi anlaşılmayan bir ret, görünmeyen bir düğmeden kötüdür.
 */
check(/!readOnly && authority\.canEditAll &&/.test(drawer), "silme yalnız tam yetkide görünüyor");
{
  const i = drawer.indexOf("authority.canEditAll");
  const j = drawer.indexOf("handleDelete", i);
  check(i > -1 && j > i, "silme düğmesi o koşulun İÇİNDE");
}
/*
 * HAM kayıt sorulmalı, maskeli kopya değil.
 *
 * İlk hâlinde `canEditPerson(person)` yazıyordu ve `person` çekmecede
 * `view(rawPerson)` ile maskelenmiş kopya. `maskPerson` bir beyaz liste ve
 * `addedBy` taşımıyor: katkı verici kendi eklediği kaydı "gizli"
 * işaretlediğinde çekmece "değişiklik öner" derken form "güncelle" diyordu —
 * aynı kayıt için iki farklı vaat. Test iddiası da bunu göremiyordu, çünkü
 * çağrının VARLIĞINI kilitliyordu, neyin geçirildiğini değil.
 */
check(/authority\.canEditPerson\(rawPerson\) \? t\("drawer\.edit"\) : t\("proposal\.submit"\)/.test(drawer),
  "düzenleyemediği kayıtta düğme 'öner' diyor");
check(!/canEditPerson\(person\)/.test(drawer), "maskelenmiş kopya sahiplik kararına GİRMİYOR");

/* --- 4. Kimlik sunucudan geliyor ----------------------------------------- */
/*
 * `authorId` gelmezse sahiplik hiç kurulamaz ve HER kayıt için öneri açılır
 * — güvenli yön. Ama gelmesi gerekiyor, yoksa katkı verici kendi eklediğini
 * bile düzeltemez.
 */
check(/authorId=\{ctx\.authorId\}/.test(page), "sunucu bileşeni kimliği geçiriyor");
check(/<AuthorityProvider role=\{props\.role \?\? "admin"\} authorId=\{props\.authorId \?\? ""\}>/.test(workspace),
  "sağlayıcı rol ve kimliği alıyor");

/* --- 5. Kuyruk katkı vericiye de açık ------------------------------------ */
/*
 * Yazdığı önerinin onaylanıp onaylanmadığını göremeseydi, boşluğa yazmış
 * olurdu. Kuyruk `canAdd` ile açılıyor, `canDecide` ile değil.
 */
check(/onOpenProposals=\{!publicView && authority\.canAdd \?/.test(workspace),
  "kuyruk katkı vericiye de açık");
check(/canDecide && p\.status === "bekliyor"/.test(dialog),
  "karar düğmeleri yalnız karar verebilene");
check(/proposalCount/.test(workspace), "bekleyen sayısı taşınıyor");

/* --- 6. Rol davet edilebilir --------------------------------------------- */
check(/<option value="contributor">/.test(members), "üye ekranında seçilebiliyor");
check(/role === "contributor" &&/.test(members) && /role\.contributorHint/.test(members),
  "seçilince ne olduğu yazıyor");

console.log(`\n${ok}/${ok + fail} geçti${fail ? `, ${fail} başarısız` : " ✓"}`);
if (fail > 0) process.exit(1);
