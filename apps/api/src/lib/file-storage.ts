import { randomBytes } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

import { env } from "../env.js";

import { ALLOWED_CONTENT_TYPES } from "./safe-image-fetch.js";

const EXTENSION_BY_CONTENT_TYPE: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
};

export class UnsupportedImageTypeError extends Error {
  constructor(contentType: string) {
    super(`Unsupported image content type: ${contentType}`);
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
  if (!extension) {
    throw new UnsupportedImageTypeError(contentType);
  }

  const filename = `${randomBytes(16).toString("hex")}.${extension}`;
  const dir = path.join(env.UPLOAD_DIR, subdirectory);
  await mkdir(dir, { recursive: true });
  await writeFile(path.join(dir, filename), buffer);

  return `${env.PUBLIC_API_URL}/uploads/${subdirectory}/${filename}`;
}
