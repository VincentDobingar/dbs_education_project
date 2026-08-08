import type { ReactNode } from "react";

import { LegalPage } from "./LegalPage.js";

export function TermsPage(): ReactNode {
  return <LegalPage titleKey="legal.terms.title" introKey="legal.terms.intro" />;
}
