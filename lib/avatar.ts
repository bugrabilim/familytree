import type { Gender } from "@/types/family";

/**
 * Gömülü avatar üretici.
 *
 * Fotoğrafı olmayan hiçbir kart boş kalmasın diye, kişinin kimliğinden
 * deterministik bir portre üretiyoruz. Çıktı `data:` URI olduğundan ek ağ
 * isteği yok, dış servise bağımlılık yok, çevrimdışı da çalışır.
 *
 * Görünüm doğum yılına ve cinsiyete göre dönemini yansıtır: yaşlı kuşakta
 * ak saç, bıyık, başörtüsü.
 */
const TEN = ["#f4d7bd", "#eac09b", "#d6a074", "#b87f55", "#96603f", "#7a4a30"];
const SAC = ["#241a12", "#3d2a1c", "#5a3f2b", "#7d5a3c", "#2f2f33", "#151515"];
const AK = ["#b9b4ab", "#cfcac1", "#9a958c", "#e0dcd4"];
const GIYSI = ["#4f7fb8", "#c06585", "#7d6aa8", "#4f8a6b", "#a8763e", "#5c6b7a", "#8f5a5a", "#3f6b8a"];
const ZEMIN = ["#eef2f7", "#faeef2", "#f2eefa", "#eef6f1", "#f9f2e8", "#eff1f4"];

/** Deterministik 32-bit karma (FNV-1a) */
function hash(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

const pick = <T,>(arr: T[], n: number) => arr[n % arr.length];

export function generateAvatar(
  seed: string,
  gender: Gender,
  birthYear?: number,
  /** Aynı kişi için alternatif görünümler — avatar seçicide kullanılır */
  variant = 0
): string {
  const h = hash(`${seed}#${variant}`);
  const b1 = (h >> 3) & 0xff;
  const b2 = (h >> 11) & 0xff;
  const b3 = (h >> 19) & 0xff;
  const b4 = (h >> 27) & 0x1f;

  const yasli = birthYear !== undefined && birthYear < 1935;
  const cokEski = birthYear !== undefined && birthYear < 1900;

  const ten = pick(TEN, b1);
  const sac = yasli && b2 % 3 !== 0 ? pick(AK, b2) : pick(SAC, b2);
  const giysi = pick(GIYSI, b3);
  const zemin = pick(ZEMIN, b4);

  const kadin = gender === "female";
  const erkek = gender === "male";

  // Yaşlı kuşakta başörtüsü, erkeklerde bıyık — dönemin görünümü
  const basortusu = kadin && (cokEski || (yasli && b1 % 3 !== 0) || b2 % 7 === 0);
  const biyik = erkek && (cokEski || (yasli && b3 % 3 !== 0) || b1 % 5 === 0);
  const sakal = erkek && cokEski && b2 % 3 === 0;
  const gozluk = !cokEski && b4 % 6 === 0;

  const parcalar: string[] = [];

  parcalar.push(`<rect width="100" height="100" fill="${zemin}"/>`);
  // Omuzlar
  parcalar.push(`<path d="M14 100c0-19 16-30 36-30s36 11 36 30z" fill="${giysi}"/>`);
  // Boyun
  parcalar.push(`<rect x="43" y="56" width="14" height="16" rx="6" fill="${ten}"/>`);

  if (basortusu) {
    // Örtü, saçın yerine geçer ve omuzlara iner
    parcalar.push(`<path d="M22 46a28 30 0 0 1 56 0v10c0 16-9 26-12 30H34c-3-4-12-14-12-30z" fill="${giysi}" opacity="0.92"/>`);
    parcalar.push(`<ellipse cx="50" cy="46" rx="15" ry="18" fill="${ten}"/>`);
  } else {
    parcalar.push(`<ellipse cx="50" cy="45" rx="17" ry="20" fill="${ten}"/>`);
    // Saç biçimleri — uzun saç ve topuz erkeklerde kullanılmıyor
    const sacTipi = erkek ? [0, 1, 4][b2 % 3] : b2 % 5;
    if (sacTipi === 0) {
      parcalar.push(`<path d="M33 42a17 19 0 0 1 34 0c0-13-7-19-17-19s-17 6-17 19z" fill="${sac}"/>`);
    } else if (sacTipi === 1) {
      parcalar.push(`<path d="M32 44c0-15 8-22 18-22s18 7 18 22c0 0 2-26-18-26S32 44 32 44z" fill="${sac}"/>`);
      parcalar.push(`<path d="M31 40h4v22h-4zM65 40h4v22h-4z" fill="${sac}"/>`);
    } else if (sacTipi === 2) {
      // Uzun saç
      parcalar.push(`<path d="M30 44c0-16 9-24 20-24s20 8 20 24v26c0 4-4 6-6 3-2-10-2-24-2-24s-6 5-12 5-12-5-12-5 0 14-2 24c-2 3-6 1-6-3z" fill="${sac}"/>`);
    } else if (sacTipi === 3) {
      // Topuz
      parcalar.push(`<path d="M33 43a17 18 0 0 1 34 0c0-14-7-20-17-20s-17 6-17 20z" fill="${sac}"/>`);
      parcalar.push(`<circle cx="50" cy="19" r="7" fill="${sac}"/>`);
    } else {
      // Kısa/dağınık
      parcalar.push(`<path d="M34 41c2-12 8-18 16-18s14 6 16 18c1-18-6-24-16-24s-17 6-16 24z" fill="${sac}"/>`);
      parcalar.push(`<circle cx="38" cy="30" r="5" fill="${sac}"/><circle cx="50" cy="26" r="6" fill="${sac}"/><circle cx="62" cy="30" r="5" fill="${sac}"/>`);
    }
  }

  // Gözler
  parcalar.push(`<circle cx="44" cy="45" r="1.9" fill="#2b2b2b"/><circle cx="56" cy="45" r="1.9" fill="#2b2b2b"/>`);
  // Ağız
  parcalar.push(`<path d="M46 54q4 3 8 0" stroke="#9c6a58" stroke-width="1.6" fill="none" stroke-linecap="round"/>`);

  if (biyik) parcalar.push(`<path d="M42 51q8 4 16 0" stroke="${sac}" stroke-width="3.2" fill="none" stroke-linecap="round"/>`);
  if (sakal) parcalar.push(`<path d="M35 48c0 12 7 19 15 19s15-7 15-19c0 18-5 24-15 24s-15-6-15-24z" fill="${sac}" opacity="0.9"/>`);
  if (gozluk) {
    parcalar.push(`<g stroke="#4a4a4a" stroke-width="1.4" fill="none"><circle cx="44" cy="45" r="5.5"/><circle cx="56" cy="45" r="5.5"/><path d="M49.5 45h1"/></g>`);
  }

  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">${parcalar.join("")}</svg>`;

  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}
