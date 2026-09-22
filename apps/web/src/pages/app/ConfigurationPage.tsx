import { Button } from "@edumanage/ui";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { useRef, useState } from "react";
import { useForm } from "react-hook-form";
import { useTranslation } from "react-i18next";
import { z } from "zod";

import {
  createFeeCategory,
  createFeeStructure,
  listFeeCategories,
  listFeeStructures,
} from "../../lib/financeApi.js";
import { createAssessmentType, listAssessmentTypes } from "../../lib/gradingApi.js";
import {
  archiveRoom,
  createAcademicPeriod,
  createAcademicYear,
  createCalendarEvent,
  createCampus,
  createClassroom,
  createEducationCycle,
  createGradeLevel,
  createRoom,
  createSubject,
  getTenantLogo,
  listAcademicPeriods,
  listAcademicYears,
  listCalendarEvents,
  listCampuses,
  listClassrooms,
  listEducationCycles,
  listGradeLevels,
  listRooms,
  listSubjects,
  removeCalendarEvent,
  uploadTenantLogo,
  type AcademicPeriodType,
} from "../../lib/schoolConfigApi.js";
import { useRequiredSession } from "../../lib/useSession.js";

function Section({ title, children }: { title: string; children: ReactNode }): ReactNode {
  return (
    <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
      <h2 className="text-lg font-semibold text-slate-900">{title}</h2>
      <div className="mt-4 space-y-4">{children}</div>
    </section>
  );
}

function Table({
  columns,
  rows,
  empty,
}: {
  columns: string[];
  rows: (string | number)[][];
  empty: string;
}): ReactNode {
  if (rows.length === 0) {
    return <p className="text-sm text-slate-500">{empty}</p>;
  }
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left text-sm">
        <thead>
          <tr className="border-b border-slate-200 text-slate-500">
            {columns.map((col) => (
              <th key={col} className="pb-2 pr-4 font-medium">
                {col}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, index) => (
            <tr key={index} className="border-b border-slate-100 last:border-0">
              {row.map((cell, cellIndex) => (
                <td key={cellIndex} className="py-2 pr-4 text-slate-700">
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function formatAmount(cents: number): string {
  return (cents / 100).toLocaleString("fr-FR", { maximumFractionDigits: 0 });
}

const campusSchema = z.object({ name: z.string().min(2), code: z.string().min(1) });
const yearSchema = z.object({
  name: z.string().min(2),
  startDate: z.string().min(1),
  endDate: z.string().min(1),
});
const cycleSchema = z.object({
  code: z.string().min(1),
  nameFr: z.string().min(1),
  nameEn: z.string().min(1),
  order: z.coerce.number().int().nonnegative(),
});
const gradeLevelSchema = z.object({
  cycleId: z.string().min(1),
  code: z.string().min(1),
  nameFr: z.string().min(1),
  nameEn: z.string().min(1),
  order: z.coerce.number().int().nonnegative(),
});
const classroomSchema = z.object({
  name: z.string().min(1),
  academicYearId: z.string().min(1),
  campusId: z.string().min(1),
  gradeLevelId: z.string().min(1),
  capacity: z.coerce.number().int().positive().optional(),
});
const subjectSchema = z.object({
  code: z.string().min(1),
  nameFr: z.string().min(1),
  nameEn: z.string().min(1),
});
const periodSchema = z.object({
  name: z.string().min(2),
  type: z.enum(["TRIMESTER", "SEMESTER", "CUSTOM"]),
  sequence: z.coerce.number().int().positive(),
  startDate: z.string().min(1),
  endDate: z.string().min(1),
});
const assessmentTypeSchema = z.object({
  code: z.string().min(1),
  nameFr: z.string().min(1),
  nameEn: z.string().min(1),
});
const feeCategorySchema = z.object({
  code: z.string().min(1),
  nameFr: z.string().min(1),
  nameEn: z.string().min(1),
});
const roomSchema = z.object({
  name: z.string().min(1),
  campusId: z.string().optional(),
  capacity: z.coerce.number().int().positive().optional(),
});
const CALENDAR_EVENT_TYPES = ["HOLIDAY", "EXAM_PERIOD", "SCHOOL_EVENT", "OTHER"] as const;
const calendarEventSchema = z.object({
  academicYearId: z.string().optional(),
  type: z.enum(CALENDAR_EVENT_TYPES),
  title: z.string().min(1),
  startDate: z.string().min(1),
  endDate: z.string().optional(),
});
const feeStructureSchema = z.object({
  academicYearId: z.string().min(1),
  gradeLevelId: z.string().optional(),
  feeCategoryId: z.string().min(1),
  amount: z.coerce.number().positive(),
  dueDate: z.string().optional(),
  isMandatory: z.boolean().optional(),
});

export function ConfigurationPage(): ReactNode {
  const { t } = useTranslation("app");
  const session = useRequiredSession();
  const creds = { accessToken: session.accessToken, subdomain: session.subdomain };
  const queryClient = useQueryClient();

  const tenantLogo = useQuery({
    queryKey: ["tenant-logo", session.subdomain],
    queryFn: () => getTenantLogo(creds),
  });
  const logoFileInputRef = useRef<HTMLInputElement>(null);
  const [logoLoadFailed, setLogoLoadFailed] = useState(false);
  const uploadLogoMutation = useMutation({
    mutationFn: (file: File) => uploadTenantLogo(file, creds),
    onSuccess: () => {
      setLogoLoadFailed(false);
      void queryClient.invalidateQueries({ queryKey: ["tenant-logo", session.subdomain] });
    },
  });

  const campuses = useQuery({
    queryKey: ["campuses", session.subdomain],
    queryFn: () => listCampuses(creds),
  });
  const years = useQuery({
    queryKey: ["academic-years", session.subdomain],
    queryFn: () => listAcademicYears(creds),
  });
  const cycles = useQuery({
    queryKey: ["education-cycles", session.subdomain],
    queryFn: () => listEducationCycles(creds),
  });
  const gradeLevels = useQuery({
    queryKey: ["grade-levels", session.subdomain],
    queryFn: () => listGradeLevels(creds),
  });
  const classrooms = useQuery({
    queryKey: ["classrooms", session.subdomain],
    queryFn: () => listClassrooms(creds),
  });
  const subjects = useQuery({
    queryKey: ["subjects", session.subdomain],
    queryFn: () => listSubjects(creds),
  });
  const assessmentTypes = useQuery({
    queryKey: ["assessment-types", session.subdomain],
    queryFn: () => listAssessmentTypes(creds),
  });

  const [periodYearId, setPeriodYearId] = useState("");
  const periods = useQuery({
    queryKey: ["academic-periods", session.subdomain, periodYearId],
    queryFn: () => listAcademicPeriods(periodYearId, creds),
    enabled: Boolean(periodYearId),
  });

  const feeCategories = useQuery({
    queryKey: ["fee-categories", session.subdomain],
    queryFn: () => listFeeCategories(creds),
  });
  const feeStructures = useQuery({
    queryKey: ["fee-structures", session.subdomain],
    queryFn: () => listFeeStructures(creds),
  });

  const campusForm = useForm<z.infer<typeof campusSchema>>({ resolver: zodResolver(campusSchema) });
  const createCampusMutation = useMutation({
    mutationFn: (input: z.infer<typeof campusSchema>) => createCampus(input, creds),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["campuses", session.subdomain] });
      campusForm.reset();
    },
  });

  const rooms = useQuery({
    queryKey: ["rooms", session.subdomain],
    queryFn: () => listRooms(creds),
  });
  const roomForm = useForm<z.infer<typeof roomSchema>>({ resolver: zodResolver(roomSchema) });
  const createRoomMutation = useMutation({
    mutationFn: (input: z.infer<typeof roomSchema>) => {
      const { campusId, capacity, ...rest } = input;
      return createRoom(
        { ...rest, ...(campusId ? { campusId } : {}), ...(capacity ? { capacity } : {}) },
        creds,
      );
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["rooms", session.subdomain] });
      roomForm.reset();
    },
  });
  const archiveRoomMutation = useMutation({
    mutationFn: (id: string) => archiveRoom(id, creds),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ["rooms", session.subdomain] }),
  });

  const calendarEvents = useQuery({
    queryKey: ["calendar-events", session.subdomain],
    queryFn: () => listCalendarEvents(creds),
  });
  const calendarEventForm = useForm<z.infer<typeof calendarEventSchema>>({
    resolver: zodResolver(calendarEventSchema),
    defaultValues: { type: "HOLIDAY" },
  });
  const createCalendarEventMutation = useMutation({
    mutationFn: (input: z.infer<typeof calendarEventSchema>) => {
      const { academicYearId, endDate, ...rest } = input;
      return createCalendarEvent(
        { ...rest, ...(academicYearId ? { academicYearId } : {}), ...(endDate ? { endDate } : {}) },
        creds,
      );
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["calendar-events", session.subdomain] });
      calendarEventForm.reset({ type: "HOLIDAY" });
    },
  });
  const removeCalendarEventMutation = useMutation({
    mutationFn: (id: string) => removeCalendarEvent(id, creds),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ["calendar-events", session.subdomain] }),
  });

  const yearForm = useForm<z.infer<typeof yearSchema>>({ resolver: zodResolver(yearSchema) });
  const createYearMutation = useMutation({
    mutationFn: (input: z.infer<typeof yearSchema>) => createAcademicYear(input, creds),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["academic-years", session.subdomain] });
      yearForm.reset();
    },
  });

  const cycleForm = useForm<z.infer<typeof cycleSchema>>({ resolver: zodResolver(cycleSchema) });
  const createCycleMutation = useMutation({
    mutationFn: (input: z.infer<typeof cycleSchema>) => createEducationCycle(input, creds),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["education-cycles", session.subdomain] });
      cycleForm.reset();
    },
  });

  const gradeLevelForm = useForm<z.infer<typeof gradeLevelSchema>>({
    resolver: zodResolver(gradeLevelSchema),
  });
  const createGradeLevelMutation = useMutation({
    mutationFn: (input: z.infer<typeof gradeLevelSchema>) => createGradeLevel(input.cycleId, input, creds),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["grade-levels", session.subdomain] });
      gradeLevelForm.reset();
    },
  });

  const classroomForm = useForm<z.infer<typeof classroomSchema>>({
    resolver: zodResolver(classroomSchema),
  });
  const createClassroomMutation = useMutation({
    mutationFn: (input: z.infer<typeof classroomSchema>) => {
      const { capacity, ...rest } = input;
      return createClassroom({ ...rest, ...(capacity ? { capacity } : {}) }, creds);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["classrooms", session.subdomain] });
      classroomForm.reset();
    },
  });

  const subjectForm = useForm<z.infer<typeof subjectSchema>>({ resolver: zodResolver(subjectSchema) });
  const createSubjectMutation = useMutation({
    mutationFn: (input: z.infer<typeof subjectSchema>) => createSubject(input, creds),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["subjects", session.subdomain] });
      subjectForm.reset();
    },
  });

  const periodForm = useForm<z.infer<typeof periodSchema>>({ resolver: zodResolver(periodSchema) });
  const createPeriodMutation = useMutation({
    mutationFn: (input: z.infer<typeof periodSchema>) => createAcademicPeriod(periodYearId, input, creds),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["academic-periods", session.subdomain, periodYearId] });
      periodForm.reset();
    },
  });

  const assessmentTypeForm = useForm<z.infer<typeof assessmentTypeSchema>>({
    resolver: zodResolver(assessmentTypeSchema),
  });
  const createAssessmentTypeMutation = useMutation({
    mutationFn: (input: z.infer<typeof assessmentTypeSchema>) => createAssessmentType(input, creds),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["assessment-types", session.subdomain] });
      assessmentTypeForm.reset();
    },
  });

  const feeCategoryForm = useForm<z.infer<typeof feeCategorySchema>>({
    resolver: zodResolver(feeCategorySchema),
  });
  const createFeeCategoryMutation = useMutation({
    mutationFn: (input: z.infer<typeof feeCategorySchema>) => createFeeCategory(input, creds),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["fee-categories", session.subdomain] });
      feeCategoryForm.reset();
    },
  });

  const feeStructureForm = useForm<z.infer<typeof feeStructureSchema>>({
    resolver: zodResolver(feeStructureSchema),
  });
  const createFeeStructureMutation = useMutation({
    mutationFn: (values: z.infer<typeof feeStructureSchema>) => {
      const { amount, gradeLevelId, dueDate, isMandatory, ...rest } = values;
      return createFeeStructure(
        {
          ...rest,
          amountCents: Math.round(amount * 100),
          ...(gradeLevelId ? { gradeLevelId } : {}),
          ...(dueDate ? { dueDate } : {}),
          ...(isMandatory !== undefined ? { isMandatory } : {}),
        },
        creds,
      );
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["fee-structures", session.subdomain] });
      feeStructureForm.reset();
    },
  });

  return (
    <div className="mx-auto max-w-4xl space-y-6 px-6 py-10">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">{t("config.title")}</h1>
        <p className="mt-1 text-sm text-slate-500">{t("config.subtitle")}</p>
      </div>

      <Section title={t("config.logo")}>
        <div className="flex flex-wrap items-center gap-4">
          {tenantLogo.data?.logoUrl && !logoLoadFailed ? (
            <img
              src={tenantLogo.data.logoUrl}
              alt=""
              className="h-16 w-16 rounded-md border border-slate-200 object-contain"
              onError={() => setLogoLoadFailed(true)}
            />
          ) : (
            <p className="text-sm text-slate-500">{t("config.logoEmpty")}</p>
          )}
          <input
            ref={logoFileInputRef}
            type="file"
            accept="image/png,image/jpeg"
            className="hidden"
            disabled={uploadLogoMutation.isPending}
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) {
                uploadLogoMutation.mutate(file);
              }
              event.target.value = "";
            }}
          />
          <Button
            type="button"
            variant="secondary"
            disabled={uploadLogoMutation.isPending}
            onClick={() => logoFileInputRef.current?.click()}
          >
            {uploadLogoMutation.isPending ? t("config.uploadingLogo") : t("config.chooseLogoFile")}
          </Button>
        </div>
        {uploadLogoMutation.isError ? (
          <p className="mt-2 text-sm text-red-600">{t("config.logoUploadError")}</p>
        ) : null}
        <p className="mt-2 text-xs text-slate-500">{t("config.logoHint")}</p>
      </Section>

      <Section title={t("config.academicYears")}>
        <Table
          columns={[t("config.col.name"), t("config.col.startDate"), t("config.col.endDate")]}
          rows={(years.data ?? []).map((y) => [y.name, y.startDate.slice(0, 10), y.endDate.slice(0, 10)])}
          empty={t("config.empty")}
        />
        <form
          onSubmit={(event) =>
            void yearForm.handleSubmit((values) => createYearMutation.mutate(values))(event)
          }
          className="flex flex-wrap items-end gap-3"
        >
          <input
            placeholder={t("config.form.yearName")}
            className="input w-40"
            {...yearForm.register("name")}
          />
          <input type="date" className="input w-40" {...yearForm.register("startDate")} />
          <input type="date" className="input w-40" {...yearForm.register("endDate")} />
          <Button type="submit" variant="secondary">
            {t("config.add")}
          </Button>
        </form>
      </Section>

      <Section title={t("config.campuses")}>
        <Table
          columns={[t("config.col.name"), t("config.col.code")]}
          rows={(campuses.data ?? []).map((c) => [c.name, c.code])}
          empty={t("config.empty")}
        />
        <form
          onSubmit={(event) =>
            void campusForm.handleSubmit((values) => createCampusMutation.mutate(values))(event)
          }
          className="flex flex-wrap items-end gap-3"
        >
          <input
            placeholder={t("config.form.campusName")}
            className="input w-48"
            {...campusForm.register("name")}
          />
          <input
            placeholder={t("config.form.campusCode")}
            className="input w-32"
            {...campusForm.register("code")}
          />
          <Button type="submit" variant="secondary">
            {t("config.add")}
          </Button>
        </form>
      </Section>

      <Section title={t("config.rooms")}>
        {(rooms.data ?? []).length === 0 ? (
          <p className="text-sm text-slate-500">{t("config.empty")}</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-slate-500">
                  <th className="pb-2 pr-4 font-medium">{t("config.col.name")}</th>
                  <th className="pb-2 pr-4 font-medium">{t("config.col.capacity")}</th>
                  <th className="pb-2 pr-4" />
                </tr>
              </thead>
              <tbody>
                {(rooms.data ?? []).map((room) => (
                  <tr key={room.id} className="border-b border-slate-100 last:border-0">
                    <td className="py-2 pr-4 text-slate-700">{room.name}</td>
                    <td className="py-2 pr-4 text-slate-700">{room.capacity ?? "—"}</td>
                    <td className="py-2 pr-4">
                      <button
                        type="button"
                        className="text-xs text-red-600 hover:underline"
                        onClick={() => archiveRoomMutation.mutate(room.id)}
                      >
                        {t("admin.common.delete")}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <form
          onSubmit={(event) =>
            void roomForm.handleSubmit((values) => createRoomMutation.mutate(values))(event)
          }
          className="flex flex-wrap items-end gap-3"
        >
          <input
            placeholder={t("config.form.roomName")}
            className="input w-48"
            {...roomForm.register("name")}
          />
          <select className="input w-40" {...roomForm.register("campusId")}>
            <option value="">{t("config.form.selectCampus")}</option>
            {(campuses.data ?? []).map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
          <input
            type="number"
            min={1}
            placeholder={t("config.form.capacity")}
            className="input w-28"
            {...roomForm.register("capacity")}
          />
          <Button type="submit" variant="secondary">
            {t("config.add")}
          </Button>
        </form>
      </Section>

      <Section title={t("config.calendarEvents")}>
        {(calendarEvents.data ?? []).length === 0 ? (
          <p className="text-sm text-slate-500">{t("config.empty")}</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-slate-500">
                  <th className="pb-2 pr-4 font-medium">{t("config.col.title")}</th>
                  <th className="pb-2 pr-4 font-medium">{t("config.col.eventType")}</th>
                  <th className="pb-2 pr-4 font-medium">{t("config.col.startDate")}</th>
                  <th className="pb-2 pr-4 font-medium">{t("config.col.endDate")}</th>
                  <th className="pb-2 pr-4" />
                </tr>
              </thead>
              <tbody>
                {(calendarEvents.data ?? []).map((event) => (
                  <tr key={event.id} className="border-b border-slate-100 last:border-0">
                    <td className="py-2 pr-4 text-slate-700">{event.title}</td>
                    <td className="py-2 pr-4 text-slate-700">{t(`config.eventType.${event.type}`)}</td>
                    <td className="py-2 pr-4 text-slate-700">{event.startDate.slice(0, 10)}</td>
                    <td className="py-2 pr-4 text-slate-700">{event.endDate?.slice(0, 10) ?? "—"}</td>
                    <td className="py-2 pr-4">
                      <button
                        type="button"
                        className="text-xs text-red-600 hover:underline"
                        onClick={() => removeCalendarEventMutation.mutate(event.id)}
                      >
                        {t("admin.common.delete")}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <form
          onSubmit={(event) =>
            void calendarEventForm.handleSubmit((values) => createCalendarEventMutation.mutate(values))(event)
          }
          className="flex flex-wrap items-end gap-3"
        >
          <input
            placeholder={t("config.form.eventTitle")}
            className="input w-48"
            {...calendarEventForm.register("title")}
          />
          <select className="input w-40" {...calendarEventForm.register("type")}>
            {CALENDAR_EVENT_TYPES.map((type) => (
              <option key={type} value={type}>
                {t(`config.eventType.${type}`)}
              </option>
            ))}
          </select>
          <input type="date" className="input w-40" {...calendarEventForm.register("startDate")} />
          <input type="date" className="input w-40" {...calendarEventForm.register("endDate")} />
          <select className="input w-40" {...calendarEventForm.register("academicYearId")}>
            <option value="">{t("config.form.selectYear")}</option>
            {(years.data ?? []).map((y) => (
              <option key={y.id} value={y.id}>
                {y.name}
              </option>
            ))}
          </select>
          <Button type="submit" variant="secondary">
            {t("config.add")}
          </Button>
        </form>
      </Section>

      <Section title={t("config.cycles")}>
        <Table
          columns={[t("config.col.code"), t("config.col.nameFr"), t("config.col.order")]}
          rows={(cycles.data ?? []).map((c) => [c.code, c.nameFr, c.order])}
          empty={t("config.empty")}
        />
        <form
          onSubmit={(event) =>
            void cycleForm.handleSubmit((values) => createCycleMutation.mutate(values))(event)
          }
          className="flex flex-wrap items-end gap-3"
        >
          <input placeholder={t("config.form.code")} className="input w-28" {...cycleForm.register("code")} />
          <input
            placeholder={t("config.form.nameFr")}
            className="input w-40"
            {...cycleForm.register("nameFr")}
          />
          <input
            placeholder={t("config.form.nameEn")}
            className="input w-40"
            {...cycleForm.register("nameEn")}
          />
          <input
            type="number"
            placeholder={t("config.form.order")}
            className="input w-24"
            {...cycleForm.register("order")}
          />
          <Button type="submit" variant="secondary">
            {t("config.add")}
          </Button>
        </form>
      </Section>

      <Section title={t("config.gradeLevels")}>
        <Table
          columns={[t("config.col.code"), t("config.col.nameFr"), t("config.col.cycle")]}
          rows={(gradeLevels.data ?? []).map((g) => [
            g.code,
            g.nameFr,
            cycles.data?.find((c) => c.id === g.cycleId)?.nameFr ?? g.cycleId,
          ])}
          empty={t("config.empty")}
        />
        <form
          onSubmit={(event) =>
            void gradeLevelForm.handleSubmit((values) => createGradeLevelMutation.mutate(values))(event)
          }
          className="flex flex-wrap items-end gap-3"
        >
          <select className="input w-40" {...gradeLevelForm.register("cycleId")}>
            <option value="">{t("config.form.selectCycle")}</option>
            {(cycles.data ?? []).map((c) => (
              <option key={c.id} value={c.id}>
                {c.nameFr}
              </option>
            ))}
          </select>
          <input
            placeholder={t("config.form.code")}
            className="input w-28"
            {...gradeLevelForm.register("code")}
          />
          <input
            placeholder={t("config.form.nameFr")}
            className="input w-40"
            {...gradeLevelForm.register("nameFr")}
          />
          <input
            placeholder={t("config.form.nameEn")}
            className="input w-40"
            {...gradeLevelForm.register("nameEn")}
          />
          <input
            type="number"
            placeholder={t("config.form.order")}
            className="input w-24"
            {...gradeLevelForm.register("order")}
          />
          <Button type="submit" variant="secondary">
            {t("config.add")}
          </Button>
        </form>
      </Section>

      <Section title={t("config.classrooms")}>
        <Table
          columns={[t("config.col.name"), t("config.col.capacity")]}
          rows={(classrooms.data ?? []).map((c) => [c.name, c.capacity ?? "—"])}
          empty={t("config.empty")}
        />
        <form
          onSubmit={(event) =>
            void classroomForm.handleSubmit((values) => createClassroomMutation.mutate(values))(event)
          }
          className="flex flex-wrap items-end gap-3"
        >
          <input
            placeholder={t("config.form.classroomName")}
            className="input w-40"
            {...classroomForm.register("name")}
          />
          <select className="input w-40" {...classroomForm.register("academicYearId")}>
            <option value="">{t("config.form.selectYear")}</option>
            {(years.data ?? []).map((y) => (
              <option key={y.id} value={y.id}>
                {y.name}
              </option>
            ))}
          </select>
          <select className="input w-40" {...classroomForm.register("campusId")}>
            <option value="">{t("config.form.selectCampus")}</option>
            {(campuses.data ?? []).map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
          <select className="input w-40" {...classroomForm.register("gradeLevelId")}>
            <option value="">{t("config.form.selectGradeLevel")}</option>
            {(gradeLevels.data ?? []).map((g) => (
              <option key={g.id} value={g.id}>
                {g.nameFr}
              </option>
            ))}
          </select>
          <input
            type="number"
            placeholder={t("config.form.capacity")}
            className="input w-28"
            {...classroomForm.register("capacity")}
          />
          <Button type="submit" variant="secondary">
            {t("config.add")}
          </Button>
        </form>
      </Section>

      <Section title={t("config.subjects")}>
        <Table
          columns={[t("config.col.code"), t("config.col.nameFr")]}
          rows={(subjects.data ?? []).map((s) => [s.code, s.nameFr])}
          empty={t("config.empty")}
        />
        <form
          onSubmit={(event) =>
            void subjectForm.handleSubmit((values) => createSubjectMutation.mutate(values))(event)
          }
          className="flex flex-wrap items-end gap-3"
        >
          <input
            placeholder={t("config.form.code")}
            className="input w-28"
            {...subjectForm.register("code")}
          />
          <input
            placeholder={t("config.form.nameFr")}
            className="input w-40"
            {...subjectForm.register("nameFr")}
          />
          <input
            placeholder={t("config.form.nameEn")}
            className="input w-40"
            {...subjectForm.register("nameEn")}
          />
          <Button type="submit" variant="secondary">
            {t("config.add")}
          </Button>
        </form>
      </Section>

      <Section title={t("config.periods")}>
        <label className="block text-xs font-medium text-slate-600">{t("config.form.selectYear")}</label>
        <select
          className="input w-56"
          value={periodYearId}
          onChange={(event) => setPeriodYearId(event.target.value)}
        >
          <option value="">{t("config.form.selectYear")}</option>
          {(years.data ?? []).map((y) => (
            <option key={y.id} value={y.id}>
              {y.name}
            </option>
          ))}
        </select>

        {periodYearId ? (
          <>
            <Table
              columns={[
                t("config.col.name"),
                t("config.col.periodType"),
                t("config.col.startDate"),
                t("config.col.endDate"),
              ]}
              rows={(periods.data ?? [])
                .slice()
                .sort((a, b) => a.sequence - b.sequence)
                .map((p) => [
                  p.name,
                  t(`config.periodType.${p.type}`),
                  p.startDate.slice(0, 10),
                  p.endDate.slice(0, 10),
                ])}
              empty={t("config.empty")}
            />
            <form
              onSubmit={(event) =>
                void periodForm.handleSubmit((values) => createPeriodMutation.mutate(values))(event)
              }
              className="flex flex-wrap items-end gap-3"
            >
              <input
                placeholder={t("config.form.periodName")}
                className="input w-40"
                {...periodForm.register("name")}
              />
              <select className="input w-32" {...periodForm.register("type")}>
                {(["TRIMESTER", "SEMESTER", "CUSTOM"] satisfies AcademicPeriodType[]).map((type) => (
                  <option key={type} value={type}>
                    {t(`config.periodType.${type}`)}
                  </option>
                ))}
              </select>
              <input
                type="number"
                placeholder={t("config.form.sequence")}
                className="input w-24"
                {...periodForm.register("sequence")}
              />
              <input type="date" className="input w-40" {...periodForm.register("startDate")} />
              <input type="date" className="input w-40" {...periodForm.register("endDate")} />
              <Button type="submit" variant="secondary">
                {t("config.add")}
              </Button>
            </form>
          </>
        ) : null}
      </Section>

      <Section title={t("config.assessmentTypes")}>
        <Table
          columns={[t("config.col.code"), t("config.col.nameFr")]}
          rows={(assessmentTypes.data ?? []).map((a) => [a.code, a.nameFr])}
          empty={t("config.empty")}
        />
        <form
          onSubmit={(event) =>
            void assessmentTypeForm.handleSubmit((values) => createAssessmentTypeMutation.mutate(values))(
              event,
            )
          }
          className="flex flex-wrap items-end gap-3"
        >
          <input
            placeholder={t("config.form.code")}
            className="input w-28"
            {...assessmentTypeForm.register("code")}
          />
          <input
            placeholder={t("config.form.nameFr")}
            className="input w-40"
            {...assessmentTypeForm.register("nameFr")}
          />
          <input
            placeholder={t("config.form.nameEn")}
            className="input w-40"
            {...assessmentTypeForm.register("nameEn")}
          />
          <Button type="submit" variant="secondary">
            {t("config.add")}
          </Button>
        </form>
      </Section>

      <Section title={t("config.feeCategories")}>
        <Table
          columns={[t("config.col.code"), t("config.col.nameFr")]}
          rows={(feeCategories.data ?? []).map((c) => [c.code, c.nameFr])}
          empty={t("config.empty")}
        />
        <form
          onSubmit={(event) =>
            void feeCategoryForm.handleSubmit((values) => createFeeCategoryMutation.mutate(values))(event)
          }
          className="flex flex-wrap items-end gap-3"
        >
          <input
            placeholder={t("config.form.code")}
            className="input w-28"
            {...feeCategoryForm.register("code")}
          />
          <input
            placeholder={t("config.form.nameFr")}
            className="input w-40"
            {...feeCategoryForm.register("nameFr")}
          />
          <input
            placeholder={t("config.form.nameEn")}
            className="input w-40"
            {...feeCategoryForm.register("nameEn")}
          />
          <Button type="submit" variant="secondary">
            {t("config.add")}
          </Button>
        </form>
      </Section>

      <Section title={t("config.feeStructures")}>
        <Table
          columns={[
            t("config.col.feeCategory"),
            t("config.col.gradeLevel"),
            t("config.col.amount"),
            t("config.col.mandatory"),
          ]}
          rows={(feeStructures.data ?? []).map((fs) => [
            feeCategories.data?.find((c) => c.id === fs.feeCategoryId)?.nameFr ?? fs.feeCategoryId,
            gradeLevels.data?.find((g) => g.id === fs.gradeLevelId)?.nameFr ?? t("config.allGradeLevels"),
            formatAmount(fs.amountCents),
            fs.isMandatory ? t("config.yes") : t("config.no"),
          ])}
          empty={t("config.empty")}
        />
        <form
          onSubmit={(event) =>
            void feeStructureForm.handleSubmit((values) => createFeeStructureMutation.mutate(values))(event)
          }
          className="flex flex-wrap items-end gap-3"
        >
          <select className="input w-40" {...feeStructureForm.register("academicYearId")}>
            <option value="">{t("config.form.selectYear")}</option>
            {(years.data ?? []).map((y) => (
              <option key={y.id} value={y.id}>
                {y.name}
              </option>
            ))}
          </select>
          <select className="input w-40" {...feeStructureForm.register("feeCategoryId")}>
            <option value="">{t("config.form.selectFeeCategory")}</option>
            {(feeCategories.data ?? []).map((c) => (
              <option key={c.id} value={c.id}>
                {c.nameFr}
              </option>
            ))}
          </select>
          <select className="input w-40" {...feeStructureForm.register("gradeLevelId")}>
            <option value="">{t("config.allGradeLevels")}</option>
            {(gradeLevels.data ?? []).map((g) => (
              <option key={g.id} value={g.id}>
                {g.nameFr}
              </option>
            ))}
          </select>
          <input
            type="number"
            step="0.01"
            placeholder={t("config.form.amount")}
            className="input w-28"
            {...feeStructureForm.register("amount")}
          />
          <input type="date" className="input w-40" {...feeStructureForm.register("dueDate")} />
          <label className="flex items-center gap-2 text-sm text-slate-600">
            <input type="checkbox" defaultChecked {...feeStructureForm.register("isMandatory")} />
            {t("config.form.mandatory")}
          </label>
          <Button type="submit" variant="secondary">
            {t("config.add")}
          </Button>
        </form>
      </Section>
    </div>
  );
}
