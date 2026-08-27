/**
 * YZ sohbetinden verilen KOMUTLARI (soru değil) tanıyan saf çözümleyici (#14).
 * Kullanıcı "karanlık tema yap, arkadaşları gizle" gibi doğal komutlar
 * yazabilir; bunları uygulamanın yapabildiği eylemlere eşleriz. Runtime importu
 * yok (yalnız tip) → Node ile test edilebilir. Yürütme `components/AiChat.tsx`
 * içinde geri çağrılarla yapılır.
 *
 * Tasarım: tek bir mesajda birden çok komut olabilir (virgülle/"ve" ile).
 * Her komut türü metinde bağımsızca aranır; bulunanların tümü döndürülür.
 */

export type ViewCmdKey =
  | "agac" | "cevre" | "soy" | "yelpaze" | "liste" | "zaman" | "harita"
  | "istatistik" | "iliski" | "tablo";

export type TreeCommand =
  | { kind: "theme"; value: "dark" | "light" }
  | { kind: "hideLiving"; value: boolean }
  | { kind: "showAssociates"; value: boolean }
  | { kind: "lang"; value: "tr" | "en" }
  | { kind: "view"; value: ViewCmdKey }
  | { kind: "share" }
  | { kind: "book" }
  | { kind: "addPerson" };

/** Türkçe küçük harfe indir (İ/I inceliğiyle) — eşleştirme için. */
function norm(s: string): string {
  return s.toLocaleLowerCase("tr");
}

// Türkçe iyelik/hâl ekleriyle biten göster/gizle fiil öbekleri.
const HIDE = "(gizle|sakla|kapat|kaldır)";
const SHOW = "(göster|aç)";

// Görünüm sözcükleri → ViewCmdKey. Sıra önemli: daha özgül olan önce.
const VIEW_WORDS: Array<[ViewCmdKey, RegExp]> = [
  ["harita", /har(i|İ)ta|map\b/i],
  ["zaman", /zaman|timeline/i],
  ["yelpaze", /yelpaze|fan\s*chart/i],
  ["tablo", /tablo|table\b/i],
  ["liste", /liste|list\b/i],
  ["istatistik", /istatistik|stat(istic)?s?\b/i],
  ["iliski", /ili[şs]ki\s*hesap|ili[şs]kiler|relationship/i],
  ["soy", /soy\s*(a[ğg]ac|kütü)|[şs]ecere|pedigree/i],
  ["cevre", /çevre|associates?\b/i],
  ["agac", /aile\s*a[ğg]ac|soya[ğg]ac|a[ğg]a[çc]\b|tree\b/i],
];

const OPEN_VERB = /(aç|göster|geç|git|gör|getir|open|show|go\s*to|switch\s*to|display)/i;

/** Bir görünüm sözcüğü açma fiiliyle birlikte geçiyor mu? (yanlış eşleşmeyi
 *  azaltmak için fiil yakınlığı aranır.) */
function matchView(text: string): ViewCmdKey | null {
  if (!OPEN_VERB.test(text)) return null;
  for (const [key, re] of VIEW_WORDS) {
    if (re.test(text)) return key;
  }
  return null;
}

export function parseCommands(input: string): TreeCommand[] {
  const text = norm(input);
  const out: TreeCommand[] = [];

  // Tema. "karanlık/koyu" ve "aydınlık/beyaz" tek anlamlı → gevşek eşleşme
  // ("aydınlık yap", "karanlığa geç" de olur). "açık" iki anlamlı (aydınlık VE
  // herkese açık) olduğundan yalnız "açık tema/mod/görünüm" biçimini kabul et.
  const themeVerb = "(tema|temaya|mod|moda|görünüm|görünüme|yap|geç|çevir|ol|dön)";
  if (new RegExp(`(koyu|karanl[ıi][kğ])\\w*\\s*${themeVerb}|dark\\s*(theme|mode)`).test(text))
    out.push({ kind: "theme", value: "dark" });
  else if (
    new RegExp(`(aydınl[ıi][kğ]|beyaz)\\w*\\s*${themeVerb}|açık\\s*(tema|mod|görünüm)|light\\s*(theme|mode)`).test(text)
  )
    out.push({ kind: "theme", value: "light" });

  // Yaşayanları göster / gizle
  if (new RegExp(`(yaşayan|sağ olan)(lar)?[ıi]?\\s*${HIDE}|hide\\s+living`).test(text))
    out.push({ kind: "hideLiving", value: true });
  else if (new RegExp(`(yaşayan|sağ olan)(lar)?[ıi]?\\s*${SHOW}|show\\s+living`).test(text))
    out.push({ kind: "hideLiving", value: false });

  // Arkadaşları (çevre) göster / gizle
  if (new RegExp(`(arkadaş|dost|çevre)(ler|lar)?[ıiİ]?n?[ıi]?\\s*${HIDE}|hide\\s+(friends|associates)`).test(text))
    out.push({ kind: "showAssociates", value: false });
  else if (new RegExp(`(arkadaş|dost)(ler|lar)?[ıiİ]?n?[ıi]?\\s*${SHOW}|show\\s+(friends|associates)`).test(text))
    out.push({ kind: "showAssociates", value: true });

  // Dil
  if (/ingilizce(ye)?\s*(çevir|yap|geç|al|dön)|in\s+english|to\s+english|english['’]?e/.test(text))
    out.push({ kind: "lang", value: "en" });
  else if (/türkçe(ye)?\s*(çevir|yap|geç|al|dön)|in\s+turkish|to\s+turkish/.test(text))
    out.push({ kind: "lang", value: "tr" });

  // Herkese açık paylaşım
  if (/(herkese\s*açık.*payla[şs]|payla[şs][ıi]?m?\s*(yap|oluştur|aç|başlat|link|bağlant)|public\s*share|share\s*(link|publicly|the\s*tree)|bağlantı\s*(oluştur|yap))/.test(text))
    out.push({ kind: "share" });

  // Aile kitabı
  if (/(aile\s*)?kitab[ıi]?(n[ıi])?\s*(aç|göster|oku|getir)|open\s*(the\s*)?book|family\s*book/.test(text))
    out.push({ kind: "book" });

  // Kişi ekle
  if (/(yeni\s*)?kişi\s*ekle|birini?\s*ekle|add\s*(a\s*)?person|new\s*person/.test(text))
    out.push({ kind: "addPerson" });

  // Görünüm aç (paylaşım/kitap/kişi-ekleyle çakışmasın diye en son)
  const v = matchView(text);
  if (v) out.push({ kind: "view", value: v });

  return out;
}
