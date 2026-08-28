import { v2 as cloudinary } from "cloudinary";

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

/** Sağlık kontrolü: Cloudinary hesabına ulaşılıyor mu? (sır sızdırmaz) */
export async function pingCloudinary(): Promise<{ ok: boolean; error?: string }> {
  if (!process.env.CLOUDINARY_CLOUD_NAME || !process.env.CLOUDINARY_API_KEY || !process.env.CLOUDINARY_API_SECRET) {
    return { ok: false, error: "env eksik" };
  }
  try {
    const r = (await cloudinary.api.ping()) as { status?: string };
    return { ok: r?.status === "ok" };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

export type UploadKind = "photo" | "cover" | "audio" | "video" | "document";

export async function uploadToCloudinary(
  fileBuffer: Buffer,
  filename: string,
  kind: UploadKind = "photo"
): Promise<string> {
  // Ses/video → Cloudinary "video" kaynağı. Belge (tarama/el yazısı/PDF) →
  // "auto" (görsel ya da PDF), kırpmasız tam saklanır. Foto → kare yüz-kırpma.
  const base = { public_id: filename.replace(/\.[^.]+$/, ""), overwrite: true };
  const options =
    kind === "audio"
      ? { ...base, folder: "familytree/audio", resource_type: "video" as const }
      : kind === "video"
        ? { ...base, folder: "familytree/video", resource_type: "video" as const }
        : kind === "document"
          ? { ...base, folder: "familytree/docs", resource_type: "auto" as const }
          : kind === "cover"
            ? {
                // Aile Kitabı kapağı: KIRPMA YOK. Oranı koru, yalnız çok büyükse
                // küçült (crop:limit). Böylece fotoğrafın tamamı görünür (#3).
                ...base,
                folder: "familytree/covers",
                transformation: [{ width: 1600, height: 1600, crop: "limit" }],
              }
            : {
                ...base,
                folder: "familytree",
                transformation: [{ width: 400, height: 400, crop: "fill", gravity: "face" }],
              };

  return new Promise((resolve, reject) => {
    const uploadStream = cloudinary.uploader.upload_stream(options, (error, result) => {
      if (error || !result) return reject(error ?? new Error("Upload failed"));
      resolve(result.secure_url);
    });
    uploadStream.end(fileBuffer);
  });
}
