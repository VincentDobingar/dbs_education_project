import type { NextFunction, Request, Response } from "express";

import { AppError } from "../../lib/errors.js";

import * as libraryService from "./library.service.js";
import {
  createBookSchema,
  createLoanSchema,
  listBooksQuerySchema,
  listLoansQuerySchema,
  updateBookSchema,
} from "./library.validation.js";

function requireUserId(req: Request): string {
  if (!req.user) {
    throw new AppError(401, "UNAUTHENTICATED", "requireAuth must run first");
  }
  return req.user.id;
}

export function createBook(req: Request, res: Response, next: NextFunction): void {
  void (async () => {
    const input = createBookSchema.parse(req.body);
    const book = await libraryService.createBook(input);
    res.status(201).json(book);
  })().catch(next);
}

export function listBooks(req: Request, res: Response, next: NextFunction): void {
  void (async () => {
    const query = listBooksQuerySchema.parse(req.query);
    const books = await libraryService.listBooks(query);
    res.status(200).json(books);
  })().catch(next);
}

export function getBook(req: Request, res: Response, next: NextFunction): void {
  void (async () => {
    const book = await libraryService.requireBook(req.params.id as string);
    res.status(200).json(book);
  })().catch(next);
}

export function updateBook(req: Request, res: Response, next: NextFunction): void {
  void (async () => {
    const input = updateBookSchema.parse(req.body);
    const book = await libraryService.updateBook(req.params.id as string, input);
    res.status(200).json(book);
  })().catch(next);
}

export function archiveBook(req: Request, res: Response, next: NextFunction): void {
  void (async () => {
    const book = await libraryService.archiveBook(req.params.id as string);
    res.status(200).json(book);
  })().catch(next);
}

export function createLoan(req: Request, res: Response, next: NextFunction): void {
  void (async () => {
    const userId = requireUserId(req);
    const input = createLoanSchema.parse(req.body);
    const loan = await libraryService.createLoan(req.params.id as string, input, userId);
    res.status(201).json(loan);
  })().catch(next);
}

export function listLoans(req: Request, res: Response, next: NextFunction): void {
  void (async () => {
    const query = listLoansQuerySchema.parse(req.query);
    const loans = await libraryService.listLoans(query);
    res.status(200).json(loans);
  })().catch(next);
}

export function returnLoan(req: Request, res: Response, next: NextFunction): void {
  void (async () => {
    const loan = await libraryService.returnLoan(req.params.id as string);
    res.status(200).json(loan);
  })().catch(next);
}

export function markLoanLost(req: Request, res: Response, next: NextFunction): void {
  void (async () => {
    const loan = await libraryService.markLoanLost(req.params.id as string);
    res.status(200).json(loan);
  })().catch(next);
}
