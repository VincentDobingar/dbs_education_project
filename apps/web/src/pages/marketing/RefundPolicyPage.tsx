import type { ReactNode } from "react";

import { LegalPage } from "./LegalPage.js";

export function RefundPolicyPage(): ReactNode {
  return <LegalPage titleKey="legal.refund.title" introKey="legal.refund.intro" />;
}
