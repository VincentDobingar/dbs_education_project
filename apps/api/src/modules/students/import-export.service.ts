import { parse } from "csv-parse/sync";
import { ZodError } from "zod";

import { escapeCsvField } from "../../lib/csv.js";
import { AppError } from "../../lib/errors.js";

import { createStudent, listStudents } from "./student.service.js";
import { createStudentSchema } from "./student.validation.js";

export interface ImportRowSuccess {
  row: number;
  id: string;
  matricule: string;
}

export interface ImportRowError {
  row: number;
  message: string;
}

export interface ImportStudentsResult {
  created: ImportRowSuccess[];
  errors: ImportRowError[];
}

function describeError(error: unknown): string {
  if (error instanceof ZodError) {
    return error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`).join("; ");
  }
  if (error instanceof AppError) {
    return error.message;
  }
  if (error instanceof Error) {
    return error.message;
  }
  return "Unknown error";
}

/**
 * Doublon detection (checkDuplicateStudents) is deliberately NOT run per row here —
 * a bulk import is assumed to come from a source the school has already vetted
 * (e.g. a prior system's export), and per-row heuristic warnings would bloat the
 * response for no actionable benefit at this stage.
 */
export async function importStudentsFromCsv(csv: string): Promise<ImportStudentsResult> {
  let records: Record<string, string | undefined>[];
  try {
    records = parse(csv, { columns: true, skip_empty_lines: true, trim: true });
  } catch (error) {
    throw new AppError(400, "INVALID_CSV", error instanceof Error ? error.message : "Malformed CSV");
  }

  const created: ImportRowSuccess[] = [];
  const errors: ImportRowError[] = [];
  const matriculesSeenInBatch = new Set<string>();

  for (const [index, record] of records.entries()) {
    const row = index + 2; // +1 for the 0-based index, +1 for the header row
    try {
      const input = createStudentSchema.parse({
        matricule: record.matricule,
        firstName: record.firstName,
        lastName: record.lastName,
        ...(record.dateOfBirth ? { dateOfBirth: record.dateOfBirth } : {}),
        ...(record.gender ? { gender: record.gender } : {}),
        ...(record.emergencyContactName ? { emergencyContactName: record.emergencyContactName } : {}),
        ...(record.emergencyContactPhone ? { emergencyContactPhone: record.emergencyContactPhone } : {}),
      });

      if (matriculesSeenInBatch.has(input.matricule)) {
        throw new AppError(
          409,
          "DUPLICATE_IN_FILE",
          `Duplicate matricule within this file: ${input.matricule}`,
        );
      }
      matriculesSeenInBatch.add(input.matricule);

      const student = await createStudent(input);
      created.push({ row, id: student.id, matricule: student.matricule });
    } catch (error) {
      errors.push({ row, message: describeError(error) });
    }
  }

  return { created, errors };
}

const EXPORT_COLUMNS = ["matricule", "firstName", "lastName", "dateOfBirth", "gender", "status"] as const;

/**
 * "Exportation contrôlée" (§19): only roster/status fields, matching what
 * listStudents already exposes to any students.read caller — never emergency
 * contacts, photoUrl, or medicalNotes, regardless of who is asking.
 */
export async function exportStudentsToCsv(): Promise<string> {
  const students = await listStudents();

  const rows = students.map((student) =>
    EXPORT_COLUMNS.map((column) => {
      const value = student[column];
      if (value === null || value === undefined) {
        return "";
      }
      return escapeCsvField(value instanceof Date ? value.toISOString().slice(0, 10) : String(value));
    }).join(","),
  );

  return [EXPORT_COLUMNS.join(","), ...rows].join("\r\n");
}
