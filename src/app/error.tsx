"use client";

// Errors outside the configurator's own screen boundary (the print page, layouts) land here instead
// of Next's bare "Application error" page: same design, with Reload and Start over.

import { ErrorScreen } from "@/components/shell/error-screen";

export default function RouteError() {
  return <ErrorScreen />;
}
