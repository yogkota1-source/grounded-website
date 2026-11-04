import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { initConsentGate } from "../../consent-gate.js";

describe("consent-gate.js", () => {
  const KEY = "grounded_terms_accepted";

  beforeEach(() => {
    localStorage.clear();
    document.body.innerHTML = "";
    document.body.className = "";
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns early without rendering if already accepted", () => {
    localStorage.setItem(KEY, "yes");
    initConsentGate();
    expect(document.querySelector(".consent-overlay")).toBeNull();
    expect(document.body.classList.contains("consent-locked")).toBe(false);
  });

  it("renders when not accepted, enables button on check, and dismisses on accept", () => {
    vi.useFakeTimers();
    initConsentGate();

    const overlay = document.querySelector(".consent-overlay");
    expect(overlay).not.toBeNull();
    expect(document.body.classList.contains("consent-locked")).toBe(true);

    const box = document.getElementById("consent-checkbox");
    const btn = document.getElementById("consent-btn");
    expect(btn.disabled).toBe(true);

    // Unchecked button click triggers if (!box.checked) return;
    btn.disabled = false;
    box.checked = false;
    btn.click();
    expect(localStorage.getItem(KEY)).toBeNull();

    // Check box
    box.checked = true;
    box.dispatchEvent(new Event("change"));
    expect(btn.disabled).toBe(false);

    // Uncheck box
    box.checked = false;
    box.dispatchEvent(new Event("change"));
    expect(btn.disabled).toBe(true);

    // Check and click
    box.checked = true;
    box.dispatchEvent(new Event("change"));
    btn.click();

    expect(localStorage.getItem(KEY)).toBe("yes");
    expect(overlay.classList.contains("fade-out")).toBe(true);
    expect(document.body.classList.contains("consent-locked")).toBe(false);

    // Fast-forward animation timeout
    vi.advanceTimersByTime(500);
    expect(document.querySelector(".consent-overlay")).toBeNull();
  });

  it("tolerates localStorage errors gracefully", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("Quota/Privacy error");
    });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("Quota/Privacy error");
    });

    initConsentGate();
    const overlay = document.querySelector(".consent-overlay");
    expect(overlay).not.toBeNull();

    const box = document.getElementById("consent-checkbox");
    const btn = document.getElementById("consent-btn");
    box.checked = true;
    box.dispatchEvent(new Event("change"));

    expect(() => btn.click()).not.toThrow();
  });

  it("mounts on DOMContentLoaded if document.body is initially missing", () => {
    const origBody = document.body;
    try {
      Object.defineProperty(document, "body", { value: null, configurable: true });
      let domLoadedCb;
      vi.spyOn(document, "addEventListener").mockImplementation((event, cb) => {
        if (event === "DOMContentLoaded") domLoadedCb = cb;
      });

      initConsentGate();
      expect(domLoadedCb).toBeDefined();

      Object.defineProperty(document, "body", { value: origBody, configurable: true });
      domLoadedCb();
      expect(document.querySelector(".consent-overlay")).not.toBeNull();
    } finally {
      Object.defineProperty(document, "body", { value: origBody, configurable: true });
    }
  });
});
