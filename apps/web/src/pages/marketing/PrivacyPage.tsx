import type { ReactNode } from "react";

import { LegalPage } from "./LegalPage.js";

export function PrivacyPage(): ReactNode {
  return <LegalPage titleKey="legal.privacy.title" introKey="legal.privacy.intro" />;
}
