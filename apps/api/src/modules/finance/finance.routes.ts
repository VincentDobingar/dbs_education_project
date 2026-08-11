import { Router } from "express";

import { enforceTenantScope } from "../../middleware/enforceTenantScope.js";
import { requireAuth } from "../../middleware/requireAuth.js";
import { requirePermission } from "../../middleware/requirePermission.js";
import { requireTenantMembership } from "../../middleware/requireTenantMembership.js";

import * as feeCategoryController from "./fee-category.controller.js";
import * as feeStructureController from "./fee-structure.controller.js";
import * as studentInvoiceController from "./student-invoice.controller.js";

export const financeRouter: Router = Router();

financeRouter.use(requireAuth, enforceTenantScope, requireTenantMembership);

const readFinance = requirePermission("finance.read");
const writeFinance = requirePermission("finance.write");

financeRouter.post("/fee-categories", writeFinance, feeCategoryController.createFeeCategory);
financeRouter.get("/fee-categories", readFinance, feeCategoryController.listFeeCategories);

financeRouter.post("/fee-structures", writeFinance, feeStructureController.createFeeStructure);
financeRouter.get("/fee-structures", readFinance, feeStructureController.listFeeStructures);
financeRouter.patch("/fee-structures/:id", writeFinance, feeStructureController.updateFeeStructure);

financeRouter.post("/student-invoices", writeFinance, studentInvoiceController.createStudentInvoice);
financeRouter.get("/student-invoices", readFinance, studentInvoiceController.listStudentInvoices);
financeRouter.get("/student-invoices/:id", readFinance, studentInvoiceController.getStudentInvoice);
financeRouter.post("/student-invoices/:id/issue", writeFinance, studentInvoiceController.issueStudentInvoice);
financeRouter.post(
  "/student-invoices/:id/cancel",
  writeFinance,
  studentInvoiceController.cancelStudentInvoice,
);
