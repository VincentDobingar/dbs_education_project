import type { NextFunction, Request, Response } from "express";

import * as roomService from "./room.service.js";
import { createRoomSchema, listRoomsQuerySchema, updateRoomSchema } from "./room.validation.js";

export function createRoom(req: Request, res: Response, next: NextFunction): void {
  void (async () => {
    const input = createRoomSchema.parse(req.body);
    const room = await roomService.createRoom(input);
    res.status(201).json(room);
  })().catch(next);
}

export function listRooms(req: Request, res: Response, next: NextFunction): void {
  void (async () => {
    const query = listRoomsQuerySchema.parse(req.query);
    const rooms = await roomService.listRooms(query);
    res.status(200).json(rooms);
  })().catch(next);
}

export function updateRoom(req: Request, res: Response, next: NextFunction): void {
  void (async () => {
    const input = updateRoomSchema.parse(req.body);
    const room = await roomService.updateRoom(req.params.id as string, input);
    res.status(200).json(room);
  })().catch(next);
}

export function archiveRoom(req: Request, res: Response, next: NextFunction): void {
  void (async () => {
    const room = await roomService.archiveRoom(req.params.id as string);
    res.status(200).json(room);
  })().catch(next);
}
