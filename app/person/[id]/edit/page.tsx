import { auth } from "@/auth";
import { getFamilyData } from "@/lib/blob";
import Navbar from "@/components/Navbar";
import PersonForm from "@/components/PersonForm";
import { notFound, redirect } from "next/navigation";

export default async function EditPersonPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const { people } = await getFamilyData(session.user.id);
  const person = people.find((p) => p.id === id);
  if (!person) notFound();

  return (
    <div className="flex flex-col min-h-screen">
      <Navbar familyName={session.user.name ?? undefined} />
      <main className="max-w-lg mx-auto w-full px-4 py-8">
        <h1 className="text-2xl font-bold text-gray-900 mb-6">
          {person.firstName} {person.lastName} — Düzenle
        </h1>
        <PersonForm people={people} initial={person} personId={id} />
      </main>
    </div>
  );
}
