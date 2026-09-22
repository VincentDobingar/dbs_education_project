import multer from "multer";

import { ALLOWED_CONTENT_TYPES, MAX_IMAGE_BYTES } from "./safe-image-fetch.js";

/**
 * Mémoire seulement — jamais écrit sur disque par multer lui-même : le
 * contrôleur valide puis délègue à `lib/file-storage.ts` pour le nommage et
 * l'emplacement final. Mêmes limites que la récupération SSRF-safe d'une image
 * externe (`safe-image-fetch.ts`) : un fichier téléversé directement n'a pas
 * besoin de ces garde-fous réseau, mais doit rester dans les mêmes contraintes
 * de taille/format puisqu'il finit embarqué dans les mêmes PDF.
 */
export const imageUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_IMAGE_BYTES },
  fileFilter: (_req, file, callback) => {
    callback(null, ALLOWED_CONTENT_TYPES.has(file.mimetype));
  },
});
