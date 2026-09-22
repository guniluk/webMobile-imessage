import { v2 as cloudinary } from "cloudinary";
import dotenv from "dotenv";

dotenv.config({ quiet: true });

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

export const uploadFile = async (file) => {
  const result = await cloudinary.uploader.upload(file, {
    folder: "imessage",
    resource_type: "image",
  });
  return result.secure_url;
};

export const deleteFile = async (url) => {
  if (!url || typeof url !== "string") return;
  if (!url.includes("res.cloudinary.com")) return;
  try {
    // URL에서 폴더명('tinder')과 파일명을 분리하여 public_id 생성
    // 예: "https://.../tinder/abc123xyz.jpg" -> "tinder/abc123xyz"
    const parts = url.split("/");
    if (parts.length < 2) return;
    const folder = parts[parts.length - 2];
    const filename = parts[parts.length - 1].split(".")[0];
    const publicId = `${folder}/${filename}`;

    return await cloudinary.uploader.destroy(publicId);
  } catch (error) {
    console.error("Cloudinary delete error:", error);
  }
};
