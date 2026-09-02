import type { Person } from "@/types/family";

/**
 * `Person` ALAN KAYIT DEFTERİ.
 *
 * Bugüne dek bir alan eklemek beş ayrı yeri elle güncellemek demekti:
 * `types/family.ts`, `PersonForm`, POST rotası, PUT rotası, `PersonDrawer`
 * (ve etiketi için `i18n-dict`). Beşinden biri unutulduğunda kimse fark
 * etmiyordu — alan sessizce kaydedilmiyor ya da gösterilmiyordu.
 *
 * Burası o beş yerin ORTAK KAYNAĞI. `tests/person-fields.test.mts` her
 * kayıtlı alanın gerçekten her yerde bulunduğunu, ve `Person`daki her alanın
 * ya kayıtlı ya da GEREKÇESİYLE dışarıda bırakıldığını denetler.
 *
 * Dosya bilerek bağımlılıksız (`@/` yalnız tür düzeyinde) — birim testi
 * koşulabilsin.
 */

/**
 * Bir alanın gelen gövdeyle nasıl birleştirileceği.
 *
 * · "text"  — metin. `undefined` = dokunma; `""`/`null` = TEMİZLE; değer = ayarla.
 * · "array" — dizi. Dizi geldiyse değiştir, gelmediyse dokunma.
 * · "bool"  — boolean. Yalnız gerçek boolean değiştirir.
 * · "obj"   — nesne (ör. koordinat, `parentLinks`). `null`/"" = temizle.
 *
 * "text"in kuralı önemli: eskiden bazı alanlar `body.x || mevcut` ile
 * birleşiyordu, yani boş bir değer eskisine geri düşüyordu ve alan HİÇ
 * TEMİZLENEMİYORDU. Tek bir kural, tek bir davranış.
 */
export type MergeKind = "text" | "array" | "bool" | "obj";

/** Alanın hangi düzenleme yüzeyinde göründüğü. */
export interface FieldSurfaces {
  /** `PersonForm`da bir girdisi var mı? */
  form: boolean;
  /** `PersonDrawer`da gösteriliyor mu? */
  drawer: boolean;
  /** i18n etiket anahtarı (varsa) — `form.field.<key>` kalıbı. */
  labelKey?: string;
}

export interface FieldSpec {
  key: keyof Person;
  merge: MergeKind;
  /** Gizlilik grubu (`PRIVATE_GROUPS`) — alan-bazlı gizlemeye giriyorsa. */
  privateGroup?: string;
  surfaces: FieldSurfaces;
}

const F = (
  key: keyof Person,
  merge: MergeKind,
  surfaces: Partial<FieldSurfaces> & { labelKey?: string } = {},
  privateGroup?: string
): FieldSpec => ({
  key,
  merge,
  privateGroup,
  surfaces: { form: surfaces.form ?? true, drawer: surfaces.drawer ?? true, labelKey: surfaces.labelKey },
});

/**
 * Kullanıcının doldurduğu alanlar. Sıra, `PersonForm`daki mantıksal sırayla
 * aynı tutuldu ki iki listeyi yan yana okumak kolay olsun.
 */
export const PERSON_FIELDS: readonly FieldSpec[] = [
  // NOT: etiket anahtarları iki kalıp taşıyor — `form.field.X` (birkaç alan)
  // ve `form.X` (çoğu). Tahmin etmek yerine sözlükteki GERÇEK anahtar yazıldı;
  // test ikisinin de var olduğunu denetliyor.
  //
  // `drawer: false` demek "çekmecede hiç yok" demek DEĞİL; "kendi anahtarıyla
  // görünmüyor" demek. Ad/soyad/lakap/baba adı çekmecede `fullName()` ile tek
  // satırda çizilir; koordinatlar haritaya gider; `privateFields` bir gösterim
  // alanı değil, gizlilik ayarıdır.
  F("firstName", "text", { drawer: false, labelKey: "form.field.firstName" }),
  F("lastName", "text", { drawer: false, labelKey: "form.field.lastName" }),
  F("gender", "text", { drawer: false, labelKey: "form.field.gender" }),
  F("nickname", "text", { drawer: false, labelKey: "form.nickname" }),
  F("patronymic", "text", { drawer: false, labelKey: "form.patronymic" }),
  F("orientation", "text", { labelKey: "form.orientation" }, "orientation"),
  F("birthDate", "text", { labelKey: "form.field.birthDate" }),
  F("officialBirthDate", "text", { labelKey: "form.field.officialBirthDate" }),
  F("deathDate", "text", { labelKey: "form.field.deathDate" }),
  F("birthPlace", "text", { labelKey: "form.birthPlace" }, "birthPlace"),
  F("birthCoords", "obj", { drawer: false }, "birthPlace"),
  F("religion", "text", { labelKey: "form.religion" }, "belief"),
  F("denomination", "text", { labelKey: "form.denomination" }, "belief"),
  F("language", "text", { labelKey: "form.language" }, "origin"),
  F("ethnicity", "text", { labelKey: "form.ethnicity" }, "origin"),
  F("nationality", "text", { labelKey: "form.nationality" }, "origin"),
  F("occupation", "text", {}),
  F("education", "text", { labelKey: "form.education" }),
  F("congenitalCondition", "text", { labelKey: "form.congenital" }, "health"),
  F("healthCondition", "text", { labelKey: "form.health" }, "health"),
  F("healthNote", "text", { form: false, labelKey: "form.healthNote" }, "health"),
  F("deathCause", "text", { labelKey: "form.deathCause" }, "health"),
  F("burialPlace", "text", {}, "burialPlace"),
  F("burialCoords", "obj", { drawer: false }, "burialPlace"),
  F("bio", "text", { labelKey: "form.bio" }, "story"),
  F("photo", "text", {}, "photo"),
  F("photos", "array", {}, "photo"),
  F("videos", "array", {}, "photo"),
  F("documents", "array", {}, "photo"),
  F("events", "array", { labelKey: "form.field.events" }, "events"),
  F("sources", "array", {}),
  F("memories", "array", {}, "memories"),
  F("associations", "array", {}),
  F("kind", "text", {}),
  F("publicVisibility", "text", { drawer: false }),
  F("confidential", "bool", {}),
  F("privateFields", "array", { drawer: false }),
  F("siblingOrder", "text", { form: false }),
];

/**
 * KAYIT DEFTERİ DIŞINDA bırakılanlar ve NEDENİ.
 *
 * Bu liste boş bir muafiyet listesi değil: yeni bir alan eklendiğinde test,
 * ya kayıt defterine ya da buraya gerekçesiyle yazılmasını zorlar. Sessizce
 * yarım bağlanmış bir alan kalamaz.
 */
export const EXCLUDED_FIELDS: Readonly<Record<string, string>> = {
  id: "Sistem alanı; kullanıcı dokunmaz.",
  code: "Sunucu üretir (`lib/code.ts`); gövdeden kabul edilmez.",
  placeholder: "Türetilmiş bayrak; ad girilince sunucuda düşer.",
  entrySource: "Kaydın nereden geldiği (içe aktarma/AI); kullanıcı alanı değil.",
  parentIds: "İlişki grafiği — kendi akışı var (eş/ebeveyn karşılıklılığı).",
  parentLinks: "İlişki grafiği; `parentIds` ile birlikte yürür.",
  spouseIds: "İlişki grafiği — karşı tarafı da güncellenir.",
  formerSpouseIds: "İlişki grafiği; `spouseIds` ile birlikte yürür.",
};

/** Anahtara göre alan tanımı. */
export function fieldSpec(key: string): FieldSpec | undefined {
  return PERSON_FIELDS.find((f) => f.key === key);
}

/** Bir gizlilik grubunun kapsadığı alanlar — `lib/privacy.ts` ile karşılaştırmak için. */
export function fieldsInGroup(group: string): string[] {
  return PERSON_FIELDS.filter((f) => f.privateGroup === group).map((f) => String(f.key));
}

type Body = Record<string, unknown>;

/** Tek bir alanın birleştirilmiş değeri. */
function mergeValue(spec: FieldSpec, incoming: unknown, current: unknown): unknown {
  if (incoming === undefined) return current;
  switch (spec.merge) {
    case "array":
      return Array.isArray(incoming) ? incoming : current;
    case "bool":
      return typeof incoming === "boolean" ? incoming : current;
    case "obj":
      // `null` / "" → temizle; nesne → ayarla; başka bir şey → dokunma.
      if (incoming === null || incoming === "") return undefined;
      return typeof incoming === "object" ? incoming : current;
    case "text":
    default:
      // "" ve `null` TEMİZLER. Eskiden `||` kullanılan alanlar burada
      // temizlenemiyordu; artık kural tek.
      if (incoming === null || incoming === "") return undefined;
      return incoming;
  }
}

/**
 * Var olan kişiyi gelen gövdeyle birleştirir (PUT).
 *
 * YALNIZ kayıt defterindeki alanlara dokunur; ilişki grafiği ve sistem
 * alanları çağıranda kalır. Gövdedeki tanınmayan anahtarlar yok sayılır —
 * istemcinin kaydına gizli alan ekleyebilmesi istenmez.
 */
export function mergePersonFields(existing: Person, body: Body): Partial<Person> {
  const out: Record<string, unknown> = {};
  for (const spec of PERSON_FIELDS) {
    const key = String(spec.key);
    const merged = mergeValue(spec, body[key], (existing as unknown as Body)[key]);
    if (merged !== undefined) out[key] = merged;
    else if (key in (existing as unknown as Body)) out[key] = undefined;
  }
  return out as Partial<Person>;
}

/** Yeni kişi için alanları gövdeden kurar (POST). Boşlar `undefined` kalır. */
export function buildPersonFields(body: Body): Partial<Person> {
  const out: Record<string, unknown> = {};
  for (const spec of PERSON_FIELDS) {
    const key = String(spec.key);
    const v = mergeValue(spec, body[key], undefined);
    if (v !== undefined) out[key] = v;
  }
  return out as Partial<Person>;
}
