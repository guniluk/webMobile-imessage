import { v2 as cloudinary } from "cloudinary";
import dotenv from "dotenv";

dotenv.config({ quiet: true });

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

export const uploadFile = async (file, options = {}) => {
  if (!file) {
    throw new Error("File data or path is required for upload");
  }
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

    // URL에서 버전 번호(v12345/)를 제외한 경로(폴더명 및 파일명) 추출
    // 예: "https://res.cloudinary.com/.../imessage/sub/abc.123.jpg" -> "imessage/sub/abc.123"
    const match = url.match(/\/upload\/(?:v\d+\/)?(.+?)(?:\.[^.]+)?$/);
    if (!match || !match[1]) return;
    const publicId = match[1];

    return await cloudinary.uploader.destroy(publicId, {
      resource_type: options.resource_type || defaultResourceType,
      ...options,
    });
  } catch (error) {
    console.error("Cloudinary delete error:", error);
  }
};

