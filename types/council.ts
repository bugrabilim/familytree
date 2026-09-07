/**
 * AİLE MECLİSİ — aidat/katkı defteri, borç-alacak defteri, karar tutanağı.
 *
 * ## Bu dosyanın taşıdığı en önemli karar: PARA TAŞIMIYORUZ
 *
 * Burada tanımlı hiçbir tür bir ödeme, bakiye, cüzdan ya da kart taşımıyor —
 * ve bu bir eksiklik değil, tasarımın kendisi. Uygulama içinde para toplamak,
 * aktarmak ya da saklamak Türkiye'de 6493 sayılı kanun kapsamında **ödeme
 * hizmeti**dir ve BDDK/TCMB'den **ödeme kuruluşu lisansı** ister. Lisanssız
 * yapılması idari ve cezai sorumluluk doğurur; "sadece aracıyız", "sadece
 * kolaylık olsun diye" gibi gerekçeler bu tanımı değiştirmez.
 *
 * Bu yüzden burada tuttuğumuz şey bir **defter**tir:
 *
 *   · kim ne kadar **taahhüt** etti,
 *   · kim ne kadar ödediğini **beyan** etti (beyan = kullanıcının sözü;
 *     bizim doğruladığımız bir tahsilat DEĞİL),
 *   · kim kime borçlu,
 *   · meclis ne karar verdi.
 *
 * Paranın kendisi kullanıcının kendi bankasında, kendi IBAN'ıyla hareket
 * eder. Biz o hareketi ne başlatırız ne görürüz ne de saklarız.
 *
 * İleride biri "kullanıcı kolaylık olsun diye kartla ödesin" derse: o an
 * ürün, lisanslı bir ödeme kuruluşu olmak zorunda kalır. Bu bir kod
 * değişikliği değil, bir şirket kararıdır — ve bu dosyaya bir alan
 * eklenerek alınamaz. `tests/council-gate.test.mts` bunu kaynak düzeyinde
 * kilitliyor.
 *
 * ## IBAN neden YOK
 *
 * IBAN kişisel veridir (KVKK m.3 — belirli bir kişiyi tanımlar) ve bir de
 * finansal veridir: sızdığında doğrudan dolandırıcılık malzemesi. Onu
 * saklamanın bize kazandıracağı tek şey "ekranda görünsün" kolaylığıydı;
 * karşılığında ise saklama, erişim, silme ve ihlal bildirimi
 * yükümlülüklerinin tamamını üstlenirdik.
 *
 * Karar: **hiç saklamıyoruz.** Ağaç sahibi hesap bilgisini toplantıda,
 * WhatsApp'ta ya da kampanyanın açıklamasında kendisi paylaşır — ve
 * açıklama alanına yazılmaya çalışılan IBAN'lar `lib/council.ts`teki
 * `stripIban` ile metinden DÜŞÜRÜLÜR, yani "yazan yazar" boşluğu da açık
 * bırakılmıyor.
 *
 * ## Para neden kuruş cinsinden TAMSAYI
 *
 * `0.1 + 0.2 !== 0.3`. Kayan noktalı para hesabı, toplamların kuruş kuruş
 * kaymasıyla sonuçlanır ve bir aidat defterinde bu, "kim ne kadar kaldı"
 * sorusunun yanıtını yanlışlar. Tutarlar bu yüzden **kuruş** cinsinden
 * tamsayı; alan adlarının `Kurus` ile bitmesi kural (kapı testi zorluyor)
 * ki bir sonraki geliştirici lirayla kuruşu karıştırmasın.
 *
 * Para birimi de saklanıyor: kuruş tek başına "ne kadar" demek değil.
 */

/** Kuruş cinsinden TAMSAYI tutar. Asla ondalıklı sayı değil. */
export type Kurus = number;

export const CURRENCIES = ["TRY", "EUR", "USD", "GBP"] as const;
export type Currency = (typeof CURRENCIES)[number];

/**
 * Bir kampanyaya tek bir kişinin katkı satırı.
 *
 * `pledgedKurus` taahhüt, `paidKurus` ise ÖDENDİĞİ BEYAN EDİLEN tutar.
 * İkisinin ayrı olması şart: defterin bütün bilgi değeri "söz verildi ama
 * henüz gelmedi" farkında.
 */
export interface Pledge {
  id: string;
  /** Ağaçtaki kişi (varsa). Ad ekrana `view()`den geçerek çıksın diye id. */
  personId?: string;
  /** Ağaçta olmayan katkı sahibi için serbest ad (gelin tarafı, komşu…). */
  name: string;
  pledgedKurus: Kurus;
  /** Kullanıcı BEYANI — bizim doğruladığımız bir tahsilat değil. */
  paidKurus: Kurus;
  /** Beyanın yapıldığı gün ("YYYY-MM-DD"). */
  paidAt?: string;
  note?: string;
  createdAt: string;
  updatedAt: string;
}

export interface Campaign {
  id: string;
  title: string;
  /** "Dede için mezar taşı", "2026 aile buluşması"… */
  purpose?: string;
  /** Hedef tutar; 0 = hedefsiz (açık uçlu yardımlaşma). */
  targetKurus: Kurus;
  currency: Currency;
  /**
   * Kampanya kapandı mı. Kapalıyken yeni katkı satırı yazılamaz.
   *
   * Karar tutanağının aksine bu GERİ ALINABİLİR: bir defter, yanlışlıkla
   * kapatıldığında yeniden açılabilmeli. Tutanakta durum tersi (aşağıya bak).
   */
  closed: boolean;
  pledges: Pledge[];
  createdAt: string;
  updatedAt: string;
}

/**
 * Aile bireyleri arasındaki basit borç-alacak kaydı.
 *
 * Yine yalnız KAYIT: ne bir tahsilat, ne bir icra takibi, ne de hukuki bir
 * senet. "Amcam düğünde 5.000 TL vermişti" cümlesinin, unutulmayacak bir
 * yere yazılmış hâli.
 */
export interface Debt {
  id: string;
  /** Borçlu. */
  fromName: string;
  fromPersonId?: string;
  /** Alacaklı. */
  toName: string;
  toPersonId?: string;
  amountKurus: Kurus;
  currency: Currency;
  /**
   * Borcun doğduğu gün ("YYYY-MM-DD"). İSTEĞE BAĞLI: aile defterlerinin
   * çoğu "geçen düğünde" diye başlar; tarihi zorunlu kılmak, tarihi
   * hatırlamayan kullanıcıyı uydurmaya iter ve kayıt yanlış olur.
   */
  on?: string;
  note?: string;
  /** Kapandığı an (ISO). Yoksa borç açık. */
  settledAt?: string;
  createdAt: string;
  updatedAt: string;
}

export type Vote = "evet" | "hayir" | "cekimser";
export const VOTES: readonly Vote[] = ["evet", "hayir", "cekimser"];

/** Tek bir üyenin oyu. Bir üye bir kez oy verir; değiştirirse satır GÜNCELLENİR. */
export interface Ballot {
  id: string;
  /** Oy verenin kimliği (`TreeContext.authorId`) — tek kişi tek oy. */
  voterId: string;
  /** Tutanakta görünecek ad. Boşsa arayüz rolüne göre bir etiket gösterir. */
  voterName: string;
  vote: Vote;
  at: string;
}

export type Outcome = "kabul" | "ret" | "esitlik";

/**
 * Meclis kararı — açıldığında bir gündem, kapandığında bir TUTANAK.
 *
 * ## Kapandıktan sonra DEĞİŞTİRİLEMEZ
 *
 * Bir meclis kararının bütün değeri değiştirilemezliğindedir. Sonradan
 * düzeltilebilen bir tutanak, tutanak değil taslaktır: "biz buna karar
 * vermiştik" diyen kişinin dayanağı kalmaz. Bu yüzden `closedAt` yazıldığı
 * an başlık, açıklama, oylar ve sonuç donar; silme de kapalıdır.
 *
 * Alternatif "değişikliğe izin ver ama iz bırak" tasarımıydı; seçilmedi,
 * çünkü izli değişiklik hâlâ tartışma açar ("neden değiştirdin?") ve bu
 * ürünün çözmesi gereken sorun tam olarak o tartışmayı gereksiz kılmak.
 * Yanlış kapanan bir karar için doğru yol, YENİ bir karar açmak.
 */
export interface Decision {
  id: string;
  title: string;
  detail?: string;
  ballots: Ballot[];
  /** Kapanış anı (ISO). Doluysa kayıt DONMUŞTUR. */
  closedAt?: string;
  /** Kapanışta hesaplanıp DONDURULAN sonuç. */
  outcome?: Outcome;
  createdAt: string;
  updatedAt: string;
}

export interface CouncilBox {
  campaigns: Campaign[];
  debts: Debt[];
  decisions: Decision[];
  /** Kayıp yazma koruması ve iyimser kilidin dayanağı. */
  updatedAt: string;
}
