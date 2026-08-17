import type { Book, LibraryLoan } from "@prisma/client";

import { AppError } from "../../lib/errors.js";
import { prisma } from "../../lib/prisma.js";
import { requireCurrentTenantId } from "../../lib/tenant-context.js";
import { requireStudentRecord } from "../students/student.service.js";

import type {
  CreateBookInput,
  CreateLoanInput,
  ListBooksQuery,
  ListLoansQuery,
  UpdateBookInput,
} from "./library.validation.js";

/** Never trust a client-supplied employee id for "who handed out this loan". */
async function resolveActingEmployeeId(userId: string): Promise<string | undefined> {
  const employee = await prisma.employee.findFirst({ where: { userId } });
  return employee?.id;
}

export async function createBook(input: CreateBookInput): Promise<Book> {
  return prisma.book.create({
    data: {
      tenantId: requireCurrentTenantId(),
      title: input.title,
      author: input.author,
      totalCopies: input.totalCopies,
      ...(input.isbn ? { isbn: input.isbn } : {}),
      ...(input.category ? { category: input.category } : {}),
    },
  });
}

export async function listBooks(query: ListBooksQuery): Promise<Book[]> {
  return prisma.book.findMany({
    where: {
      deletedAt: null,
      ...(query.category ? { category: query.category } : {}),
      ...(query.search
        ? {
            OR: [
              { title: { contains: query.search, mode: "insensitive" } },
              { author: { contains: query.search, mode: "insensitive" } },
            ],
          }
        : {}),
    },
    orderBy: { title: "asc" },
  });
}

export async function requireBook(id: string): Promise<Book> {
  const book = await prisma.book.findUnique({ where: { id } });
  if (!book || book.deletedAt) {
    throw new AppError(404, "BOOK_NOT_FOUND", `Book not found: ${id}`);
  }
  return book;
}

export async function updateBook(id: string, input: UpdateBookInput): Promise<Book> {
  await requireBook(id);

  return prisma.book.update({
    where: { id },
    data: {
      ...(input.isbn !== undefined ? { isbn: input.isbn } : {}),
      ...(input.title !== undefined ? { title: input.title } : {}),
      ...(input.author !== undefined ? { author: input.author } : {}),
      ...(input.category !== undefined ? { category: input.category } : {}),
      ...(input.totalCopies !== undefined ? { totalCopies: input.totalCopies } : {}),
    },
  });
}

export async function archiveBook(id: string): Promise<Book> {
  await requireBook(id);
  return prisma.book.update({ where: { id }, data: { deletedAt: new Date(), status: "ARCHIVED" } });
}

/**
 * "Exemplaires disponibles" (§29) dérivé à la volée à chaque emprunt — jamais un
 * compteur stocké séparément qui pourrait diverger de la réalité des prêts actifs.
 */
export async function createLoan(
  bookId: string,
  input: CreateLoanInput,
  actingUserId: string,
): Promise<LibraryLoan> {
  const book = await requireBook(bookId);
  if (book.status === "ARCHIVED") {
    throw new AppError(409, "BOOK_ARCHIVED", "This book is archived and cannot be borrowed");
  }
  await requireStudentRecord(input.studentId);

  const activeLoans = await prisma.libraryLoan.count({ where: { bookId, status: "ACTIVE" } });
  if (activeLoans >= book.totalCopies) {
    throw new AppError(409, "NO_COPIES_AVAILABLE", "No copies of this book are currently available");
  }

  const existingLoanForStudent = await prisma.libraryLoan.findFirst({
    where: { bookId, studentId: input.studentId, status: "ACTIVE" },
  });
  if (existingLoanForStudent) {
    throw new AppError(409, "LOAN_ALREADY_ACTIVE", "This student already has an active loan for this book");
  }

  const issuedByEmployeeId = await resolveActingEmployeeId(actingUserId);

  return prisma.libraryLoan.create({
    data: {
      tenantId: requireCurrentTenantId(),
      bookId,
      studentId: input.studentId,
      dueAt: input.dueAt,
      ...(issuedByEmployeeId ? { issuedByEmployeeId } : {}),
    },
  });
}

export async function listLoans(query: ListLoansQuery): Promise<LibraryLoan[]> {
  return prisma.libraryLoan.findMany({
    where: {
      ...(query.bookId ? { bookId: query.bookId } : {}),
      ...(query.studentId ? { studentId: query.studentId } : {}),
      ...(query.status ? { status: query.status } : {}),
    },
    orderBy: { borrowedAt: "desc" },
  });
}

async function requireLoan(id: string): Promise<LibraryLoan> {
  const loan = await prisma.libraryLoan.findUnique({ where: { id } });
  if (!loan) {
    throw new AppError(404, "LOAN_NOT_FOUND", `Library loan not found: ${id}`);
  }
  return loan;
}

export async function returnLoan(id: string): Promise<LibraryLoan> {
  const loan = await requireLoan(id);
  if (loan.status !== "ACTIVE") {
    throw new AppError(409, "LOAN_NOT_ACTIVE", "Only an active loan can be returned");
  }
  return prisma.libraryLoan.update({ where: { id }, data: { status: "RETURNED", returnedAt: new Date() } });
}

export async function markLoanLost(id: string): Promise<LibraryLoan> {
  const loan = await requireLoan(id);
  if (loan.status !== "ACTIVE") {
    throw new AppError(409, "LOAN_NOT_ACTIVE", "Only an active loan can be marked lost");
  }
  return prisma.libraryLoan.update({ where: { id }, data: { status: "LOST" } });
}
