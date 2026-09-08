import { canManage } from "./roles.ts";
import { isDemoTree } from "./demo-id.ts";
import type { TreeRole } from "../types/user";

/**
 * YÖNETİM (operatör) UÇLARININ KAPISI — tek karar noktası.
 *
 * ## Neden ayrı bir dosya
 *
 * `/api/admin/*` uçlarının dördü de aynı üç satırı KOPYALAMIŞTI:
 * `auth()` → `isFounder` → `canManage`. Kopya bir kapının iki kusuru var:
 * yenisi eklendiğinde unutulur, ve kusurlu çıktığında dört yerden düzeltilir.
 * Aşağıdaki kusur da tam olarak öyle bulundu.
 *
 * ## Bulunan kusur: ŞİFRESİZ DEMO O KAPIYI AÇIYORDU
 *
 * Demo oturumu bilerek `role: "yonetici"` ve `isFounder: true` taşıyor
 * (`lib/demo-account.ts`) — ziyaretçi ağacı düzenleyebilsin, ayar
 * ekranlarını görebilsin diye. Ama yönetim kapısı tam olarak o iki şeye
 * bakıyordu ve demo girişi ŞİFRESİZ, tanıtım sayfasından tek tıklık.
 *
 * Yani internetten gelen herkes "Demo"ya basıp `GET /api/admin/phase4`
 * çağırabiliyordu: yanıt HER hesabın kimliğini, şifre özeti olup olmadığını,
 * Supabase Auth'ta bulunup bulunmadığını ve son giriş zamanını; HER ağacın
 * kimliğini, kişi sayısını ve kayma durumunu veriyor. Uç ayrıca her çağrıda
 * envanterdeki bütün aile blob'larını okuyor — kimliksiz bir maliyet yüzeyi.
 *
 * Kapsamın genel olması bilinçliydi ve gerekçesi yazılı (bir başka hesabın
 * kilitlenmesi kapıya görünmeli). Yanlış olan kapsam değil, o kapsamın
 * "giriş yapmış gerçek kurucu" varsaydığı hâlde şifresiz bir ziyaretçiye
 * açık olmasıydı.
 *
 * ## Neden demo denetimi ÖNCE
 *
 * Demo hem `isFounder` hem `canManage` denetiminden GEÇİYOR. Sona konsaydı
 * hiçbir şeyi değiştirmezdi; kapının ilk sorusu "bu gerçek bir hesap mı"
 * olmak zorunda.
 *
 * ## Bu dosya neden bağımlılıksız
 *
 * `auth()` çalışma zamanı `@/…` içe aktarımı demek ve o, birim testini
 * imkânsız kılar (CLAUDE.md). Oturumu ÇÖZMEK rotanın işi; burada yalnız
 * çözülmüş oturumla verilen KARAR var, dolayısıyla doğruluk tablosu
 * çalıştırılarak sınanabiliyor (`tests/operator-access.test.mts`).
 */

/** Kapının çözülmüş oturumdan ihtiyaç duyduğu üç alan. */
export interface OperatorSession {
  id?: string | null;
  isFounder?: boolean | null;
  role?: TreeRole | null;
}

export type OperatorVerdict =
  /** Geçti — `accountId` burada dönüyor ki çağıran oturumu yeniden daraltmak
   *  zorunda kalmasın (yoksa her rota kendi `!` iddiasını yazardı). */
  | { ok: true; accountId: string }
  | { ok: false; status: 401 | 403; error: string };

/**
 * Bu oturum operatör uçlarını açabilir mi?
 *
 * `isFounder` YOKSA `true` sayılıyor — eski oturum çerezlerinde alan
 * bulunmuyordu ve varsayılanı `false` yapmak, çerezi hâlâ geçerli olan
 * kurucuları kapı dışında bırakırdı. Demo denetimi bundan bağımsız ve önce
 * geldiği için bu gevşeklik demoyu içeri almıyor.
 */
export function operatorVerdict(session: OperatorSession | null | undefined): OperatorVerdict {
  const id = session?.id;
  if (!id) return { ok: false, status: 401, error: "Yetkisiz" };
  if (isDemoTree(id))
    return { ok: false, status: 403, error: "Demo oturumu yönetim uçlarını açamaz." };
  if (!(session?.isFounder ?? true))
    return { ok: false, status: 403, error: "Yalnız ağaç sahibi denetleyebilir." };
  if (!canManage(session?.role))
    return { ok: false, status: 403, error: "Yönetici olmalısınız." };
  return { ok: true, accountId: id };
}
