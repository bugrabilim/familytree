/**
 * Ağaç düzeyi meta alanlarının kaydetme kuralı — saf, test edilebilir.
 *
 * `coverPhoto` (Aile Kitabı kapağı) kişi verisi değil, ağacın ayarı. Ama
 * kaydeden rotaların çoğu `{ people, updatedAt }` diye yeni bir nesne
 * kuruyor ve o nesnede kapak bulunmadığı için kapak sessizce siliniyordu.
 *
 * Kural: alan nesnede **hiç yoksa** eski değer korunur; **varsa** (boş bile
 * olsa) söylenen uygulanır. Yani "bir şey söylemedim" ile "kaldır" ayrı
 * şeyler — ve bu ayrımı yapmayan bir kaydetme, kullanıcının koymadığı bir
 * kararı onun adına veriyor demektir.
 */
export function shouldKeepCover(data: object): boolean {
  return !("coverPhoto" in data);
}
