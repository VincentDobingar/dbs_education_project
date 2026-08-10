import type { NextFunction, Request, Response } from "express";

import * as programService from "./program.service.js";
import { createProgramSchema, listProgramsQuerySchema, updateProgramSchema } from "./program.validation.js";

export function createProgram(req: Request, res: Response, next: NextFunction): void {
  void (async () => {
    const input = createProgramSchema.parse(req.body);
    const program = await programService.createProgram(input);
    res.status(201).json(program);
  })().catch(next);
}

export function listPrograms(req: Request, res: Response, next: NextFunction): void {
  void (async () => {
    const query = listProgramsQuerySchema.parse(req.query);
    const programs = await programService.listPrograms(query);
    res.status(200).json(programs);
  })().catch(next);
}

export function updateProgram(req: Request, res: Response, next: NextFunction): void {
  void (async () => {
    const input = updateProgramSchema.parse(req.body);
    const program = await programService.updateProgram(req.params.id as string, input);
    res.status(200).json(program);
  })().catch(next);
}
