import { randomBytes } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

import { env } from "../env.js";

import { AppError } from "./errors.js";
import { ALLOWED_CONTENT_TYPES } from "./safe-image-fetch.js";

const EXTENSION_BY_CONTENT_TYPE: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
};

// Signature réelle des octets (magic bytes), pas seulement le Content-Type déclaré
// par l'appelant (spoofable — multer se contente de relayer le header HTTP du
// client). Un PNG commence toujours par ces 8 octets fixes ; un JPEG par ces 3
// octets (marqueur SOI suivi du premier segment).
const MAGIC_BYTES_BY_CONTENT_TYPE: Record<string, readonly number[]> = {
  "image/jpeg": [0xff, 0xd8, 0xff],
  "image/png": [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a],
};

function matchesDeclaredType(buffer: Buffer, contentType: string): boolean {
  const signature = MAGIC_BYTES_BY_CONTENT_TYPE[contentType];
  if (!signature || buffer.length < signature.length) return false;
  return signature.every((byte, index) => buffer[index] === byte);
}

export class UnsupportedImageTypeError extends AppError {
  constructor(contentType: string) {
    super(400, "UNSUPPORTED_IMAGE_TYPE", `Unsupported or mismatched image content type: ${contentType}`);
  }
}

/**
 * Stocke une image téléversée (logo d'établissement) sur le disque local, sous
 * un sous-dossier dédié de `UPLOAD_DIR`, et renvoie l'URL publique absolue à
 * partir de laquelle elle est servie (`app.ts` monte `express.static` sur ce
 * même dossier, à `/uploads`). Même restriction de type que la récupération
 * SSRF-safe (`safe-image-fetch.ts`) — un logo doit être un format que pdfkit
 * sait embarquer, jamais un fichier arbitraire.
 */
export async function saveUploadedImage(
  buffer: Buffer,
  contentType: string,
  subdirectory: string,
): Promise<string> {
  const extension = ALLOWED_CONTENT_TYPES.has(contentType) ? EXTENSION_BY_CONTENT_TYPE[contentType] : null;
  if (!extension || !matchesDeclaredType(buffer, contentType)) {
    throw new UnsupportedImageTypeError(contentType);
  }

  const filename = `${randomBytes(16).toString("hex")}.${extension}`;
  const dir = path.join(env.UPLOAD_DIR, subdirectory);
  await mkdir(dir, { recursive: true });
  await writeFile(path.join(dir, filename), buffer);

  return `${env.PUBLIC_API_URL}/uploads/${subdirectory}/${filename}`;
}
