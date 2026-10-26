import { useQuery } from "@tanstack/react-query";

import { TimetableGrid, type GridBreak } from "../../components/TimetableGrid.js";
import { apiRequest } from "../../lib/apiClient.js";
import type { TimetableEntry } from "../../lib/timetableApi.js";

export function PortalTimetable({
  entries,
  studentId,
  accessToken,
  parent = false,
}: {
  entries: TimetableEntry[];
  studentId: string;
  accessToken: string;
  parent?: boolean;
}) {
  const url = parent
    ? `/parent-portal/children/${studentId}/timetable-breaks`
    : `/student-portal/students/${studentId}/timetable-breaks`;
  const breaks = useQuery({
    queryKey: ["portal-timetable-breaks", accessToken, parent, studentId],
    queryFn: () => apiRequest<GridBreak[]>(url, { accessToken, authContext: "portal" }),
  });
  return (
    <>
      {breaks.isError && <p role="alert">Impossible de charger les récréations.</p>}
      <TimetableGrid
        lessons={entries.map((e) => ({
          ...e,
          label: e.subjectName ?? "Cours",
          detail: [e.teacherName, e.roomLabel].filter(Boolean).join(" · "),
        }))}
        breaks={breaks.data ?? []}
      />
    </>
  );
}
