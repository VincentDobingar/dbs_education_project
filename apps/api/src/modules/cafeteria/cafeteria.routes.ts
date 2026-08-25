import { Router } from "express";

import { enforceTenantScope } from "../../middleware/enforceTenantScope.js";
import { requireActiveSubscription } from "../../middleware/requireActiveSubscription.js";
import { requireAuth } from "../../middleware/requireAuth.js";
import { requirePermission } from "../../middleware/requirePermission.js";
import { requireTenantMembership } from "../../middleware/requireTenantMembership.js";

import * as cafeteriaController from "./cafeteria.controller.js";

export const cafeteriaRouter: Router = Router();

cafeteriaRouter.use(requireAuth, enforceTenantScope, requireTenantMembership, requireActiveSubscription());

const readCafeteria = requirePermission("cafeteria.read");
const writeCafeteria = requirePermission("cafeteria.write");

cafeteriaRouter.post("/menus", writeCafeteria, cafeteriaController.createMenu);
cafeteriaRouter.get("/menus", readCafeteria, cafeteriaController.listMenus);
cafeteriaRouter.get("/menus/:id", readCafeteria, cafeteriaController.getMenu);
cafeteriaRouter.patch("/menus/:id", writeCafeteria, cafeteriaController.updateMenu);
cafeteriaRouter.delete("/menus/:id", writeCafeteria, cafeteriaController.removeMenu);

cafeteriaRouter.post("/meal-plans", writeCafeteria, cafeteriaController.createMealPlan);
cafeteriaRouter.get("/meal-plans", readCafeteria, cafeteriaController.listMealPlans);
cafeteriaRouter.get("/meal-plans/:id", readCafeteria, cafeteriaController.getMealPlan);
cafeteriaRouter.patch("/meal-plans/:id", writeCafeteria, cafeteriaController.updateMealPlan);
cafeteriaRouter.post("/meal-plans/:id/archive", writeCafeteria, cafeteriaController.archiveMealPlan);

cafeteriaRouter.post("/enrollments", writeCafeteria, cafeteriaController.createEnrollment);
cafeteriaRouter.get("/enrollments", readCafeteria, cafeteriaController.listEnrollments);
cafeteriaRouter.get("/enrollments/:id", readCafeteria, cafeteriaController.getEnrollment);
cafeteriaRouter.post("/enrollments/:id/mark-paid", writeCafeteria, cafeteriaController.markEnrollmentPaid);
cafeteriaRouter.post("/enrollments/:id/cancel", writeCafeteria, cafeteriaController.cancelEnrollment);

cafeteriaRouter.post("/enrollments/:id/attendance", writeCafeteria, cafeteriaController.recordAttendance);
cafeteriaRouter.get("/enrollments/:id/attendance", readCafeteria, cafeteriaController.listAttendance);
