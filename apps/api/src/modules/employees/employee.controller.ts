import type { NextFunction, Request, Response } from "express";

import * as employeeService from "./employee.service.js";
import {
  createEmployeeSchema,
  employeeWorkloadQuerySchema,
  updateEmployeeSchema,
} from "./employee.validation.js";

export function createEmployee(req: Request, res: Response, next: NextFunction): void {
  void (async () => {
    const input = createEmployeeSchema.parse(req.body);
    const employee = await employeeService.createEmployee(input);
    res.status(201).json(employee);
  })().catch(next);
}

export function listEmployees(_req: Request, res: Response, next: NextFunction): void {
  void (async () => {
    const employees = await employeeService.listEmployees();
    res.status(200).json(employees);
  })().catch(next);
}

export function getEmployee(req: Request, res: Response, next: NextFunction): void {
  void (async () => {
    const employee = await employeeService.getEmployee(req.params.id as string);
    res.status(200).json(employee);
  })().catch(next);
}

export function updateEmployee(req: Request, res: Response, next: NextFunction): void {
  void (async () => {
    const input = updateEmployeeSchema.parse(req.body);
    const employee = await employeeService.updateEmployee(req.params.id as string, input);
    res.status(200).json(employee);
  })().catch(next);
}

export function archiveEmployee(req: Request, res: Response, next: NextFunction): void {
  void (async () => {
    const employee = await employeeService.archiveEmployee(req.params.id as string);
    res.status(200).json(employee);
  })().catch(next);
}

export function getEmployeeWorkload(req: Request, res: Response, next: NextFunction): void {
  void (async () => {
    const query = employeeWorkloadQuerySchema.parse(req.query);
    const workload = await employeeService.getEmployeeWorkload(req.params.id as string, query.academicYearId);
    res.status(200).json(workload);
  })().catch(next);
}
