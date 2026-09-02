/**
 * Zaman kilitli mektup — açılma tarihi gelene kadar İÇERİĞİ kimseye
 * gösterilmeyen kayıt.
 *
 * Ayrı bir koleksiyon (`letters-<treeId>.json`), `Person`'a alan değil: bir
 * mektubun kendi yazarı, kendi alıcısı ve kendi kilit tarihi vardır; kişi
 * kaydının bir özelliği değildir.
 */
export interface Letter {
  id: string;
  /** "Torunuma, 18 yaşına girdiğinde" — kilitliyken de GÖRÜNÜR. */
  title: string;
  /** Kim yazdı — `Person.id`. */
  fromPersonId?: string;
  /** Yazanın o günkü adı; kişi silinse de mektup kimden geldiğini unutmasın. */
  fromName?: string;
  /** Kime — `Person.id`. Boşsa "aileye". */
  toPersonId?: string;
  toName?: string;
  /** "YYYY-MM-DD" — bu tarihe kadar `body` KİMSEYE gönderilmez. */
  opensOn: string;
  /**
   * Mektubun metni.
   *
   * Bu alan sunucudan yalnız kilit açıldıktan sonra çıkar. Kilitliyken API
   * onu yanıttan tamamen ÇIKARIR — boş dize olarak değil, alan hiç
   * bulunmayacak şekilde. Bu yüzden isteğe bağlı.
   */
  body?: string;
  createdAt: string;
  updatedAt: string;
}

/** Bir ağacın mektup kutusu — `letters-<treeId>.json`. */
export interface LetterBox {
  letters: Letter[];
  updatedAt: string;
}
