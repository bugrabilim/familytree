import { auth } from "@/auth";
import { getFamilyData } from "@/lib/blob";
import Navbar from "@/components/Navbar";
import Link from "next/link";
import { notFound } from "next/navigation";
import DeleteButton from "./DeleteButton";

export default async function PersonPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const session = await auth();
  const { people } = await getFamilyData();

  const person = people.find((p) => p.id === id);
  if (!person) notFound();

  const parents = people.filter((p) => person.parentIds.includes(p.id));
  const spouses = people.filter((p) => person.spouseIds.includes(p.id));
  const children = people.filter((p) => p.parentIds.includes(id));
  const siblings = people.filter(
    (p) =>
      p.id !== id &&
      person.parentIds.length > 0 &&
      p.parentIds.some((pid) => person.parentIds.includes(pid))
  );

  const birthYear = person.birthDate?.slice(0, 4);
  const deathYear = person.deathDate?.slice(0, 4);

  return (
    <div className="flex flex-col min-h-screen">
      <Navbar familyName={session?.user?.name ?? undefined} />
      <main className="max-w-2xl mx-auto w-full px-4 py-8">
        {/* Header */}
        <div className="bg-white rounded-2xl shadow-md p-6 mb-6 flex gap-5 items-start">
          {person.photo ? (
            <img
              src={person.photo}
              alt={`${person.firstName} ${person.lastName}`}
              className="w-24 h-24 rounded-full object-cover border-4 border-white shadow flex-shrink-0"
            />
          ) : (
            <div
              className={`w-24 h-24 rounded-full flex items-center justify-center text-3xl font-bold flex-shrink-0 border-4 border-white shadow
                ${person.gender === "female" ? "bg-pink-100 text-pink-700" : person.gender === "male" ? "bg-blue-100 text-blue-700" : "bg-gray-100 text-gray-500"}
              `}
            >
              {`${person.firstName[0] ?? ""}${person.lastName[0] ?? ""}`.toUpperCase() || "?"}
            </div>
          )}

          <div className="flex-1 min-w-0">
            <h1 className="text-2xl font-bold text-gray-900">
              {person.firstName} {person.lastName}
            </h1>
            {(birthYear || person.birthPlace) && (
              <p className="text-gray-500 text-sm mt-1">
                {birthYear && (
                  <span>
                    {birthYear}
                    {deathYear && ` – ${deathYear}`}
                  </span>
                )}
                {birthYear && person.birthPlace && " · "}
                {person.birthPlace && <span>{person.birthPlace}</span>}
              </p>
            )}
            {person.bio && (
              <p className="text-gray-600 text-sm mt-3 leading-relaxed">{person.bio}</p>
            )}
          </div>

          <div className="flex gap-2 flex-shrink-0">
            <Link
              href={`/person/${id}/edit`}
              className="px-3 py-1.5 bg-green-700 text-white text-sm rounded-lg hover:bg-green-800 transition-colors"
            >
              Düzenle
            </Link>
            <DeleteButton personId={id} />
          </div>
        </div>

        {/* Relations */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <RelationSection title="Ebeveynler" people={parents} />
          <RelationSection title="Eş / Eşler" people={spouses} />
          <RelationSection title="Çocuklar" people={children} />
          <RelationSection title="Kardeşler" people={siblings} />
        </div>
      </main>
    </div>
  );
}

function RelationSection({ title, people }: { title: string; people: { id: string; firstName: string; lastName: string; photo?: string }[] }) {
  if (people.length === 0) return null;
  return (
    <div className="bg-white rounded-xl shadow-sm p-4">
      <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">
        {title}
      </h2>
      <ul className="space-y-2">
        {people.map((p) => (
          <li key={p.id}>
            <Link
              href={`/person/${p.id}`}
              className="flex items-center gap-2.5 hover:bg-gray-50 rounded-lg p-1.5 -mx-1.5 transition-colors"
            >
              {p.photo ? (
                <img src={p.photo} className="w-8 h-8 rounded-full object-cover" alt="" />
              ) : (
                <div className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center text-xs font-bold text-gray-500">
                  {`${p.firstName[0] ?? ""}${p.lastName[0] ?? ""}`.toUpperCase()}
                </div>
              )}
              <span className="text-sm text-gray-800 font-medium">
                {p.firstName} {p.lastName}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
