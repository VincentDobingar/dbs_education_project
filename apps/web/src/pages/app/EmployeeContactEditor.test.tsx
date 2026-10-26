import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";

import { updateEmployeeContact, type Employee } from "../../lib/employeesApi.js";
import { listSubjects } from "../../lib/schoolConfigApi.js";

import { EmployeeContactEditor } from "./EmployeeContactEditor.js";

vi.mock("../../lib/employeesApi.js", () => ({ updateEmployeeContact: vi.fn() }));
vi.mock("../../lib/schoolConfigApi.js", () => ({ listSubjects: vi.fn() }));
vi.mock("./EmployeeTeachingSetup.js", () => ({ EmployeeTeachingSetup: () => null }));
afterEach(() => {
  cleanup();
  vi.resetAllMocks();
});
it("enregistre l'email et la matière de la fiche personnel", async () => {
  const employee: Employee = {
    id: "e",
    employeeNumber: "EMP",
    firstName: "Awa",
    lastName: "Test",
    jobTitle: "Enseignante",
    status: "ACTIVE",
    hireDate: null,
    deletedAt: null,
  };
  const creds = { accessToken: "owner", subdomain: "school" };
  vi.mocked(listSubjects).mockResolvedValue([
    { id: "math", code: "MATH", nameFr: "Mathématiques", nameEn: "Math", departmentId: null },
  ]);
  vi.mocked(updateEmployeeContact).mockResolvedValue(employee);
  render(
    <QueryClientProvider client={new QueryClient()}>
      <EmployeeContactEditor employee={employee} creds={creds} />
    </QueryClientProvider>,
  );
  await screen.findByRole("option", { name: "Mathématiques" });
  fireEvent.change(screen.getByRole("textbox", { name: "Adresse email" }), {
    target: { value: "teacher@example.test" },
  });
  fireEvent.change(screen.getByRole("combobox", { name: "Matière" }), { target: { value: "math" } });
  fireEvent.click(screen.getByRole("button", { name: "Enregistrer email et matière" }));
  await waitFor(() =>
    expect(updateEmployeeContact).toHaveBeenCalledWith(
      "e",
      { email: "teacher@example.test", subjectId: "math" },
      creds,
    ),
  );
  expect(await screen.findByRole("status")).toHaveTextContent("Email et matière enregistrés");
});
