import { DEMO_PEOPLE } from "../lib/demo-data.ts";
import { computeStats, indexPeople, ancestorDepths } from "../lib/relations.ts";
import { generateAvatar } from "../lib/avatar.ts";

const P = DEMO_PEOPLE;
const idx = indexPeople(P);
const ids = new Set(P.map(p => p.id));
let hata = 0;
const err = (m: string) => { hata++; console.log("✗ " + m); };
const ad = (p: { firstName: string; lastName: string }) => `${p.firstName} ${p.lastName}`;

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
      if (fark < 13) err(`${ad(par)} (${pb}) → ${ad(p)} (${b}): ${fark} yaş farkı`);
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

console.log(`\n${hata === 0 ? "✓ Veri bütünlüğü temiz" : `✗ ${hata} bütünlük hatası`}`);
