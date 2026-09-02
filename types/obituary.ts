/**
 * Taziye / vefat duyurusu — ayrı bir nesne, `Person`'a dokunmaz.
 *
 * Neden ayrı: vefat kaydı ile duyuru aynı şey değildir. `Person.deathDate`
 * bir OLGUDUR; duyuru ise ailenin o an kurduğu bir metindir — cenaze nerede
 * kılınacak, taziye nerede kabul ediliyor, kimin adına yazıldı. Olgular kalıcı,
 * duyuru geçicidir: cenaze bitince duyurunun pratik ömrü biter ama kayıt
 * kalabilir. İkisini aynı nesnede tutmak, birinin düzenlenmesini öbürünün
 * düzenlenmesi hâline getirirdi.
 *
 * Kültürel olarak da en hassas yüzey: burada uydurma bir alan ("cenaze saati"
 * tahmini gibi) gerçek bir aileyi yanlış yere gönderebilir. O yüzden HİÇBİR
 * alan türetilmez, hepsi ailenin yazdığıdır.
 */
export interface Obituary {
  id: string;
  /** Kimin duyurusu — `Person.id`. */
  personId: string;
  /** Kişinin o günkü adı; kişi silinse de duyuru kimin olduğunu unutmasın. */
  personName: string;
  /** "YYYY-MM-DD" — vefat tarihi (aileden gelir, `deathDate`ten kopyalanabilir). */
  diedOn?: string;
  /** Cenaze namazı / töreni: yer ve zaman, serbest metin. */
  serviceAt?: string;
  serviceOn?: string;
  /** Defin yeri (duyuruda yazıldığı hâliyle). */
  burialAt?: string;
  /** Taziye kabul yeri ve günleri. */
  condolenceAt?: string;
  /** Ailenin metni — başsağlığı, dua, anma sözü. */
  message?: string;
  /**
   * Duyuruyu herkese açık paylaşım bağlantısında göstermek AÇIK bir seçimdir.
   * Varsayılan KAPALI: ölüm haberi, ailenin paylaşmayı seçmediği sürece
   * dışarı çıkmaz.
   */
  publicShare?: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface ObituaryBoard {
  obituaries: Obituary[];
  updatedAt: string;
}
