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

  it("verifies all three legal policy documents contain complete required sections", async () => {
    const fs = await import("node:fs");

    // Check consent-gate links
    initConsentGate();
    const overlay = document.querySelector(".consent-overlay");
    expect(overlay.innerHTML).toContain('href="terms-of-service.html"');
    expect(overlay.innerHTML).toContain('href="privacy-policy.html"');
    expect(overlay.innerHTML).toContain('href="refund-policy.html"');

    // Refund policy
    const refundHtml = fs.readFileSync("refund-policy.html", "utf8");
    expect(refundHtml).toContain("1.1 Strict Zero-Return Policy for Perishable Consumables");
    expect(refundHtml).toContain("1.2 Mandatory 48-Hour Reporting Window");
    expect(refundHtml).toContain("1.3 Transit Damage vs. Post-Delivery Drops (The Mandatory Unboxing Video Rule)");
    expect(refundHtml).toContain("1.4 Spoilage, Expiry, and Improper Customer Storage");
    expect(refundHtml).toContain("1.5 Natural Characteristics: Oil Separation &amp; Live Fermentation");
    expect(refundHtml).toContain("1.6 Accurate Shipping Details &amp; Undeliverable Orders (RTO)");
    expect(refundHtml).toContain("1.7 Cancellations &amp; Refund Processing Timeline");

    // Terms of service
    const termsHtml = fs.readFileSync("terms-of-service.html", "utf8");
    expect(termsHtml).toContain("2.1 Overview &amp; Binding Acceptance");
    expect(termsHtml).toContain("2.2 Home Kitchen Facility &amp; Exhaustive Allergen Warning");
    expect(termsHtml).toContain("2.3 Strict Anti-Resale &amp; Commercial Ban");
    expect(termsHtml).toContain("2.4 Account Integrity, Checkout Accuracy &amp; Anti-Abuse");
    expect(termsHtml).toContain("2.5 AI Chatbot Assistants &amp; Non-Medical Disclaimer");
    expect(termsHtml).toContain("2.6 Technical Glitches, Pricing Verification &amp; Payment Security");
    expect(termsHtml).toContain("2.7 Intellectual Property, Limitation of Liability &amp; Exclusive Jurisdiction");
    expect(termsHtml).toContain("2.8 Statutory Grievance Redressal");

    // Privacy policy
    const privacyHtml = fs.readFileSync("privacy-policy.html", "utf8");
    expect(privacyHtml).toContain("3.1 Introduction &amp; Legal Compliance");
    expect(privacyHtml).toContain('3.2 The "Zero Data Selling" Guarantee');
    expect(privacyHtml).toContain("3.3 Personal Data We Collect &amp; Purpose Limitation");
    expect(privacyHtml).toContain("3.4 Financial Data Isolation &amp; Payment Security");
    expect(privacyHtml).toContain("3.5 Trusted Third-Party Data Processors");
    expect(privacyHtml).toContain("3.6 Cookies, Local Storage &amp; Consent Management");
    expect(privacyHtml).toContain("3.7 Data Security &amp; Retention");
    expect(privacyHtml).toContain("3.8 Your Rights as a Data Principal (Under DPDPA 2023)");
    expect(privacyHtml).toContain("3.9 Data Protection &amp; Grievance Officer");
  });
});
