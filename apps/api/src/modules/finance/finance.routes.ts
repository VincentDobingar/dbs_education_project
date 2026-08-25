import { Router } from "express";

import { enforceTenantScope } from "../../middleware/enforceTenantScope.js";
import { requireActiveSubscription } from "../../middleware/requireActiveSubscription.js";
import { requireAuth } from "../../middleware/requireAuth.js";
import { requirePermission } from "../../middleware/requirePermission.js";
import { requireTenantMembership } from "../../middleware/requireTenantMembership.js";

import * as cashSessionController from "./cash-session.controller.js";
import * as expenseCategoryController from "./expense-category.controller.js";
import * as expenseController from "./expense.controller.js";
import * as feeCategoryController from "./fee-category.controller.js";
import * as feeStructureController from "./fee-structure.controller.js";
import * as financialReportController from "./financial-report.controller.js";
import * as studentInvoiceController from "./student-invoice.controller.js";
import * as studentPaymentController from "./student-payment.controller.js";

export const financeRouter: Router = Router();

financeRouter.use(requireAuth, enforceTenantScope, requireTenantMembership, requireActiveSubscription());

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

financeRouter.post(
  "/student-invoices/:id/payments",
  writeFinance,
  studentPaymentController.recordCashPayment,
);
financeRouter.get(
  "/student-invoices/:id/payments",
  readFinance,
  studentPaymentController.listPaymentsForInvoice,
);
financeRouter.get(
  "/students/:studentId/financial-situation",
  readFinance,
  studentInvoiceController.getStudentFinancialSituationHandler,
);

financeRouter.get("/receipts/:id", readFinance, studentPaymentController.getReceipt);
financeRouter.get("/receipts/:id/pdf", readFinance, studentPaymentController.getReceiptPdf);

financeRouter.post(
  "/payments/:paymentId/refunds",
  writeFinance,
  studentPaymentController.refundStudentPayment,
);
financeRouter.get(
  "/payments/:paymentId/refunds",
  readFinance,
  studentPaymentController.listRefundsForPayment,
);

financeRouter.post("/expense-categories", writeFinance, expenseCategoryController.createExpenseCategory);
financeRouter.get("/expense-categories", readFinance, expenseCategoryController.listExpenseCategories);

financeRouter.post("/expenses", writeFinance, expenseController.createExpense);
financeRouter.get("/expenses", readFinance, expenseController.listExpenses);
financeRouter.patch("/expenses/:id", writeFinance, expenseController.updateExpense);
financeRouter.delete("/expenses/:id", writeFinance, expenseController.removeExpense);

financeRouter.post("/cash-sessions/open", writeFinance, cashSessionController.openCashSession);
financeRouter.post("/cash-sessions/:id/close", writeFinance, cashSessionController.closeCashSession);
financeRouter.get("/cash-sessions", readFinance, cashSessionController.listCashSessions);
financeRouter.get("/cash-sessions/:id", readFinance, cashSessionController.getCashSession);

financeRouter.get("/reports/revenue", readFinance, financialReportController.getRevenueReport);
financeRouter.get("/reports/revenue/csv", readFinance, financialReportController.getRevenueReportCsv);
financeRouter.get("/reports/revenue/pdf", readFinance, financialReportController.getRevenueReportPdf);
financeRouter.get("/reports/expenses", readFinance, financialReportController.getExpenseReport);
financeRouter.get("/reports/expenses/csv", readFinance, financialReportController.getExpenseReportCsv);
financeRouter.get("/reports/expenses/pdf", readFinance, financialReportController.getExpenseReportPdf);
