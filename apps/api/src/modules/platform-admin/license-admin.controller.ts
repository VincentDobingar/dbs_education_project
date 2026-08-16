import type { NextFunction, Request, Response } from "express";

import * as licenseAdminService from "./license-admin.service.js";
import {
  assignLicenseSchema,
  createLicenseBatchSchema,
  listLicenseBatchesQuerySchema,
  listLicensesQuerySchema,
  revokeLicenseSchema,
} from "./license-admin.validation.js";
import { resolveActor } from "./platform-actor.js";

export function listLicenseBatches(req: Request, res: Response, next: NextFunction): void {
  void (async () => {
    const query = listLicenseBatchesQuerySchema.parse(req.query);
    const batches = await licenseAdminService.listLicenseBatches(query);
    res.status(200).json(batches);
  })().catch(next);
}

export function getLicenseBatch(req: Request, res: Response, next: NextFunction): void {
  void (async () => {
    const batch = await licenseAdminService.requireLicenseBatch(req.params.id as string);
    res.status(200).json(batch);
  })().catch(next);
}

export function createLicenseBatch(req: Request, res: Response, next: NextFunction): void {
  void (async () => {
    const input = createLicenseBatchSchema.parse(req.body);
    const actor = await resolveActor(req, input.justification ?? "");
    const batch = await licenseAdminService.createLicenseBatch(input, actor);
    res.status(201).json(batch);
  })().catch(next);
}

export function listLicenses(req: Request, res: Response, next: NextFunction): void {
  void (async () => {
    const query = listLicensesQuerySchema.parse(req.query);
    const licenses = await licenseAdminService.listLicenses(query);
    res.status(200).json(licenses);
  })().catch(next);
}

export function getLicense(req: Request, res: Response, next: NextFunction): void {
  void (async () => {
    const license = await licenseAdminService.requireLicense(req.params.id as string);
    res.status(200).json(license);
  })().catch(next);
}

export function assignLicense(req: Request, res: Response, next: NextFunction): void {
  void (async () => {
    const input = assignLicenseSchema.parse(req.body);
    const actor = await resolveActor(req, input.justification ?? "");
    const license = await licenseAdminService.assignLicense(req.params.id as string, input, actor);
    res.status(200).json(license);
  })().catch(next);
}

export function revokeLicense(req: Request, res: Response, next: NextFunction): void {
  void (async () => {
    const input = revokeLicenseSchema.parse(req.body);
    const actor = await resolveActor(req, input.justification ?? "");
    const license = await licenseAdminService.revokeLicense(req.params.id as string, input, actor);
    res.status(200).json(license);
  })().catch(next);
}
