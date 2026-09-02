/**
 * Aile tarifi — AYRI bir koleksiyon, `Person`'a alan olarak eklenmez.
 *
 * Nedeni yalnız dosya düzeni değil: bir tarif kişiye ait bir ALAN değil, kendi
 * başına duran bir kayıttır. Nine ölünce tarifi silinmez; iki kişiden birden
 * gelmiş olabilir, hiç kimseye bağlı olmayabilir (yörenin tarifi), ve kaydı
 * girenle tarifi getiren aynı kişi değildir. `Person` içine alan olarak
 * konsaydı bunların hiçbiri ifade edilemezdi.
 */
export interface Recipe {
  id: string;
  /** "Nine'nin mercimek çorbası" */
  title: string;
  /**
   * Tarif kimden geliyor — `Person.id`. Kişi ağaçtan silinse bile tarif
   * kalır; o yüzden ad ayrıca `fromName`de saklanır.
   */
  fromPersonId?: string;
  /** Kişinin o günkü adı. Bağ koparsa tarif "kimin" olduğunu unutmasın. */
  fromName?: string;
  /** Yöre — "Develi, Kayseri" */
  place?: string;
  /** Ne zaman pişirilir: bayram, kandil, kış, düğün, hıdrellez… */
  occasion?: string;
  /** "6 kişilik" — serbest metin; ölçü birimleri yörelere göre değişiyor. */
  servings?: string;
  /** Malzemeler, satır satır. */
  ingredients: string[];
  /** Yapılış adımları, sırayla. */
  steps: string[];
  /** "Nine tereyağını en sonda katardı." */
  note?: string;
  /** Cloudinary URL. */
  photo?: string;
  createdAt: string;
  updatedAt: string;
}

/** Bir ağacın tarif defteri — `recipes-<treeId>.json`. */
export interface RecipeBook {
  recipes: Recipe[];
  updatedAt: string;
}
