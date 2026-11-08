import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { trackListeners, untrackListeners } from "../store/helpers.js";

describe("cart.js", () => {
  let cartModule;

  beforeEach(async () => {
    trackListeners();
    localStorage.clear();
    document.body.innerHTML = `
      <div id="cartCount">0</div>
      <div class="cart-count">0</div>
      <div class="add-control" id="ctrl1" data-name="250g Sweetened" data-options="sweet" data-p1="279" data-p2="404"></div>
      <div class="add-control" id="ctrl2" data-name="250g Cocoa" data-variant="" data-price="399"></div>
      <div class="size-card">
        <button class="size-chip active" data-size="250g">250g</button>
        <button class="size-chip" data-size="500g">500g</button>
        <div class="add-control" id="ctrlKimchi" data-name="Spicy Kimchi" data-variant="250g" data-price="0"></div>
      </div>
    `;
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.resetModules();
    cartModule = await import("../../cart.js");
  });

  afterEach(() => {
    untrackListeners();
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it("normalizes and loads valid, corrupted, and edge-case cart data", () => {
    expect(cartModule.escapeHTML("")).toBe("");
    expect(cartModule.escapeHTML("<b>&'\"</b>")).toBe("&lt;b&gt;&amp;&#39;&quot;&lt;/b&gt;");

    cartModule.loadCart("{bad json");
    expect(cartModule.cart).toEqual([]);

    cartModule.loadCart("123");
    expect(cartModule.cart).toEqual([]);

    cartModule.loadCart(JSON.stringify({ not: "an array" }));
    expect(cartModule.cart).toEqual([]);

    cartModule.loadCart(
      JSON.stringify([
        null,
        123,
        {},
        { name: 456 },
        { name: "Item A" },
        { name: "Item B", variant: null, price: "100", qty: "3" },
        { name: "Item C", variant: "Crunchy", price: -50, qty: -1 }
      ])
    );
    expect(cartModule.cart).toEqual([
      { name: "Item A", variant: "", price: 0, qty: 1 },
      { name: "Item B", variant: "", price: 100, qty: 3 },
      { name: "Item C", variant: "Crunchy", price: -50, qty: 1 }
    ]);
  });

  it("computes cartCount and cartTotal accurately", () => {
    cartModule.loadCart(
      JSON.stringify([
        { name: "A", variant: "Smooth", price: 200, qty: 2 },
        { name: "B", variant: "Crunchy", price: 300, qty: 1 }
      ])
    );
    expect(cartModule.cartCount()).toBe(3);
    expect(cartModule.cartTotal()).toBe(700);
  });

  it("computes qtyOf with specific variant and across all variants", () => {
    cartModule.loadCart(
      JSON.stringify([
        { name: "PB", variant: "Smooth", price: 250, qty: 2 },
        { name: "PB", variant: "Crunchy", price: 250, qty: 3 }
      ])
    );
    expect(cartModule.qtyOf("PB", "Smooth")).toBe(2);
    expect(cartModule.qtyOf("PB", "Crunchy")).toBe(3);
    expect(cartModule.qtyOf("PB")).toBe(5);
    expect(cartModule.qtyOf("NonExistent")).toBe(0);
  });

  it("finds lastIndexOfProduct with and without variant", () => {
    cartModule.loadCart(
      JSON.stringify([
        { name: "PB", variant: "Smooth", price: 250, qty: 1 },
        { name: "PB", variant: "Crunchy", price: 250, qty: 1 },
        { name: "PB", variant: "Smooth", price: 250, qty: 2 }
      ])
    );
    expect(cartModule.lastIndexOfProduct("PB", "Smooth")).toBe(2);
    expect(cartModule.lastIndexOfProduct("PB")).toBe(2);
    expect(cartModule.lastIndexOfProduct("Missing", "Variant")).toBe(-1);
  });

  it("renders buttons and quantity selectors based on options dataset", () => {
    const elOptions = document.getElementById("ctrl1");
    const elDirect = document.getElementById("ctrl2");

    cartModule.renderControl(elOptions);
    expect(elOptions.innerHTML).toContain("Customize &amp; Add");

    cartModule.renderControl(elDirect);
    expect(elDirect.innerHTML).toContain("Add to Cart");

    cartModule.addToCart("250g Cocoa", "", 399);
    cartModule.renderControl(elDirect);
    expect(elDirect.innerHTML).toContain("qty-selector");
    expect(elDirect.querySelector(".qty-value").textContent).toBe("1");
  });

  it("saves cart to localStorage and catches storage errors gracefully", () => {
    cartModule.addToCart("Item", "V", 100);
    expect(JSON.parse(localStorage.getItem("groundedCart"))).toHaveLength(1);

    const setItemSpy = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("Quota exceeded");
    });
    expect(() => cartModule.saveCart()).not.toThrow();
    expect(console.error).toHaveBeenCalled();
    setItemSpy.mockRestore();
  });

  it("increments quantity for existing cart item in addToCart", () => {
    cartModule.addToCart("250g Cocoa", "", 399);
    expect(cartModule.cart).toHaveLength(1);
    expect(cartModule.cart[0].qty).toBe(1);

    cartModule.addToCart("250g Cocoa", "", 399);
    expect(cartModule.cart).toHaveLength(1);
    expect(cartModule.cart[0].qty).toBe(2);
  });

  it("handles changeQty: invalid index, decrement, and removal at zero", () => {
    cartModule.changeQty(999, 1);
    expect(cartModule.cart).toHaveLength(0);

    cartModule.addToCart("250g Cocoa", "", 399);
    cartModule.changeQty(0, 1);
    expect(cartModule.cart[0].qty).toBe(2);

    cartModule.changeQty(0, -1);
    expect(cartModule.cart[0].qty).toBe(1);

    cartModule.changeQty(0, -1);
    expect(cartModule.cart).toHaveLength(0);
  });

  it("creates, displays, resets, and hides the toast popup", () => {
    vi.useFakeTimers();
    expect(document.getElementById("cart-toast")).toBeNull();

    cartModule.showToast("Added to Cart");
    const toast = document.getElementById("cart-toast");
    expect(toast).not.toBeNull();
    expect(toast.textContent).toBe("Added to Cart");
    expect(toast.classList.contains("show")).toBe(true);

    // Call again to trigger existing element branch and timer reset
    cartModule.showToast("Updated Cart");
    expect(toast.textContent).toBe("Updated Cart");

    vi.advanceTimersByTime(2300);
    expect(toast.classList.contains("show")).toBe(false);
  });

  it("handles button clicks for ac-add, ac-plus, ac-minus and options modal dispatch", () => {
    const optionsListener = vi.fn();
    document.addEventListener("grounded:open-options", optionsListener);

    // Click on ctrl1 (options: 'sweet')
    cartModule.refreshCartUI();
    const btnOptions = document.querySelector("#ctrl1 .ac-add");
    btnOptions.click();
    expect(optionsListener).toHaveBeenCalledWith(
      expect.objectContaining({
        detail: {
          name: "250g Sweetened",
          type: "sweet",
          price1: 279,
          price2: 404
        }
      })
    );

    // Click on ctrl2 (direct add, no options)
    const btnDirect = document.querySelector("#ctrl2 .ac-add");
    btnDirect.click();
    expect(cartModule.qtyOf("250g Cocoa", "")).toBe(1);

    // Now ctrl2 has quantity selector; click plus
    const plusBtn = document.querySelector("#ctrl2 .ac-plus");
    plusBtn.click();
    expect(cartModule.qtyOf("250g Cocoa", "")).toBe(2);

    // Click minus
    const minusBtn = document.querySelector("#ctrl2 .ac-minus");
    minusBtn.click();
    expect(cartModule.qtyOf("250g Cocoa", "")).toBe(1);

    document.querySelector("#ctrl2 .ac-minus").click();
    expect(cartModule.qtyOf("250g Cocoa", "")).toBe(0);
    expect(document.querySelector("#ctrl2 .ac-add")).not.toBeNull();
  });

  it("handles size chip switching on multi-size cards", () => {
    cartModule.refreshCartUI();
    const chips = document.querySelectorAll(".size-card .size-chip");
    const chip500 = chips[1];

    chip500.click();
    expect(chip500.classList.contains("active")).toBe(true);
    expect(chips[0].classList.contains("active")).toBe(false);

    const ctrl = document.getElementById("ctrlKimchi");
    expect(ctrl.dataset.variant).toBe("500g");

    // Click random non-control element and non-Element target (document)
    document.body.click();
    document.dispatchEvent(new MouseEvent("click"));

    // Click detached button
    const detached = document.createElement("button");
    detached.className = "ac-add";
    document.body.appendChild(detached);
    detached.click();
    detached.remove();
  });

  it("synchronizes on storage events from other tabs", () => {
    window.dispatchEvent(
      new StorageEvent("storage", {
        key: "other_key",
        newValue: "ignored"
      })
    );
    expect(cartModule.cart).toHaveLength(0);

    window.dispatchEvent(
      new StorageEvent("storage", {
        key: "groundedCart",
        newValue: JSON.stringify([{ name: "Synced Jar", variant: "Smooth", price: 300, qty: 1 }])
      })
    );
    expect(cartModule.cart).toHaveLength(1);
    expect(cartModule.cart[0].name).toBe("Synced Jar");
  });

  it("manages global cartModal open, close, backdrop clicks, progress bar, line items, and quantity changes", () => {
    // 1. Initial open with empty cart
    cartModule.openCartModal();
    const modal = document.getElementById("cartModal");
    expect(modal).not.toBeNull();
    expect(modal.style.display).toBe("flex");
    expect(document.getElementById("cartItemsList").innerHTML).toContain("Your pantry is waiting.");
    expect(document.getElementById("checkoutBtn").style.display).toBe("none");

    // Backdrop click closing
    modal.click();
    expect(modal.style.display).toBe("none");

    // Re-open
    cartModule.openCartModal();
    expect(modal.style.display).toBe("flex");

    // Click inside modal content should not close
    document.querySelector("#cartModal .modal-content").click();
    expect(modal.style.display).toBe("flex");

    // Close via closeCartModal
    cartModule.closeCartModal();
    expect(modal.style.display).toBe("none");

    // 2. Add items to cart and test progress bar below threshold (< 1399)
    cartModule.addToCart("Spicy Kimchi", "250g", 250);
    cartModule.openCartModal();
    expect(document.getElementById("checkoutBtn").style.display).toBe("block");
    expect(document.getElementById("checkoutBtn").innerText).toBe("Sign In to Checkout");
    localStorage.setItem("grounded_user", JSON.stringify({ displayName: "Asha" }));
    cartModule.openCartModal();
    expect(document.getElementById("checkoutBtn").innerText).toBe("Checkout");
    localStorage.removeItem("grounded_user");
    expect(document.getElementById("cartTotalDisplay").innerText).toBe("₹250");
    expect(document.getElementById("shippingText").innerText).toContain("Add ₹1149 more for FREE Shipping!");

    // Test progress bar above threshold (>= 1399)
    cartModule.addToCart("Spicy Kimchi", "1kg", 1200);
    cartModule.openCartModal();
    expect(document.getElementById("shippingText").innerText).toBe("🎉 You unlocked FREE Shipping!");

    // Test updateProgressBar guard with negative/NaN values and missing elements
    cartModule.updateProgressBar(-10);
    const bar = document.getElementById("shippingBar");
    bar.remove();
    cartModule.updateProgressBar(500);

    // Test missing shippingFields in openCartModal
    const sf = document.getElementById("shippingFields");
    sf.remove();
    cartModule.openCartModal();
    const savedItems = [...cartModule.cart];
    cartModule.cart.length = 0;
    cartModule.openCartModal();
    cartModule.cart.push(...savedItems);

    // Re-ensure modal and re-render
    cartModule.ensureCartModal();

    // 3. Test changeCartQty and removeFromCart
    cartModule.changeCartQty(0, 1);
    expect(cartModule.cart[0].qty).toBe(2);

    cartModule.removeFromCart(0);
    expect(cartModule.cart).toHaveLength(1);

    // 4. Test grounded:cart-changed event when modal is open vs closed
    document.getElementById("cartModal").style.display = "flex";
    document.dispatchEvent(new CustomEvent("grounded:cart-changed"));
    expect(document.getElementById("cartModal").style.display).toBe("flex");

    document.getElementById("cartModal").style.display = "none";
    document.dispatchEvent(new CustomEvent("grounded:cart-changed"));
    expect(document.getElementById("cartModal").style.display).toBe("none");
  });

  it("handles localStorage.getItem throwing on initial load", async () => {
    const getItemSpy = vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("Security blocked");
    });
    vi.resetModules();
    const freshCart = await import("../../cart.js");
    expect(freshCart.cart).toBeDefined();
    getItemSpy.mockRestore();
  });
});
