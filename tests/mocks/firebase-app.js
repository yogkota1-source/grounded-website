import { vi } from "vitest";

const g = (globalThis.__fbAppMocks ??= { initializeApp: vi.fn() });
export const initializeApp = g.initializeApp;
