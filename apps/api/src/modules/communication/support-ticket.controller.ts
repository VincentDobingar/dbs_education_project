import type { NextFunction, Request, Response } from "express";

import { AppError } from "../../lib/errors.js";

import * as supportTicketService from "./support-ticket.service.js";
import { addSupportTicketMessageSchema, createSupportTicketSchema } from "./support-ticket.validation.js";

export function createSupportTicket(req: Request, res: Response, next: NextFunction): void {
  void (async () => {
    if (!req.user) {
      throw new AppError(401, "UNAUTHENTICATED", "requireAuth must run first");
    }
    const input = createSupportTicketSchema.parse(req.body);
    const ticket = await supportTicketService.createSupportTicket(input, req.user.id);
    res.status(201).json(ticket);
  })().catch(next);
}

export function listMyTickets(req: Request, res: Response, next: NextFunction): void {
  void (async () => {
    if (!req.user) {
      throw new AppError(401, "UNAUTHENTICATED", "requireAuth must run first");
    }
    const tickets = await supportTicketService.listMyTickets(req.user.id);
    res.status(200).json(tickets);
  })().catch(next);
}

export function getMyTicket(req: Request, res: Response, next: NextFunction): void {
  void (async () => {
    if (!req.user) {
      throw new AppError(401, "UNAUTHENTICATED", "requireAuth must run first");
    }
    const ticket = await supportTicketService.requireOwnTicket(req.params.id as string, req.user.id);
    res.status(200).json(ticket);
  })().catch(next);
}

export function addTicketMessage(req: Request, res: Response, next: NextFunction): void {
  void (async () => {
    if (!req.user) {
      throw new AppError(401, "UNAUTHENTICATED", "requireAuth must run first");
    }
    const input = addSupportTicketMessageSchema.parse(req.body);
    const message = await supportTicketService.addMessageToTicket(
      req.params.id as string,
      req.user.id,
      input,
    );
    res.status(201).json(message);
  })().catch(next);
}
