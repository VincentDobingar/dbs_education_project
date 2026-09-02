import { withTenantSession } from "../../lib/prisma.js";
import { requireCurrentTenantId } from "../../lib/tenant-context.js";

import type { MinorConsentSettingInput } from "./minor-consent-setting.validation.js";

const SETTING_KEY = "minor_consent";

/**
 * §16 : « pour les élèves mineurs, prévoir les règles de consentement ... selon les
 * paramètres applicables » — no tenant had ever configured this before this setting
 * existed, so absence of a row means the safe default applies rather than an
 * unconfigured/disabled state.
 */
export const DEFAULT_MINOR_CONSENT_SETTING: MinorConsentSettingInput = { enabled: true, majorityAge: 18 };

/**
 * TenantSetting has RLS enforced (it is not one of the bootstrap-lookup exceptions
 * documented in docs/architecture.md), so a bare rawPrisma call would either see no
 * rows (SELECT: the USING clause silently filters everything out, masking a real
 * setting as "unconfigured") or fail outright (INSERT: the WITH CHECK clause
 * rejects a row with no app.tenant_id set) — every access goes through
 * withTenantSession, tenantId passed explicitly since the compound unique key
 * ([tenantId, key]) makes the tenant-guard-extended client's own auto-injection
 * unnecessary and, for a nested key selector, unreliable (same reasoning as
 * UserRole's userId_roleId_tenantId lookups in tenant-user.service.ts).
 */
export async function getMinorConsentSetting(tenantId: string): Promise<MinorConsentSettingInput> {
  const row = await withTenantSession(tenantId, (tx) =>
    tx.tenantSetting.findUnique({ where: { tenantId_key: { tenantId, key: SETTING_KEY } } }),
  );
  if (!row) {
    return DEFAULT_MINOR_CONSENT_SETTING;
  }
  const value = row.value as Partial<MinorConsentSettingInput> | null;
  const enabled = typeof value?.enabled === "boolean" ? value.enabled : DEFAULT_MINOR_CONSENT_SETTING.enabled;
  const majorityAge =
    typeof value?.majorityAge === "number" && value.majorityAge > 0
      ? value.majorityAge
      : DEFAULT_MINOR_CONSENT_SETTING.majorityAge;
  return { enabled, majorityAge };
}

export async function updateMinorConsentSetting(
  input: MinorConsentSettingInput,
  updatedByUserId: string,
): Promise<MinorConsentSettingInput> {
  const tenantId = requireCurrentTenantId();
  await withTenantSession(tenantId, (tx) =>
    tx.tenantSetting.upsert({
      where: { tenantId_key: { tenantId, key: SETTING_KEY } },
      create: { tenantId, key: SETTING_KEY, value: input, updatedById: updatedByUserId },
      update: { value: input, updatedById: updatedByUserId },
    }),
  );
  return input;
}
