import { v2 as cloudinary } from "cloudinary";

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

export type UploadKind = "photo" | "audio";

export async function uploadToCloudinary(
  fileBuffer: Buffer,
  filename: string,
  kind: UploadKind = "photo"
): Promise<string> {
  // Ses, Cloudinary'de "video" kaynağı olarak yüklenir; foto ise kare yüz-kırpma
  // dönüşümüyle avatar boyutuna getirilir.
  const options =
    kind === "audio"
      ? {
          folder: "familytree/audio",
          resource_type: "video" as const,
          public_id: filename.replace(/\.[^.]+$/, ""),
          overwrite: true,
        }
      : {
          folder: "familytree",
          public_id: filename.replace(/\.[^.]+$/, ""),
          overwrite: true,
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
