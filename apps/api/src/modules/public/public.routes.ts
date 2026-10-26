import { Router } from "express";

import * as publicController from "./public.controller.js";

/** Routes sans authentification du site vitrine (inscription, Tarifs, vitrine des établissements). */
export const publicRouter: Router = Router();

publicRouter.get("/countries", publicController.listCountries);
publicRouter.get("/pricing", publicController.getPricing);
publicRouter.get("/schools", publicController.listSchools);
