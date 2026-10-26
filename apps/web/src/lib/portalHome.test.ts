import { beforeEach, describe, expect, it, vi } from "vitest";

import { listLinkedStudents, listMyChildren } from "./familyApi.js";
import { getPortalHome } from "./portalHome.js";

vi.mock("./familyApi.js", () => ({ listMyChildren: vi.fn(), listLinkedStudents: vi.fn() }));
describe("destination après connexion portail", () => {
  beforeEach(() => {
    vi.mocked(listMyChildren).mockResolvedValue([]);
    vi.mocked(listLinkedStudents).mockResolvedValue([]);
  });
  it("ouvre le dashboard d'un parent déjà lié, même sans abonnement", async () => {
    vi.mocked(listMyChildren).mockResolvedValue([{}] as Awaited<ReturnType<typeof listMyChildren>>);
    expect(await getPortalHome("token")).toBe("/portail/parent");
  });
  it("ouvre le portail d'un élève déjà lié", async () => {
    vi.mocked(listLinkedStudents).mockResolvedValue([{}] as Awaited<ReturnType<typeof listLinkedStudents>>);
    expect(await getPortalHome("token")).toBe("/portail/eleve");
  });
  it("demande l'activation seulement sans rattachement", async () => {
    expect(await getPortalHome("token")).toBe("/portail/activation");
  });
});
