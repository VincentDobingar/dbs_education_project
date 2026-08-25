import { Router } from "express";

import { enforceTenantScope } from "../../middleware/enforceTenantScope.js";
import { requireActiveSubscription } from "../../middleware/requireActiveSubscription.js";
import { requireAuth } from "../../middleware/requireAuth.js";
import { requirePermission } from "../../middleware/requirePermission.js";
import { requireTenantMembership } from "../../middleware/requireTenantMembership.js";

import * as transportController from "./transport.controller.js";

export const transportRouter: Router = Router();

transportRouter.use(requireAuth, enforceTenantScope, requireTenantMembership, requireActiveSubscription());

const readTransport = requirePermission("transport.read");
const writeTransport = requirePermission("transport.write");

transportRouter.post("/vehicles", writeTransport, transportController.createVehicle);
transportRouter.get("/vehicles", readTransport, transportController.listVehicles);
transportRouter.get("/vehicles/:id", readTransport, transportController.getVehicle);
transportRouter.patch("/vehicles/:id", writeTransport, transportController.updateVehicle);
transportRouter.post("/vehicles/:id/retire", writeTransport, transportController.retireVehicle);

transportRouter.post("/routes", writeTransport, transportController.createRoute);
transportRouter.get("/routes", readTransport, transportController.listRoutes);
transportRouter.get("/routes/:id", readTransport, transportController.getRoute);
transportRouter.patch("/routes/:id", writeTransport, transportController.updateRoute);
transportRouter.delete("/routes/:id", writeTransport, transportController.cancelRoute);

transportRouter.post("/routes/:id/stops", writeTransport, transportController.addStop);
transportRouter.get("/routes/:id/stops", readTransport, transportController.listStops);
transportRouter.delete("/routes/:id/stops/:stopId", writeTransport, transportController.removeStop);

transportRouter.post("/routes/:id/students", writeTransport, transportController.assignStudent);
transportRouter.get("/routes/:id/students", readTransport, transportController.listStudentsForRoute);
transportRouter.delete(
  "/students/:studentId/assignment",
  writeTransport,
  transportController.unassignStudent,
);

transportRouter.post("/routes/:id/attendance", writeTransport, transportController.recordAttendance);
transportRouter.get("/routes/:id/attendance", readTransport, transportController.listAttendance);
