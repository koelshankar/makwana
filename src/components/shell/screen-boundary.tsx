"use client";

// Last line of defence for the configurator screens. The project is saved on every change, so
// reloading brings back exactly what was on screen before the error; if the saved project is
// itself the cause, Start over clears it.

import { Component, type ReactNode } from "react";
import { ErrorScreen } from "./error-screen";

export class ScreenBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  render() {
    if (!this.state.failed) return this.props.children;
    return <ErrorScreen />;
  }
}
