import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import "../mocks/firebase-app.js";
import "../mocks/firebase-auth.js";
import { loadPage, trackListeners, untrackListeners, flush } from "../store/helpers.js";

const PAGE = "index.html";
const SCRIPT = "index-auth.js";
const SESSION_KEY = "grounded_user";
const fb = () => globalThis.__fbAuthMocks;
const appFb = () => globalThis.__fbAppMocks;
const $ = (id) => document.getElementById(id);

let alertMock;
let auth;
let providerInstance;
let authStateCallback;

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
  authStateCallback = undefined;
  fb().onAuthStateChanged.mockReset().mockImplementation((a, cb) => { authStateCallback = cb; });
}

const load = (opts) => loadPage(PAGE, SCRIPT, opts);
const removeIds = (...ids) => ({ mutateDom: () => ids.forEach((id) => $(id) && $(id).remove()) });
const storage = (key, newValue) => window.dispatchEvent(Object.assign(new Event("storage"), { key, newValue }));
const setUrl = (path) => window.history.replaceState({}, "", path);

beforeEach(() => {
  trackListeners();
  localStorage.clear();
  setUrl("/");
  alertMock = vi.fn();
  vi.stubGlobal("alert", alertMock);
  vi.spyOn(console, "error").mockImplementation(() => {});
  resetFirebaseMocks();
});

afterEach(() => {
  untrackListeners();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  delete window.confirmationResult;
  delete window.recaptchaVerifier;
  delete window.firebaseAuth;
});

describe("initialisation", () => {
  it("initialises Firebase and exposes auth on window", async () => {
    await load();
    expect(appFb().initializeApp).toHaveBeenCalledWith(expect.objectContaining({ projectId: "grounded-store" }));
    expect(window.firebaseAuth).toBe(auth);
    expect(fb().RecaptchaVerifier).toHaveBeenCalled();
  });

  it("skips reCAPTCHA when its container is missing", async () => {
    await load(removeIds("recaptcha-container"));
    expect(fb().RecaptchaVerifier).not.toHaveBeenCalled();
  });

  it("restores a saved session in every display-name variant", async () => {
    const cases = [
      [{ displayName: "Asha" }, "Asha"],
      [{ email: "bo@x.com" }, "bo"],
      [{ phoneNumber: "+911234567890" }, "+911234567890"],
      [{}, "User"]
    ];
    for (const [session, expected] of cases) {
      localStorage.setItem(SESSION_KEY, JSON.stringify(session));
      await load();
      expect($("user-name").textContent).toBe(expected);
      expect($("open-modal-btn").style.display).toBe("none");
      expect($("user-profile").style.display).toBe("inline-block");
      expect($("aiInput").disabled).toBe(false);
      expect($("aiInput").placeholder).toBe("Ask a question...");
    }
  });

  it("treats a corrupted saved session as signed out", async () => {
    localStorage.setItem(SESSION_KEY, "{bad");
    await load();
    expect($("open-modal-btn").style.display).toBe("block");
    expect($("user-profile").style.display).toBe("none");
  });

  it("opens modal if url has ?auth=true or #signin", async () => {
    for (const path of ["/?auth=true", "/#signin", "/#auth"]) {
      localStorage.clear();
      setUrl(path);
      await load();
      expect($("auth-modal").style.display).toBe("flex");
    }
  });

  it("does not open modal from URL if already logged in", async () => {
    localStorage.setItem(SESSION_KEY, JSON.stringify({ displayName: "Asha" }));
    setUrl("/?auth=true");
    await load();
    expect($("auth-modal").style.display).toBe("none");
  });
});

describe("modal and tabs", () => {
  it("handles open, close and backdrop click", async () => {
    await load();
    $("open-modal-btn").click();
    expect($("auth-modal").style.display).toBe("flex");

    $("close-modal-btn").click();
    expect($("auth-modal").style.display).toBe("none");

    $("open-modal-btn").click();
    expect($("auth-modal").style.display).toBe("flex");

    // Click backdrop
    window.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    // target was window, not authModal
    $("auth-modal").dispatchEvent(new MouseEvent("click", { bubbles: true }));
    expect($("auth-modal").style.display).toBe("none");
  });

  it("switches tabs between Sign Up and Sign In", async () => {
    await load();
    expect($("tab-signup").classList.contains("active")).toBe(true);

    $("tab-signin").click();
    expect($("tab-signin").classList.contains("active")).toBe(true);
    expect($("modal-action-title").innerText).toBe("Sign In with Email");
    expect($("email-action-btn").innerText).toBe("Sign In");

    $("tab-signup").click();
    expect($("tab-signup").classList.contains("active")).toBe(true);
    expect($("modal-action-title").innerText).toBe("Create an Account");
    expect($("email-action-btn").innerText).toBe("Sign Up");

    // Line 132: emailActionBtn.innerText = isSignUpMode ? "Sign Up" : "Sign In"
    $("tab-signin").click();
    storage(SESSION_KEY, null);
    expect($("email-action-btn").innerText).toBe("Sign In");
    $("tab-signup").click();
    storage(SESSION_KEY, null);
    expect($("email-action-btn").innerText).toBe("Sign Up");
  });

  it("copes with missing optional elements in modal and views", async () => {
    const ids = ["open-modal-btn", "close-modal-btn", "user-profile", "user-name", "user-menu-btn",
      "menu-sign-out", "menu-switch-account", "modal-default-view", "modal-phone-view",
      "modal-otp-view", "email-input", "password-input", "email-action-btn", "tab-signup", "tab-signin",
      "modal-action-title", "btn-google", "btn-phone", "phone-number", "send-code-btn", "otp-code",
      "verify-code-btn", "aiInput", "aiSendBtn", "aiMicBtn", "recaptcha-container"];
    const m = await load(removeIds(...ids));
    storage(SESSION_KEY, JSON.stringify({ displayName: "A" }));
    storage(SESSION_KEY, null);
    m.showAuthModal();
    m.setAuthMode(true);
    m.setAuthMode(false);
    m.toggleDropdown();
  });

  it("copes when only the chat send/mic buttons are missing", async () => {
    const ids = ["aiSendBtn", "aiMicBtn"];
    await load(removeIds(...ids));
    storage(SESSION_KEY, JSON.stringify({ displayName: "A" }));
    storage(SESSION_KEY, null);
  });
});

describe("email sign-in and sign-up", () => {
  it("validates empty email or password, invalid email, and short password", async () => {
    await load();
    $("email-action-btn").click();
    expect(alertMock).toHaveBeenCalledWith("Please enter both email and password.");

    $("email-input").value = "bademail";
    $("password-input").value = "123456";
    $("email-action-btn").click();
    expect(alertMock).toHaveBeenCalledWith(expect.stringContaining("valid email"));

    $("email-input").value = "good@x.com";
    $("password-input").value = "123";
    $("email-action-btn").click();
    expect(alertMock).toHaveBeenCalledWith(expect.stringContaining("at least 6 characters"));
  });

  it("signs up and stores session, with fallback prefix", async () => {
    fb().createUserWithEmailAndPassword.mockResolvedValue({
      user: { uid: "u1", email: "new@grounded.in" }
    });
    await load();

    $("email-input").value = "new@grounded.in";
    $("password-input").value = "supersecret";
    $("email-action-btn").click();
    await flush();

    expect(fb().createUserWithEmailAndPassword).toHaveBeenCalledWith(auth, "new@grounded.in", "supersecret");
    const stored = JSON.parse(localStorage.getItem(SESSION_KEY));
    expect(stored.displayName).toBe("new");
    expect($("auth-modal").style.display).toBe("none");
  });

  it("reports sign-up failure and restores button text", async () => {
    fb().createUserWithEmailAndPassword.mockRejectedValue(new Error("Email in use"));
    await load();

    $("email-input").value = "existing@grounded.in";
    $("password-input").value = "supersecret";
    $("email-action-btn").click();
    await flush();

    expect(alertMock).toHaveBeenCalledWith("Sign Up failed: Email in use");
    expect($("email-action-btn").innerText).toBe("Sign Up");
  });

  it("signs in with a display name and handles sign-in failure", async () => {
    fb().signInWithEmailAndPassword.mockResolvedValue({
      user: { uid: "u2", email: "hi@grounded.in", displayName: "Asha" }
    });
    await load();

    $("tab-signin").click();
    $("email-input").value = "hi@grounded.in";
    $("password-input").value = "supersecret";
    $("email-action-btn").click();
    await flush();

    expect(JSON.parse(localStorage.getItem(SESSION_KEY)).displayName).toBe("Asha");

    fb().signInWithEmailAndPassword.mockRejectedValue(new Error("Bad pass"));
    $("email-action-btn").click();
    await flush();

    expect(alertMock).toHaveBeenCalledWith("Login failed: Bad pass");
    expect($("email-action-btn").innerText).toBe("Sign In");
  });

  it("signs in without a display name and falls back to email prefix", async () => {
    fb().signInWithEmailAndPassword.mockResolvedValue({
      user: { uid: "u22", email: "prefix_only@grounded.in" }
    });
    await load();

    $("tab-signin").click();
    $("email-input").value = "prefix_only@grounded.in";
    $("password-input").value = "supersecret";
    $("email-action-btn").click();
    await flush();

    expect(JSON.parse(localStorage.getItem(SESSION_KEY)).displayName).toBe("prefix_only");
  });
});

describe("google and phone auth", () => {
  it("signs in with Google or falls back to prefix", async () => {
    fb().signInWithPopup.mockResolvedValue({
      user: { uid: "g1", email: "g@grounded.in", displayName: "Google User" }
    });
    await load();
    $("btn-google").click();
    await flush();
    expect(JSON.parse(localStorage.getItem(SESSION_KEY)).displayName).toBe("Google User");

    fb().signInWithPopup.mockResolvedValue({
      user: { uid: "g2", email: "no_name@grounded.in" }
    });
    $("btn-google").click();
    await flush();
    expect(JSON.parse(localStorage.getItem(SESSION_KEY)).displayName).toBe("no_name");

    fb().signInWithPopup.mockRejectedValue(new Error("Closed"));
    $("btn-google").click();
    await flush();
    expect(console.error).toHaveBeenCalled();
  });

  it("handles phone navigation and sending OTP", async () => {
    const confirmationResult = { confirm: vi.fn() };
    fb().signInWithPhoneNumber.mockResolvedValue(confirmationResult);
    await load();

    $("btn-phone").click();
    expect($("modal-phone-view").style.display).toBe("block");

    $("phone-number").value = "bad";
    $("send-code-btn").click();
    expect(alertMock).toHaveBeenCalledWith(expect.stringContaining("valid 10-digit"));

    $("phone-number").value = "9876543210";
    $("send-code-btn").click();
    await flush();

    expect(fb().signInWithPhoneNumber).toHaveBeenCalled();
    expect($("modal-otp-view").style.display).toBe("block");

    fb().signInWithPhoneNumber.mockRejectedValue(new Error("Quota"));
    $("send-code-btn").click();
    await flush();
    expect(alertMock).toHaveBeenCalledWith("Error: Quota");
    expect($("send-code-btn").innerText).toBe("SEND OTP");
  });

  it("verifies OTP and handles errors", async () => {
    const confirm = vi.fn().mockResolvedValue({
      user: { uid: "p1", phoneNumber: "+919876543210" }
    });
    window.confirmationResult = { confirm };
    await load();

    $("otp-code").value = "12";
    $("verify-code-btn").click();
    expect(alertMock).toHaveBeenCalledWith(expect.stringContaining("valid 6-digit OTP"));

    $("otp-code").value = "123456";
    $("verify-code-btn").click();
    await flush();
    expect(JSON.parse(localStorage.getItem(SESSION_KEY)).phoneNumber).toBe("+919876543210");

    // User fallback without displayName or phoneNumber
    confirm.mockResolvedValueOnce({ user: { uid: "p2" } });
    $("verify-code-btn").click();
    await flush();
    expect(JSON.parse(localStorage.getItem(SESSION_KEY)).displayName).toBe("User");

    confirm.mockRejectedValue(new Error("Bad"));
    $("verify-code-btn").click();
    await flush();
    expect(alertMock).toHaveBeenCalledWith("Invalid OTP code.");
    expect($("verify-code-btn").innerText).toBe("VERIFY");
  });

  it("copes when phoneView and otpView are missing during phone flow", async () => {
    const confirmationResult = { confirm: vi.fn().mockResolvedValue({ user: { uid: "p3", phoneNumber: "+919876543210" } }) };
    fb().signInWithPhoneNumber.mockResolvedValue(confirmationResult);
    await load({
      mutateDom: (d) => {
        d.getElementById("modal-phone-view")?.removeAttribute("id");
        d.getElementById("modal-otp-view")?.removeAttribute("id");
      }
    });
    $("phone-number").value = "9876543210";
    $("send-code-btn").click();
    await flush();
    $("otp-code").value = "123456";
    $("verify-code-btn").click();
    await flush();
  });
});

describe("user dropdown and account actions", () => {
  it("toggles and closes dropdown menu on click, Escape, and outside click", async () => {
    localStorage.setItem(SESSION_KEY, JSON.stringify({ displayName: "Asha" }));
    await load();

    $("user-menu-btn").click();
    expect($("user-dropdown-menu").classList.contains("show")).toBe(true);

    $("user-menu-btn").click();
    expect($("user-dropdown-menu").classList.contains("show")).toBe(false);

    $("user-menu-btn").click();
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    expect($("user-dropdown-menu").classList.contains("show")).toBe(false);

    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter" }));

    $("user-menu-btn").click();
    document.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    expect($("user-dropdown-menu").classList.contains("show")).toBe(false);
  });

  it("signs out and switches account from menu", async () => {
    localStorage.setItem(SESSION_KEY, JSON.stringify({ displayName: "Asha" }));
    await load();

    fb().signOut.mockRejectedValue(new Error("Offline"));
    $("menu-sign-out").click();
    await flush();
    expect(localStorage.getItem(SESSION_KEY)).toBeNull();
    expect(console.error).toHaveBeenCalled();

    localStorage.setItem(SESSION_KEY, JSON.stringify({ displayName: "Asha" }));
    fb().signOut.mockResolvedValue(undefined);
    $("menu-switch-account").click();
    await flush();
    expect(providerInstance.setCustomParameters).toHaveBeenCalledWith({ prompt: "select_account" });
    expect($("auth-modal").style.display).toBe("flex");

    fb().signOut.mockRejectedValue(new Error("Fail"));
    $("menu-switch-account").click();
    await flush();
    expect(console.error).toHaveBeenCalled();
  });
});

describe("auth state synchronization", () => {
  it("syncs Firebase user changes into session and UI", async () => {
    await load();
    expect(authStateCallback).toBeDefined();

    authStateCallback({ uid: "u5", displayName: "Synced User", email: "s@g.com" });
    expect(JSON.parse(localStorage.getItem(SESSION_KEY)).displayName).toBe("Synced User");
    expect($("user-name").textContent).toBe("Synced User");

    authStateCallback({ uid: "u6", email: "prefix@g.com" });
    expect(JSON.parse(localStorage.getItem(SESSION_KEY)).displayName).toBe("prefix");

    authStateCallback({ uid: "u7", phoneNumber: "+911111111111" });
    expect(JSON.parse(localStorage.getItem(SESSION_KEY)).displayName).toBe("+911111111111");

    authStateCallback({ uid: "u8" });
    expect(JSON.parse(localStorage.getItem(SESSION_KEY)).displayName).toBe("User");

    authStateCallback(null);
    expect(localStorage.getItem(SESSION_KEY)).toBeDefined();

    localStorage.clear();
    authStateCallback(null);
    expect($("open-modal-btn").style.display).toBe("block");
  });

  it("follows storage events across tabs", async () => {
    await load();
    storage(SESSION_KEY, JSON.stringify({ displayName: "Tab2" }));
    expect($("user-name").textContent).toBe("Tab2");

    storage(SESSION_KEY, null);
    expect($("open-modal-btn").style.display).toBe("block");

    storage(SESSION_KEY, "{bad json");
    expect($("open-modal-btn").style.display).toBe("block");

    storage("other_key", "val");
  });

  it("handles showAuthModal/hideAuthModal and toggleDropdown edge cases", async () => {
    const m = await load(removeIds("auth-modal", "user-menu-btn"));
    expect(() => { m.showAuthModal(); m.hideAuthModal(); }).not.toThrow();
    $("user-dropdown-menu").classList.remove("show");
    expect(() => m.toggleDropdown({ stopPropagation: vi.fn() })).not.toThrow();
    expect($("user-dropdown-menu").classList.contains("show")).toBe(true);
  });
});

function setupShippingFields(fields = {
  firstName: "Jane",
  lastName: "Smith",
  address: "456 Grounded Rd",
  pincode: "400001"
}) {
  let container = document.getElementById("shippingFields");
  if (!container) {
    container = document.createElement("div");
    container.id = "shippingFields";
    container.innerHTML = `
      <input type="text" id="shippingFirstName" class="shipping-input">
      <input type="text" id="shippingLastName" class="shipping-input">
      <input type="text" id="shippingAddress" class="shipping-input">
      <input type="text" id="shippingPincode" class="shipping-input">
      <div id="shippingError" class="shipping-error"></div>
    `;
    document.body.appendChild(container);
  }
  document.getElementById("shippingFirstName").value = fields.firstName;
  document.getElementById("shippingLastName").value = fields.lastName;
  document.getElementById("shippingAddress").value = fields.address;
  document.getElementById("shippingPincode").value = fields.pincode;
}

describe("checkout flow", () => {
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

  const jsonResponse = (data, status = 200) => ({
    ok: status >= 200 && status < 300,
    status,
    json: async () => data
  });

  const orderOk = {
    key_id: "rzp_from_backend",
    amount: 27900,
    currency: "INR",
    order_id: "order_9"
  };

  const signedInUser = () => ({
    currentUser: {
      uid: "u_ok",
      getIdToken: vi.fn().mockResolvedValue("tok_initial")
    }
  });

  it("updates checkout button when present in DOM", async () => {
    const addBtn = () => {
      const btn = document.createElement("button");
      btn.id = "checkoutBtn";
      document.body.appendChild(btn);
    };
    await load({ mutateDom: addBtn });
    expect($("checkoutBtn").innerText).toBe("Sign In to Checkout");
    
    // Test signed in
    localStorage.setItem(SESSION_KEY, JSON.stringify({ displayName: "Asha" }));
    await load({ mutateDom: addBtn });
    expect($("checkoutBtn").innerText).toBe("Checkout");
    expect($("checkoutBtn").disabled).toBe(false);
  });

  it("builds item ID correctly", async () => {
    const m = await load();
    expect(m.buildItemId({ name: "Spicy Kimchi", variant: "250g" })).toBe("Spicy Kimchi - 250g");
    expect(m.buildItemId({ name: "Plain", variant: "" })).toBe("Plain");
    expect(m.buildItemId({ name: "250g Unsweetened", variant: "Smooth | Unsweetened" })).toBe("250g Unsweetened - Smooth");
  });

  it("sets checkout busy state and handles missing button", async () => {
    const m = await load();
    const btn = document.createElement("button");
    btn.id = "checkoutBtn";
    document.body.appendChild(btn);
    m.setCheckoutBusy(true);
    expect(btn.disabled).toBe(true);
    m.setCheckoutBusy(false);
    expect(btn.disabled).toBe(false);
    btn.remove();
    expect(() => m.setCheckoutBusy(true)).not.toThrow();
  });

  it("handles empty cart and alerts", async () => {
    const m = await load();
    window.firebaseAuth = signedInUser();
    await m.startCheckout([]);
    await m.startCheckout(undefined);
    expect(alertMock).toHaveBeenCalledWith("Your cart is empty! Please add a jar to checkout.");
  });

  it("handles checkout when signed out", async () => {
    const m = await load();
    window.firebaseAuth = undefined;
    await m.startCheckout([{ itemId: "x" }]);
    expect(alertMock).toHaveBeenCalledWith("Please sign in to checkout.");
  });

  it("handles getIdToken failure, backend error and network error", async () => {
    const m = await load();
    setupShippingFields();
    window.firebaseAuth = { currentUser: { getIdToken: vi.fn().mockRejectedValue(new Error("no token")) } };
    await m.startCheckout([{ itemId: "x" }]);
    expect(alertMock).toHaveBeenCalledWith("Could not start checkout. Please try again.");

    window.firebaseAuth = signedInUser();
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse({ error: "Unrecognized item" })));
    await m.startCheckout([{ itemId: "x" }]);
    expect(alertMock).toHaveBeenCalledWith("Unrecognized item");

    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline")));
    await m.startCheckout([{ itemId: "x" }]);
    expect(alertMock).toHaveBeenCalledWith("Could not start checkout. Please try again.");
  });

  it("handles Razorpay open, dismiss and payment verification handler", async () => {
    const { instances } = setupRazorpay();
    const m = await load();
    const user = signedInUser();
    window.firebaseAuth = user;
    const f = vi.fn().mockResolvedValue(jsonResponse(orderOk));
    vi.stubGlobal("fetch", f);

    const btn = document.createElement("button");
    btn.id = "checkoutBtn";
    document.body.appendChild(btn);
    setupShippingFields();

    await m.startCheckout([{ itemId: "Spicy Kimchi - 250g", quantity: 1, name: "Spicy Kimchi", variant: "250g" }]);
    expect(instances[0].open).toHaveBeenCalled();
    expect(btn.disabled).toBe(true);

    instances[0].options.modal.ondismiss();
    expect(btn.disabled).toBe(false);

    // Payment verification
    const handler = instances[0].options.handler;
    const response = { razorpay_order_id: "o", razorpay_payment_id: "p", razorpay_signature: "s" };
    
    // 1. Success
    user.currentUser.getIdToken.mockResolvedValue("tok_fresh");
    f.mockResolvedValue(jsonResponse({ status: "success" }));
    window.cart = [{ name: "Spicy Kimchi" }];
    window.saveCart = vi.fn();
    window.closeCartModal = vi.fn();
    await handler(response);
    expect(alertMock).toHaveBeenCalledWith("Payment Successful! Order confirmed.");
    expect(window.cart).toHaveLength(0);

    // 1b. Success with missing globals
    window.cart = null;
    delete window.saveCart;
    delete window.closeCartModal;
    await handler(response);

    // 2. Failed status
    f.mockResolvedValue(jsonResponse({ status: "failure" }));
    await handler(response);
    expect(alertMock).toHaveBeenCalledWith("Payment verification failed. If money was deducted, please contact support.");

    // 3. Exception in handler
    f.mockRejectedValue(new Error("network error"));
    await handler(response);
    expect(alertMock).toHaveBeenCalledWith("Payment verification failed. If money was deducted, please contact support.");
    
    btn.remove();
  });

  describe("shipping details validation", () => {
    it("blocks checkout and shows error for missing First Name", async () => {
      const m = await load();
      window.firebaseAuth = signedInUser();
      setupShippingFields({ firstName: "", lastName: "Doe", address: "123 St", pincode: "411001" });
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
      const m = await load();
      window.firebaseAuth = signedInUser();
      setupShippingFields({ firstName: "John", lastName: "", address: "123 St", pincode: "411001" });

      await m.startCheckout([{ itemId: "x" }]);
      expect($("shippingError").textContent).toBe("Last Name is required for shipping.");
      expect($("shippingLastName").classList.contains("input-error")).toBe(true);
    });

    it("blocks checkout and shows error for missing Address", async () => {
      const m = await load();
      window.firebaseAuth = signedInUser();
      setupShippingFields({ firstName: "John", lastName: "Doe", address: "", pincode: "411001" });

      await m.startCheckout([{ itemId: "x" }]);
      expect($("shippingError").textContent).toBe("Full Delivery Address is required for shipping.");
      expect($("shippingAddress").classList.contains("input-error")).toBe(true);
    });

    it("blocks checkout and shows error for missing Pincode", async () => {
      const m = await load();
      window.firebaseAuth = signedInUser();
      setupShippingFields({ firstName: "John", lastName: "Doe", address: "123 St", pincode: "" });

      await m.startCheckout([{ itemId: "x" }]);
      expect($("shippingError").textContent).toBe("Pincode is required for shipping.");
      expect($("shippingPincode").classList.contains("input-error")).toBe(true);
    });

    it("clears error on input when user types", async () => {
      const m = await load();
      window.firebaseAuth = signedInUser();
      setupShippingFields({ firstName: "", lastName: "Doe", address: "123 St", pincode: "411001" });
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
      const m = await load();
      document.getElementById("shippingFields")?.remove();
      window.firebaseAuth = signedInUser();
      expect(m.validateShippingDetails()).toBeNull();
    });
  });

  it("handles global delegated click on #checkoutBtn when signed out vs signed in", async () => {
    const m = await load();
    const btn = document.createElement("button");
    btn.id = "checkoutBtn";
    document.body.appendChild(btn);

    // Click when disabled: ignored
    btn.disabled = true;
    btn.click();
    expect($("auth-modal").style.display).toBe("none");

    // Click when signed out: opens auth modal
    btn.disabled = false;
    window.firebaseAuth = null;
    localStorage.removeItem(SESSION_KEY);
    btn.click();
    expect($("auth-modal").style.display).toBe("flex");

    // Click when signed in
    setupRazorpay();
    setupShippingFields();
    window.firebaseAuth = signedInUser();
    localStorage.setItem(SESSION_KEY, JSON.stringify({ displayName: "Asha" }));
    window.cart = [{ name: "Spicy Kimchi", variant: "250g", price: 250, qty: 1 }];
    const f = vi.fn().mockResolvedValue(jsonResponse(orderOk));
    vi.stubGlobal("fetch", f);
    btn.click();
    expect(btn.disabled).toBe(true);

    // Click when window.cart is null
    btn.disabled = false;
    window.cart = null;
    btn.click();

    btn.remove();
  });
});

