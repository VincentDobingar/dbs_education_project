import { Router } from "express";

import { enforceTenantScope } from "../../middleware/enforceTenantScope.js";
import { requireAuth } from "../../middleware/requireAuth.js";
import { requirePermission } from "../../middleware/requirePermission.js";
import { requireTenantMembership } from "../../middleware/requireTenantMembership.js";

import * as boardingController from "./boarding.controller.js";

export const boardingRouter: Router = Router();

boardingRouter.use(requireAuth, enforceTenantScope, requireTenantMembership);

const readBoarding = requirePermission("boarding.read");
const writeBoarding = requirePermission("boarding.write");

boardingRouter.post("/rooms", writeBoarding, boardingController.createRoom);
boardingRouter.get("/rooms", readBoarding, boardingController.listRooms);
boardingRouter.get("/rooms/:id", readBoarding, boardingController.getRoom);
boardingRouter.patch("/rooms/:id", writeBoarding, boardingController.updateRoom);
boardingRouter.post("/rooms/:id/archive", writeBoarding, boardingController.archiveRoom);

boardingRouter.post("/rooms/:id/beds", writeBoarding, boardingController.addBed);
boardingRouter.get("/rooms/:id/beds", readBoarding, boardingController.listBeds);
boardingRouter.delete("/rooms/:id/beds/:bedId", writeBoarding, boardingController.removeBed);

boardingRouter.post("/rooms/:id/beds/:bedId/assign", writeBoarding, boardingController.assignStudent);
boardingRouter.delete("/students/:studentId/assignment", writeBoarding, boardingController.unassignStudent);

boardingRouter.post("/students/:studentId/attendance", writeBoarding, boardingController.recordAttendance);
boardingRouter.get("/students/:studentId/attendance", readBoarding, boardingController.listAttendance);
