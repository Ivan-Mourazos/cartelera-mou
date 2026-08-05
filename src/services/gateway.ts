import { DemoDesktopGateway } from "./demo-gateway";
import { TauriDesktopGateway } from "./tauri-gateway";
import type { DesktopGateway } from "./types";

declare global {
  interface Window {
    __TAURI_INTERNALS__?: unknown;
  }
}

export function createDesktopGateway(): DesktopGateway {
  const isTauri =
    typeof window !== "undefined" && typeof window.__TAURI_INTERNALS__ !== "undefined";
  return isTauri ? new TauriDesktopGateway() : new DemoDesktopGateway();
}
