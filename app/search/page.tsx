import { auth } from "@/auth";
import { getFamilyData } from "@/lib/blob";
import Navbar from "@/components/Navbar";
import Link from "next/link";

export default async function SearchPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const { q } = await searchParams;
  const session = await auth();
  const { people } = await getFamilyData();

  const query = q?.toLowerCase().trim() ?? "";

  const results = query
    ? people.filter(
        (p) =>
          `${p.firstName} ${p.lastName}`.toLowerCase().includes(query) ||
          p.birthPlace?.toLowerCase().includes(query) ||
          p.birthDate?.includes(query) ||
          p.bio?.toLowerCase().includes(query)
      )
    : people;

  return (
    <div className="flex flex-col min-h-screen">
      <Navbar familyName={session?.user?.name ?? undefined} />
      <main className="max-w-2xl mx-auto w-full px-4 py-8">
        <h1 className="text-2xl font-bold text-gray-900 mb-6">Arama</h1>

        <form method="GET" className="mb-6">
          <div className="flex gap-2">
            <input
              name="q"
              defaultValue={q}
              placeholder="İsim, doğum yeri veya tarih..."
              className="flex-1 px-4 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500 text-gray-900"
              autoFocus
            />
            <button
              type="submit"
              className="px-5 py-2.5 bg-green-700 text-white rounded-lg hover:bg-green-800 transition-colors font-medium"
            >
              Ara
            </button>
          </div>
        </form>

        <p className="text-sm text-gray-400 mb-4">
          {query
            ? `"${q}" için ${results.length} sonuç`
            : `Toplam ${people.length} kişi`}
        </p>

        <ul className="space-y-2">
          {results.map((person) => (
            <li key={person.id}>
              <Link
                href={`/person/${person.id}`}
                className="flex items-center gap-4 bg-white rounded-xl shadow-sm p-4 hover:shadow-md transition-shadow"
              >
                {person.photo ? (
                  <img
                    src={person.photo}
                    alt=""
                    className="w-12 h-12 rounded-full object-cover flex-shrink-0"
                  />
                ) : (
                  <div
                    className={`w-12 h-12 rounded-full flex items-center justify-center font-bold text-sm flex-shrink-0
                      ${person.gender === "female" ? "bg-pink-100 text-pink-700" : person.gender === "male" ? "bg-blue-100 text-blue-700" : "bg-gray-100 text-gray-500"}
                    `}
                  >
                    {`${person.firstName[0] ?? ""}${person.lastName[0] ?? ""}`.toUpperCase()}
                  </div>
                )}
                <div>
                  <p className="font-semibold text-gray-900">
                    {person.firstName} {person.lastName}
                  </p>
                  <p className="text-sm text-gray-400">
                    {[
                      person.birthDate?.slice(0, 4),
                      person.birthPlace,
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                  </p>
                </div>
              </Link>
            </li>
          ))}
        </ul>

        {results.length === 0 && query && (
          <div className="text-center text-gray-400 py-12">
            <p className="text-4xl mb-2">🔍</p>
            <p>Sonuç bulunamadı</p>
          </div>
        )}
      </main>
    </div>
  );
}
