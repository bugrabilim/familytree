import "server-only";
import { supabaseAdmin, isSupabaseConfigured } from "@/lib/supabase";
import type { FamilyData, Person } from "@/types/family";
import type { Invite, Member, User } from "@/types/user";
import { pickVersion } from "@/lib/version-stamp";

/**
 * Postgres (Supabase) veri katmanı — Faz 2.
 *
 * Şimdilik YALNIZ yazma (göç) ve doğrulama içindir; uygulama hâlâ Blob'dan
 * okuyup yazıyor. Okuma yolu ileride (çift-yazma sonrası) buraya çevrilecek.
 * Tüm çağrılar servis-rolü istemcisiyle sunucudan yapılır (RLS atlanır);
 * yetki denetimi çağıran rotalarda.
 */

export interface TreeRow {
  treeId: string;
  ownerAccount: string;
  name: string;
  isHome: boolean;
  createdAt?: string;
}

/**
 * `stamp` — satıra yazılacak sürüm damgası.
 *
 * Verilmezse "şimdi" kullanılıyordu ve bu, iyimser kilidi sessizce kırıyordu:
 * kaydetme yolu Blob'a `data.updatedAt` yazıp o değeri istemciye `version`
 * olarak veriyor, ama aynaya basılan satırlar BİRKAÇ MİLİSANİYE SONRAKİ bir
 * damga taşıyordu. Okuma yolundaki jeton ikisinin BÜYÜĞÜ olduğu için
 * (`pickVersion`) sonuç hep kişi damgası oluyordu — yani istemcinin elindeki
 * sürüm daha doğduğu anda bayattı ve arka arkaya yapılan her ikinci yazma
 * "ağaç başka bir yerde değişti" diye 409 yiyordu.
 *
 * Çağıran damgayı geçirdiğinde Blob ile Postgres AYNI değeri taşıyor ve
 * jeton tam olarak istemciye dönen değere eşitleniyor.
 */
function personToRow(treeId: string, p: Person, stamp?: string) {
  return {
    tree_id: treeId,
    person_id: p.id,
    first_name: p.firstName ?? "",
    last_name: p.lastName ?? "",
    gender: p.gender ?? "unknown",
    birth_date: p.birthDate ?? null,
    death_date: p.deathDate ?? null,
    sibling_order: p.siblingOrder ?? null,
    data: p, // tam Person nesnesi (kayıpsız)
    updated_at: stamp ?? new Date().toISOString(),
  };
}

/** Ağaç satırını ekle/güncelle (id çakışmasında günceller). */
export async function dbUpsertTree(t: TreeRow): Promise<void> {
  const { error } = await supabaseAdmin()
    .from("trees")
    .upsert(
      {
        id: t.treeId,
        owner_account: t.ownerAccount,
        name: t.name,
        is_home: t.isHome,
        ...(t.createdAt ? { created_at: t.createdAt } : {}),
      },
      { onConflict: "id" }
    );
  if (error) throw new Error(`trees upsert: ${error.message}`);
}

/** Ağacın kişilerini Postgres'e tam kopyala (önce temizle, sonra ekle). İdempotent. */
export async function dbReplacePeople(
  treeId: string,
  people: Person[],
  /** Satırlara yazılacak damga — bkz. `personToRow`. */
  stamp?: string
): Promise<number> {
  const sb = supabaseAdmin();
  const del = await sb.from("people").delete().eq("tree_id", treeId);
  if (del.error) throw new Error(`people delete: ${del.error.message}`);
  if (people.length === 0) return 0;
  const rows = people.map((p) => personToRow(treeId, p, stamp));
  // Büyük ağaçlarda tek istek şişmesin diye parça parça ekle.
  const CHUNK = 500;
  for (let i = 0; i < rows.length; i += CHUNK) {
    const { error } = await sb.from("people").insert(rows.slice(i, i + CHUNK));
    if (error) throw new Error(`people insert: ${error.message}`);
  }
  return people.length;
}

/** Yalnız verilen kişileri ekle/güncelle (hedefli — tam yenileme yerine). */
export async function dbUpsertPeople(
  treeId: string,
  people: Person[],
  /** Satırlara yazılacak damga — bkz. `personToRow`. */
  stamp?: string
): Promise<number> {
  if (people.length === 0) return 0;
  const rows = people.map((p) => personToRow(treeId, p, stamp));
  const { error } = await supabaseAdmin()
    .from("people")
    .upsert(rows, { onConflict: "tree_id,person_id" });
  if (error) throw new Error(`people upsert: ${error.message}`);
  return people.length;
}

/** Verilen kişi kimliklerini sil (hedefli). */
export async function dbDeletePeople(treeId: string, personIds: string[]): Promise<number> {
  if (personIds.length === 0) return 0;
  const { error } = await supabaseAdmin()
    .from("people")
    .delete()
    .eq("tree_id", treeId)
    .in("person_id", personIds);
  if (error) throw new Error(`people delete (targeted): ${error.message}`);
  return personIds.length;
}

/** Ağacın üyelerini Postgres'e tam kopyala. İdempotent. */
export async function dbReplaceMembers(treeId: string, members: Member[]): Promise<number> {
  const sb = supabaseAdmin();
  const del = await sb.from("tree_members").delete().eq("tree_id", treeId);
  if (del.error) throw new Error(`members delete: ${del.error.message}`);
  if (members.length === 0) return 0;
  const rows = members.map((m) => ({
    id: m.id,
    tree_id: treeId,
    display_name: m.displayName,
    password_hash: m.passwordHash,
    role: m.role,
    /*
     * GİRİŞ ADI da aynalanıyor.
     *
     * Alan sonradan eklendi (`lib/username.ts`) ve ayna güncellenmemişti:
     * üye Blob'da adıyla vardı, Postgres'te adsızdı. Bugün zararsız — okuma
     * yolu üyeleri hâlâ Blob'dan çözüyor — ama Faz 3'ün varış noktası
     * okumayı Postgres'e çevirmek, ve o gün her üye giriş adını KAYBEDERDİ:
     * adıyla giriş yapan herkes "böyle bir üye yok" görürdü ve sebebi
     * aylar önce yazılmış bu satırda olurdu.
     *
     * `?? null`: alan yoksa sütun boş kalıyor. Boş dize YAZILMIYOR — şemadaki
     * benzersizlik indeksi `username is not null` ile sınırlı ve boş dize
     * "adsız" değil, "adı boş dize olan" demek olurdu; iki adsız üye
     * çakışırdı.
     */
    username: m.username ?? null,
    joined_at: m.joinedAt,
  }));
  const { error } = await sb.from("tree_members").insert(rows);
  if (error) throw new Error(`members insert: ${error.message}`);
  return members.length;
}

/** Ağacın davetlerini Postgres'e tam kopyala. İdempotent. */
export async function dbReplaceInvites(treeId: string, invites: Invite[]): Promise<number> {
  const sb = supabaseAdmin();
  const del = await sb.from("tree_invites").delete().eq("tree_id", treeId);
  if (del.error) throw new Error(`invites delete: ${del.error.message}`);
  if (invites.length === 0) return 0;
  const rows = invites.map((iv) => ({
    tree_id: treeId,
    token_hash: iv.tokenHash,
    role: iv.role,
    created_by: iv.createdBy,
    created_at: iv.createdAt,
    expires_at: iv.expiresAt,
    used_at: iv.usedAt ?? null,
  }));
  const { error } = await sb.from("tree_invites").insert(rows);
  if (error) throw new Error(`invites insert: ${error.message}`);
  return invites.length;
}

/** Ağaç adını güncelle (çift-yazma). */
export async function dbRenameTree(treeId: string, name: string): Promise<void> {
  const { error } = await supabaseAdmin().from("trees").update({ name }).eq("id", treeId);
  if (error) throw new Error(`trees rename: ${error.message}`);
}

/** Ağacı sil (çift-yazma). people/members/invites FK cascade ile silinir. */
export async function dbDeleteTree(treeId: string): Promise<void> {
  const { error } = await supabaseAdmin().from("trees").delete().eq("id", treeId);
  if (error) throw new Error(`trees delete: ${error.message}`);
}

/**
 * HESABI ve ona bağlı HER ŞEYİ Postgres'ten siler.
 *
 * FK CASCADE'E GÜVENİLMİYOR ve bu bilinçli: `trees.owner_account` hesabı
 * işaret ediyor ama YABANCI ANAHTAR DEĞİL (bkz. supabase/schema.sql). Yani
 * `accounts` satırını silmek ağaçlarını silmez; ağaçlar açıkça siliniyor —
 * onların altındaki `people` / `tree_members` / `tree_invites` ise gerçekten
 * cascade ile gidiyor.
 *
 * Bu tam olarak yaşanmış bir hata: kaldırılan misafir girişinden arta kalan
 * yetim bir `accounts` satırı depoda öylece kaldı. Yaşam döngüsünün sonu
 * yazılmadığında ortaya çıkan şey budur.
 *
 * `rate_limits` ayrıca temizleniyor: anahtarların içinde hesap kimliği geçiyor
 * (`ai:chat:<accountId>` gibi) ve satırlar kendiliğinden düşmüyor.
 */
export async function dbDeleteAccount(accountId: string): Promise<void> {
  const sb = supabaseAdmin();

  // 1) Ağaçlar (people/members/invites cascade ile birlikte gider).
  const trees = await sb.from("trees").delete().eq("owner_account", accountId);
  if (trees.error) throw new Error(`trees delete (owner): ${trees.error.message}`);

  // 2) Hesabın kendisi.
  const acc = await sb.from("accounts").delete().eq("id", accountId);
  if (acc.error) throw new Error(`accounts delete: ${acc.error.message}`);
}

/**
 * Kimliği ANAHTARININ İÇİNDE geçen hız-sınırı satırlarını siler.
 *
 * Anahtarlar `<alan>:<accountId>` ya da `<alan>:<accountId>:<ip>` biçiminde
 * (`lib/rate-limit.ts` çağıranları). Kimlik bir UUID olduğu için `like`
 * kalıbının yanlış satır yakalama ihtimali yok denecek kadar düşük; yine de
 * hata BEST-EFFORT sayılmalı — artakalan bir kova satırı zararsızdır, oysa
 * silmeyi bunun yüzünden durdurmak değil.
 */
export async function dbDeleteRateLimitsFor(id: string): Promise<void> {
  if (!id) return;
  const { error } = await supabaseAdmin().from("rate_limits").delete().like("key", `%${id}%`);
  if (error) throw new Error(`rate_limits delete: ${error.message}`);
}

/**
 * Ağacın sürüm damgasını ilerlet (`trees.updated_at`).
 *
 * Kaydetme yolunun aynası kişileri yazıyor ama ağacın KENDİ damgası yoktu;
 * sürüm jetonu kişilerden türetildiği için bir silme jetonu geriye
 * götürüyordu (ayrıntı: `lib/version-stamp.ts`). Bu çağrı, jetonu kişi
 * satırlarından bağımsız kılar — silme ve yalnız-kapak gibi kişi damgasına
 * hiç dokunmayan kayıtlar da jetonu ilerletir.
 *
 * Ağaç satırı Postgres'te yoksa hiçbir satır eşleşmez ve sessizce geçer:
 * henüz göç etmemiş ağaç zaten Blob'dan okunuyor.
 */
/**
 * Ağacın sürüm damgasını yazar.
 *
 * `null` KABUL EDİYOR ve bu bir kolaylık değil, bir gereklilik: çift-yazma
 * aynası yarıda kaldığında damga GERİYE alınıyor (`lib/blob.ts`) ki yarım
 * ayna güncel görünmesin. Ağacın hiç damgası yoksa (sütun sonradan eklendi)
 * geri alınacak değer de yok — o zaman temizleniyor.
 */
export async function dbSetTreeUpdatedAt(treeId: string, iso: string | null): Promise<void> {
  const { error } = await supabaseAdmin().from("trees").update({ updated_at: iso }).eq("id", treeId);
  if (error) throw new Error(`tree stamp: ${error.message}`);
}

/**
 * Ağacın verisini Postgres'ten oku (Faz 2d — okuma yolu).
 *
 * Ağaç Postgres'te YOKSA `null` döner → çağıran Blob'a düşer (henüz göç
 * edilmemiş ağaçlar için güvenli yedek). Kişiler `data` (JSONB) sütunundan
 * kayıpsız geri kurulur; `updatedAt` sürüm jetonu ağaç damgası ile kişi
 * damgalarının en büyüğüdür (`pickVersion` — neden öyle olduğu orada
 * anlatılıyor: yalnız kişilere bakan jeton SİLMEDE geriye gidiyordu).
 */
export async function dbGetFamilyData(treeId: string): Promise<FamilyData | null> {
  const sb = supabaseAdmin();
  const tree = await sb.from("trees").select("id, updated_at").eq("id", treeId).maybeSingle();
  if (tree.error) throw new Error(`tree get: ${tree.error.message}`);
  if (!tree.data) return null; // Postgres'te yok → Blob'a düş
  const treeRow = tree.data as { id: string; updated_at: string | null };

  const { data, error } = await sb.from("people").select("data, updated_at").eq("tree_id", treeId);
  if (error) throw new Error(`people get: ${error.message}`);
  const rows = (data ?? []) as Array<{ data: Person; updated_at: string }>;
  const updatedAt = pickVersion(treeRow.updated_at, rows.map((r) => r.updated_at));
  return { people: rows.map((r) => r.data), updatedAt };
}

/**
 * Ağaç satırını oku — kayma denetimi için (Madde 43).
 *
 * `dbGetFamilyData` ile aynı sorguyu iki kez yapmamak adına ayrı: denetim
 * ağacın Postgres'te VAR OLUP OLMADIĞINI ve adının Blob'daki adla aynı olup
 * olmadığını ayrıca bilmek zorunda. Yoksa `null`.
 */
export async function dbGetTreeRow(
  treeId: string
): Promise<{
  id: string;
  name: string;
  owner_account: string;
  is_home: boolean;
  /*
   * Sürüm damgası — `updated_at` sütunu SONRADAN eklendi (`lib/version-stamp.ts`),
   * bu yüzden eski satırlarda `null` olabilir. Ayna taraması damgaları
   * karşılaştırıyor ve okunamayan damgayı "eşit" sayıyor; seçilmemesi ise
   * her ağaç için sessizce "damga yok" demek olurdu.
   */
  updated_at: string | null;
} | null> {
  type Satir = {
    id: string; name: string; owner_account: string; is_home: boolean; updated_at: string | null;
  };
  const { data, error } = await supabaseAdmin()
    .from("trees")
    .select("id, name, owner_account, is_home, updated_at")
    .eq("id", treeId)
    .maybeSingle();
  if (error) throw new Error(`tree row: ${error.message}`);
  return (data as Satir | null) ?? null;
}

/**
 * Ağacın HAM kişi satırları — `data` (JSONB) YANINDA denormalize sütunlarla.
 *
 * `dbGetFamilyData` yalnız `data`yı çeker, çünkü uygulama için gereken o.
 * Kayma denetimi ise sütunların `data` ile çelişip çelişmediğine bakıyor
 * (`lib/drift.ts`, `columnDrift`) — bu yüzden sütunların kendisi lazım.
 */
export async function dbGetPeopleRows(
  treeId: string
): Promise<Array<{ person_id: string; data: Person } & Record<string, unknown>>> {
  const { data, error } = await supabaseAdmin()
    .from("people")
    .select("person_id, first_name, last_name, gender, birth_date, death_date, sibling_order, data")
    .eq("tree_id", treeId);
  if (error) throw new Error(`people rows: ${error.message}`);
  return (data ?? []) as Array<{ person_id: string; data: Person } & Record<string, unknown>>;
}

/**
 * Tanıtım (landing) sosyal-kanıt taban değerleri (Madde 9). Gerçek sayaç bunun
 * ALTINDA kalırsa taban gösterilir; üstüne çıkarsa gerçek sayı gösterilir —
 * böylece şerit hiçbir zaman bu değerlerden düşük görünmez.
 */
const SOCIAL_BASELINE = { trees: 108, people: 16782 };

/**
 * Platform geneli sayaçlar — "X aile ağacı oluşturuldu · X kişi eklendi".
 * Supabase yapılandırılmamış / sorgu başarısızsa taban değerler döner (şerit
 * her zaman gösterilir). `head:true` + `count:exact` yalnız sayıyı çeker.
 */
export async function getPlatformStats(): Promise<{ trees: number; people: number }> {
  if (!isSupabaseConfigured()) return SOCIAL_BASELINE;
  try {
    const sb = supabaseAdmin();
    const [tt, pp] = await Promise.all([
      sb.from("trees").select("*", { count: "exact", head: true }),
      sb.from("people").select("*", { count: "exact", head: true }),
    ]);
    if (tt.error || pp.error) return SOCIAL_BASELINE;
    return {
      trees: Math.max(SOCIAL_BASELINE.trees, tt.count ?? 0),
      people: Math.max(SOCIAL_BASELINE.people, pp.count ?? 0),
    };
  } catch {
    return SOCIAL_BASELINE;
  }
}

/* ── Hesaplar (founder) — Faz 3, şimdilik yalnız çift-yazma aynası ─────────── */

/** Founder hesabını ekle/güncelle (çift-yazma). */
/**
 * Hesabın TAM satırını aynaya yazar (Faz 4 / parça 2'nin ön koşulu).
 *
 * ## Neden tamamı
 *
 * Ayna beş sütun yazıyordu ve `docs/SUPABASE-GECIS.md` parça 2'yi "veri
 * zaten Postgres + Auth'ta" diye tarif ediyordu. Değildi: `User` tipinin on
 * sekiz alanının on üçü yalnız `users.json`da yaşıyordu. `users.json` o
 * hâliyle emekliye ayrılsaydı yumuşak silinmiş hesap geri diriler, şifre
 * sıfırlama oturumları düşürmez, kurtarma koduyla sıfırlama hiç çalışmazdı
 * — hiçbiri hata vermeden. Sütun sütun gerekçe `supabase/schema.sql`de.
 *
 * ## Boşluk `null`, `undefined` değil
 *
 * `undefined` gönderilen alanı Supabase yazmıyor; yani bir alanın SİLİNMESİ
 * aynaya hiç ulaşmazdı. Kullanıcı bildirim adresini kaldırdığında ayna eski
 * adresi tutmaya devam ederdi — ve okuma yolu Postgres'e döndüğünde silinmiş
 * bir onay geri gelirdi. `?? null` bu yüzden her isteğe bağlı alanda.
 */
export async function dbUpsertAccount(u: User): Promise<void> {
  const { error } = await supabaseAdmin().from("accounts").upsert(
    {
      id: u.id,
      family_name: u.familyName,
      password_hash: u.passwordHash,
      recovery_code_hash: u.recoveryCodeHash ?? "",
      created_at: u.createdAt,
      recovery_code_index: u.recoveryCodeIndex ?? null,
      session_epoch: u.sessionEpoch ?? null,
      deleted_at: u.deletedAt ?? null,
      auth_email: u.authEmail ?? null,
      auth_email_verified: u.authEmailVerified ?? null,
      email_token_hash: u.emailTokenHash ?? null,
      email_token_expires: u.emailTokenExpires ?? null,
      reset_token_hash: u.resetTokenHash ?? null,
      reset_token_expires: u.resetTokenExpires ?? null,
      notify_email: u.notifyEmail ?? null,
      notify_reminders: u.notifyReminders ?? null,
      notify_memorials: u.notifyMemorials ?? null,
      notify_newsletter: u.notifyNewsletter ?? null,
    },
    { onConflict: "id" }
  );
  if (error) throw new Error(`accounts upsert: ${error.message}`);
}


/** Doğrulama: Postgres'te bu ağaç için kaç kişi var? */
export async function dbCountPeople(treeId: string): Promise<number> {
  const { count, error } = await supabaseAdmin()
    .from("people")
    .select("person_id", { count: "exact", head: true })
    .eq("tree_id", treeId);
  if (error) throw new Error(`people count: ${error.message}`);
  return count ?? 0;
}
