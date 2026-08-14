import type { NextFunction, Request, Response } from "express";

import { resolveActor } from "./platform-actor.js";
import * as referenceDataAdminService from "./reference-data-admin.service.js";
import {
  createCountrySchema,
  createCurrencySchema,
  createPaymentProviderSchema,
  updateCountrySchema,
  updateCurrencySchema,
  updatePaymentProviderSchema,
} from "./reference-data-admin.validation.js";

export function listCountries(_req: Request, res: Response, next: NextFunction): void {
  void (async () => {
    const countries = await referenceDataAdminService.listCountries();
    res.status(200).json(countries);
  })().catch(next);
}

export function createCountry(req: Request, res: Response, next: NextFunction): void {
  void (async () => {
    const input = createCountrySchema.parse(req.body);
    const actor = await resolveActor(req, input.justification ?? "");
    const country = await referenceDataAdminService.createCountry(input, actor);
    res.status(201).json(country);
  })().catch(next);
}

export function updateCountry(req: Request, res: Response, next: NextFunction): void {
  void (async () => {
    const input = updateCountrySchema.parse(req.body);
    const actor = await resolveActor(req, input.justification ?? "");
    const country = await referenceDataAdminService.updateCountry(req.params.id as string, input, actor);
    res.status(200).json(country);
  })().catch(next);
}

export function listCurrencies(_req: Request, res: Response, next: NextFunction): void {
  void (async () => {
    const currencies = await referenceDataAdminService.listCurrencies();
    res.status(200).json(currencies);
  })().catch(next);
}

export function createCurrency(req: Request, res: Response, next: NextFunction): void {
  void (async () => {
    const input = createCurrencySchema.parse(req.body);
    const actor = await resolveActor(req, input.justification ?? "");
    const currency = await referenceDataAdminService.createCurrency(input, actor);
    res.status(201).json(currency);
  })().catch(next);
}

export function updateCurrency(req: Request, res: Response, next: NextFunction): void {
  void (async () => {
    const input = updateCurrencySchema.parse(req.body);
    const actor = await resolveActor(req, input.justification ?? "");
    const currency = await referenceDataAdminService.updateCurrency(req.params.id as string, input, actor);
    res.status(200).json(currency);
  })().catch(next);
}

export function listPaymentProviders(_req: Request, res: Response, next: NextFunction): void {
  void (async () => {
    const providers = await referenceDataAdminService.listPaymentProviders();
    res.status(200).json(providers);
  })().catch(next);
}

export function createPaymentProvider(req: Request, res: Response, next: NextFunction): void {
  void (async () => {
    const input = createPaymentProviderSchema.parse(req.body);
    const actor = await resolveActor(req, input.justification ?? "");
    const provider = await referenceDataAdminService.createPaymentProvider(input, actor);
    res.status(201).json(provider);
  })().catch(next);
}

export function updatePaymentProvider(req: Request, res: Response, next: NextFunction): void {
  void (async () => {
    const input = updatePaymentProviderSchema.parse(req.body);
    const actor = await resolveActor(req, input.justification ?? "");
    const provider = await referenceDataAdminService.updatePaymentProvider(
      req.params.id as string,
      input,
      actor,
    );
    res.status(200).json(provider);
  })().catch(next);
}
