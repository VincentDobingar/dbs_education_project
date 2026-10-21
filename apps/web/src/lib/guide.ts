/** Version PDF du guide d'utilisation public (générée hors application, dans public/). */
export const GUIDE_PDF_HREF = "/guide/edumanage-africa-guide-utilisateur.pdf";

/** Ancre stable d'un titre : « Rôles et menus » → « roles-et-menus ». */
export function slugify(text: string): string {
  return text
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/** Titres de niveau 2 du guide, dans l'ordre — ils forment le sommaire. */
export function guideSections(source: string): { id: string; title: string }[] {
  return [...source.matchAll(/^## (.+)$/gm)].map((match) => {
    const title = match[1]!.trim();
    return { id: slugify(title), title };
  });
}
