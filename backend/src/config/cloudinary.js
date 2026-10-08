import { v2 as cloudinary } from "cloudinary";
import dotenv from "dotenv";

dotenv.config({ quiet: true });

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

export const uploadFile = async (file, options = {}) => {
  const result = await cloudinary.uploader.upload(file, {
    folder: "imessage",
    resource_type: "auto", // "auto" allows automatic detection and storage of both images and videos
    ...options,
  });
  return result.secure_url;
};

export const deleteFile = async (url, options = {}) => {
  if (!url || typeof url !== "string") return;
  if (!url.includes("res.cloudinary.com")) return;
  try {
    // Cloudinary URL에서 resource_type 자동 판별 (video 또는 image)
    const isVideo = url.includes("/video/upload/");
    const defaultResourceType = isVideo ? "video" : "image";

    // URL에서 폴더명과 파일명을 분리하여 public_id 생성
    // 예: "https://res.cloudinary.com/.../imessage/abc123xyz.jpg" -> "imessage/abc123xyz"
    const parts = url.split("/");
    if (parts.length < 2) return;
    const folder = parts[parts.length - 2];
    const filenameWithExt = parts[parts.length - 1];
    const filename = filenameWithExt.split(".")[0];
    const publicId = `${folder}/${filename}`;

    return await cloudinary.uploader.destroy(publicId, {
      resource_type: options.resource_type || defaultResourceType,
      ...options,
    });
  } catch (error) {
    console.error("Cloudinary delete error:", error);
  }
};

