import { Button } from "@edumanage/ui";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { useState } from "react";
import { useTranslation } from "react-i18next";

import {
  addResource,
  cancelCourse,
  createCourse,
  listCourses,
  listProgress,
  listResources,
  removeResource,
  type LearningResourceType,
} from "../../lib/elearningApi.js";
import { listClassrooms, listSubjects } from "../../lib/schoolConfigApi.js";
import { useRequiredSession } from "../../lib/useSession.js";

const RESOURCE_TYPES: LearningResourceType[] = ["VIDEO", "DOCUMENT", "LINK", "TEXT"];

export function ElearningPage(): ReactNode {
  const { t } = useTranslation("app");
  const session = useRequiredSession();
  const creds = { accessToken: session.accessToken, subdomain: session.subdomain };
  const queryClient = useQueryClient();

  const classrooms = useQuery({
    queryKey: ["classrooms", session.subdomain],
    queryFn: () => listClassrooms(creds),
  });
  const subjects = useQuery({
    queryKey: ["subjects", session.subdomain],
    queryFn: () => listSubjects(creds),
  });

  const courses = useQuery({
    queryKey: ["elearning-courses", session.subdomain],
    queryFn: () => listCourses({}, creds),
  });
  const [courseForm, setCourseForm] = useState({
    classroomId: "",
    subjectId: "",
    title: "",
    description: "",
  });
  const createCourseMutation = useMutation({
    mutationFn: () =>
      createCourse(
        {
          classroomId: courseForm.classroomId,
          subjectId: courseForm.subjectId,
          title: courseForm.title,
          ...(courseForm.description ? { description: courseForm.description } : {}),
        },
        creds,
      ),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["elearning-courses", session.subdomain] });
      setCourseForm({ classroomId: "", subjectId: "", title: "", description: "" });
    },
  });
  const cancelCourseMutation = useMutation({
    mutationFn: (id: string) => cancelCourse(id, creds),
    onSuccess: () =>
      void queryClient.invalidateQueries({ queryKey: ["elearning-courses", session.subdomain] }),
  });

  const [selectedCourseId, setSelectedCourseId] = useState("");
  const resources = useQuery({
    queryKey: ["elearning-resources", selectedCourseId],
    queryFn: () => listResources(selectedCourseId, creds),
    enabled: Boolean(selectedCourseId),
  });
  const progress = useQuery({
    queryKey: ["elearning-progress", selectedCourseId],
    queryFn: () => listProgress(selectedCourseId, creds),
    enabled: Boolean(selectedCourseId),
  });

  const [resourceForm, setResourceForm] = useState<{
    title: string;
    type: LearningResourceType;
    url: string;
    content: string;
  }>({ title: "", type: "LINK", url: "", content: "" });
  const addResourceMutation = useMutation({
    mutationFn: () =>
      addResource(
        selectedCourseId,
        {
          title: resourceForm.title,
          type: resourceForm.type,
          ...(resourceForm.url ? { url: resourceForm.url } : {}),
          ...(resourceForm.content ? { content: resourceForm.content } : {}),
        },
        creds,
      ),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["elearning-resources", selectedCourseId] });
      setResourceForm({ title: "", type: "LINK", url: "", content: "" });
    },
  });
  const removeResourceMutation = useMutation({
    mutationFn: (resourceId: string) => removeResource(selectedCourseId, resourceId, creds),
    onSuccess: () =>
      void queryClient.invalidateQueries({ queryKey: ["elearning-resources", selectedCourseId] }),
  });

  const classroomName = (id: string): string => classrooms.data?.find((c) => c.id === id)?.name ?? id;
  const subjectName = (id: string): string => subjects.data?.find((s) => s.id === id)?.nameFr ?? id;

  return (
    <div className="mx-auto max-w-5xl space-y-6 px-6 py-10">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">{t("elearning.title")}</h1>
        <p className="mt-1 text-sm text-slate-500">{t("elearning.subtitle")}</p>
      </div>

      <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="text-lg font-semibold text-slate-900">{t("elearning.courses")}</h2>
        {(courses.data ?? []).length === 0 ? (
          <p className="mt-3 text-sm text-slate-500">{t("admin.common.empty")}</p>
        ) : (
          <table className="mt-3 w-full text-left text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-slate-500">
                <th className="pb-2 pr-4 font-medium">{t("elearning.courseTitle")}</th>
                <th className="pb-2 pr-4 font-medium">{t("config.col.name")}</th>
                <th className="pb-2 pr-4 font-medium">{t("timetable.subject")}</th>
                <th className="pb-2 pr-4" />
              </tr>
            </thead>
            <tbody>
              {(courses.data ?? []).map((course) => (
                <tr key={course.id} className="border-b border-slate-100 last:border-0">
                  <td className="py-2 pr-4 text-slate-700">{course.title}</td>
                  <td className="py-2 pr-4 text-slate-700">{classroomName(course.classroomId)}</td>
                  <td className="py-2 pr-4 text-slate-700">{subjectName(course.subjectId)}</td>
                  <td className="py-2 pr-4 flex gap-3">
                    <button
                      type="button"
                      className="text-xs text-brand-teal hover:underline"
                      onClick={() => setSelectedCourseId(course.id)}
                    >
                      {t("admin.common.open")}
                    </button>
                    <button
                      type="button"
                      className="text-xs text-red-600 hover:underline"
                      onClick={() => cancelCourseMutation.mutate(course.id)}
                    >
                      {t("admin.common.delete")}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <form
          onSubmit={(event) => {
            event.preventDefault();
            createCourseMutation.mutate();
          }}
          className="mt-4 flex flex-wrap items-end gap-3"
        >
          <select
            className="input w-48"
            value={courseForm.classroomId}
            onChange={(event) => setCourseForm({ ...courseForm, classroomId: event.target.value })}
          >
            <option value="">{t("elearning.selectClassroom")}</option>
            {(classrooms.data ?? []).map((classroom) => (
              <option key={classroom.id} value={classroom.id}>
                {classroom.name}
              </option>
            ))}
          </select>
          <select
            className="input w-48"
            value={courseForm.subjectId}
            onChange={(event) => setCourseForm({ ...courseForm, subjectId: event.target.value })}
          >
            <option value="">{t("timetable.selectSubject")}</option>
            {(subjects.data ?? []).map((subject) => (
              <option key={subject.id} value={subject.id}>
                {subject.nameFr}
              </option>
            ))}
          </select>
          <input
            placeholder={t("elearning.courseTitle")}
            className="input w-56"
            value={courseForm.title}
            onChange={(event) => setCourseForm({ ...courseForm, title: event.target.value })}
          />
          <Button
            type="submit"
            variant="secondary"
            disabled={!courseForm.classroomId || !courseForm.subjectId || !courseForm.title}
          >
            {t("admin.common.create")}
          </Button>
        </form>
      </section>

      {selectedCourseId ? (
        <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="text-lg font-semibold text-slate-900">{t("elearning.resources")}</h2>
          <ul className="mt-3 space-y-1 text-sm">
            {(resources.data ?? []).map((resource) => (
              <li
                key={resource.id}
                className="flex items-center justify-between border-b border-slate-100 pb-1"
              >
                <span className="text-slate-700">
                  {resource.order}. {resource.title} ({t(`elearning.resourceType.${resource.type}`)})
                </span>
                <button
                  type="button"
                  className="text-xs text-red-600 hover:underline"
                  onClick={() => removeResourceMutation.mutate(resource.id)}
                >
                  {t("admin.common.delete")}
                </button>
              </li>
            ))}
          </ul>
          <form
            onSubmit={(event) => {
              event.preventDefault();
              addResourceMutation.mutate();
            }}
            className="mt-3 flex flex-wrap items-end gap-3"
          >
            <input
              placeholder={t("elearning.resourceTitle")}
              className="input w-48"
              value={resourceForm.title}
              onChange={(event) => setResourceForm({ ...resourceForm, title: event.target.value })}
            />
            <select
              className="input w-36"
              value={resourceForm.type}
              onChange={(event) =>
                setResourceForm({ ...resourceForm, type: event.target.value as LearningResourceType })
              }
            >
              {RESOURCE_TYPES.map((type) => (
                <option key={type} value={type}>
                  {t(`elearning.resourceType.${type}`)}
                </option>
              ))}
            </select>
            <input
              placeholder={t("elearning.resourceUrl")}
              className="input w-56"
              value={resourceForm.url}
              onChange={(event) => setResourceForm({ ...resourceForm, url: event.target.value })}
            />
            <Button
              type="submit"
              variant="secondary"
              disabled={!resourceForm.title || (!resourceForm.url && !resourceForm.content)}
            >
              {t("admin.common.create")}
            </Button>
          </form>

          <h2 className="mt-6 text-lg font-semibold text-slate-900">{t("elearning.progress")}</h2>
          {(progress.data ?? []).length === 0 ? (
            <p className="mt-3 text-sm text-slate-500">{t("admin.common.empty")}</p>
          ) : (
            <ul className="mt-3 space-y-1 text-sm">
              {(progress.data ?? []).map((entry) => (
                <li key={entry.id} className="flex justify-between border-b border-slate-100 pb-1">
                  <span className="font-mono text-xs text-slate-500">{entry.studentId}</span>
                  <span className="text-slate-500">{entry.completedAt.slice(0, 10)}</span>
                </li>
              ))}
            </ul>
          )}
        </section>
      ) : null}
    </div>
  );
}
