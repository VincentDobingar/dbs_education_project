import { Button } from "@edumanage/ui";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { useForm } from "react-hook-form";
import { useTranslation } from "react-i18next";
import { z } from "zod";

import {
  createAcademicYear,
  createCampus,
  createClassroom,
  createEducationCycle,
  createGradeLevel,
  listAcademicYears,
  listCampuses,
  listClassrooms,
  listEducationCycles,
  listGradeLevels,
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

export function ConfigurationPage(): ReactNode {
  const { t } = useTranslation("app");
  const session = useRequiredSession();
  const creds = { accessToken: session.accessToken, subdomain: session.subdomain };
  const queryClient = useQueryClient();

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

  const campusForm = useForm<z.infer<typeof campusSchema>>({ resolver: zodResolver(campusSchema) });
  const createCampusMutation = useMutation({
    mutationFn: (input: z.infer<typeof campusSchema>) => createCampus(input, creds),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["campuses", session.subdomain] });
      campusForm.reset();
    },
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

  return (
    <div className="mx-auto max-w-4xl space-y-6 px-6 py-10">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">{t("config.title")}</h1>
        <p className="mt-1 text-sm text-slate-500">{t("config.subtitle")}</p>
      </div>

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
    </div>
  );
}
