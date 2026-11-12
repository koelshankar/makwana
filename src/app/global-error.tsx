"use client";

// Last resort when the root layout itself fails: it replaces the whole document, so it brings its
// own <html>, <body> and styles. Same design as the screen error page, with Start over.

import { ErrorScreen } from "@/components/shell/error-screen";
import "./globals.css";

export default function GlobalError() {
  return (
    <html lang="en">
      <body className="antialiased">
        <ErrorScreen />
      </body>
    </html>
  );
}
