import { nextCode } from "@/lib/code";
import { buildPersonFields } from "@/lib/person-fields";
import type { FamilyData, Person } from "@/types/family";

/**
 * YENİ KİŞİ OLUŞTURMA — tek yerde (madde 35, ikinci tur).
 *
 * Bu mantık `POST /api/family/person` rotasının içinde yaşıyordu. Öneri
 * akışı "yeni kişi ekle" türünü kazanınca ikinci bir çağıranı oldu: bir
 * ekleme önerisi ONAYLANDIĞINDA kişi aynı kurallarla oluşmalı — kod
 * üretimi, ilişki bağlama, eş karşılıklılığı, hepsi.
 *
 * Kopyalansaydı ikisi ayrışırdı ve ayrışmanın yönü kötü olurdu: kullanıcı
 * kendi eklediğinde kurulan bir bağ, öneriyle eklendiğinde kurulmazdı — ve
 * fark, aylar sonra tek yönlü kalmış bir eş bağı olarak ortaya çıkardı.
 * Depo bu hatayı bir kez yaşadı (`formerSpouseIds` karşılıklılığı).
 */

export type RelationType = "parent" | "child" | "spouse" | "sibling" | "associate";

export interface CreateRelation {
  type: RelationType;
  targetId: string;
  assocType?: string;
}

export interface CreatePersonInput {
  /** Kayıt defterinden geçirilecek ham alanlar. */
  fields: Record<string, unknown>;
  relation?: CreateRelation;
  /**
   * İlişki DİZİLERİ (`spouseIds` / `formerSpouseIds`) gövdeden kabul edilsin mi?
   *
   * Bu diziler VAR OLAN kişilerin kayıtlarına yazıyor. Serbest bırakıldığında
   * tek istekle ağaçtaki her kaydın eş listesi kirletilebiliyordu; o yüzden
   * yalnız tam yetkide açık ve karar ÇAĞIRANIN.
   */
  allowLinkArrays: boolean;
  /** Kaydı ekleyen (`ctx.authorId`) — sahiplik denetimi buna bakıyor. */
  addedBy: string;
}

export type CreateFail = "hedef-yok" | "iki-ebeveyn";

/**
 * Kişiyi kurar, ilişkileri bağlar ve `data.people`e EKLER.
 *
 * `data` YERİNDE değiştiriliyor: çağıranlar zaten okudukları anlık görüntüyü
 * kaydedecek ve ilişki bağlama karşı tarafın kaydına da yazmak zorunda —
 * kopya üstünde çalışmak, o yazmaları görünmez kılardı.
 */
export function createPerson(
  data: FamilyData,
  input: CreatePersonInput
): { ok: true; person: Person } | { ok: false; fail: CreateFail } {
  const body = input.fields;
  const person: Person = {
    id: crypto.randomUUID(),
    code: nextCode(data.people),
    addedBy: input.addedBy,
    ...buildPersonFields(body),
    // Ad/soyad her zaman bulunur (boş da olsa) ve kırpılır.
    firstName: ((body.firstName as string) ?? "").trim(),
    lastName: ((body.lastName as string) ?? "").trim(),
    gender: (body.gender as Person["gender"]) ?? "unknown",
    // "cevre" dışındaki her değer varsayılan (üye) demektir.
    kind: body.kind === "cevre" ? "cevre" : undefined,
    parentIds: Array.isArray(body.parentIds) ? body.parentIds.slice(0, 2) : [],
    parentLinks:
      body.parentLinks && typeof body.parentLinks === "object"
        ? (body.parentLinks as Person["parentLinks"])
        : undefined,
    spouseIds: input.allowLinkArrays && Array.isArray(body.spouseIds) ? [...body.spouseIds] : [],
    formerSpouseIds:
      input.allowLinkArrays && Array.isArray(body.formerSpouseIds)
        ? [...body.formerSpouseIds]
        : [],
    // #6 — Köken/iz: elle eklenen kart (çağıran başka bir kaynak bildirmediyse).
    entrySource:
      typeof body.entrySource === "string" && body.entrySource.trim()
        ? body.entrySource.trim()
        : "manuel",
  };

  /* ---- İlişki bağlama: "X'in babası/çocuğu/eşi/kardeşi olarak ekle" ---- */
  const relation = input.relation;
  if (relation?.targetId) {
    const target = data.people.find((p) => p.id === relation.targetId);
    if (!target) return { ok: false, fail: "hedef-yok" };

    switch (relation.type) {
      case "associate": {
        // Yeni kişi, hedefin aile-dışı yakını (çevre) olur — kan/evlilik bağı
        // KURULMAZ; iki yönlü çözülebilen bir "yakın çevre" bağı eklenir.
        person.kind = "cevre";
        const type = (typeof relation.assocType === "string" && relation.assocType.trim()) || "arkadas";
        const existing = Array.isArray(person.associations) ? person.associations : [];
        if (!existing.some((a) => a.personId === target.id)) {
          person.associations = [...existing, { id: crypto.randomUUID(), personId: target.id, type }];
        }
        break;
      }

      case "parent": {
        // Yeni kişi, hedefin ebeveyni olur
        if (target.parentIds.length >= 2) return { ok: false, fail: "iki-ebeveyn" };
        target.parentIds.push(person.id);
        // Mevcut diğer ebeveyn varsa eş olarak bağla
        const digerEbeveynId = target.parentIds.find((id) => id !== person.id);
        if (digerEbeveynId) {
          const diger = data.people.find((p) => p.id === digerEbeveynId);
          if (diger && !diger.spouseIds.includes(person.id)) {
            diger.spouseIds.push(person.id);
            person.spouseIds.push(diger.id);
          }
        }
        break;
      }

      case "child": {
        // Yeni kişi, hedefin çocuğu olur
        if (!person.parentIds.includes(target.id)) person.parentIds.push(target.id);
        // Hedefin tek eşi varsa onu da ikinci ebeveyn yap
        if (target.spouseIds.length === 1 && person.parentIds.length < 2) {
          const es = target.spouseIds[0];
          if (!person.parentIds.includes(es)) person.parentIds.push(es);
        }
        break;
      }

      case "spouse": {
        if (!person.spouseIds.includes(target.id)) person.spouseIds.push(target.id);
        break;
      }

      case "sibling": {
        // Hedefin ebeveynlerini paylaş
        person.parentIds = [...target.parentIds];
        break;
      }
    }
  }

  data.people.push(person);

  /*
   * EŞ BAĞLARI ÇİFT YÖNLÜ. Tek yönlü bırakılsaydı bir tarafta evlilik
   * görünür, öbür tarafta görünmezdi — ve bu depoda tam olarak bu yaşandı
   * (`formerSpouseIds` karşılıklılığı hiç kurulmuyordu).
   */
  for (const spouseId of person.spouseIds) {
    const spouse = data.people.find((p) => p.id === spouseId);
    if (spouse && !spouse.spouseIds.includes(person.id)) spouse.spouseIds.push(person.id);
  }
  for (const exId of person.formerSpouseIds ?? []) {
    const ex = data.people.find((p) => p.id === exId);
    if (ex && !(ex.formerSpouseIds ?? []).includes(person.id)) {
      ex.formerSpouseIds = [...(ex.formerSpouseIds ?? []), person.id];
    }
  }

  return { ok: true, person };
}
