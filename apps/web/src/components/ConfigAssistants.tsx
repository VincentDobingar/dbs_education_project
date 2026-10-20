import { Button } from "@edumanage/ui";
import { useQuery } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { useState } from "react";
import { useTranslation } from "react-i18next";

import { ApiError, type TenantCredentials } from "../lib/apiClient.js";
import {
  createAcademicYear,
  createCalendarEvent,
  createClassroom,
  createRoom,
  getCatalogContext,
  setCurrentAcademicYear,
  type AcademicYear,
  type CalendarEvent,
  type Campus,
  type Classroom,
  type GradeLevel,
  type Room,
} from "../lib/schoolConfigApi.js";

/**
 * Création en série avec les routes unitaires existantes : un doublon (409) est
 * compté comme « déjà présent » plutôt que d'interrompre la série ; toute autre
 * erreur l'arrête et est remontée.
 */
async function createSequentially<T>(
  items: readonly T[],
  create: (item: T) => Promise<unknown>,
): Promise<{ created: number; skipped: number }> {
  let created = 0;
  let skipped = 0;
  for (const item of items) {
    try {
      await create(item);
      created += 1;
    } catch (error) {
      if (error instanceof ApiError && error.status === 409) {
        skipped += 1;
        continue;
      }
      throw error;
    }
  }
  return { created, skipped };
}

function AssistantBox({ title, children }: { title: string; children: ReactNode }): ReactNode {
  return (
    <div className="rounded-md border border-teal-100 bg-teal-50/40 p-4">
      <p className="text-sm font-medium text-slate-800">{title}</p>
      <div className="mt-3">{children}</div>
    </div>
  );
}

function useRunner(onDone: () => void): {
  busy: boolean;
  message: { tone: "success" | "error"; text: string } | null;
  run: (task: () => Promise<{ created: number; skipped: number }>) => Promise<void>;
} {
  const { t } = useTranslation("app");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ tone: "success" | "error"; text: string } | null>(null);

  async function run(task: () => Promise<{ created: number; skipped: number }>): Promise<void> {
    setBusy(true);
    setMessage(null);
    try {
      const { created, skipped } = await task();
      setMessage({
        tone: "success",
        text:
          skipped > 0
            ? `${t("catalog.imported", { count: created })} ${t("catalog.skipped", { count: skipped })}`
            : t("catalog.imported", { count: created }),
      });
      onDone();
    } catch (error) {
      setMessage({
        tone: "error",
        text:
          error instanceof ApiError && error.status === 403
            ? t("catalog.error.forbidden")
            : t("catalog.error.generic"),
      });
    } finally {
      setBusy(false);
    }
  }

  return { busy, message, run };
}

function Feedback({ message }: { message: { tone: "success" | "error"; text: string } | null }): ReactNode {
  if (!message) return null;
  return (
    <span className={`text-sm ${message.tone === "success" ? "text-emerald-700" : "text-red-600"}`}>
      {message.text}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Années scolaires
// ---------------------------------------------------------------------------

/** Calendrier scolaire indicatif par pays (modifiable avant création). */
const SCHOOL_YEAR_PATTERNS: Record<string, { start: string; end: string; calendarYear?: true }> = {
  TD: { start: "10-01", end: "06-30" },
  SN: { start: "10-01", end: "07-31" },
  KE: { start: "01-05", end: "11-30", calendarYear: true },
  TZ: { start: "01-05", end: "12-05", calendarYear: true },
  UG: { start: "02-01", end: "12-05", calendarYear: true },
};
const DEFAULT_PATTERN = { start: "09-01", end: "06-30" };

interface YearSuggestion {
  name: string;
  startDate: string;
  endDate: string;
}

function suggestSchoolYears(countryIsoCode: string | null, today = new Date()): YearSuggestion[] {
  const pattern = (countryIsoCode && SCHOOL_YEAR_PATTERNS[countryIsoCode]) || DEFAULT_PATTERN;
  const year = today.getFullYear();
  if ("calendarYear" in pattern && pattern.calendarYear) {
    return [year, year + 1].map((y) => ({
      name: String(y),
      startDate: `${y}-${pattern.start}`,
      endDate: `${y}-${pattern.end}`,
    }));
  }
  // Après juin, l'année scolaire « en cours » est celle qui commence à la rentrée.
  const firstStart = today.getMonth() >= 6 ? year : year - 1;
  return [firstStart, firstStart + 1].map((y) => ({
    name: `${y}-${y + 1}`,
    startDate: `${y}-${pattern.start}`,
    endDate: `${y + 1}-${pattern.end}`,
  }));
}

export function AcademicYearAssistant({
  creds,
  years,
  onCreated,
}: {
  creds: TenantCredentials;
  years: readonly AcademicYear[];
  onCreated: () => void;
}): ReactNode {
  const { t } = useTranslation("app");
  const context = useQuery({
    queryKey: ["catalog-context", creds.subdomain],
    queryFn: () => getCatalogContext(creds),
    staleTime: Infinity,
  });
  const [edits, setEdits] = useState<Record<string, YearSuggestion>>({});
  const { busy, message, run } = useRunner(onCreated);

  if (!context.isSuccess) return null;
  const suggestions = suggestSchoolYears(context.data.countryIsoCode).filter(
    (suggestion) => !years.some((year) => year.name === suggestion.name),
  );
  if (suggestions.length === 0) return null;

  return (
    <AssistantBox title={t("assistant.years.title")}>
      <div className="flex flex-wrap gap-4">
        {suggestions.map((suggestion) => {
          const value = edits[suggestion.name] ?? suggestion;
          return (
            <div key={suggestion.name} className="rounded-md border border-slate-200 bg-white p-3">
              <p className="font-medium text-slate-900">{suggestion.name}</p>
              <div className="mt-2 flex flex-wrap items-center gap-2 text-sm">
                <input
                  type="date"
                  className="input w-40"
                  value={value.startDate}
                  onChange={(event) =>
                    setEdits({ ...edits, [suggestion.name]: { ...value, startDate: event.target.value } })
                  }
                />
                <span className="text-slate-400">→</span>
                <input
                  type="date"
                  className="input w-40"
                  value={value.endDate}
                  onChange={(event) =>
                    setEdits({ ...edits, [suggestion.name]: { ...value, endDate: event.target.value } })
                  }
                />
                <Button
                  type="button"
                  variant="secondary"
                  disabled={busy}
                  onClick={() =>
                    void run(async () => {
                      const created = await createAcademicYear(value, creds);
                      // Première année créée : elle devient l'année en cours.
                      if (!years.some((year) => year.isCurrent)) {
                        await setCurrentAcademicYear(created.id, creds);
                      }
                      return { created: 1, skipped: 0 };
                    })
                  }
                >
                  {t("assistant.create")}
                </Button>
              </div>
            </div>
          );
        })}
      </div>
      <p className="mt-2 text-xs text-slate-500">{t("assistant.years.hint")}</p>
      <div className="mt-2">
        <Feedback message={message} />
      </div>
    </AssistantBox>
  );
}

// ---------------------------------------------------------------------------
// Salles de classe numérotées
// ---------------------------------------------------------------------------

export function RoomSeriesAssistant({
  creds,
  campuses,
  rooms,
  onCreated,
}: {
  creds: TenantCredentials;
  campuses: readonly Campus[];
  rooms: readonly Room[];
  onCreated: () => void;
}): ReactNode {
  const { t } = useTranslation("app");
  const [prefix, setPrefix] = useState(t("assistant.rooms.defaultPrefix"));
  const [from, setFrom] = useState("1");
  const [to, setTo] = useState("10");
  const [campusId, setCampusId] = useState("");
  const [capacity, setCapacity] = useState("");
  const { busy, message, run } = useRunner(onCreated);

  const start = Math.max(1, Number(from) || 1);
  const end = Math.min(start + 99, Math.max(start, Number(to) || start));
  const names = Array.from({ length: end - start + 1 }, (_, index) => `${prefix.trim()} ${start + index}`);
  const existing = new Set(rooms.map((room) => room.name));
  const toCreate = names.filter((name) => !existing.has(name));

  return (
    <AssistantBox title={t("assistant.rooms.title")}>
      <div className="flex flex-wrap items-end gap-3 text-sm">
        <label className="text-slate-600">
          {t("assistant.rooms.prefix")}
          <input
            className="input mt-1 block w-32"
            value={prefix}
            onChange={(e) => setPrefix(e.target.value)}
          />
        </label>
        <label className="text-slate-600">
          {t("assistant.rooms.from")}
          <input
            type="number"
            min={1}
            className="input mt-1 block w-20"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
          />
        </label>
        <label className="text-slate-600">
          {t("assistant.rooms.to")}
          <input
            type="number"
            min={1}
            className="input mt-1 block w-20"
            value={to}
            onChange={(e) => setTo(e.target.value)}
          />
        </label>
        <label className="text-slate-600">
          {t("assistant.campus")}
          <select
            className="input mt-1 block w-44"
            value={campusId}
            onChange={(e) => setCampusId(e.target.value)}
          >
            <option value="">{t("assistant.anyCampus")}</option>
            {campuses.map((campus) => (
              <option key={campus.id} value={campus.id}>
                {campus.name}
              </option>
            ))}
          </select>
        </label>
        <label className="text-slate-600">
          {t("assistant.capacity")}
          <input
            type="number"
            min={1}
            className="input mt-1 block w-24"
            value={capacity}
            onChange={(e) => setCapacity(e.target.value)}
          />
        </label>
        <Button
          type="button"
          variant="secondary"
          disabled={busy || !prefix.trim() || toCreate.length === 0}
          onClick={() =>
            void run(() =>
              createSequentially(toCreate, (name) =>
                createRoom(
                  {
                    name,
                    ...(campusId ? { campusId } : {}),
                    ...(Number(capacity) > 0 ? { capacity: Number(capacity) } : {}),
                  },
                  creds,
                ),
              ),
            )
          }
        >
          {t("assistant.createCount", { count: toCreate.length })}
        </Button>
      </div>
      {toCreate.length > 0 ? (
        <p className="mt-2 text-xs text-slate-500">
          {toCreate.slice(0, 4).join(", ")}
          {toCreate.length > 4 ? `, … ${toCreate[toCreate.length - 1]}` : ""}
        </p>
      ) : null}
      <div className="mt-2">
        <Feedback message={message} />
      </div>
    </AssistantBox>
  );
}

// ---------------------------------------------------------------------------
// Calendrier : rentrée et fin d'année
// ---------------------------------------------------------------------------

export function SchoolYearMilestonesAssistant({
  creds,
  year,
  events,
  onCreated,
}: {
  creds: TenantCredentials;
  year: AcademicYear | undefined;
  events: readonly CalendarEvent[];
  onCreated: () => void;
}): ReactNode {
  const { t } = useTranslation("app");
  const { busy, message, run } = useRunner(onCreated);
  if (!year) return null;

  const milestones = [
    { title: t("assistant.calendar.start"), date: year.startDate.slice(0, 10) },
    { title: t("assistant.calendar.end"), date: year.endDate.slice(0, 10) },
  ].filter(
    (milestone) =>
      !events.some((event) => event.title === milestone.title && event.academicYearId === year.id),
  );
  if (milestones.length === 0) return null;

  return (
    <div className="flex flex-wrap items-center gap-3 text-sm">
      <span className="text-slate-600">{t("assistant.calendar.milestones", { year: year.name })}</span>
      <Button
        type="button"
        variant="secondary"
        disabled={busy}
        onClick={() =>
          void run(() =>
            createSequentially(milestones, (milestone) =>
              createCalendarEvent(
                {
                  academicYearId: year.id,
                  type: "SCHOOL_EVENT",
                  title: milestone.title,
                  startDate: milestone.date,
                },
                creds,
              ),
            ),
          )
        }
      >
        {milestones.map((milestone) => `${milestone.title} (${milestone.date})`).join(" + ")}
      </Button>
      <Feedback message={message} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Classes
// ---------------------------------------------------------------------------

const DIVISION_LETTERS = ["A", "B", "C", "D", "E", "F", "G", "H"];

export function ClassroomAssistant({
  creds,
  years,
  campuses,
  gradeLevels,
  classrooms,
  onCreated,
}: {
  creds: TenantCredentials;
  years: readonly AcademicYear[];
  campuses: readonly Campus[];
  gradeLevels: readonly GradeLevel[];
  classrooms: readonly Classroom[];
  onCreated: () => void;
}): ReactNode {
  const { t, i18n } = useTranslation("app");
  const defaultYear = years.find((year) => year.isCurrent) ?? years[0];
  const defaultCampus = campuses.find((campus) => campus.isMain) ?? campuses[0];
  const [yearId, setYearId] = useState("");
  const [campusId, setCampusId] = useState("");
  const [levelIds, setLevelIds] = useState<ReadonlySet<string>>(new Set());
  const [divisions, setDivisions] = useState("1");
  const [capacity, setCapacity] = useState("");
  const [naming, setNaming] = useState<"name" | "code">("name");
  const { busy, message, run } = useRunner(onCreated);

  const effectiveYearId = yearId || defaultYear?.id || "";
  const effectiveCampusId = campusId || defaultCampus?.id || "";

  if (gradeLevels.length === 0 || years.length === 0 || campuses.length === 0) {
    return (
      <AssistantBox title={t("assistant.classes.title")}>
        <p className="text-sm text-slate-500">{t("assistant.classes.prerequisites")}</p>
      </AssistantBox>
    );
  }

  const divisionCount = Math.min(DIVISION_LETTERS.length, Math.max(1, Number(divisions) || 1));
  const sortedLevels = [...gradeLevels].sort((a, b) => a.order - b.order);
  const existingNames = new Set(
    classrooms.filter((classroom) => classroom.academicYearId === effectiveYearId).map((c) => c.name),
  );
  const planned = sortedLevels
    .filter((level) => levelIds.has(level.id))
    .flatMap((level) => {
      const base =
        naming === "code" ? level.code : i18n.language.startsWith("en") ? level.nameEn : level.nameFr;
      return DIVISION_LETTERS.slice(0, divisionCount).map((letter) => ({
        level,
        name: divisionCount === 1 ? base : `${base} ${letter}`,
      }));
    })
    .filter((entry) => !existingNames.has(entry.name));

  function toggleLevel(id: string): void {
    setLevelIds((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  return (
    <AssistantBox title={t("assistant.classes.title")}>
      <div className="flex flex-wrap gap-2">
        {sortedLevels.map((level) => (
          <label
            key={level.id}
            className={`inline-flex cursor-pointer items-center gap-2 rounded-full border px-3 py-1 text-sm ${
              levelIds.has(level.id)
                ? "border-brand-teal bg-white text-slate-900"
                : "border-slate-200 bg-white text-slate-600"
            }`}
          >
            <input
              type="checkbox"
              className="h-3.5 w-3.5"
              checked={levelIds.has(level.id)}
              onChange={() => toggleLevel(level.id)}
            />
            {i18n.language.startsWith("en") ? level.nameEn : level.nameFr}
          </label>
        ))}
        <button
          type="button"
          className="text-xs text-brand-teal hover:underline"
          onClick={() =>
            setLevelIds(
              levelIds.size === sortedLevels.length ? new Set() : new Set(sortedLevels.map((l) => l.id)),
            )
          }
        >
          {t("catalog.toggleAll")}
        </button>
      </div>

      <div className="mt-3 flex flex-wrap items-end gap-3 text-sm">
        <label className="text-slate-600">
          {t("assistant.year")}
          <select
            className="input mt-1 block w-36"
            value={effectiveYearId}
            onChange={(e) => setYearId(e.target.value)}
          >
            {years.map((year) => (
              <option key={year.id} value={year.id}>
                {year.name}
              </option>
            ))}
          </select>
        </label>
        <label className="text-slate-600">
          {t("assistant.campus")}
          <select
            className="input mt-1 block w-44"
            value={effectiveCampusId}
            onChange={(e) => setCampusId(e.target.value)}
          >
            {campuses.map((campus) => (
              <option key={campus.id} value={campus.id}>
                {campus.name}
              </option>
            ))}
          </select>
        </label>
        <label className="text-slate-600">
          {t("assistant.classes.divisions")}
          <input
            type="number"
            min={1}
            max={DIVISION_LETTERS.length}
            className="input mt-1 block w-20"
            value={divisions}
            onChange={(e) => setDivisions(e.target.value)}
          />
        </label>
        <label className="text-slate-600">
          {t("assistant.capacity")}
          <input
            type="number"
            min={1}
            className="input mt-1 block w-24"
            value={capacity}
            onChange={(e) => setCapacity(e.target.value)}
          />
        </label>
        <label className="text-slate-600">
          {t("assistant.classes.naming")}
          <select
            className="input mt-1 block w-44"
            value={naming}
            onChange={(e) => setNaming(e.target.value as "name" | "code")}
          >
            <option value="name">{t("assistant.classes.namingName")}</option>
            <option value="code">{t("assistant.classes.namingCode")}</option>
          </select>
        </label>
        <Button
          type="button"
          variant="secondary"
          disabled={busy || planned.length === 0 || !effectiveYearId || !effectiveCampusId}
          onClick={() =>
            void run(() =>
              createSequentially(planned, (entry) =>
                createClassroom(
                  {
                    name: entry.name,
                    academicYearId: effectiveYearId,
                    campusId: effectiveCampusId,
                    gradeLevelId: entry.level.id,
                    ...(Number(capacity) > 0 ? { capacity: Number(capacity) } : {}),
                  },
                  creds,
                ),
              ).then((result) => {
                setLevelIds(new Set());
                return result;
              }),
            )
          }
        >
          {t("assistant.createCount", { count: planned.length })}
        </Button>
      </div>
      {planned.length > 0 ? (
        <p className="mt-2 text-xs text-slate-500">
          {planned
            .slice(0, 6)
            .map((entry) => entry.name)
            .join(", ")}
          {planned.length > 6 ? ", …" : ""}
        </p>
      ) : null}
      <div className="mt-2">
        <Feedback message={message} />
      </div>
    </AssistantBox>
  );
}
