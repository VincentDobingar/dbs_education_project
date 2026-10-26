import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";

import { TimetableGrid } from "./TimetableGrid.js";

afterEach(cleanup);
it("place les heures en lignes, les jours en colonnes et affiche la récréation", () => {
  render(
    <TimetableGrid
      lessons={[{ id: "e", dayOfWeek: 0, startTime: "08:00", endTime: "09:00", label: "Mathématiques" }]}
      breaks={[{ label: "Récréation", startTime: "09:00", endTime: "09:15", days: [0, 1, 2, 3, 4] }]}
    />,
  );
  expect(screen.getByRole("columnheader", { name: "Lundi" })).toBeInTheDocument();
  const lesson = screen.getByRole("rowheader", { name: "08:00 – 09:00" }).closest("tr")!;
  expect(within(lesson).getAllByRole("cell")[0]).toHaveTextContent("Mathématiques");
  const pause = screen.getByRole("rowheader", { name: "09:00 – 09:15" }).closest("tr")!;
  expect(within(pause).getAllByRole("cell")[0]).toHaveTextContent("Récréation");
  expect(within(pause).getAllByRole("cell")[5]).not.toHaveTextContent("Récréation");
  expect(screen.queryByRole("button")).not.toBeInTheDocument();
});
