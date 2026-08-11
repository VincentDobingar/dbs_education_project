import type { NextFunction, Request, Response } from "express";

import * as feeStructureService from "./fee-structure.service.js";
import {
  createFeeStructureSchema,
  listFeeStructuresQuerySchema,
  updateFeeStructureSchema,
} from "./fee-structure.validation.js";

export function createFeeStructure(req: Request, res: Response, next: NextFunction): void {
  void (async () => {
    const input = createFeeStructureSchema.parse(req.body);
    const feeStructure = await feeStructureService.createFeeStructure(input);
    res.status(201).json(feeStructure);
  })().catch(next);
}

export function listFeeStructures(req: Request, res: Response, next: NextFunction): void {
  void (async () => {
    const query = listFeeStructuresQuerySchema.parse(req.query);
    const feeStructures = await feeStructureService.listFeeStructures(query);
    res.status(200).json(feeStructures);
  })().catch(next);
}

export function updateFeeStructure(req: Request, res: Response, next: NextFunction): void {
  void (async () => {
    const input = updateFeeStructureSchema.parse(req.body);
    const feeStructure = await feeStructureService.updateFeeStructure(req.params.id as string, input);
    res.status(200).json(feeStructure);
  })().catch(next);
}
