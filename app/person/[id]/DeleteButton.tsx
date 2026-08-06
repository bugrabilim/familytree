"use client";

import { useRouter } from "next/navigation";

export default function DeleteButton({ personId }: { personId: string }) {
  const router = useRouter();

  const handleDelete = async () => {
    if (!confirm("Bu kişiyi silmek istediğinize emin misiniz?")) return;
    await fetch(`/api/family/person/${personId}`, { method: "DELETE" });
    router.push("/tree");
    router.refresh();
  };

  return (
    <button
      onClick={handleDelete}
      className="px-3 py-1.5 border border-red-300 text-red-600 text-sm rounded-lg hover:bg-red-50 transition-colors"
    >
      Sil
    </button>
  );
}
