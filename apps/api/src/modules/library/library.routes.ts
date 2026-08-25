import { Router } from "express";

import { enforceTenantScope } from "../../middleware/enforceTenantScope.js";
import { requireActiveSubscription } from "../../middleware/requireActiveSubscription.js";
import { requireAuth } from "../../middleware/requireAuth.js";
import { requirePermission } from "../../middleware/requirePermission.js";
import { requireTenantMembership } from "../../middleware/requireTenantMembership.js";

import * as libraryController from "./library.controller.js";

export const libraryRouter: Router = Router();

libraryRouter.use(requireAuth, enforceTenantScope, requireTenantMembership, requireActiveSubscription());

const readLibrary = requirePermission("library.read");
const writeLibrary = requirePermission("library.write");

libraryRouter.post("/books", writeLibrary, libraryController.createBook);
libraryRouter.get("/books", readLibrary, libraryController.listBooks);
libraryRouter.get("/books/:id", readLibrary, libraryController.getBook);
libraryRouter.patch("/books/:id", writeLibrary, libraryController.updateBook);
libraryRouter.delete("/books/:id", writeLibrary, libraryController.archiveBook);

libraryRouter.post("/books/:id/loans", writeLibrary, libraryController.createLoan);
libraryRouter.get("/loans", readLibrary, libraryController.listLoans);
libraryRouter.post("/loans/:id/return", writeLibrary, libraryController.returnLoan);
libraryRouter.post("/loans/:id/lost", writeLibrary, libraryController.markLoanLost);
