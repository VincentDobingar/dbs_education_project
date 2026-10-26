import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import { afterEach, expect, it, vi } from "vitest";

import { PortalLayout } from "./PortalLayout.js";
vi.mock("../pages/portal/PortalNotifications.js", () => ({ PortalNotifications: () => null }));
const fixture = vi.hoisted(() => ({ parent: false, student: true }));
vi.mock("../lib/portalSession.js", () => ({
  loadPortalSession: () => ({ email: "test@example.test", accessToken: "token" }),
  clearPortalSession: vi.fn(),
}));
vi.mock("../lib/familyApi.js", () => ({
  listMyChildren: () => Promise.resolve(fixture.parent ? [{}] : []),
  listLinkedStudents: () => Promise.resolve(fixture.student ? [{}] : []),
}));
vi.mock("../components/SidebarShell.js", () => ({
  SidebarShell: ({
    title,
    links,
    children,
  }: {
    title: string;
    links: { to: string; label: string }[];
    children: React.ReactNode;
  }) => (
    <div>
      <h1>{title}</h1>
      {links.map((l) => (
        <a key={l.to} href={l.to}>
          {l.label}
        </a>
      ))}
      {children}
    </div>
  ),
}));
afterEach(cleanup);
function show(path: string) {
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route element={<PortalLayout />}>
            <Route path="*" element={<p>Dashboard</p>} />
          </Route>
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}
it("présente uniquement l'espace et le profil élève pour un compte élève", async () => {
  fixture.parent = false;
  fixture.student = true;
  show("/portail/eleve");
  expect(await screen.findByRole("heading", { name: "Espace élève" })).toBeVisible();
  expect(screen.getByRole("link", { name: "Mon profil élève" })).toBeVisible();
  expect(screen.queryByRole("link", { name: "Mes enfants" })).not.toBeInTheDocument();
});
it("présente le suivi des enfants et le profil parent pour un parent", async () => {
  fixture.parent = true;
  fixture.student = false;
  show("/portail/parent");
  expect(await screen.findByRole("heading", { name: "Espace parent / tuteur" })).toBeVisible();
  expect(screen.getByRole("link", { name: "Mon profil parent" })).toBeVisible();
  expect(screen.queryByRole("link", { name: "Mon dashboard élève" })).not.toBeInTheDocument();
});
it("permet aux comptes cumulant les rôles de choisir leur espace", async () => {
  fixture.parent = true;
  fixture.student = true;
  show("/portail/eleve");
  expect(await screen.findByRole("link", { name: "Espace parent" })).toBeVisible();
  expect(screen.getByRole("link", { name: "Espace élève" })).toBeVisible();
});
