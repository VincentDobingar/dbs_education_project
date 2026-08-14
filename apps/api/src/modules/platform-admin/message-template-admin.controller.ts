import type { NextFunction, Request, Response } from "express";

import * as messageTemplateAdminService from "./message-template-admin.service.js";
import {
  createMessageTemplateSchema,
  deleteMessageTemplateSchema,
  listMessageTemplatesQuerySchema,
  updateMessageTemplateSchema,
} from "./message-template-admin.validation.js";
import { resolveActor } from "./platform-actor.js";

export function listMessageTemplates(req: Request, res: Response, next: NextFunction): void {
  void (async () => {
    const query = listMessageTemplatesQuerySchema.parse(req.query);
    const templates = await messageTemplateAdminService.listMessageTemplates(query);
    res.status(200).json(templates);
  })().catch(next);
}

export function createMessageTemplate(req: Request, res: Response, next: NextFunction): void {
  void (async () => {
    const input = createMessageTemplateSchema.parse(req.body);
    const actor = await resolveActor(req, input.justification ?? "");
    const template = await messageTemplateAdminService.createMessageTemplate(input, actor);
    res.status(201).json(template);
  })().catch(next);
}

export function updateMessageTemplate(req: Request, res: Response, next: NextFunction): void {
  void (async () => {
    const input = updateMessageTemplateSchema.parse(req.body);
    const actor = await resolveActor(req, input.justification ?? "");
    const template = await messageTemplateAdminService.updateMessageTemplate(
      req.params.id as string,
      input,
      actor,
    );
    res.status(200).json(template);
  })().catch(next);
}

export function deleteMessageTemplate(req: Request, res: Response, next: NextFunction): void {
  void (async () => {
    const input = deleteMessageTemplateSchema.parse(req.body);
    const actor = await resolveActor(req, input.justification ?? "");
    await messageTemplateAdminService.deleteMessageTemplate(req.params.id as string, actor);
    res.status(204).send();
  })().catch(next);
}
