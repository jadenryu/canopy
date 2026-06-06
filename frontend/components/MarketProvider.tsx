"use client";

import { CopilotKit } from "@copilotkit/react-core";
import { ReactNode } from "react";
import "@copilotkit/react-ui/styles.css";

export function MarketProvider({ children }: { children: ReactNode }) {
  return (
    <CopilotKit runtimeUrl="/api/copilotkit" agent="canopy_market">
      {children}
    </CopilotKit>
  );
}
