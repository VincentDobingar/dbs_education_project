import { fetchImageSafely } from "./safe-image-fetch.js";

export interface TenantLetterhead {
  name: string;
  logoUrl: string | null;
}

const LOGO_SIZE = 40; // pt (~14mm) — assez visible sans dominer un en-tête A4/A5.

/**
 * Récupère le logo d'un établissement pour l'embarquer dans un document généré
 * côté serveur (bulletin, reçu, rapport financier, carte scolaire). Même
 * dégradation que `Student.photoUrl` sur la carte scolaire (id-card.service.ts) :
 * `fetchImageSafely` ne lève jamais, `null` signifie simplement « pas de logo »,
 * jamais un échec de génération du document.
 */
export async function fetchTenantLogo(logoUrl: string | null): Promise<Buffer | null> {
  return logoUrl ? fetchImageSafely(logoUrl) : null;
}

/**
 * Dessine un en-tête centré (logo au-dessus du nom de l'établissement) à la
 * position courante du curseur. Partagé par tous les documents « formels » qui
 * ont la même mise en page d'en-tête (reçu, bulletin, rapports recettes/dépenses)
 * — la carte scolaire a sa propre mise en page compacte à deux colonnes et
 * dessine son logo séparément (id-card.service.ts).
 */
export function drawCenteredLetterhead(
  doc: PDFKit.PDFDocument,
  tenantName: string,
  logo: Buffer | null,
  nameFontSize: number,
): void {
  if (logo !== null) {
    try {
      const x = (doc.page.width - LOGO_SIZE) / 2;
      doc.image(logo, x, doc.y, { width: LOGO_SIZE, height: LOGO_SIZE, fit: [LOGO_SIZE, LOGO_SIZE] });
      doc.y += LOGO_SIZE + 6;
    } catch {
      // Octets récupérés mais pas un JPEG/PNG décodable par pdfkit — même repli
      // que partout ailleurs : en-tête texte seul, jamais un échec de génération.
    }
  }
  doc.fontSize(nameFontSize).font("Helvetica-Bold").text(tenantName, { align: "center" });
}
