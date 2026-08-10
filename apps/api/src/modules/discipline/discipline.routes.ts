import { Router } from "express";

import { enforceTenantScope } from "../../middleware/enforceTenantScope.js";
import { requireAuth } from "../../middleware/requireAuth.js";
import { requirePermission } from "../../middleware/requirePermission.js";
import { requireTenantMembership } from "../../middleware/requireTenantMembership.js";

import * as disciplineController from "./discipline.controller.js";

export const disciplineRouter: Router = Router();

disciplineRouter.use(requireAuth, enforceTenantScope, requireTenantMembership);

const readDiscipline = requirePermission("discipline.read");
const writeDiscipline = requirePermission("discipline.write");

disciplineRouter.post("/incidents", writeDiscipline, disciplineController.createIncident);
disciplineRouter.get("/incidents", readDiscipline, disciplineController.listIncidents);
disciplineRouter.patch("/incidents/:id", writeDiscipline, disciplineController.updateIncident);
disciplineRouter.delete("/incidents/:id", writeDiscipline, disciplineController.removeIncident);

disciplineRouter.get(
  "/students/:studentId/history",
  readDiscipline,
  disciplineController.getStudentDisciplineHistory,
);
