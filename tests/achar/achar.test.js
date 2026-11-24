import fs from "node:fs";
import path from "node:path";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import "../mocks/firebase-app.js";
import "../mocks/firebase-auth.js";
import { loadPage, trackListeners, untrackListeners } from "../store/helpers.js";
import { storePrices } from "../../worker.js";

const PAGE = "achar.html";
const SCRIPT = "index-auth.js";
const fb = () => globalThis.__fbAuthMocks;
const appFb = () => globalThis.__fbAppMocks;

let alertMock;
let auth;
let providerInstance;

function resetFirebaseMocks() {
  auth = { currentUser: null };
  providerInstance = { setCustomParameters: vi.fn() };
  appFb().initializeApp.mockReset().mockReturnValue({ app: true });
  fb().getAuth.mockReset().mockReturnValue(auth);
  fb().RecaptchaVerifier.mockReset().mockImplementation(function () { this.isVerifier = true; });
  fb().GoogleAuthProvider.mockReset().mockImplementation(function () { return providerInstance; });
  fb().signInWithPhoneNumber.mockReset();
  fb().signInWithPopup.mockReset();
  fb().signInWithEmailAndPassword.mockReset();
  fb().createUserWithEmailAndPassword.mockReset();
  fb().signOut.mockReset().mockResolvedValue(undefined);
  fb().onAuthStateChanged.mockReset().mockImplementation((a, cb) => cb(auth.currentUser));
}

const load = async (opts) => {
  const authModule = await loadPage(PAGE, SCRIPT, opts);
  const cartModule = await import("../../cart.js");
  const indexModule = await import("../../index.js");
  window.cart = cartModule.cart;
  window.saveCart = cartModule.saveCart;
  window.closeCartModal = cartModule.closeCartModal;
  window.switchAcharSizeTab = indexModule.switchAcharSizeTab;
  cartModule.refreshCartUI();
  return { authModule, cartModule, indexModule };
};

beforeEach(() => {
  trackListeners();
  localStorage.clear();
  alertMock = vi.fn();
  vi.stubGlobal("alert", alertMock);
  vi.spyOn(console, "error").mockImplementation(() => {});
  resetFirebaseMocks();
});

afterEach(() => {
  untrackListeners();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.useRealTimers();
  delete window.SpeechRecognition;
  delete window.webkitSpeechRecognition;
  delete window.speechSynthesis;
  delete window.Razorpay;
  delete window.cart;
  delete window.switchAcharSizeTab;
  delete window.aiPersona;
});

describe("achar.html storefront integration", () => {
  it("renders the 9 Āchar product cards (3 per size) and verifies Kimchi placeholder (no img) and ingredients", async () => {
    await load();
    const cards = document.querySelectorAll(".achar-card");
    expect(cards).toHaveLength(9);

    // Active Kimchi cards (250g, 500g, 1kg)
    const kimchiCards = document.querySelectorAll('.achar-card.achar-active');
    expect(kimchiCards).toHaveLength(3);

    const kimchi250 = kimchiCards[0];
    expect(kimchi250.querySelector("h2").textContent).toBe("250g Kimchi");
    expect(kimchi250.querySelector(".achar-size-label").textContent).toBe("250g");
    expect(kimchi250.querySelector(".achar-price").textContent).toBe("₹399");
    // Verify no img tag is present in the placeholder
    expect(kimchi250.querySelector(".achar-image img")).toBeNull();
    const placeholder = kimchi250.querySelector(".achar-placeholder");
    expect(placeholder).not.toBeNull();
    expect(placeholder.textContent).toContain("Āchar — Artisanal Napa Cabbage Kimchi 250g");
    expect(kimchi250.querySelector(".achar-desc").textContent).toContain("Small-batch, wild-fermented");
    expect(kimchi250.querySelector(".achar-ingredients").textContent).toContain("Napa cabbage");
    expect(kimchi250.querySelector(".achar-ingredients").textContent).toContain("Gochugaru");

    // Inactive development cards (South Indian Pickles & Cucumber Pickles)
    const southIndianCards = Array.from(cards).filter(c => c.querySelector("h2").textContent.includes("South Indian Pickles"));
    expect(southIndianCards).toHaveLength(3);
    southIndianCards.forEach(c => {
      expect(c.querySelector(".btn-in-dev").textContent).toContain("Under Development");
    });

    const cucumberCards = Array.from(cards).filter(c => c.querySelector("h2").textContent.includes("Cucumber Pickles"));
    expect(cucumberCards).toHaveLength(3);
    cucumberCards.forEach(c => {
      expect(c.querySelector(".btn-in-dev").textContent).toContain("Under Development");
    });
  });

  it("renders 3 category sections with all 9 cards visible automatically (no tabs)", async () => {
    await load();
    const sectionTitles = Array.from(document.querySelectorAll(".section-title")).map(el => el.textContent.trim());
    expect(sectionTitles).toEqual([
      "Artisanal Napa Cabbage Kimchi",
      "South Indian Pickles",
      "Cucumber Pickles"
    ]);

    // Verify no size tab bar exists
    expect(document.querySelector(".size-tabs-bar")).toBeNull();

    // Verify all 9 cards are automatically visible (none hidden)
    const cards = document.querySelectorAll(".achar-card");
    expect(cards).toHaveLength(9);
    cards.forEach(card => {
      expect(card.style.display).not.toBe("none");
    });
  });

  it("adds Kimchi variants from each size card to shared cart and builds deterministic itemIds matching storePrices", async () => {
    const { authModule, cartModule } = await load();

    const kimchiCards = document.querySelectorAll(".achar-card.achar-active");
    const kimchi250 = Array.from(kimchiCards).find(c => c.dataset.size === "250g");
    const kimchi500 = Array.from(kimchiCards).find(c => c.dataset.size === "500g");
    const kimchi1kg = Array.from(kimchiCards).find(c => c.dataset.size === "1kg");

    // 1. Add 250g Jar
    kimchi250.querySelector(".ac-add").click();
    expect(cartModule.cart).toHaveLength(1);
    expect(cartModule.cart[0]).toEqual({
      name: "Āchar — Artisanal Napa Cabbage Kimchi",
      variant: "250g",
      price: 399,
      qty: 1
    });
    expect(cartModule.cartTotal()).toBe(399);

    const itemId250 = authModule.buildItemId(cartModule.cart[0]);
    expect(itemId250).toBe("Āchar — Artisanal Napa Cabbage Kimchi - 250g");
    expect(storePrices[itemId250]).toBe(399);

    // 2. Add 500g Jar
    kimchi500.querySelector(".ac-add").click();
    expect(cartModule.cart).toHaveLength(2);
    expect(cartModule.cart[1]).toEqual({
      name: "Āchar — Artisanal Napa Cabbage Kimchi",
      variant: "500g",
      price: 749,
      qty: 1
    });
    expect(cartModule.cartTotal()).toBe(399 + 749);

    const itemId500 = authModule.buildItemId(cartModule.cart[1]);
    expect(itemId500).toBe("Āchar — Artisanal Napa Cabbage Kimchi - 500g");
    expect(storePrices[itemId500]).toBe(749);

    // 3. Add 1kg Jar
    kimchi1kg.querySelector(".ac-add").click();
    expect(cartModule.cart).toHaveLength(3);
    const itemId1kg = authModule.buildItemId(cartModule.cart[2]);
    expect(itemId1kg).toBe("Āchar — Artisanal Napa Cabbage Kimchi - 1kg");
    expect(storePrices[itemId1kg]).toBe(1299);
    expect(cartModule.cartTotal()).toBe(399 + 749 + 1299);

    // Verify cart modal renders line items cleanly
    cartModule.openCartModal();
    const modal = document.getElementById("cartModal");
    expect(modal.style.display).toBe("flex");
    expect(document.getElementById("cartItemsList").innerHTML).toContain("Āchar — Artisanal Napa Cabbage Kimchi");
    expect(document.getElementById("cartTotalDisplay").textContent).toBe("₹2447");
  });

  it("verifies The Archer AI chat assistant and consent gate exist on achar.html", async () => {
    await load();
    expect(document.querySelector(".ai-bubble-btn").textContent.trim()).toBe("TA");
    expect(document.querySelector(".ai-name").textContent.trim()).toBe("The Archer");
    expect(document.getElementById("aiChatWindow")).not.toBeNull();
    expect(document.getElementById("aiInput")).not.toBeNull();
    expect(document.getElementById("aiSendBtn")).not.toBeNull();
    expect(document.querySelector(".ai-msg-content").textContent).toBe(
      "Hi, I’m TA — The Archer. Ask me anything about our small-batch ferments and pickles. I’m here to make sure every flavor hits right on target."
    );

    // Verify script and stylesheet links in achar.html source
    const html = fs.readFileSync("achar.html", "utf8");
    expect(html).toContain('window.aiPersona = "archer";');
    expect(html).toContain('<script src="consent-gate.js" defer></script>');
    expect(html).toContain('<link rel="stylesheet" href="legal.css">');
    expect(html).toContain('<link rel="stylesheet" href="cart.css">');
    expect(html).toContain('<script type="module" src="cart.js"></script>');
    expect(html).toContain('<script type="module" src="index.js"></script>');
    expect(html).toContain('<script type="module" src="index-auth.js"></script>');
  });
});
