import type { NextFunction, Request, Response } from "express";

import { resolveActor } from "./platform-actor.js";
import * as supportTicketAdminService from "./support-ticket-admin.service.js";
import {
  addSupportTicketMessageSchema,
  assignSupportTicketSchema,
  listSupportTicketsQuerySchema,
  updateSupportTicketStatusSchema,
} from "./support-ticket-admin.validation.js";

export function listSupportTickets(req: Request, res: Response, next: NextFunction): void {
  void (async () => {
    const query = listSupportTicketsQuerySchema.parse(req.query);
    const tickets = await supportTicketAdminService.listSupportTickets(query);
    res.status(200).json(tickets);
  })().catch(next);
}

export function getSupportTicket(req: Request, res: Response, next: NextFunction): void {
  void (async () => {
    const ticket = await supportTicketAdminService.requireSupportTicket(req.params.id as string);
    res.status(200).json(ticket);
  })().catch(next);
}

export function assignSupportTicket(req: Request, res: Response, next: NextFunction): void {
  void (async () => {
    const input = assignSupportTicketSchema.parse(req.body);
    const actor = await resolveActor(req, input.justification ?? "");
    const ticket = await supportTicketAdminService.assignSupportTicket(req.params.id as string, input, actor);
    res.status(200).json(ticket);
  })().catch(next);
}

export function updateSupportTicketStatus(req: Request, res: Response, next: NextFunction): void {
  void (async () => {
    const input = updateSupportTicketStatusSchema.parse(req.body);
    const actor = await resolveActor(req, input.justification ?? "");
    const ticket = await supportTicketAdminService.updateSupportTicketStatus(
      req.params.id as string,
      input,
      actor,
    );
    res.status(200).json(ticket);
  })().catch(next);
}

export function addSupportTicketMessage(req: Request, res: Response, next: NextFunction): void {
  void (async () => {
    const input = addSupportTicketMessageSchema.parse(req.body);
    const actor = await resolveActor(req, input.justification ?? "");
    const message = await supportTicketAdminService.addSupportTicketMessage(
      req.params.id as string,
      input,
      actor,
    );
    res.status(201).json(message);
  })().catch(next);
}
