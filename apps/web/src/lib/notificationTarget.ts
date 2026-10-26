import type { Notification } from "./communicationApi.js";

export function notificationTarget(n: Notification) {
  const meta = n.metadata;
  if (!meta || typeof meta !== "object" || !("studentId" in meta) || typeof meta.studentId !== "string" || !meta.studentId) return null;
  const kinds: Record<string, { kind: string; key: string }> = {
    "grade.published": { kind: "grades", key: "assessmentId" },
    "homework.added": { kind: "homework", key: "homeworkId" },
    "attendance.absence": { kind: "attendance", key: "attendanceId" },
    "discipline.incident": { kind: "incidents", key: "incidentId" },
  };
  const target = kinds[n.type];
  if (!target || !("event" in meta) || !meta.event || typeof meta.event !== "object") return null;
  const id: unknown = (meta.event as Record<string, unknown>)[target.key];
  return typeof id === "string" && id ? { studentId: meta.studentId, kind: target.kind, id } : null;
}

export function notificationHref(n: Notification, studentMode: boolean) {
  const target = notificationTarget(n);
  if (!target) return null;
  const base = studentMode ? "/portail/eleve" : "/portail/parent/enfants";
  return `${base}/${encodeURIComponent(target.studentId)}/notifications/${encodeURIComponent(n.id)}`;
}
