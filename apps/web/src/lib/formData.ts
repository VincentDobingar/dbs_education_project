/** Les champs texte ne doivent pas convertir un éventuel File en chaîne. */
export function formText(data: FormData, name: string): string {
  const value = data.get(name);
  return typeof value === "string" ? value : "";
}
