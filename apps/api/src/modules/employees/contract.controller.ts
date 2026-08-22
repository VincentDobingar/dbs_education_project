import type { NextFunction, Request, Response } from "express";

import * as contractService from "./contract.service.js";
import { createContractSchema, updateContractSchema } from "./contract.validation.js";

export function createContract(req: Request, res: Response, next: NextFunction): void {
  void (async () => {
    const input = createContractSchema.parse(req.body);
    const contract = await contractService.createContract(req.params.employeeId as string, input);
    res.status(201).json(contract);
  })().catch(next);
}

export function listContracts(req: Request, res: Response, next: NextFunction): void {
  void (async () => {
    const contracts = await contractService.listContracts(req.params.employeeId as string);
    res.status(200).json(contracts);
  })().catch(next);
}

export function updateContract(req: Request, res: Response, next: NextFunction): void {
  void (async () => {
    const input = updateContractSchema.parse(req.body);
    const contract = await contractService.updateContract(
      req.params.employeeId as string,
      req.params.id as string,
      input,
    );
    res.status(200).json(contract);
  })().catch(next);
}
