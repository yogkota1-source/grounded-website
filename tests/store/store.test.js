import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { loadPage, trackListeners, untrackListeners, flush } from "./helpers.js";
import { storePrices } from "../../worker.js";

const PAGE = "simply-seeded.html";
const SCRIPT = "simply-seeded.js";

let alertMock;
const load = (opts) => loadPage(PAGE, SCRIPT, opts);
const $ = (id) => document.getElementById(id);

beforeEach(() => {
  trackListeners();
  localStorage.clear();
  alertMock = vi.fn();
  vi.stubGlobal("alert", alertMock);
  vi.spyOn(console, "error").mockImplementation(() => {});
  delete window.firebaseAuth;
  delete window.turnstile;
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
});

describe("escapeHTML", () => {
  it("escapes special characters, tolerates falsy values and non-strings", async () => {
    const m = await load();
    expect(m.escapeHTML(`<a href="x" onclick='y'>&</a>`)).toBe("&lt;a href=&quot;x&quot; onclick=&#39;y&#39;&gt;&amp;&lt;/a&gt;");
    expect(m.escapeHTML("")).toBe("");
    expect(m.escapeHTML(null)).toBe("");
    expect(m.escapeHTML(42)).toBe("42");
  });
});

describe("carousel", () => {
  it("moves forward and backward with wrap-around", async () => {
    const m = await load();
    const wrapper = document.querySelector(".carousel-wrapper");
    const track = wrapper.querySelector(".carousel-track");
    const next = wrapper.querySelector(".next-btn");
    const prev = wrapper.querySelector(".prev-btn");
    m.moveCarousel(next, 1);
    expect(track.getAttribute("data-slide")).toBe("1");
    expect(track.style.transform).toBe("translateX(-100%)");
    m.moveCarousel(next, 1);
    m.moveCarousel(next, 1);
    expect(track.getAttribute("data-slide")).toBe("0");
    m.moveCarousel(prev, -1);
    expect(track.getAttribute("data-slide")).toBe("2");
  });

  it("handles a track with no slides and no data-slide attribute", async () => {
    const m = await load();
    const wrapper = document.createElement("div");
    wrapper.innerHTML = `<button></button><div class="carousel-track"></div>`;
    document.body.appendChild(wrapper);
    m.moveCarousel(wrapper.querySelector("button"), 1);
    expect(wrapper.querySelector(".carousel-track").getAttribute("data-slide")).toBe("0");
  });
});

describe("category dropdown", () => {
  it("toggles, closes and closes on outside click", async () => {
    const m = await load({
      mutateDom: (d) => {
        d.body.insertAdjacentHTML("beforeend", `<div id="categoryDropdown"></div><div id="outside"></div>`);
      }
    });
    const dd = $("categoryDropdown");
    const evt = { preventDefault: vi.fn(), stopPropagation: vi.fn() };
    m.toggleCategoryDropdown(evt);
    expect(dd.classList.contains("open")).toBe(true);
    expect(evt.preventDefault).toHaveBeenCalled();
    m.toggleCategoryDropdown();
    expect(dd.classList.contains("open")).toBe(false);

    m.toggleCategoryDropdown();
    dd.click();
    expect(dd.classList.contains("open")).toBe(true);
    $("outside").click();
    expect(dd.classList.contains("open")).toBe(false);

    m.toggleCategoryDropdown();
    m.closeCategoryDropdown();
    expect(dd.classList.contains("open")).toBe(false);
  });

  it("does nothing when the dropdown is missing", async () => {
    const m = await load({
      mutateDom: (d) => d.getElementById("categoryDropdown")?.remove()
    });
    expect(() => {
      m.toggleCategoryDropdown();
      m.closeCategoryDropdown();
      document.body.click();
    }).not.toThrow();
  });
});

describe("cart persistence", () => {
  it("restores a saved cart and shows the count", async () => {
    localStorage.setItem("groundedCart", JSON.stringify([{ name: "a", variant: "b", price: 1 }]));
    await load();
    expect($("cartCount").innerText).toBe(1);
  });

  it("falls back to an empty cart for corrupted, non-array and null data", async () => {
    for (const raw of ["{bad json", "{}", "null"]) {
      localStorage.setItem("groundedCart", raw);
      await load();
      expect($("cartCount").innerText).toBe(0);
    }
  });

  it("logs when saving fails", async () => {
    const m = await load();
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw new Error("full"); });
    m.saveCart();
    expect(console.error).toHaveBeenCalled();
    window.cart = [{ name: "test", price: 100 }];
    expect(window.cart).toHaveLength(1);
    window.cart = [];
  });

  it("syncs cart changes from other tabs", async () => {
    const m = await load();
    const fire = (key, newValue) => window.dispatchEvent(Object.assign(new Event("storage"), { key, newValue }));
    fire("groundedCart", JSON.stringify([{ name: "x", variant: "y", price: 5 }, { name: "z", variant: "w", price: 6 }]));
    expect($("cartCount").innerText).toBe(2);
    fire("groundedCart", "{bad");
    expect($("cartCount").innerText).toBe(0);
    fire("groundedCart", "{}");
    expect($("cartCount").innerText).toBe(0);
    fire("groundedCart", null);
    expect($("cartCount").innerText).toBe(0);
    fire("other", "x");

    $("cartModal").style.display = "flex";
    fire("groundedCart", JSON.stringify([{ name: "n", variant: "v", price: 7 }]));
    expect($("cartItemsList").innerHTML).toContain("n");
    expect(m).toBeTruthy();
  });

  it("tolerates a missing cart counter", async () => {
    const m = await load({ mutateDom: () => $("cartCount").remove() });
    expect(() => m.updateCartIcon()).not.toThrow();
  });
});

describe("options modal, prices and cart", () => {
  it("shows the sweetened modal with the monk fruit surcharge", async () => {
    const m = await load();
    m.openOptionsModal("250g Sweetened", "sweet", 279, 404);
    expect($("modalSizeText").innerText).toBe("250g Sweetened");
    expect($("sweetenerGroup").style.display).toBe("block");
    expect($("monkPriceBadge").textContent).toBe("(+ ₹125)");
    expect($("addToCartBtn").innerText).toBe("Add to Cart (₹279)");
    expect($("optionsModal").style.display).toBe("flex");

    $("sweetMonk").checked = true;
    m.updateAddButtonPrice();
    expect($("addToCartBtn").innerText).toBe("Add to Cart (₹404)");
  });

  it("hides the surcharge for unsweetened and for equal prices", async () => {
    const m = await load();
    m.openOptionsModal("250g Unsweetened", "unsweet", 259, 259);
    expect($("sweetenerGroup").style.display).toBe("none");
    expect($("monkPriceBadge").style.display).toBe("none");
    expect($("addToCartBtn").innerText).toBe("Add to Cart (₹259)");
    m.openOptionsModal("Same", "sweet", 100, 100);
    expect($("monkPriceBadge").textContent).toBe("");
  });

  it("works when the surcharge badge element is missing", async () => {
    const m = await load({ mutateDom: () => $("monkPriceBadge").remove() });
    expect(() => m.openOptionsModal("250g Sweetened", "sweet", 279, 404)).not.toThrow();
  });

  it("every product combination produces one of the backend itemIds with the matching price", async () => {
    const m = await load();
    const controls = [...document.querySelectorAll(".add-control[data-options]")];
    expect(controls).toHaveLength(9);
    const seen = new Set();

    for (const ctrl of controls) {
      const { name, options: type, p1, p2 } = ctrl.dataset;
      for (const texture of ["texSmooth", "texCrunchy"]) {
        const sweeteners = type === "sweet" ? ["sweetDate", "sweetMonk"] : [null];
        for (const sweetener of sweeteners) {
          localStorage.clear();
          m.cart.length = 0;
          m.openOptionsModal(name, type, Number(p1), Number(p2));
          $(texture).checked = true;
          if (sweetener) $(sweetener).checked = true;
          m.processOptionsAndAdd();

          const cart = JSON.parse(localStorage.getItem("groundedCart"));
          expect(cart).toHaveLength(1);
          const id = m.buildItemId(cart[0]);
          expect(Object.keys(storePrices)).toContain(id);
          expect(cart[0].price).toBe(storePrices[id]);
          seen.add(id);
        }
      }
    }
    expect(seen.size).toBe(24);
    for (const id of seen) {
      expect(storePrices[id]).toBeDefined();
    }
    expect(seen).toContain("250g Cocoa PB - Smooth");
    expect(seen).toContain("250g Cocoa PB - Crunchy");
    expect(seen).toContain("500g Cocoa PB - Smooth");
    expect(seen).toContain("500g Cocoa PB - Crunchy");
    expect(seen).toContain("1kg Cocoa PB - Smooth");
    expect(seen).toContain("1kg Cocoa PB - Crunchy");
  });

  it("falls back to Smooth and Date Powder when no radio is checked", async () => {
    const m = await load();
    m.openOptionsModal("250g Sweetened", "sweet", 279, 404);
    document.querySelectorAll("input[type=radio]").forEach((r) => (r.checked = false));
    m.processOptionsAndAdd();
    const [item] = JSON.parse(localStorage.getItem("groundedCart"));
    expect(item.variant).toBe("Smooth | Date Powder");
  });

  it("removes items and renders the empty cart", async () => {
    const m = await load();
    m.openOptionsModal("250g Unsweetened", "unsweet", 259, 259);
    m.processOptionsAndAdd();
    m.openCartModal();
    expect($("cartItemsList").innerHTML).toContain("250g Unsweetened");
    expect($("cartItemsList").innerHTML).toContain("Smooth | Unsweetened");
    expect($("cartTotalDisplay").innerText).toBe("₹259");
    expect($("checkoutBtn").style.display).toBe("block");
    expect($("optionsModal").style.display).toBe("none");
    m.removeFromCart(0);
    expect($("cartItemsList").innerHTML).toContain("Your pantry is waiting.");
    expect($("checkoutBtn").style.display).toBe("none");
  });

  it("changes cart line quantities and re-renders modal", async () => {
    const m = await load();
    m.openOptionsModal("250g Unsweetened", "unsweet", 259, 259);
    m.processOptionsAndAdd();
    m.openCartModal();
    expect($("cartTotalDisplay").innerText).toBe("₹259");
    m.changeCartQty(0, 1);
    expect($("cartTotalDisplay").innerText).toBe("₹518");
    m.changeCartQty(0, -2);
    expect($("cartItemsList").innerHTML).toContain("Your pantry is waiting.");
  });

  it("handles grounded:open-options and grounded:cart-changed events", async () => {
    const m = await load();
    document.dispatchEvent(new CustomEvent("grounded:open-options", {
      detail: { name: "250g Cocoa PB", type: "cocoa", price1: 399, price2: 399 }
    }));
    expect($("optionsModal").style.display).toBe("flex");
    expect($("modalSizeText").innerText).toBe("250g Cocoa PB");
    expect($("sweetenerGroup").style.display).toBe("none");

    $("cartModal").style.display = "none";
    document.dispatchEvent(new CustomEvent("grounded:cart-changed"));

    $("cartModal").style.display = "flex";
    document.dispatchEvent(new CustomEvent("grounded:cart-changed"));
  });

  it("opens cart modal on load if URL has ?cart=open", async () => {
    delete window.location;
    window.location = new URL("https://grounded.test/simply-seeded.html?cart=open");
    const m = await load();
    expect($("cartModal").style.display).toBe("flex");
  });
});

describe("progress bar and modals", () => {
  it("handles every total", async () => {
    const m = await load();
    m.updateProgressBar(1399);
    expect($("shippingBar").style.width).toBe("100%");
    expect($("shippingText").innerText).toContain("unlocked FREE Shipping");
    m.updateProgressBar(699.5);
    expect($("shippingBar").classList.contains("unlocked-bar")).toBe(false);
    expect($("shippingText").innerText).toContain("Add ₹699.5 more");
    for (const bad of [NaN, -5, 0, "100", undefined]) {
      m.updateProgressBar(bad);
      expect($("shippingBar").style.width).toBe("0%");
    }
  });

  it("returns quietly when the progress elements are missing", async () => {
    const m = await load({ mutateDom: () => $("shippingBar").remove() });
    expect(() => m.updateProgressBar(10)).not.toThrow();
  });

  it("closes modals and ignores unknown ids", async () => {
    const m = await load();
    $("cartModal").style.display = "flex";
    m.closeModal("cartModal");
    expect($("cartModal").style.display).toBe("none");
    expect(() => m.closeModal("nope")).not.toThrow();
  });
});

describe("buildItemId", () => {
  it("strips the Unsweetened suffix only", async () => {
    const m = await load();
    expect(m.buildItemId({ name: "250g Unsweetened", variant: "Smooth | Unsweetened" })).toBe("250g Unsweetened - Smooth");
    expect(m.buildItemId({ name: "1kg Sweetened", variant: "Crunchy | Monk Fruit" })).toBe("1kg Sweetened - Crunchy | Monk Fruit");
    expect(m.buildItemId({ name: "Sample Item", variant: "" })).toBe("Sample Item");
  });
});

// ---------------- Razorpay checkout ----------------
function setupRazorpay() {
  const instances = [];
  const ctor = vi.fn(function (options) {
    this.options = options;
    this.open = vi.fn();
    instances.push(this);
  });
  window.Razorpay = ctor;
  return { ctor, instances };
}

const signedInUser = (extra = {}) => ({
  currentUser: { getIdToken: vi.fn().mockResolvedValue("tok_initial"), ...extra }
});

const orderOk = { key_id: "rzp_from_backend", amount: 27900, currency: "INR", order_id: "order_9" };
const jsonResponse = (body) => ({ json: async () => body });

function fillShippingDetails(details = {
  firstName: "John",
  lastName: "Doe",
  address: "123 Grounded Lane, Koregaon Park",
  pincode: "411001"
}) {
  if ($("shippingFirstName")) $("shippingFirstName").value = details.firstName;
  if ($("shippingLastName")) $("shippingLastName").value = details.lastName;
  if ($("shippingAddress")) $("shippingAddress").value = details.address;
  if ($("shippingPincode")) $("shippingPincode").value = details.pincode;
}

async function loadWithCart() {
  const m = await load();
  m.openOptionsModal("250g Unsweetened", "unsweet", 259, 259);
  m.processOptionsAndAdd();
  $("checkoutBtn").disabled = false;
  fillShippingDetails();
  return m;
}

describe("checkout button", () => {
  it("does nothing when disabled or signed out", async () => {
    await loadWithCart();
    const f = vi.fn();
    vi.stubGlobal("fetch", f);
    $("checkoutBtn").disabled = true;
    $("checkoutBtn").click();
    $("checkoutBtn").disabled = false;
    window.firebaseAuth = undefined;
    $("checkoutBtn").click();
    window.firebaseAuth = { currentUser: null };
    $("checkoutBtn").click();
    expect(f).not.toHaveBeenCalled();
  });

  it("starts checkout with the real cart (exact itemIds, no prices) and locks the button", async () => {
    const { instances } = setupRazorpay();
    await loadWithCart();
    window.firebaseAuth = signedInUser();
    const f = vi.fn().mockResolvedValue(jsonResponse(orderOk));
    vi.stubGlobal("fetch", f);

    $("checkoutBtn").click();
    expect($("checkoutBtn").disabled).toBe(true);
    await flush();
    await flush();

    const [url, init] = f.mock.calls[0];
    expect(url).toBe("https://grounded-api.theteamgrounded.workers.dev/create-order");
    const sent = JSON.parse(init.body);
    expect(sent.token).toBe("tok_initial");
    expect(sent.cart).toEqual([{ itemId: "250g Unsweetened - Smooth", quantity: 1, name: "250g Unsweetened", variant: "Smooth | Unsweetened" }]);
    expect(sent.customer).toEqual({
      firstName: "John",
      lastName: "Doe",
      address: "123 Grounded Lane, Koregaon Park",
      pincode: "411001"
    });
    expect(JSON.stringify(sent)).not.toContain("price");

    const opts = instances[0].options;
    expect(opts).toMatchObject({ key: "rzp_from_backend", amount: 27900, currency: "INR", order_id: "order_9", name: "Grounded", description: "Store Purchase" });
    expect(opts.theme.color).toBe("#000000");
    expect(instances[0].open).toHaveBeenCalled();
    expect($("checkoutBtn").disabled).toBe(true);

    opts.modal.ondismiss();
    expect($("checkoutBtn").disabled).toBe(false);
  });

  it("alerts on an empty cart and re-enables the button", async () => {
    const m = await load();
    window.firebaseAuth = signedInUser();
    await m.startCheckout([]);
    await m.startCheckout(undefined);
    expect(alertMock).toHaveBeenCalledWith("Your cart is empty! Please add a jar to checkout.");
    expect($("checkoutBtn").disabled).toBe(false);
  });

  it("asks to sign in when there is no user", async () => {
    const m = await load();
    window.firebaseAuth = undefined;
    await m.startCheckout([{ itemId: "x" }]);
    window.firebaseAuth = { currentUser: null };
    await m.startCheckout([{ itemId: "x" }]);
    expect(alertMock).toHaveBeenCalledWith("Please sign in to checkout.");
  });

  it("handles getIdToken failure", async () => {
    const m = await load();
    window.firebaseAuth = { currentUser: { getIdToken: vi.fn().mockRejectedValue(new Error("no token")) } };
    fillShippingDetails();
    await m.startCheckout([{ itemId: "x" }]);
    expect(alertMock).toHaveBeenCalledWith("Could not start checkout. Please try again.");
    expect($("checkoutBtn").disabled).toBe(false);
  });

  it("shows backend errors from /create-order", async () => {
    const m = await load();
    window.firebaseAuth = signedInUser();
    fillShippingDetails();
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse({ error: "Unrecognized item in cart." })));
    await m.startCheckout([{ itemId: "x" }]);
    expect(alertMock).toHaveBeenCalledWith("Unrecognized item in cart.");
    expect($("checkoutBtn").disabled).toBe(false);
  });

  it("handles a network rejection", async () => {
    const m = await load();
    window.firebaseAuth = signedInUser();
    fillShippingDetails();
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline")));
    await m.startCheckout([{ itemId: "x" }]);
    expect(alertMock).toHaveBeenCalledWith("Could not start checkout. Please try again.");
  });

  it("tolerates a missing checkout button and shipping fields", async () => {
    const m = await load({ mutateDom: () => { $("checkoutBtn")?.remove(); $("shippingFields")?.remove(); } });
    window.firebaseAuth = signedInUser();
    fillShippingDetails();
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline")));
    await expect(m.startCheckout([{ itemId: "x" }])).resolves.toBeUndefined();
    m.openCartModal();
    m.cart.push({ name: "A", variant: "B", price: 10, qty: 1 });
    expect(() => m.openCartModal()).not.toThrow();
  });

    describe("shipping details validation", () => {
      it("blocks checkout and shows error for missing First Name", async () => {
        const m = await loadWithCart();
        window.firebaseAuth = signedInUser();
        fillShippingDetails({ firstName: "", lastName: "Doe", address: "123 St", pincode: "411001" });
        const scrollSpy = vi.fn();
        const focusSpy = vi.fn();
        $("shippingFirstName").scrollIntoView = scrollSpy;
        $("shippingFirstName").focus = focusSpy;

        await m.startCheckout([{ itemId: "x" }]);
        expect($("shippingError").textContent).toBe("First Name is required for shipping.");
        expect($("shippingError").style.display).toBe("block");
        expect($("shippingFirstName").classList.contains("input-error")).toBe(true);
        expect(scrollSpy).toHaveBeenCalled();
        expect(focusSpy).toHaveBeenCalled();
      });

      it("blocks checkout and shows error for missing Last Name", async () => {
        const m = await loadWithCart();
        window.firebaseAuth = signedInUser();
        fillShippingDetails({ firstName: "John", lastName: "", address: "123 St", pincode: "411001" });

        await m.startCheckout([{ itemId: "x" }]);
        expect($("shippingError").textContent).toBe("Last Name is required for shipping.");
        expect($("shippingLastName").classList.contains("input-error")).toBe(true);
      });

      it("blocks checkout and shows error for missing Address", async () => {
        const m = await loadWithCart();
        window.firebaseAuth = signedInUser();
        fillShippingDetails({ firstName: "John", lastName: "Doe", address: "", pincode: "411001" });

        await m.startCheckout([{ itemId: "x" }]);
        expect($("shippingError").textContent).toBe("Full Delivery Address is required for shipping.");
        expect($("shippingAddress").classList.contains("input-error")).toBe(true);
      });

      it("blocks checkout and shows error for missing Pincode", async () => {
        const m = await loadWithCart();
        window.firebaseAuth = signedInUser();
        fillShippingDetails({ firstName: "John", lastName: "Doe", address: "123 St", pincode: "" });

        await m.startCheckout([{ itemId: "x" }]);
        expect($("shippingError").textContent).toBe("Pincode is required for shipping.");
        expect($("shippingPincode").classList.contains("input-error")).toBe(true);
      });

      it("clears error on input when user types", async () => {
        const m = await loadWithCart();
        window.firebaseAuth = signedInUser();
        fillShippingDetails({ firstName: "", lastName: "Doe", address: "123 St", pincode: "411001" });
        await m.startCheckout([{ itemId: "x" }]);
        expect($("shippingFirstName").classList.contains("input-error")).toBe(true);

        // Type empty
        $("shippingFirstName").value = "   ";
        $("shippingFirstName").dispatchEvent(new Event("input"));
        expect($("shippingFirstName").classList.contains("input-error")).toBe(true);

        // Type real value
        $("shippingFirstName").value = "John";
        $("shippingFirstName").dispatchEvent(new Event("input"));
        expect($("shippingFirstName").classList.contains("input-error")).toBe(false);
        expect($("shippingError").style.display).toBe("none");
      });

      it("handles missing DOM elements and missing scroll/focus gracefully", async () => {
        const m = await load({ mutateDom: () => $("shippingFields")?.remove() });
        window.firebaseAuth = signedInUser();
        expect(m.validateShippingDetails()).toBeNull();
      });
    });

  describe("payment handler", () => {
    async function openAndGetHandler() {
      const { instances } = setupRazorpay();
      const m = await loadWithCart();
      const user = signedInUser();
      window.firebaseAuth = user;
      const f = vi.fn().mockResolvedValue(jsonResponse(orderOk));
      vi.stubGlobal("fetch", f);
      await m.startCheckout([{ itemId: "250g Unsweetened - Smooth", quantity: 1 }]);
      return { handler: instances[0].options.handler, user, f };
    }
    const response = { razorpay_order_id: "o", razorpay_payment_id: "p", razorpay_signature: "s" };

    it("refreshes the token, verifies, clears the cart and confirms on success", async () => {
      const { handler, user, f } = await openAndGetHandler();
      user.currentUser.getIdToken.mockResolvedValue("tok_fresh");
      f.mockResolvedValue(jsonResponse({ status: "success" }));
      await handler(response);
      expect(user.currentUser.getIdToken).toHaveBeenLastCalledWith(true);
      const [url, init] = f.mock.calls.at(-1);
      expect(url).toBe("https://grounded-api.theteamgrounded.workers.dev/verify-payment");
      expect(JSON.parse(init.body)).toEqual({ razorpay_order_id: "o", razorpay_payment_id: "p", razorpay_signature: "s", token: "tok_fresh" });
      expect(alertMock).toHaveBeenCalledWith("Payment Successful! Order confirmed.");
      expect(JSON.parse(localStorage.getItem("groundedCart"))).toEqual([]);
      expect($("checkoutBtn").disabled).toBe(false);
    });

    it("reports a failed verification", async () => {
      const { handler, f } = await openAndGetHandler();
      f.mockResolvedValue(jsonResponse({ status: "failed" }));
      await handler(response);
      expect(alertMock).toHaveBeenCalledWith("Payment verification failed. If money was deducted, please contact support.");
    });

    it("reports a network rejection or token refresh failure", async () => {
      const { handler, f, user } = await openAndGetHandler();
      f.mockRejectedValue(new Error("offline"));
      await handler(response);
      user.currentUser.getIdToken.mockRejectedValue(new Error("expired"));
      await handler(response);
      expect(alertMock).toHaveBeenCalledTimes(2);
      expect(console.error).toHaveBeenCalled();
    });
  });
});

// ---------------- AI chat ----------------
function chatSetup({ user = true } = {}) {
  if (user) window.firebaseAuth = signedInUser();
  $("aiInput").disabled = false;
  $("aiSendBtn").disabled = false;
  $("aiMicBtn").disabled = false;
}
const type = (text) => { $("aiInput").value = text; };
const replyOk = (reply = "Hello!") => vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({ reply }) });

describe("chat widget helpers", () => {
  it("toggles the chat window", async () => {
    const m = await load();
    const cancel = vi.fn();
    window.speechSynthesis = { cancel };
    $("aiChatWindow").style.display = "flex";
    m.toggleAIChat();
    expect($("aiChatWindow").style.display).toBe("none");
    expect(cancel).toHaveBeenCalled();
    m.toggleAIChat();
    expect($("aiChatWindow").style.display).toBe("flex");
    delete window.speechSynthesis;
    m.toggleAIChat();
    expect($("aiChatWindow").style.display).toBe("none");
  });

  it("updates the character counter", async () => {
    const m = await load();
    type("abcd");
    m.updateCharCount();
    expect($("aiCharCounter").innerText).toBe("4/300");
  });

  it("speaks text only when speech synthesis exists", async () => {
    const m = await load();
    m.speakText("hi");
    const speak = vi.fn();
    const cancel = vi.fn();
    window.speechSynthesis = { speak, cancel };
    vi.stubGlobal("SpeechSynthesisUtterance", function (t) { this.text = t; });
    m.speakText("hello");
    expect(speak.mock.calls[0][0]).toMatchObject({ text: "hello", lang: "en-IN", rate: 1, pitch: 1 });
  });

  it("sends on Enter only", async () => {
    const m = await load();
    chatSetup();
    type("");
    expect(() => { m.handleAIKeyPress({ key: "a" }); m.handleAIKeyPress({ key: "Enter" }); }).not.toThrow();
  });
});

describe("speech recognition", () => {
  const makeSR = () => {
    const inst = [];
    window.SpeechRecognition = function () {
      this.start = vi.fn();
      this.stop = vi.fn();
      inst.push(this);
    };
    return inst;
  };

  it("is optional: alerts when unsupported", async () => {
    const m = await load();
    m.toggleSpeechRecognition();
    expect(alertMock).toHaveBeenCalled();
  });

  it("works with the webkit-prefixed implementation", async () => {
    const inst = [];
    window.webkitSpeechRecognition = function () { this.start = vi.fn(); this.stop = vi.fn(); inst.push(this); };
    const m = await load();
    m.toggleSpeechRecognition();
    expect(inst[0].start).toHaveBeenCalled();
  });

  it("wires every recognition handler", async () => {
    const inst = makeSR();
    const m = await load();
    const r = inst[0];
    expect(r.lang).toBe("en-IN");

    m.toggleSpeechRecognition();
    expect(r.start).toHaveBeenCalled();

    const cancel = vi.fn();
    window.speechSynthesis = { cancel };
    r.onstart();
    expect($("aiInput").placeholder).toBe("Listening...");
    expect(cancel).toHaveBeenCalled();
    delete window.speechSynthesis;
    r.onstart();

    m.toggleSpeechRecognition();
    expect(r.stop).toHaveBeenCalled();

    type("");
    r.onresult({ results: [[{ transcript: "first" }]] });
    expect($("aiInput").value).toBe("first");
    r.onresult({ results: [[{ transcript: "second" }]] });
    expect($("aiInput").value).toBe("first second");

    r.onerror({ error: "boom" });
    expect(console.error).toHaveBeenCalled();
    expect($("aiInput").placeholder).toBe("Ask a question...");
    r.onend();
    m.stopRecordingUI();
  });
});

describe("sendAIMessage", () => {
  it("ignores empty input", async () => {
    const m = await load();
    chatSetup();
    type("   ");
    await m.sendAIMessage();
    expect($("aiChatBody").innerHTML).not.toContain("ai-msg-user");
  });

  it("opens the login modal when signed out", async () => {
    const m = await load();
    chatSetup({ user: false });
    type("hi");
    await m.sendAIMessage();
    expect($("auth-modal").style.display).toBe("flex");
    window.firebaseAuth = { currentUser: null };
    await m.sendAIMessage();
  });

  it("sends the message with persona and fresh token", async () => {
    const m = await load();
    chatSetup();
    const f = replyOk("Nice question");
    vi.stubGlobal("fetch", f);
    window.speechSynthesis = { cancel: vi.fn() };
    type("<b>hi</b>");
    await m.sendAIMessage();
    const body = JSON.parse(f.mock.calls[0][1].body);
    expect(body).toEqual({ message: "<b>hi</b>", persona: "roaster", token: "tok_initial" });
    expect($("aiChatBody").innerHTML).toContain("&lt;b&gt;hi&lt;/b&gt;");
    expect($("aiChatBody").textContent).toContain("Nice question");
    expect($("aiInput").disabled).toBe(false);
  });

  it("works without a string reply", async () => {
    const m = await load();
    chatSetup();
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({}) }));
    type("hi");
    await m.sendAIMessage();
    expect($("aiInput").disabled).toBe(false);
  });

  it("blocks a second message while one is in flight and locks the inputs", async () => {
    const m = await load();
    chatSetup();
    let release;
    const f = vi.fn().mockReturnValue(new Promise((resolve) => { release = resolve; }));
    vi.stubGlobal("fetch", f);
    type("one");
    const first = m.sendAIMessage();
    await flush();
    expect($("aiInput").disabled).toBe(true);
    type("two");
    await m.sendAIMessage();
    expect(f).toHaveBeenCalledTimes(1);
    release({ ok: true, status: 200, json: async () => ({ reply: "done" }) });
    await first;
  });

  it("stops voice recording before sending", async () => {
    const inst = [];
    window.SpeechRecognition = function () { this.start = vi.fn(); this.stop = vi.fn(); inst.push(this); };
    const m = await load();
    chatSetup();
    inst[0].onstart();
    vi.stubGlobal("fetch", replyOk());
    type("hello");
    await m.sendAIMessage();
    expect(inst[0].stop).toHaveBeenCalled();
  });

  it("shows a generic error for backend failures", async () => {
    const m = await load();
    chatSetup();
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 500, json: async () => ({ error: "Oops" }) }));
    type("hi");
    await m.sendAIMessage();
    expect($("aiChatBody").textContent).toContain("Something went wrong");
    expect($("auth-modal").style.display).not.toBe("flex");

    chatSetup();
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 400, json: async () => ({}) }));
    type("hi again");
    await m.sendAIMessage();
    expect(console.error).toHaveBeenCalled();
  });

  it("asks the user to sign in again on 401 and Security Error replies", async () => {
    const m = await load();
    chatSetup();
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 401, json: async () => ({ error: "Security Error: Invalid or expired login." }) }));
    type("hi");
    await m.sendAIMessage();
    expect($("aiChatBody").textContent).toContain("Your login expired");
    expect($("auth-modal").style.display).toBe("flex");

    $("auth-modal").style.display = "none";
    chatSetup();
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({ reply: "Security Error: nope" }) }));
    type("again");
    await m.sendAIMessage();
    expect($("auth-modal").style.display).toBe("flex");

    $("auth-modal").style.display = "none";
    chatSetup();
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 403, json: async () => ({ error: "Security Error: x" }) }));
    type("third");
    await m.sendAIMessage();
    expect($("auth-modal").style.display).toBe("flex");
  });

  it("handles a network failure", async () => {
    const m = await load();
    chatSetup();
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline")));
    type("hi");
    await m.sendAIMessage();
    expect($("aiChatBody").textContent).toContain("Something went wrong");
  });
});

