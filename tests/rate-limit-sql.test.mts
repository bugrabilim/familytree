import { readFileSync } from "node:fs";

let ok = 0, fail = 0;
function check(cond: boolean, msg: string) { if (cond) ok++; else { fail++; console.log(`✗ ${msg}`); } }

/**
 * KAPI: Postgres'teki hız sınırı, `lib/rate-limit-core.ts` ile aynı kuralları
 * uygulamalı.
 *
 * ## Bu testin sınırı — açıkça
 *
 * Burada Postgres YOK; SQL çalıştırılamıyor. Yani bu test SQL'in doğru
 * ÇALIŞTIĞINI kanıtlamaz, yalnız aynı KURALLARI yazdığını doğrular. Asıl
 * doğrulama SQL Editor'de `schema.sql`i koşturmak.
 *
 * Yine de değerli: iki uygulamanın ayrışması sessiz bir hatadır — sınır
 * ortama göre farklı davranır ve sebebi hiç bulunamaz. Kurallardan biri
 * SQL'den düşerse burada kırılır.
 */

const sql = readFileSync(new URL("../supabase/schema.sql", import.meta.url), "utf8");
const i = sql.indexOf("create or replace function public.consume_rate_limit");
check(i >= 0, "consume_rate_limit işlevi şemada var");
const fn = sql.slice(i, sql.indexOf("$$;", i));

/* --- Dört değişmez ------------------------------------------------------- */

// 1. Kapasite en az 1: yapılandırma hatası tüm ucu kapatmasın.
check(/greatest\(1,\s*p_capacity\)/.test(fn), "kapasite en az 1'e yükseltiliyor");

// 2. Geriye giden saat jeton geri ALMAZ (sunucular arası kayma gerçek).
check(/greatest\(0,\s*\(p_now_ms - v_updated\)/.test(fn), "geçen süre negatife düşmüyor");

// 3. Kova kapasiteyi aşamaz.
check(/least\(v_cap,\s*v_tokens \+ v_elapsed \* v_refill\)/.test(fn), "kova kapasiteyle sınırlı");

// 4. Durum yoksa kova DOLU: yeni bir anahtarın ilk isteği engellenmemeli.
check(/if not found then[\s\S]*?v_tokens := v_cap;/.test(fn), "kayıt yoksa kova dolu sayılıyor");

/* --- Reddedilen istek jeton harcamaz ------------------------------------ */
/*
 * Ret dalında yazılan değer `v_tokens` olmalı, `v_tokens - 1` DEĞİL. Aksi
 * hâlde sürekli deneyen bir istemci kovayı hiç dolmaz hâlde tutar ve
 * `retry_after` yalan söylerdi.
 */
{
  // Dilim RET dalında bitmeli: başarı dalındaki `v_tokens - 1` buraya
  // karışırsa denetim boşuna kırılır (ilk yazışta tam olarak bu oldu).
  const bas = fn.indexOf("if v_tokens < 1 then");
  const retDali = fn.slice(bas, fn.indexOf("end if;", bas));
  check(/values \(p_key, v_tokens, p_now_ms\)/.test(retDali), "ret dalı jeton harcamıyor");
  check(!/v_tokens - 1/.test(retDali), "ret dalında jeton düşülmüyor");
}

/* --- Atomiklik: yarış olmasın -------------------------------------------- */
/*
 * "Oku → hesapla → yaz" turu Node'dan yapılsaydı iki örnek aynı anda okuyup
 * ikisi de dolu kova görür ve ikisi de geçirirdi. Satır kilidi bunu önlüyor.
 */
check(/for update/.test(fn), "satır kilidi var (for update)");
check(/on conflict \(key\) do update/.test(fn), "eşzamanlı ekleme çakışması ele alınıyor");

/* --- Dolumsuz kovada sonsuz/NaN bekleme olmasın ------------------------- */
check(/when v_refill > 0 then/.test(fn), "sıfır dolumda bölme yapılmıyor");
check(/greatest\(1,\s*case when v_refill/.test(fn), "bekleme süresi en az 1 saniye");

/* --- Tablo ve RLS -------------------------------------------------------- */
check(/create table if not exists public\.rate_limits/.test(sql), "rate_limits tablosu var");
check(/alter table public\.rate_limits\s+enable row level security/.test(sql),
  "rate_limits RLS açık (politika yok → varsayılan reddet)");

/* --- İstemci tarafı: paylaşımlı katman çöktüğünde ne oluyor? ------------ */
{
  const lib = readFileSync(new URL("../lib/rate-limit.ts", import.meta.url), "utf8");
  check(lib.includes("consume_rate_limit"), "istemci atomik işlevi çağırıyor");
  /*
   * Paylaşımlı katman ulaşılamazsa isteği REDDETMEK yanlış olurdu: bizim
   * altyapı sorunumuz kullanıcıyı uygulamadan edemez. Ama "sınır yok" da
   * olmamalı — yerel kovaya düşülüyor.
   */
  const catchBlok = lib.slice(lib.lastIndexOf("} catch {"));
  check(/return rateLimit\(key, opts\)/.test(catchBlok), "hata durumunda yerel kovaya düşülüyor");
  check(!/return \{ ok: true/.test(catchBlok), "hata durumunda sınır tamamen kalkmıyor");
}

console.log(`\n${ok}/${ok + fail} geçti${fail ? `, ${fail} başarısız` : " ✓"}`);
if (fail > 0) process.exit(1);
