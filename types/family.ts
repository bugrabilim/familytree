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

/**
 * Yaşam olayı — kişinin ömründeki tekil bir an (evlilik, mezuniyet, göç…).
 * `bio` serbest metin iken bunlar yapısal ve zaman çizelgesinde sıralanır.
 */
export interface LifeEvent {
  id: string;
  /** "YYYY" | "YYYY-MM" | "YYYY-MM-DD" — `birthDate` ile aynı depolama biçimi */
  date?: string;
  /** `LIFE_EVENT_TYPES` anahtarı ya da serbest metin */
  type: string;
  /** Kısa etiket, ör. "İlkokul mezuniyeti" */
  title: string;
  place?: string;
  note?: string;
}

/**
 * Kaynak / atıf — "bu bilgiyi nereden biliyoruz?". Belge, fotoğraf, nüfus
 * kaydı, mezar taşı, sözlü anlatım, kitap… Kişinin bilgisini dayandırdığı yer.
 */
export interface Source {
  id: string;
  /** "1927 Nüfus Sayımı", "Mezar taşı", "Dedemin anlatımı" */
  title: string;
  /** `SOURCE_KINDS` anahtarı ya da serbest metin */
  kind?: string;
  /** İsteğe bağlı bağlantı */
  url?: string;
  /** İsteğe bağlı ayrıntı / atıf metni */
  note?: string;
}

/**
 * Anı / hikâye — rehberli bir soruya yanıt ya da serbest bir hatıra. Metin
 * ve/veya sesli kayıt taşıyabilir. "Kuru veri"yi aile hikâyesine çevirir.
 */
export interface Memory {
  id: string;
  /** Rehberli soru: `MEMORY_PROMPTS` anahtarı ya da serbest metin. Boş olabilir. */
  prompt?: string;
  /** Yazılı yanıt / hatıra metni. */
  text?: string;
  /** Sesli anı — Cloudinary URL (ses "video" kaynağı olarak yüklenir). */
  audio?: string;
  /** "YYYY" | "YYYY-MM" | "YYYY-MM-DD" — anının ilgili olduğu tarih (isteğe bağlı). */
  date?: string;
}

/**
 * Çevre bağı — aile üyesi OLMAYAN bir yakınla (arkadaş, komşu, vasi, kirve,
 * öğretmen…) kurulan bağ. Kan/evlilik değildir; soy ağacı ve akrabalık
 * hesaplarına KATILMAZ, yalnız kişinin "yakın çevresi"nde gösterilir.
 */
export interface Association {
  id: string;
  /** Bağlı kişinin id'si. Genelde bir "çevre" kişisi, ama üye de olabilir. */
  personId: string;
  /** `ASSOCIATION_TYPES` anahtarı ya da serbest metin. */
  type: string;
  note?: string;
}

export interface Person {
  id: string;
  /**
   * Kişi türü: "uye" (kan/evlilik bağıyla soy ağacında yer alan aile üyesi) ya
   * da "cevre" (aile üyesi olmayan yakın: arkadaş, komşu, vasi…). Belirtilmezse
   * "uye" sayılır. "cevre" kişileri soy ağacı, kuşak, kan derecesi, istatistik
   * ve ilişki matrisi hesaplarına KATILMAZ; yalnız bağlı olduğu kişinin
   * yakın çevresinde ve "Çevre" görünümünde görünür.
   */
  kind?: "uye" | "cevre";
  /** Yakın çevre bağları — aile-dışı yakınlarla (drawer'da çift yönlü gösterilir). */
  associations?: Association[];
  /**
   * İnsan-okur benzersiz kimlik: 6 haneli, "289" ile başlar (289001…).
   * Kartlarda gösterilir. İç `id`'den ayrıdır; kalıcı ve paylaşılabilir.
   */
  code?: string;
  firstName: string;
  lastName: string;
  gender: Gender;
  /**
   * Lakap — özellikle Soyadı Kanunu (1934) öncesi kuşaklarda: "Topal",
   * "Avcı", "Kör" gibi. Adın önünde gösterilir: "Topal Mehmed".
   */
  /**
   * Başlangıç iskeleti kartı — yeni kullanıcıya doldurulacak boş kartlar
   * (anne, baba, dede, babaanne…) gösterilirken hangi rolü temsil ettiğini
   * tutar. Ad girilince temizlenir; yalnızca görüntü etiketi içindir.
   */
  placeholder?: string;
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
  /**
   * Nüfusa göre (resmi) doğum tarihi — eski kuşaklarda gerçek doğum tarihinden
   * (`birthDate`) sık sık farklıdır (geç tescil, askerlik/okul için düzeltme…).
   * `birthDate` ile aynı depolama biçimi. Yaş/ağaç/zaman çizelgesi GERÇEK
   * tarihi (`birthDate`) kullanır; bu yalnız kayıt olarak tutulur/gösterilir.
   */
  officialBirthDate?: string;
  deathDate?: string;
  birthPlace?: string;
  /**
   * Doğum yeri koordinatı — haritada ELLE seçilmiş/düzeltilmiş konum. Aynı adlı
   * köy/mahalle/ilçe karışıklığında (coğrafi kodlama yanlış yeri seçince) doğru
   * noktayı işaretlemek için. Yalnızca konumu değiştirir; `birthPlace` METNİ
   * değişmez. Varsa harita bu koordinatı, coğrafi kodlamaya tercih eder.
   */
  birthCoords?: { lat: number; lng: number };
  photo?: string;
  /**
   * Galeri — kişiye ait birden çok fotoğrafın URL listesi. `photo` alanı
   * kapak (avatar) olarak kalır; geri uyumluluk için ayrı tutulur. Galeriden
   * herhangi bir fotoğraf kapak yapılabilir.
   */
  photos?: string[];
  /** Video kayıtları — Cloudinary URL listesi (anlatım, kutlama, röportaj…). */
  videos?: string[];
  /** Belge / el yazısı taramaları — Cloudinary URL listesi (mektup, nüfus, vasiyet…). */
  documents?: string[];
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
  /** Meslek / uğraş — "Öğretmen", "Balıkçı", "Terzi"… (isteğe bağlı) */
  occupation?: string;
  /**
   * Eğitim seviyesi — okul adı DEĞİL, seviye. `EDUCATION_LEVELS` anahtarlarından
   * biri (ör. "lisans"); dil-bağımsız saklanır, ekranda çevrilir. İçe aktarımdan
   * gelen serbest metin de olabilir (o zaman olduğu gibi gösterilir).
   */
  education?: string;
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
  /** Defin / mezar yeri — serbest adres metni. Yalnız vefat edenlerde anlamlı. */
  burialPlace?: string;
  /** Defin yeri koordinatı — haritada seçilen konum (enlem/boylam). */
  burialCoords?: { lat: number; lng: number };
  /**
   * @deprecated Eski, ayrışmamış sağlık notu. Yeni kayıtlar
   * `congenitalCondition` / `healthCondition` kullanır; bu alan yalnızca
   * eski verilerle uyum için okunur.
   */
  healthNote?: string;

  /**
   * Gizli kayıt. İşaretliyse görüntü katmanında (yaşıyor/vefat fark etmeksizin)
   * her zaman maskelenir. Yalnızca ekranda etkilidir; veri, API ve GEDCOM
   * aktarımı bundan etkilenmez.
   */
  /**
   * HERKESE AÇIK paylaşımda bu kişiye ne olacağı. Belirtilmezse görünür.
   *
   * `confidential`den farkı kapsamı: `confidential` her yerde, aile içinde
   * DE maskeler. Bu alan yalnız girişsiz paylaşım bağlantısını (`/g/<jeton>`)
   * ilgilendirir — aile kendi ağacında kişiyi olduğu gibi görmeye devam eder.
   *
   * · "bulanik" — kart durur, kimlik gitmez. Ağacın ŞEKLİ bozulmaz: kişinin
   *   çocukları köksüz kalmaz, kuşaklar kaymaz.
   * · "gizli"   — kişi paylaşılan veriden tamamen çıkarılır ve ona yapılan
   *   tüm başvurular temizlenir. Bunun bir bedeli var: yalnız bu kişiden
   *   bağlanan çocuklar paylaşımda kök gibi görünür. Şeklin korunması
   *   isteniyorsa "bulanik" seçilmeli.
   */
  publicVisibility?: "gizli" | "bulanik";
  confidential?: boolean;

  /**
   * Alan-bazlı gizlilik (ince ayrım): burada listelenen `PRIVATE_GROUPS`
   * anahtarlarına karşılık gelen hassas alanlar, kişi tümüyle maskeli olmasa
   * bile görüntü katmanında herkesten gizlenir. Yalnızca ekranda etkilidir;
   * ham veri, API ve GEDCOM etkilenmez.
   */
  privateFields?: string[];

  parentIds: string[];
  /**
   * Kardeşler arası görüntü sırası (manuel). Aynı ebeveyn kümesini paylaşan
   * kardeşler bu değere göre sıralanır; yoksa doğum tarihine, o da yoksa ada
   * göre. Yalnız `/api/family/reorder` ile atanır (bkz. `lib/siblings.ts`).
   */
  siblingOrder?: number;
  /** Ebeveyn bağlarının niteliği. Anahtar: `parentIds` içindeki kimlik. */
  parentLinks?: Record<string, ParentLink>;
  /** Süregelen evlilikler. Aynı anda birden fazla olabilir. */
  spouseIds: string[];
  /** Boşanmayla biten evlilikler. Ortak çocuklar `parentIds` üzerinden korunur. */
  formerSpouseIds?: string[];

  /** Yapısal yaşam olayları — drawer'da zaman çizelgesi olarak gösterilir. */
  events?: LifeEvent[];

  /** Kaynaklar / atıflar — bilginin nereden bilindiği. */
  sources?: Source[];

  /** Anılar / hikâyeler — rehberli soru yanıtları ve sesli kayıtlar. */
  memories?: Memory[];

  /**
   * Bu kartın nasıl/hangi yöntemle eklendiği (köken/iz). Kullanıcı "bu bilgi
   * nereden geldi?" diye sorabilsin diye tutulur; drawer'da gösterilir.
   * - "manuel": elle eklendi
   * - "ai": yapay zekâ ile dosyadan çıkarıldı (e-Devlet/nüfus/foto…)
   * - "gedcom": GEDCOM/CSV/JSON içe aktarma
   * - "iskelet": başlangıç iskeleti (boş kart)
   * - "pair"|"davet": eşleştirme/davet akışıyla
   * Serbest metin de olabilir (ör. dosya adı eklenmiş "ai: nufus.pdf").
   */
  entrySource?: string;
}

export interface FamilyData {
  people: Person[];
  updatedAt: string;
  /** Aile Kitabı kapağına header olarak konan fotoğraf (Cloudinary URL). */
  coverPhoto?: string;
}

/**
 * Yaşam olayı türleri — Türkçe etiket + emoji simge. Anahtar, `LifeEvent.type`
 * alanında saklanır; listede olmayan (serbest metin) türler de geçerlidir.
 */
export const LIFE_EVENT_TYPES: Record<string, { label: string; icon: string }> = {
  evlilik: { label: "Evlilik", icon: "💍" },
  bosanma: { label: "Boşanma", icon: "💔" },
  cocuk: { label: "Çocuk doğumu", icon: "👶" },
  mezuniyet: { label: "Mezuniyet", icon: "🎓" },
  is: { label: "İş / kariyer", icon: "💼" },
  "goc-tasinma": { label: "Göç / taşınma", icon: "🧳" },
  askerlik: { label: "Askerlik", icon: "🎖️" },
  hastalik: { label: "Hastalık", icon: "🏥" },
  odul: { label: "Ödül", icon: "🏆" },
  diger: { label: "Diğer", icon: "✨" },
};

/**
 * Çevre bağı türleri — Türkçe etiket + emoji simge. Anahtar, `Association.type`
 * alanında saklanır; listede olmayan (serbest metin) türler de geçerlidir.
 */
export const ASSOCIATION_TYPES: Record<string, { label: string; icon: string }> = {
  arkadas: { label: "Arkadaş", icon: "🤝" },
  yakinarkadas: { label: "Yakın arkadaş", icon: "❤️" },
  komsu: { label: "Komşu", icon: "🏘️" },
  ailedostu: { label: "Aile dostu", icon: "🫂" },
  kirve: { label: "Kirve", icon: "🎗️" },
  vasi: { label: "Vasi", icon: "🛡️" },
  ogretmen: { label: "Öğretmen", icon: "📚" },
  ogrenci: { label: "Öğrenci", icon: "✏️" },
  isortagi: { label: "İş ortağı", icon: "💼" },
  meslektas: { label: "Meslektaş", icon: "🧑‍💼" },
  diger: { label: "Diğer", icon: "✨" },
};

/**
 * Kaynak türleri — Türkçe etiket + emoji simge. Anahtar, `Source.kind`
 * alanında saklanır; listede olmayan (serbest metin) türler de geçerlidir.
 */
export const SOURCE_KINDS: Record<string, { label: string; icon: string }> = {
  belge: { label: "Belge", icon: "📄" },
  nufus: { label: "Nüfus kaydı", icon: "🗂️" },
  foto: { label: "Fotoğraf", icon: "🖼️" },
  mezar: { label: "Mezar taşı", icon: "🪦" },
  kitap: { label: "Kitap", icon: "📚" },
  sozlu: { label: "Sözlü anlatım", icon: "🗣️" },
  web: { label: "Web", icon: "🔗" },
  diger: { label: "Diğer", icon: "✨" },
};

/**
 * Alan-bazlı gizlilik grupları (Madde 5). Her grup, ekranda birlikte gizlenen
 * bir veya daha çok hassas alana karşılık gelir. `Person.privateFields` bu
 * anahtarları taşır; eşleme `lib/privacy.ts`'tedir. Etiketler i18n `private.*`.
 */
export const PRIVATE_GROUPS = [
  "story",       // bio / hikâye
  "health",      // doğuştan + sonradan sağlık + ölüm nedeni
  "photo",       // fotoğraf + galeri
  "orientation", // cinsel yönelim
  "memories",    // anılar
  "birthPlace",  // doğum yeri + elle işaretlenmiş koordinatı
  "burialPlace", // defin yeri + koordinatı
  "belief",      // din + mezhep — KVKK'da özel nitelikli
  "origin",      // etnik köken + uyruk + ana dil — KVKK'da özel nitelikli
  "events",      // yaşam olayları
] as const;

/**
 * Eğitim seviyeleri — düşükten yükseğe sıralı anahtarlar. Anahtar `education`
 * alanında saklanır; etiketler dile göre `education.<anahtar>` sözlüğünden
 * gelir (okul adı değil, evrensel seviye). Serbest metin de geçerlidir.
 */
export const EDUCATION_LEVELS = [
  "ilkokul",
  "ortaokul",
  "lise",
  "onlisans",
  "lisans",
  "lisansustu",
  "doktora",
  "profesor",
] as const;

/**
 * Rehberli anı soruları — anahtarlar. Etiketler dile göre `memoryPrompt.<anahtar>`
 * sözlüğünden gelir. Kişinin hikâyesini çıkarmak için ipuçları; serbest anı da
 * eklenebilir.
 */
export const MEMORY_PROMPTS = [
  "childhood",
  "firstHome",
  "proudest",
  "tradition",
  "hardship",
  "love",
  "work",
  "advice",
] as const;

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
