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

  it("ignores clicks on non-control elements, non-Element targets, and detached buttons", () => {
    cartModule.refreshCartUI();

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

  describe("shipping validation functions", () => {
    it("validates first and last names with strict rules", () => {
      // Valid names
      expect(cartModule.isValidName("John")).toBe(true);
      expect(cartModule.isValidName("Doe")).toBe(true);
      expect(cartModule.isValidName("Mary-Jane")).toBe(true);
      expect(cartModule.isValidName("O'Connor")).toBe(true);
      expect(cartModule.isValidName("St. John")).toBe(true);
      expect(cartModule.isValidName("Lee")).toBe(true);

      // Invalid names
      expect(cartModule.isValidName("")).toBe(false);
      expect(cartModule.isValidName("12")).toBe(false);
      expect(cartModule.isValidName("John1")).toBe(false);
      expect(cartModule.isValidName("aa")).toBe(false);
      expect(cartModule.isValidName("xxx")).toBe(false);
      expect(cartModule.isValidName("A.")).toBe(false);
      expect(cartModule.isValidName("A. A.")).toBe(false);
      expect(cartModule.isValidName("A")).toBe(false);
      expect(cartModule.isValidName("x".repeat(81))).toBe(false);
      expect(cartModule.isValidName(123)).toBe(false);
      expect(cartModule.isValidName(null)).toBe(false);
      expect(cartModule.isValidName("@#$")).toBe(false);
      expect(cartModule.isValidName(".")).toBe(false);
    });

    it("validates delivery addresses with strict rules and blocks placeholders", () => {
      // Valid addresses
      expect(cartModule.isValidAddress("123 Grounded Lane, Koregaon Park")).toBe(true);
      expect(cartModule.isValidAddress("Flat 402, Building A, Pune Maharashtra")).toBe(true);

      // Invalid addresses
      expect(cartModule.isValidAddress("")).toBe(false);
      expect(cartModule.isValidAddress("123 St")).toBe(false);
      expect(cartModule.isValidAddress("ABCD EFG")).toBe(false);
      expect(cartModule.isValidAddress("12 34 56 78 90 12")).toBe(false);
      expect(cartModule.isValidAddress("123456789012345")).toBe(false);
      expect(cartModule.isValidAddress("aaaaaaaaaaaaaaa")).toBe(false);
      expect(cartModule.isValidAddress("a a a a a a a a a a a a a a a")).toBe(false);
      expect(cartModule.isValidAddress("Flat 402, Building A, test address road")).toBe(false);
      expect(cartModule.isValidAddress("Flat 402, Building A, qwerty street")).toBe(false);
      expect(cartModule.isValidAddress("Flat 402, Building A, asdfgh avenue")).toBe(false);
      expect(cartModule.isValidAddress("Flat 402, Building A, abcdefg avenue")).toBe(false);
      expect(cartModule.isValidAddress("Flat 402, Building A, none")).toBe(false);
      expect(cartModule.isValidAddress("Flat 402, Building A, na")).toBe(false);
      expect(cartModule.isValidAddress("Flat 402, Building A, null")).toBe(false);
      expect(cartModule.isValidAddress("x".repeat(251))).toBe(false);
      expect(cartModule.isValidAddress(123)).toBe(false);
      expect(cartModule.isValidAddress(null)).toBe(false);
    });

    it("validates 6-digit Indian PIN codes and blocks sequential/repeating placeholders", () => {
      // Valid pincodes
      expect(cartModule.isValidPincode("411001")).toBe(true);
      expect(cartModule.isValidPincode("560001")).toBe(true);
      expect(cartModule.isValidPincode("110001")).toBe(true);

      // Blocked / invalid pincodes
      expect(cartModule.isValidPincode("123456")).toBe(false);
      expect(cartModule.isValidPincode("654321")).toBe(false);
      expect(cartModule.isValidPincode("111111")).toBe(false);
      expect(cartModule.isValidPincode("222222")).toBe(false);
      expect(cartModule.isValidPincode("333333")).toBe(false);
      expect(cartModule.isValidPincode("444444")).toBe(false);
      expect(cartModule.isValidPincode("555555")).toBe(false);
      expect(cartModule.isValidPincode("666666")).toBe(false);
      expect(cartModule.isValidPincode("777777")).toBe(false);
      expect(cartModule.isValidPincode("888888")).toBe(false);
      expect(cartModule.isValidPincode("999999")).toBe(false);
      expect(cartModule.isValidPincode("121212")).toBe(false);
      expect(cartModule.isValidPincode("100000")).toBe(false);
      expect(cartModule.isValidPincode("101010")).toBe(false);
      expect(cartModule.isValidPincode("012345")).toBe(false);
      expect(cartModule.isValidPincode("41100")).toBe(false);
      expect(cartModule.isValidPincode("4110011")).toBe(false);
      expect(cartModule.isValidPincode("41100A")).toBe(false);
      expect(cartModule.isValidPincode(411001)).toBe(false);
      expect(cartModule.isValidPincode(null)).toBe(false);
    });

    it("validates form fields via validateShippingDetails", () => {
      cartModule.ensureCartModal();
      const fn = document.getElementById("shippingFirstName");
      const ln = document.getElementById("shippingLastName");
      const addr = document.getElementById("shippingAddress");
      const pin = document.getElementById("shippingPincode");
      const err = document.getElementById("shippingError");

      fn.scrollIntoView = vi.fn();
      fn.focus = vi.fn();

      // All empty
      fn.value = ""; ln.value = ""; addr.value = ""; pin.value = "";
      expect(cartModule.validateShippingDetails()).toBeNull();
      expect(err.textContent).toBe("First Name is required for shipping.");
      expect(err.style.display).toBe("block");

      // Invalid First Name
      fn.value = "12";
      expect(cartModule.validateShippingDetails()).toBeNull();
      expect(err.textContent).toBe("Please enter a valid First Name (2-80 letters, no digits or repeated characters).");

      // Valid First Name, missing Last Name
      fn.value = "John"; ln.value = "";
      expect(cartModule.validateShippingDetails()).toBeNull();
      expect(err.textContent).toBe("Last Name is required for shipping.");

      // Invalid Last Name
      ln.value = "34";
      expect(cartModule.validateShippingDetails()).toBeNull();
      expect(err.textContent).toBe("Please enter a valid Last Name (2-80 letters, no digits or repeated characters).");

      // Valid Last Name, missing Address
      ln.value = "Doe"; addr.value = "";
      expect(cartModule.validateShippingDetails()).toBeNull();
      expect(err.textContent).toBe("Full Delivery Address is required for shipping.");

      // Invalid Address
      addr.value = "ABCD EFG";
      expect(cartModule.validateShippingDetails()).toBeNull();
      expect(err.textContent).toBe("Please enter a complete delivery address (min 15 chars, at least 3 words).");

      // Valid Address, missing Pincode
      addr.value = "123 Grounded Lane, Koregaon Park"; pin.value = "";
      expect(cartModule.validateShippingDetails()).toBeNull();
      expect(err.textContent).toBe("Pincode is required for shipping.");

      // Invalid Pincode
      pin.value = "123456";
      expect(cartModule.validateShippingDetails()).toBeNull();
      expect(err.textContent).toBe("Please enter a valid 6-digit Indian PIN code.");

      // All valid
      pin.value = "411001";
      const result = cartModule.validateShippingDetails();
      expect(result).toEqual({
        firstName: "John",
        lastName: "Doe",
        address: "123 Grounded Lane, Koregaon Park",
        pincode: "411001"
      });
      expect(err.style.display).toBe("none");

      // Test input listener clearing error
      fn.value = "";
      cartModule.validateShippingDetails();
      expect(fn.classList.contains("input-error")).toBe(true);
      expect(fn.scrollIntoView).toHaveBeenCalled();
      expect(fn.focus).toHaveBeenCalled();

      // Test without scrollIntoView
      delete fn.scrollIntoView;
      cartModule.validateShippingDetails();

      // 1. Dispatch input when value is empty
      fn.value = "   ";
      fn.dispatchEvent(new Event("input"));
      expect(fn.classList.contains("input-error")).toBe(true);

      // 2. Dispatch input when another field also has .input-error
      ln.classList.add("input-error");
      fn.value = "John";
      fn.dispatchEvent(new Event("input"));
      expect(fn.classList.contains("input-error")).toBe(false);
      expect(err.style.display).toBe("block");

      // 3. Dispatch input when no remaining .input-error
      ln.classList.remove("input-error");
      fn.dispatchEvent(new Event("input"));
      expect(err.style.display).toBe("none");

      // 4. Dispatch input when errEl is missing
      const errParent = err.parentNode;
      const errNext = err.nextSibling;
      err.remove();
      fn.dispatchEvent(new Event("input"));
      errParent.insertBefore(err, errNext);

      // Test each missing individual DOM element
      const ids = ["shippingFirstName", "shippingLastName", "shippingAddress", "shippingPincode", "shippingError"];
      for (const id of ids) {
        const el = document.getElementById(id);
        const parent = el.parentNode;
        const next = el.nextSibling;
        el.remove();
        expect(cartModule.validateShippingDetails()).toBeNull();
        parent.insertBefore(el, next);
      }

      // Test missing DOM container
      document.getElementById("shippingFields")?.remove();
      expect(cartModule.validateShippingDetails()).toBeNull();
    });
  });
});
