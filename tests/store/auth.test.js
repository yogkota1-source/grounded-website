import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import "../mocks/firebase-app.js";
import "../mocks/firebase-auth.js";
import { loadPage, trackListeners, untrackListeners, flush } from "./helpers.js";

const PAGE = "simply-seeded.html";
const SCRIPT = "simply-seeded-auth.js";
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
    expect(window.recaptchaVerifier.isVerifier).toBe(true);
  });

  it("skips reCAPTCHA when its container is missing", async () => {
    await load(removeIds("recaptcha-container"));
    expect(fb().RecaptchaVerifier).not.toHaveBeenCalled();
  });

  it("starts signed-out: checkout asks to sign in and opens the modal", async () => {
    await load();
    expect($("checkoutBtn").innerText).toBe("Sign In to Checkout");
    expect($("aiInput").disabled).toBe(true);
    expect($("aiInput").placeholder).toBe("Please sign in to chat...");
    $("checkoutBtn").onclick();
    expect($("auth-modal").style.display).toBe("flex");
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
      expect($("aiInput").placeholder).toBe("Ask The Roaster a question...");
      expect($("checkoutBtn").innerText).toBe("Checkout");
      expect($("checkoutBtn").onclick).toBeNull();
    }
  });

  it("treats a corrupted saved session as signed out", async () => {
    localStorage.setItem(SESSION_KEY, "{bad");
    await load();
    expect($("checkoutBtn").innerText).toBe("Sign In to Checkout");
  });

  it("opens the modal from URL hints only when there is no session", async () => {
    for (const url of ["/?auth=true", "/#signin", "/#auth"]) {
      setUrl(url);
      await load();
      expect($("auth-modal").style.display).toBe("flex");
    }
    setUrl("/");
    await load();
    expect($("auth-modal").style.display).toBe("none");

    setUrl("/?auth=true");
    localStorage.setItem(SESSION_KEY, JSON.stringify({ displayName: "A" }));
    await load();
    expect($("auth-modal").style.display).toBe("none");
  });
});

describe("modal and tabs", () => {
  it("opens, closes, and closes on backdrop click only", async () => {
    await load();
    $("open-modal-btn").click();
    expect($("auth-modal").style.display).toBe("flex");
    expect($("modal-default-view").style.display).toBe("block");
    $("auth-modal").querySelector(".modal-content").click();
    expect($("auth-modal").style.display).toBe("flex");
    $("auth-modal").click();
    expect($("auth-modal").style.display).toBe("none");
    $("open-modal-btn").click();
    $("close-modal-btn").click();
    expect($("auth-modal").style.display).toBe("none");
  });

  it("switches between Create Account and Sign In", async () => {
    await load();
    $("tab-signin").click();
    expect($("tab-signin").classList.contains("active")).toBe(true);
    expect($("tab-signin").getAttribute("aria-selected")).toBe("true");
    expect($("modal-action-title").innerText).toBe("Sign In with Email");
    expect($("email-action-btn").innerText).toBe("Sign In");
    $("tab-signup").click();
    expect($("tab-signup").classList.contains("active")).toBe(true);
    expect($("modal-action-title").innerText).toBe("Create an Account");
    expect($("email-action-btn").innerText).toBe("Sign Up");
  });

  it("copes with every optional element missing", async () => {
    setUrl("/?auth=true");
    const ids = ["open-modal-btn", "close-modal-btn", "user-profile", "user-name", "user-menu-btn",
      "menu-sign-out", "menu-switch-account", "modal-default-view", "modal-phone-view",
      "modal-otp-view", "email-input", "password-input", "email-action-btn", "tab-signup", "tab-signin",
      "modal-action-title", "btn-google", "btn-phone", "phone-number", "send-code-btn", "otp-code",
      "verify-code-btn", "aiInput", "aiSendBtn", "aiMicBtn", "checkoutBtn", "recaptcha-container"];
    const m = await load(removeIds(...ids));
    m.showAuthModal();
    m.setAuthMode(true);
    m.setAuthMode(false);
    m.toggleDropdown();
    storage(SESSION_KEY, JSON.stringify({ displayName: "A" }));
    storage(SESSION_KEY, null);
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    document.body.click();
    expect(window.firebaseAuth).toBe(auth);
  });

  it("copes when only the chat send/mic buttons are missing", async () => {
    await load(removeIds("aiSendBtn", "aiMicBtn"));
    storage(SESSION_KEY, JSON.stringify({ displayName: "A" }));
    storage(SESSION_KEY, null);
    expect($("aiInput").disabled).toBe(true);
  });
});

describe("email sign-in and sign-up", () => {
  const fill = (email, password) => { $("email-input").value = email; $("password-input").value = password; };

  it("validates the form", async () => {
    await load();
    fill("", "");
    $("email-action-btn").click();
    fill("not-an-email", "123456");
    $("email-action-btn").click();
    fill("a@b.co", "123");
    $("email-action-btn").click();
    expect(alertMock.mock.calls.map((c) => c[0])).toEqual([
      "Please enter both email and password.",
      "Please enter a valid email address (e.g., yourname@domain.com).",
      "Password must be at least 6 characters long."
    ]);
  });

  it("signs up (default tab) and falls back to the email prefix", async () => {
    fb().createUserWithEmailAndPassword.mockResolvedValue({ user: { uid: "u1", displayName: null, email: "new@x.com" } });
    await load();
    $("open-modal-btn").click();
    fill("new@x.com", "secret1");
    $("email-action-btn").click();
    expect($("email-action-btn").innerText).toBe("Processing...");
    await flush();
    expect(JSON.parse(localStorage.getItem(SESSION_KEY))).toEqual({ uid: "u1", displayName: "new", email: "new@x.com" });
    expect($("auth-modal").style.display).toBe("none");
    expect($("user-name").textContent).toBe("new");
  });

  it("reports sign-up failure", async () => {
    fb().createUserWithEmailAndPassword.mockRejectedValue(new Error("exists"));
    await load();
    fill("a@b.co", "secret1");
    $("email-action-btn").click();
    await flush();
    expect(alertMock).toHaveBeenCalledWith("Sign Up failed: exists");
    expect($("email-action-btn").innerText).toBe("Sign Up");
  });

  it("signs in with a display name", async () => {
    fb().signInWithEmailAndPassword.mockResolvedValue({ user: { uid: "u2", displayName: "Dev", email: "d@x.com" } });
    await load();
    $("tab-signin").click();
    fill("d@x.com", "secret1");
    $("email-action-btn").click();
    await flush();
    expect(JSON.parse(localStorage.getItem(SESSION_KEY)).displayName).toBe("Dev");
  });

  it("signs in without a display name and reports sign-in failure", async () => {
    fb().signInWithEmailAndPassword.mockResolvedValueOnce({ user: { uid: "u3", displayName: "", email: "z@x.com" } });
    await load();
    $("tab-signin").click();
    fill("z@x.com", "secret1");
    $("email-action-btn").click();
    await flush();
    expect(JSON.parse(localStorage.getItem(SESSION_KEY)).displayName).toBe("z");

    fb().signInWithEmailAndPassword.mockRejectedValueOnce(new Error("bad password"));
    $("auth-modal").style.display = "flex";
    fill("z@x.com", "secret1");
    $("email-action-btn").click();
    await flush();
    expect(alertMock).toHaveBeenCalledWith("Login failed: bad password");
    expect($("email-action-btn").innerText).toBe("Sign In");
  });
});

describe("google sign-in", () => {
  it("signs in with a display name or the email prefix, and logs failures", async () => {
    await load();
    fb().signInWithPopup.mockResolvedValueOnce({ user: { uid: "g1", displayName: "Gita", email: "g@x.com" } });
    $("btn-google").click();
    await flush();
    expect(JSON.parse(localStorage.getItem(SESSION_KEY)).displayName).toBe("Gita");

    fb().signInWithPopup.mockResolvedValueOnce({ user: { uid: "g2", displayName: null, email: "hari@x.com" } });
    $("btn-google").click();
    await flush();
    expect(JSON.parse(localStorage.getItem(SESSION_KEY)).displayName).toBe("hari");

    fb().signInWithPopup.mockRejectedValueOnce(new Error("closed"));
    $("btn-google").click();
    await flush();
    expect(console.error).toHaveBeenCalled();
  });
});

describe("phone sign-in", () => {
  it("navigates to the phone view", async () => {
    await load();
    $("btn-phone").click();
    expect($("modal-default-view").style.display).toBe("none");
    expect($("modal-phone-view").style.display).toBe("block");
  });

  it("validates the number, sends the OTP, and handles failure", async () => {
    await load();
    $("phone-number").value = "123";
    $("send-code-btn").click();
    expect(alertMock).toHaveBeenCalledWith("Please enter a valid 10-digit Indian mobile number.");

    fb().signInWithPhoneNumber.mockResolvedValueOnce({ confirm: vi.fn() });
    $("phone-number").value = "9876543210";
    $("send-code-btn").click();
    expect($("send-code-btn").innerText).toBe("SENDING...");
    await flush();
    expect(fb().signInWithPhoneNumber).toHaveBeenCalledWith(auth, "+919876543210", window.recaptchaVerifier);
    expect($("modal-phone-view").style.display).toBe("none");
    expect($("modal-otp-view").style.display).toBe("block");

    fb().signInWithPhoneNumber.mockRejectedValueOnce(new Error("quota"));
    $("send-code-btn").click();
    await flush();
    expect(alertMock).toHaveBeenCalledWith("Error: quota");
    expect($("send-code-btn").innerText).toBe("SEND OTP");
  });

  it("verifies the OTP: validation, each user shape, and failure", async () => {
    await load();
    $("otp-code").value = "12";
    $("verify-code-btn").click();
    expect(alertMock).toHaveBeenCalledWith("Please enter a valid 6-digit OTP code.");

    const confirmFor = (user) => ({ confirm: vi.fn().mockResolvedValue({ user }) });
    $("otp-code").value = "123456";

    window.confirmationResult = confirmFor({ uid: "p1", displayName: "Pia", phoneNumber: "+91111" });
    $("verify-code-btn").click();
    expect($("verify-code-btn").innerText).toBe("VERIFYING...");
    await flush();
    expect(JSON.parse(localStorage.getItem(SESSION_KEY)).displayName).toBe("Pia");

    window.confirmationResult = confirmFor({ uid: "p2", displayName: "", phoneNumber: "+91222" });
    $("verify-code-btn").click();
    await flush();
    expect(JSON.parse(localStorage.getItem(SESSION_KEY)).displayName).toBe("+91222");

    window.confirmationResult = confirmFor({ uid: "p3", displayName: "", phoneNumber: "" });
    $("verify-code-btn").click();
    await flush();
    expect(JSON.parse(localStorage.getItem(SESSION_KEY)).displayName).toBe("User");

    window.confirmationResult = { confirm: vi.fn().mockRejectedValue(new Error("wrong")) };
    $("verify-code-btn").click();
    await flush();
    expect(alertMock).toHaveBeenCalledWith("Invalid OTP code.");
    expect($("verify-code-btn").innerText).toBe("VERIFY");
  });
});

describe("user dropdown and account actions", () => {
  async function signedIn() {
    localStorage.setItem(SESSION_KEY, JSON.stringify({ displayName: "A" }));
    return load();
  }

  it("opens, closes, closes on outside click and Escape", async () => {
    await signedIn();
    const menu = $("user-dropdown-menu");
    $("user-menu-btn").click();
    expect(menu.classList.contains("show")).toBe(true);
    expect($("user-menu-btn").getAttribute("aria-expanded")).toBe("true");
    $("user-menu-btn").click();
    expect(menu.classList.contains("show")).toBe(false);

    $("user-menu-btn").click();
    $("user-profile").click();
    expect(menu.classList.contains("show")).toBe(true);
    document.body.click();
    expect(menu.classList.contains("show")).toBe(false);

    $("user-menu-btn").click();
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "a" }));
    expect(menu.classList.contains("show")).toBe(true);
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    expect(menu.classList.contains("show")).toBe(false);
  });

  it("ignores the toggle when the menu element is missing", async () => {
    localStorage.setItem(SESSION_KEY, JSON.stringify({ displayName: "A" }));
    await load(removeIds("user-dropdown-menu"));
    expect(() => $("user-menu-btn").click()).not.toThrow();
  });

  it("closes safely when the menu button is missing", async () => {
    localStorage.setItem(SESSION_KEY, JSON.stringify({ displayName: "A" }));
    await load(removeIds("user-menu-btn"));
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    document.body.click();
  });

  it("signs out, even when Firebase sign-out fails", async () => {
    await signedIn();
    $("menu-sign-out").click();
    await flush();
    expect(localStorage.getItem(SESSION_KEY)).toBeNull();
    expect($("checkoutBtn").innerText).toBe("Sign In to Checkout");
    expect(fb().signOut).toHaveBeenCalledWith(auth);

    fb().signOut.mockRejectedValueOnce(new Error("net"));
    $("menu-sign-out").click();
    await flush();
    expect(console.error).toHaveBeenCalled();
  });

  it("switches account and reopens the modal in both outcomes", async () => {
    await signedIn();
    $("menu-switch-account").click();
    await flush();
    expect(providerInstance.setCustomParameters).toHaveBeenCalledWith({ prompt: "select_account" });
    expect($("auth-modal").style.display).toBe("flex");

    $("auth-modal").style.display = "none";
    fb().signOut.mockRejectedValueOnce(new Error("net"));
    $("menu-switch-account").click();
    await flush();
    expect($("auth-modal").style.display).toBe("flex");
  });
});

describe("auth state synchronisation", () => {
  it("syncs Firebase user changes into the session", async () => {
    await load();
    const cases = [
      [{ uid: "1", displayName: "Dana", email: "d@x.com", phoneNumber: null }, "Dana"],
      [{ uid: "2", displayName: null, email: "eve@x.com", phoneNumber: null }, "eve"],
      [{ uid: "3", displayName: null, email: null, phoneNumber: "+9133" }, "+9133"],
      [{ uid: "4", displayName: null, email: null, phoneNumber: null }, "User"]
    ];
    for (const [user, name] of cases) {
      authStateCallback(user);
      expect(JSON.parse(localStorage.getItem(SESSION_KEY)).displayName).toBe(name);
    }
  });

  it("signs the UI out only when no session is stored", async () => {
    await load();
    authStateCallback(null);
    expect($("checkoutBtn").innerText).toBe("Sign In to Checkout");

    localStorage.setItem(SESSION_KEY, JSON.stringify({ displayName: "Keep" }));
    $("checkoutBtn").innerText = "untouched";
    authStateCallback(null);
    expect($("checkoutBtn").innerText).toBe("untouched");
  });

  it("follows the session across tabs", async () => {
    await load();
    storage(SESSION_KEY, JSON.stringify({ displayName: "Tab" }));
    expect($("user-name").textContent).toBe("Tab");
    storage(SESSION_KEY, null);
    expect($("checkoutBtn").innerText).toBe("Sign In to Checkout");
    storage(SESSION_KEY, "{bad");
    expect($("checkoutBtn").innerText).toBe("Sign In to Checkout");
    $("checkoutBtn").innerText = "same";
    storage("something-else", "x");
    expect($("checkoutBtn").innerText).toBe("same");
  });

  it("keeps the sign-out label in sync with the active tab", async () => {
    await load();
    $("tab-signin").click();
    storage(SESSION_KEY, null);
    expect($("email-action-btn").innerText).toBe("Sign In");
    $("tab-signup").click();
    storage(SESSION_KEY, null);
    expect($("email-action-btn").innerText).toBe("Sign Up");
  });

  it("handles showAuthModal/hideAuthModal and toggleDropdown edge cases", async () => {
    const m = await load(removeIds("auth-modal", "user-menu-btn"));
    expect(() => { m.showAuthModal(); m.hideAuthModal(); }).not.toThrow();
    $("user-dropdown-menu").classList.remove("show");
    expect(() => m.toggleDropdown({ stopPropagation: vi.fn() })).not.toThrow();
    expect($("user-dropdown-menu").classList.contains("show")).toBe(true);
  });
});

