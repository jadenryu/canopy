import {
  CopilotRuntime,
  ExperimentalEmptyAdapter,
  copilotRuntimeNextJSAppRouterEndpoint,
} from "@copilotkit/runtime";
import { HttpAgent } from "@ag-ui/client";
import { NextRequest } from "next/server";

const BACKEND_AGUI_URL =
  process.env.BACKEND_AGUI_URL ?? "http://localhost:8000/agui";

// The market backend is a raw AG-UI agent endpoint (FastAPI + SSE).
const runtime = new CopilotRuntime({
  agents: {
    canopy_market: new HttpAgent({ url: BACKEND_AGUI_URL }),
  },
});

export const POST = async (req: NextRequest) => {
  const { handleRequest } = copilotRuntimeNextJSAppRouterEndpoint({
    runtime,
    serviceAdapter: new ExperimentalEmptyAdapter(),
    endpoint: "/api/copilotkit",
  });
  return handleRequest(req);
};
