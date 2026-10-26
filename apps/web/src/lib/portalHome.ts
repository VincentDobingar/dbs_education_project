import { listLinkedStudents, listMyChildren } from "./familyApi.js";

/** Une invitation n'est nécessaire qu'avant le premier rattachement. */
export async function getPortalHome(accessToken: string): Promise<string> {
  const [children, students] = await Promise.all([
    listMyChildren(accessToken),
    listLinkedStudents(accessToken),
  ]);
  if (children.length) return "/portail/parent";
  if (students.length) return "/portail/eleve";
  return "/portail/activation";
}
