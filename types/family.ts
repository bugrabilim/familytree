/**
 * `other` — ikili olmayan / interseks kimlikler için.
 * `unknown` — kaydı bilinmeyen eski kuşaklar için. İkisi ayrı şeylerdir.
 */
export type Gender = "male" | "female" | "other" | "unknown";

/** Ebeveyn bağının türü. Belirtilmezse kan bağı varsayılır. */
export type ParentKind = "biological" | "adoptive" | "step" | "foster";

/**
 * İlişkinin kopukluğu ve kimin kopardığı.
 * Bağ silinmez — evlatlıktan reddedilen kişi de, reddedilen ebeveyn de
 * ağaçta durur; kopukluk yalnızca not düşülür.
 */
export type Estrangement = "by-parent" | "by-child" | "mutual";

export interface ParentLink {
  kind?: ParentKind;
  estranged?: Estrangement;
  /** "1999 depreminde ailesini kaybetti, teyzesi evlat edindi" gibi */
  note?: string;
}

export interface Person {
  id: string;
  firstName: string;
  lastName: string;
  gender: Gender;
  /**
   * Lakap — özellikle Soyadı Kanunu (1934) öncesi kuşaklarda: "Topal",
   * "Avcı", "Kör" gibi. Adın önünde gösterilir: "Topal Mehmed".
   */
  nickname?: string;
  /**
   * Baba adına dayalı anılma — soyadı olmayan eski kuşaklar için:
   * "Şaban oğlu", "Veli kızı". `lastName` boşsa soyad yerine gösterilir.
   */
  patronymic?: string;
  /**
   * Cinsel yönelim (isteğe bağlı, serbest metin): "Eşcinsel", "Biseksüel"…
   * Yalnızca kişi/aile kaydetmek isterse.
   */
  orientation?: string;
  birthDate?: string;
  deathDate?: string;
  birthPlace?: string;
  photo?: string;
  bio?: string;
  /* --- Kimlik ve aidiyet (hepsi isteğe bağlı) ---
     Soy ağaçlarında sıkça kaydedilen bilgiler. "ırk" yerine "etnik köken"
     kullanıyoruz: kayıtlarda karşılığı olan ve bugün doğru kabul edilen terim. */
  religion?: string;
  /** Mezhep / cemaat */
  denomination?: string;
  /** Ana dil — birden fazlaysa virgülle */
  language?: string;
  ethnicity?: string;
  /** Uyruk / vatandaşlık — göçmen kuşaklarda ayırt edici */
  nationality?: string;
  /**
   * Doğuştan gelen sağlık durumu / engellilik (Down sendromu, doğuştan görme
   * engeli, uzuv eksikliği…). Kalıtsal durumları izlemek isteyen aileler için.
   */
  congenitalCondition?: string;
  /**
   * Yaşarken edinilen sağlık sorunu (bel fıtığı, diyabet, çocuk felci…).
   * Doğuştan olandan ayrı tutulur; ikisi farklı şeylerdir.
   */
  healthCondition?: string;
  /** Ölüm nedeni. Yalnızca vefat edenlerde anlamlı. */
  deathCause?: string;
  /**
   * @deprecated Eski, ayrışmamış sağlık notu. Yeni kayıtlar
   * `congenitalCondition` / `healthCondition` kullanır; bu alan yalnızca
   * eski verilerle uyum için okunur.
   */
  healthNote?: string;

  parentIds: string[];
  /** Ebeveyn bağlarının niteliği. Anahtar: `parentIds` içindeki kimlik. */
  parentLinks?: Record<string, ParentLink>;
  /** Süregelen evlilikler. Aynı anda birden fazla olabilir. */
  spouseIds: string[];
  /** Boşanmayla biten evlilikler. Ortak çocuklar `parentIds` üzerinden korunur. */
  formerSpouseIds?: string[];
}

export interface FamilyData {
  people: Person[];
  updatedAt: string;
}

export const PARENT_KIND_LABELS: Record<Exclude<ParentKind, "biological">, string> = {
  adoptive: "Evlat edinen",
  step: "Üvey",
  foster: "Koruyucu aile",
};

export const ESTRANGEMENT_LABELS: Record<Estrangement, { child: string; parent: string }> = {
  // child: çocuğun kartında ebeveyn için ・ parent: ebeveynin kartında çocuk için
  "by-parent": { child: "Kendisini reddetti", parent: "Evlatlıktan reddedildi" },
  "by-child": { child: "Reddettiği ebeveyn", parent: "Kendisini reddetti" },
  mutual: { child: "İlişki kopuk", parent: "İlişki kopuk" },
};
