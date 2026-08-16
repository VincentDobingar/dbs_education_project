import type { NextFunction, Request, Response } from "express";

import * as organizationAdminService from "./organization-admin.service.js";
import {
  createOrganizationSchema,
  deleteOrganizationSchema,
  listOrganizationsQuerySchema,
  updateOrganizationSchema,
} from "./organization-admin.validation.js";
import { resolveActor } from "./platform-actor.js";

export function listOrganizations(req: Request, res: Response, next: NextFunction): void {
  void (async () => {
    const query = listOrganizationsQuerySchema.parse(req.query);
    const organizations = await organizationAdminService.listOrganizations(query);
    res.status(200).json(organizations);
  })().catch(next);
}

export function createOrganization(req: Request, res: Response, next: NextFunction): void {
  void (async () => {
    const input = createOrganizationSchema.parse(req.body);
    const actor = await resolveActor(req, input.justification ?? "");
    const organization = await organizationAdminService.createOrganization(input, actor);
    res.status(201).json(organization);
  })().catch(next);
}

export function updateOrganization(req: Request, res: Response, next: NextFunction): void {
  void (async () => {
    const input = updateOrganizationSchema.parse(req.body);
    const actor = await resolveActor(req, input.justification ?? "");
    const organization = await organizationAdminService.updateOrganization(
      req.params.id as string,
      input,
      actor,
    );
    res.status(200).json(organization);
  })().catch(next);
}

export function deleteOrganization(req: Request, res: Response, next: NextFunction): void {
  void (async () => {
    const input = deleteOrganizationSchema.parse(req.body);
    const actor = await resolveActor(req, input.justification ?? "");
    await organizationAdminService.deleteOrganization(req.params.id as string, actor);
    res.status(204).send();
  })().catch(next);
}
