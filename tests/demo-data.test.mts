import { DEMO_PEOPLE } from "../lib/demo-data.ts";
import { computeStats, indexPeople, ancestorDepths, descendantDepths } from "../lib/relations.ts";
import { generateAvatar } from "../lib/avatar.ts";

const P = DEMO_PEOPLE;
const idx = indexPeople(P);
const ids = new Set(P.map(p => p.id));
let hata = 0;
const err = (m: string) => { hata++; console.log("✗ " + m); };
const ad = (p: { firstName: string; lastName: string }) => `${p.firstName} ${p.lastName}`;

// Çocuğu, annesi çok erken yaşta (14 altı) doğurmuş bilinçli örnekler.
// Yaş-farkı taban kontrolünden muaf; kimlikle işaretlenerek niyet belgeleniyor.
const COK_GENC_ANNE = new Set(["s-fadime-cocuk", "s-yagmur-cocuk"]);

// --- Referans bütünlüğü ---
for (const p of P) {
  const ad = `${p.firstName} ${p.lastName} (${p.id})`;
  for (const pid of p.parentIds) if (!ids.has(pid)) err(`${ad}: olmayan ebeveyn ${pid}`);
  for (const sid of p.spouseIds) if (!ids.has(sid)) err(`${ad}: olmayan eş ${sid}`);
  for (const sid of p.formerSpouseIds ?? []) if (!ids.has(sid)) err(`${ad}: olmayan eski eş ${sid}`);
  if (p.parentIds.length > 2) err(`${ad}: ${p.parentIds.length} ebeveyn`);
  if (p.parentIds.includes(p.id) || p.spouseIds.includes(p.id)) err(`${ad}: kendine referans`);
  if (new Set(p.parentIds).size !== p.parentIds.length) err(`${ad}: yinelenen ebeveyn`);
  // Eş hem güncel hem eski olamaz
  const kesisim = p.spouseIds.filter(s => (p.formerSpouseIds ?? []).includes(s));
  if (kesisim.length) err(`${ad}: hem eş hem eski eş: ${kesisim}`);
}

// --- Çift yönlülük ---
for (const p of P) {
  for (const sid of p.spouseIds) if (!idx.get(sid)!.spouseIds.includes(p.id)) err(`${p.id} ↔ ${sid} eş bağı tek yönlü`);
  for (const sid of p.formerSpouseIds ?? []) if (!(idx.get(sid)!.formerSpouseIds ?? []).includes(p.id)) err(`${p.id} ↔ ${sid} eski eş bağı tek yönlü`);
}

// --- Tarih tutarlılığı ---
const yil = (d?: string) => d ? Number(d.slice(0,4)) : undefined;
for (const p of P) {
  const b = yil(p.birthDate), d = yil(p.deathDate);
  if (b && d && d < b) err(`${p.firstName} ${p.lastName}: ölüm (${d}) doğumdan (${b}) önce`);
  for (const pid of p.parentIds) {
    const par = idx.get(pid); if (!par) continue;
    // Evlat edinme/koruyucu bağlarında biyolojik kısıtlar geçerli değil
    const kanBagi = !p.parentLinks?.[pid]?.kind || p.parentLinks[pid].kind === "biological";
    const pb = yil(par.birthDate);
    if (kanBagi && pb && b) {
      const fark = b - pb;
      // 14 tabanı bilinçli: sıradan kayıtlarda bunun altı veri hatasıdır.
      // Çok erken yaşta annelik (11/13) bilinçli örnekler; ayrı allowlist ile
      // muaf tutulur, ama anne kadın ve gerçekçi bir alt sınırın (10) üstünde
      // olmalı — yoksa yine hata.
      if (COK_GENC_ANNE.has(p.id)) {
        if (par.gender !== "female" || fark < 10)
          err(`${ad(par)} (${pb}) → ${ad(p)} (${b}): erken annelik istisnası geçersiz (${fark} yaş, ${par.gender})`);
      } else {
        if (fark < 14) err(`${ad(par)} (${pb}) → ${ad(p)} (${b}): ${fark} yaş farkı`);
      }
      if (fark > 65) err(`${ad(par)} (${pb}) → ${ad(p)} (${b}): ${fark} yaş farkı fazla`);
    }
    const pd = yil(par.deathDate);
    // Anne öldükten sonra doğum olamaz; baba için 1 yıl tolerans
    if (kanBagi && pd && b && b > pd + (par.gender === "female" ? 0 : 1))
      err(`${ad(par)} ${pd}'de öldü ama çocuk ${ad(p)} ${b}'de doğmuş`);
  }
}

// --- Ortak çocuğu olan iki kişi eş ya da eski eş olarak bağlı mı? ---
for (const p of P) {
  if (p.parentIds.length !== 2) continue;
  const [a, b] = p.parentIds.map(id => idx.get(id)!);
  if (!a || !b) continue;
  const bagli = a.spouseIds.includes(b.id) || (a.formerSpouseIds ?? []).includes(b.id);
  const evlatlik = p.parentLinks?.[a.id]?.kind && p.parentLinks[a.id].kind !== "biological";
  if (!bagli && !evlatlik)
    err(`${ad(a)} ile ${ad(b)} ortak çocuğu var (${ad(p)}) ama eş bağı yok`);
}

// --- Döngü kontrolü: kimse kendi atası olamaz ---
for (const p of P) if (ancestorDepths(p.id, idx).has(p.id)) err(`${p.firstName} ${p.lastName}: kendi atası (döngü)`);

// --- Kapsam kontrolü: istenen durumlar var mı? ---
const st = computeStats(P);
const kontrol = (ad: string, kosul: boolean, detay = "") =>
  console.log(`${kosul ? "✓" : "✗ EKSİK"} ${ad}${detay ? " — " + detay : ""}`);
if (!kontrol) {}

const cokEsli = P.filter(p => p.spouseIds.length >= 3);
const seriEvli = P.filter(p => (p.formerSpouseIds ?? []).length >= 4);
const bosanmis = P.filter(p => (p.formerSpouseIds ?? []).length > 0);
const tarihsiz = P.filter(p => !p.birthDate);
const bebekOlum = P.filter(p => { const b=yil(p.birthDate),d=yil(p.deathDate); return b&&d&&d-b<=1; });
const interseks = P.filter(p => p.gender === "other");
const bilinmeyenC = P.filter(p => p.gender === "unknown");
// Avatar artık arayüzde üretiliyor; herkese bir portre düştüğünü doğrula
const avatarlar = P.map(p =>
  generateAvatar(p.id, p.gender, p.birthDate ? Number(p.birthDate.slice(0, 4)) : undefined)
);
const biyografili = P.filter(p => p.bio);
const soyadlar = new Set(P.map(p => p.lastName));
const tekEbeveyn = P.filter(p => p.parentIds.length === 1);
const ikizler = (() => { const m = new Map<string,number>(); for(const p of P) if(p.birthDate?.length===10 && p.parentIds.length) { const k=p.parentIds.join()+p.birthDate; m.set(k,(m.get(k)??0)+1);} return [...m.values()].filter(v=>v>1).length; })();

console.log("");
kontrol("Kuşak sayısı ≥ 11", st.generations >= 11, `${st.generations} kuşak`);
kontrol("Toplam kişi ≥ 130", st.total >= 130, `${st.total} kişi`);
kontrol("Çok eşlilik (aynı anda 3+)", cokEsli.length > 0, cokEsli.map(p=>`${p.firstName} ${p.spouseIds.length} eş`).join(", "));
kontrol("Seri evlilik (5+ boşanma)", seriEvli.length > 0, seriEvli.map(p=>`${p.firstName} ${(p.formerSpouseIds??[]).length} eski eş`).join(", "));
kontrol("Boşanmalar", bosanmis.length >= 4, `${bosanmis.length} kişi`);
kontrol("Tarihi bilinmeyenler", tarihsiz.length >= 3, `${tarihsiz.length} kişi`);
kontrol("Bebek/doğum ölümleri", bebekOlum.length >= 4, `${bebekOlum.length} kişi`);
kontrol("İnterseks / ikili olmayan", interseks.length >= 2, interseks.map(p=>p.firstName).join(", "));
kontrol("Cinsiyeti bilinmeyen", bilinmeyenC.length >= 2, `${bilinmeyenC.length} kişi`);
kontrol("Herkese avatar üretiliyor", avatarlar.every(a => a.startsWith("data:image/svg+xml,")), `${P.length} kişi`);
kontrol("Avatar çeşitliliği", new Set(avatarlar).size >= P.length * 0.8, `${new Set(avatarlar).size} farklı görünüm`);
kontrol("Biyografili", biyografili.length >= 40, `${biyografili.length} kişi`);
kontrol("Farklı soyadı (Soyadı Kanunu)", soyadlar.size >= 10, `${soyadlar.size} soyadı`);
kontrol("Tek ebeveynli çocuk", tekEbeveyn.length >= 2, `${tekEbeveyn.length} kişi`);
kontrol("İkizler", ikizler >= 1, `${ikizler} ikiz çifti`);

// Akraba evliliği: eşlerin ortak atası var mı? (eş kenarını kullanmadan)
const akrabaEvlilik: string[] = [];
for (const p of P) {
  for (const sid of p.spouseIds) {
    if (p.id > sid) continue;
    const a = ancestorDepths(p.id, idx), b = ancestorDepths(sid, idx);
    const ortak = [...a.keys()].filter(k => b.has(k));
    if (ortak.length) {
      const derece = Math.min(...ortak.map(k => Math.max(a.get(k)!, b.get(k)!)));
      const es = idx.get(sid)!;
      akrabaEvlilik.push(`${p.firstName}–${es.firstName} (${derece}. kuşak ortak ata)`);
    }
  }
}
const bagli = (k: string) => P.filter(p => Object.values(p.parentLinks ?? {}).some(l => l.kind === k));
const kopuk = (e: string) => P.filter(p => Object.values(p.parentLinks ?? {}).some(l => l.estranged === e));
kontrol("Evlat edinme", bagli("adoptive").length >= 3, bagli("adoptive").map(p=>p.firstName).join(", "));
kontrol("Koruyucu / evlatlık", bagli("foster").length >= 1, bagli("foster").map(p=>p.firstName).join(", "));
kontrol("Evlatlıktan reddedilen", kopuk("by-parent").length >= 2, kopuk("by-parent").map(p=>p.firstName).join(", "));
kontrol("Ebeveynini reddeden", kopuk("by-child").length >= 1, kopuk("by-child").map(p=>p.firstName).join(", "));
const kokenli = P.filter(p => p.religion || p.language || p.ethnicity || p.nationality);
const yabanci = P.filter(p => p.nationality && !p.nationality.startsWith("Türkiye") && p.nationality !== "Osmanlı");
const escinsel = P.filter(p => {
  const es = p.spouseIds.map(i => idx.get(i)!).filter(Boolean);
  return es.some(e => e.gender === p.gender && p.gender !== "unknown");
});
const uvey = P.filter(p => Object.values(p.parentLinks ?? {}).some(l => l.kind === "step"));
const enEski = P.map(p => p.birthDate).filter(Boolean).sort()[0]!;

kontrol("1600 öncesine uzanıyor", Number(enEski.slice(0,4)) < 1600, `en eski doğum ${enEski}`);
kontrol("Köken bilgisi", kokenli.length >= 100, `${kokenli.length} kişide`);
kontrol("Yurt dışı aileler", yabanci.length >= 12, [...new Set(yabanci.map(p=>p.nationality))].join(" · "));
kontrol("Eşcinsel evlilik/birliktelik", escinsel.length >= 4, escinsel.map(p=>p.firstName).join(", "));
kontrol("Üvey ebeveyn", uvey.length >= 1, uvey.map(p=>p.firstName).join(", "));
kontrol("Akraba evliliği", akrabaEvlilik.length >= 2, akrabaEvlilik.join(", "));

// --- Soyadı tercihleri: kadının soyadını alan koca, kızlık soyadını koruyan
//     kadın, çift soyad ---
// Soyadın kimden geldiği veri modelinde tutulmuyor (biyografide anlatılıyor),
// bu yüzden "kocanın eşinin soyadını alması" yapısal olarak çıkarılamıyor:
// aynı soyadı paylaşan çiftlerin çoğu akraba evliliği. Bilinen örneği
// kimliğiyle doğruluyoruz; eşleri gerçekten aynı soyadı taşıyor mu diye.
const kocaSoyadiAldi = ["s-yasemin-es"].map(i => idx.get(i));
kontrol(
  "Eşinin soyadını alan koca",
  kocaSoyadiAldi.every(p => p && p.spouseIds.some(s => idx.get(s)?.lastName === p.lastName)),
  kocaSoyadiAldi.map(p => p ? ad(p) : "eksik").join(", ")
);

// Kızlık soyadını koruyan kadın: eşiyle soyadı tutmayan evli kadınlar.
// (Soyadı Kanunu öncesi kuşaklarda soyad zaten lakaptı, onları eliyoruz.)
const kizlikSoyadi = P.filter(p => {
  if (p.gender !== "female" || p.spouseIds.length === 0) return false;
  const b = yil(p.birthDate);
  if (!b || b < 1910) return false;
  return p.spouseIds.every(sid => idx.get(sid)?.lastName !== p.lastName);
});
const ciftSoyad = P.filter(p => p.lastName.trim().includes(" "));
kontrol("Kızlık soyadını koruyan kadın", kizlikSoyadi.length >= 1,
  kizlikSoyadi.map(p => ad(p)).join(", "));
kontrol("Çift soyad", ciftSoyad.length >= 1, ciftSoyad.map(p => ad(p)).join(", "));

// --- Engellilik / doğuştan durum / sonradan rahatsızlık / ölüm nedeni ---
const dogustan = P.filter(p => p.congenitalCondition);
const sonradan = P.filter(p => p.healthCondition);
const olumNedeni = P.filter(p => p.deathCause);
kontrol("Doğuştan sağlık durumu", dogustan.length >= 4,
  dogustan.map(p => `${p.firstName}: ${p.congenitalCondition}`).join(" · "));
kontrol("Yaşarken sağlık sorunu", sonradan.length >= 1,
  sonradan.map(p => `${p.firstName}: ${p.healthCondition}`).join(" · "));
kontrol("Ölüm nedeni bilinen", olumNedeni.length >= 3,
  olumNedeni.map(p => `${p.firstName}: ${p.deathCause}`).join(" · "));
// Eski, ayrışmamış healthNote alanı artık kullanılmıyor olmalı
kontrol("Eski healthNote alanı boş", P.every(p => !p.healthNote), "tüm kayıtlar yeni alanlarda");
// Ölüm nedeni yalnızca vefat edenlerde
kontrol("Ölüm nedeni yalnızca vefat edende",
  olumNedeni.every(p => p.deathDate),
  olumNedeni.filter(p => !p.deathDate).map(p => p.firstName).join(", ") || "tutarlı");

// --- Erken yaşta ebeveynlik (18 yaş altı, kan bağı) ---
const gencEbeveyn: string[] = [];
for (const p of P) {
  const b = yil(p.birthDate); if (!b) continue;
  for (const pid of p.parentIds) {
    const par = idx.get(pid); if (!par) continue;
    const kanBagi = !p.parentLinks?.[pid]?.kind || p.parentLinks[pid].kind === "biological";
    const pb = yil(par.birthDate);
    if (kanBagi && pb && b - pb < 18) gencEbeveyn.push(`${ad(par)} ${b - pb} yaşında`);
  }
}
kontrol("Erken yaşta ebeveynlik", gencEbeveyn.length >= 3, gencEbeveyn.join(", "));

// --- Çok erken yaşta annelik, evlilik dışı (14 altı, tek ebeveyn, kadın) ---
const cokGencAnne: string[] = [];
for (const cid of COK_GENC_ANNE) {
  const c = idx.get(cid);
  if (!c) { cokGencAnne.push(`${cid}?`); continue; }
  const anne = c.parentIds.map(i => idx.get(i)).find(x => x?.gender === "female");
  const yas = anne && yil(anne.birthDate) && yil(c.birthDate) ? yil(c.birthDate)! - yil(anne.birthDate)! : NaN;
  const tekEbeveyn = c.parentIds.length === 1;
  const evlilikYok = anne ? anne.spouseIds.length === 0 : false;
  if (anne && tekEbeveyn && evlilikYok && yas < 14) cokGencAnne.push(`${anne.firstName} ${yas} yaşında`);
}
kontrol("Çok erken yaşta annelik (evlilik dışı)", cokGencAnne.length >= 2, cokGencAnne.join(", "));

// --- Soyadı Kanunu öncesi: soyadsız + patronim, lakaplar ---
const soyadsiz = P.filter(p => !p.lastName?.trim());
const patronimli = soyadsiz.filter(p => p.patronymic);
const lakapli = P.filter(p => p.nickname);
kontrol("Soyadsız eski kuşak", soyadsiz.length >= 20, `${soyadsiz.length} kişi`);
kontrol("Patronim türetildi", patronimli.length >= 15,
  patronimli.slice(0, 4).map(p => `${p.firstName} (${p.patronymic})`).join(", "));
kontrol("Lakap (Topal/Avcı…)", lakapli.length >= 4,
  lakapli.map(p => `${p.nickname} ${p.firstName}`).join(", "));

// --- Cinsel yönelim kayıtlı ---
const yonelimli = P.filter(p => p.orientation);
kontrol("Cinsel yönelim kayıtlı", yonelimli.length >= 6,
  yonelimli.map(p => `${p.firstName}: ${p.orientation}`).join(" · "));

// --- Aynı anda çok eşli kadın ---
const cokEsliKadin = P.filter(p => p.gender === "female" && p.spouseIds.length >= 2);
kontrol("Aynı anda çok eşli kadın", cokEsliKadin.length >= 1,
  cokEsliKadin.map(p => `${p.firstName} (${p.spouseIds.length} eş)`).join(", "));

// --- Boşanıp yeniden evlenen kadın (hem eski hem güncel eşi olan) ---
const bosanipEvlenenKadin = P.filter(
  p => p.gender === "female" && p.spouseIds.length >= 1 && (p.formerSpouseIds ?? []).length >= 1
);
kontrol("Boşanıp yeniden evlenen kadın", bosanipEvlenenKadin.length >= 1,
  bosanipEvlenenKadin.map(p => p.firstName).join(", "));

// --- Karmaşık evlilik geçmişi: aynı kişiyle iki kez evli (Sema–Kerem) ---
const sema = idx.get("ek-sema");
kontrol("İç içe evlilik karakteri", !!sema && sema.spouseIds.includes("ek-sema-kerem") && (sema.formerSpouseIds ?? []).includes("ek-sema-tolga"),
  sema ? `${sema.spouseIds.length} güncel, ${(sema.formerSpouseIds ?? []).length} eski eş` : "yok");

// --- Beş canlı kuşak: yaşayan bir kişi, 5 kuşak altındaki yaşayan torununu görüyor; yaş ≤ 110 ---
const buYil = 2026;
const yasar = (p: typeof P[number]) => !p.deathDate;
let besKusak = "";
for (const p of P) {
  if (!yasar(p)) continue;
  const b = yil(p.birthDate);
  if (!b || buYil - b > 110) continue;
  const soy = descendantDepths(p.id, P);
  const derinYasayan = [...soy.entries()].some(([id, d]) => d >= 5 && yasar(idx.get(id)!));
  if (derinYasayan) { besKusak = `${p.firstName} (${buYil - b} yaş)`; break; }
}
kontrol("Beş canlı kuşağı gören (≤110)", !!besKusak, besKusak);

// --- Kimse 110 yaşını geçmiyor (yaşayanlar) ---
const cokYasli = P.filter(p => !p.deathDate && yil(p.birthDate) && buYil - yil(p.birthDate)! > 110);
kontrol("Yaşayan kimse 110'u geçmiyor", cokYasli.length === 0,
  cokYasli.map(p => `${p.firstName} ${buYil - yil(p.birthDate)!}`).join(", ") || "tamam");

// --- Benzersiz 6 haneli kod (289…) ---
const kodlar = P.map(p => p.code).filter(Boolean) as string[];
const kodBenzersiz = new Set(kodlar).size === kodlar.length;
const kodBicimi = kodlar.every(c => /^289\d{3}$/.test(c));
kontrol("Herkese kod atandı", kodlar.length === P.length, `${kodlar.length}/${P.length}`);
kontrol("Kod biçimi 289xxx", kodBicimi, kodlar.slice(0, 3).join(", "));
kontrol("Kodlar benzersiz", kodBenzersiz, `${new Set(kodlar).size} farklı`);

console.log(`\n${hata === 0 ? "✓ Veri bütünlüğü temiz" : `✗ ${hata} bütünlük hatası`}`);
