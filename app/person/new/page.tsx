import { auth } from "@/auth";
import { getFamilyData } from "@/lib/blob";
import Navbar from "@/components/Navbar";
import PersonForm from "@/components/PersonForm";

export default async function NewPersonPage() {
  const session = await auth();
  const { people } = await getFamilyData();

  return (
    <div className="flex flex-col min-h-screen">
      <Navbar familyName={session?.user?.name ?? undefined} />
      <main className="flex-1 max-w-lg mx-auto w-full px-4 py-8">
        <h1 className="text-2xl font-bold text-gray-900 mb-6">Yeni Kişi Ekle</h1>
        <PersonForm people={people} />
      </main>
    </div>
  );
}
