import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { loadPage, trackListeners, untrackListeners, flush } from "../store/helpers.js";

const $ = (id) => document.getElementById(id);

describe("index.js", () => {
  beforeEach(() => {
    trackListeners();
    vi.restoreAllMocks();
    window.turnstile = undefined;
    window.SpeechRecognition = undefined;
    window.webkitSpeechRecognition = undefined;
    window.firebaseAuth = undefined;
    window.scrollTo = vi.fn();
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    untrackListeners();
    vi.useRealTimers();
  });

  async function load(opts) {
    return loadPage("index.html", "index.js", opts);
  }

  describe("escapeHTML", () => {
    it("handles falsy and special character strings", async () => {
      const m = await load();
      expect(m.escapeHTML("")).toBe("");
      expect(m.escapeHTML(null)).toBe("");
      expect(m.escapeHTML(undefined)).toBe("");
      expect(m.escapeHTML("<script>alert('x & y')</script>")).toBe(
        "&lt;script&gt;alert(&#39;x &amp; y&#39;)&lt;/script&gt;"
      );
      expect(m.escapeHTML(123)).toBe("123");
    });
  });

  describe("toggleAIChat", () => {
    it("toggles chat window display and cancels speech", async () => {
      const m = await load();
      const chat = $("aiChatWindow");
      window.speechSynthesis = { cancel: vi.fn() };

      chat.style.display = "none";
      m.toggleAIChat();
      expect(chat.style.display).toBe("flex");

      m.toggleAIChat();
      expect(chat.style.display).toBe("none");
      expect(window.speechSynthesis.cancel).toHaveBeenCalled();

      // Test without speechSynthesis
      chat.style.display = "flex";
      delete window.speechSynthesis;
      expect(() => m.toggleAIChat()).not.toThrow();
      expect(chat.style.display).toBe("none");
    });

    it("handles missing chat window gracefully", async () => {
      const m = await load({
        mutateDom: (doc) => doc.getElementById("aiChatWindow")?.remove()
      });
      expect(() => m.toggleAIChat()).not.toThrow();
    });
  });

  describe("updateCharCount", () => {
    it("updates character counter", async () => {
      const m = await load();
      const input = $("aiInput");
      input.value = "Hello Grounded";
      m.updateCharCount();
      expect($("aiCharCounter").innerText).toBe("14/300");
    });

    it("handles missing elements gracefully", async () => {
      const m = await load({
        mutateDom: (doc) => doc.getElementById("aiCharCounter")?.remove()
      });
      expect(() => m.updateCharCount()).not.toThrow();
    });
  });

  describe("speakText", () => {
    it("speaks when speech synthesis is available", async () => {
      const m = await load();
      const speak = vi.fn();
      const cancel = vi.fn();
      window.speechSynthesis = { speak, cancel };

      class MockUtterance {
        constructor(text) {
          this.text = text;
        }
      }
      vi.stubGlobal("SpeechSynthesisUtterance", MockUtterance);

      m.speakText("Taste our peanut butter");
      expect(cancel).toHaveBeenCalled();
      expect(speak).toHaveBeenCalled();
      expect(speak.mock.calls[0][0].text).toBe("Taste our peanut butter");
    });

    it("does nothing when speech synthesis is not supported", async () => {
      const m = await load();
      delete window.speechSynthesis;
      expect(() => m.speakText("test")).not.toThrow();
    });
  });

  describe("speech recognition lifecycle", () => {
    it("alerts when speech recognition is unsupported", async () => {
      const m = await load();
      const alertMock = vi.fn();
      vi.stubGlobal("alert", alertMock);

      m.toggleSpeechRecognition();
      expect(alertMock).toHaveBeenCalledWith(expect.stringContaining("doesn't support"));
    });

    it("wires and executes all speech recognition handlers", async () => {
      let instance;
      class MockSpeechRecognition {
        constructor() {
          this.start = vi.fn();
          this.stop = vi.fn();
          instance = this;
        }
      }
      window.SpeechRecognition = MockSpeechRecognition;

      const m = await load();
      expect(instance).toBeDefined();

      // toggle starts recognition
      m.toggleSpeechRecognition();
      expect(instance.start).toHaveBeenCalled();

      // onstart event
      window.speechSynthesis = { cancel: vi.fn() };
      instance.onstart();
      expect($("micIconSvg").style.display).toBe("none");
      expect($("voiceVisualizer").style.display).toBe("flex");
      expect($("aiInput").placeholder).toBe("Listening...");
      expect(window.speechSynthesis.cancel).toHaveBeenCalled();

      // onresult event: with initial empty input then additional
      $("aiInput").value = "";
      instance.onresult({ results: [[{ transcript: "Kimchi" }]] });
      expect($("aiInput").value).toBe("Kimchi");
      instance.onresult({ results: [[{ transcript: "pickles" }]] });
      expect($("aiInput").value).toBe("Kimchi pickles");

      // toggle while recording stops recognition
      m.toggleSpeechRecognition();
      expect(instance.stop).toHaveBeenCalled();

      // onerror event
      instance.onerror({ error: "network" });
      expect($("micIconSvg").style.display).toBe("block");
      expect($("voiceVisualizer").style.display).toBe("none");

      // onend event
      instance.onend();
      expect($("aiInput").placeholder).toBe("Ask a question...");
    });
  });

  describe("toggleStory", () => {
    it("expands and collapses story with smooth scroll", async () => {
      vi.useFakeTimers();
      const m = await load();
      const btn = document.querySelector(".story-toggle-btn");
      expect(btn).not.toBeNull();

      const [, sumId, ftId] = btn.getAttribute("onclick").match(/toggleStory\(this,\s*'([^']+)',\s*'([^']+)'\)/);
      const sum = $(sumId);
      const ft = $(ftId);

      // Expand
      m.toggleStory(btn, sumId, ftId);
      expect(ft.classList.contains("expanded")).toBe(true);
      if (sum) expect(sum.classList.contains("hidden")).toBe(true);
      expect(btn.classList.contains("open")).toBe(true);

      vi.advanceTimersByTime(200);
      expect(window.scrollTo).toHaveBeenCalled();

      // Collapse
      m.toggleStory(btn, sumId, ftId);
      expect(ft.classList.contains("expanded")).toBe(false);
      if (sum) expect(sum.classList.contains("hidden")).toBe(false);
      expect(btn.classList.contains("open")).toBe(false);

      vi.advanceTimersByTime(120);
      expect(window.scrollTo).toHaveBeenCalled();
      vi.useRealTimers();
    });

    it("returns safely if full text element is missing", async () => {
      const m = await load();
      expect(() => m.toggleStory(null, "none1", "none2")).not.toThrow();
    });

    it("handles missing nav, missing btn, and missing summary during expand and collapse", async () => {
      vi.useFakeTimers();
      const m = await load({
        mutateDom: (d) => {
          d.querySelector('.top-nav')?.remove();
          d.querySelector('#sum-1')?.remove();
        }
      });
      m.toggleStory(null, "sum-1", "ft-1");
      vi.advanceTimersByTime(200);
      expect(window.scrollTo).toHaveBeenCalled();

      m.toggleStory(null, "sum-1", "ft-1");
      vi.advanceTimersByTime(120);
      expect(window.scrollTo).toHaveBeenCalled();
      vi.useRealTimers();
    });
  });

  describe("handleAIKeyPress", () => {
    it("handles key presses and triggers on Enter", async () => {
      const m = await load();
      expect(() => {
        m.handleAIKeyPress({ key: "A" });
        m.handleAIKeyPress({ key: "Enter" });
      }).not.toThrow();
    });
  });

  describe("sendAIMessage", () => {
    function setupAuth(loggedIn = true) {
      if (loggedIn) {
        window.firebaseAuth = {
          currentUser: {
            getIdToken: vi.fn().mockResolvedValue("mock_token_123")
          }
        };
      } else {
        window.firebaseAuth = { currentUser: null };
      }
    }

    it("ignores empty input", async () => {
      const m = await load();
      $("aiInput").value = "   ";
      await m.sendAIMessage();
      expect(document.querySelector(".ai-msg-user")).toBeNull();
    });

    it("opens login modal when user is not logged in", async () => {
      const m = await load();
      setupAuth(false);
      $("aiInput").value = "Tell me about peanut butter";
      await m.sendAIMessage();
      expect($("auth-modal").style.display).toBe("flex");
    });

    it("sends message to Cloudflare worker with curator persona and displays reply", async () => {
      const m = await load();
      setupAuth(true);
      $("aiInput").value = "Is it organic?";

      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ reply: "Yes, 100% natural and clean!" })
      });
      vi.stubGlobal("fetch", mockFetch);
      window.speechSynthesis = { cancel: vi.fn() };

      await m.sendAIMessage();

      expect(mockFetch).toHaveBeenCalled();
      const payload = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(payload).toEqual({
        message: "Is it organic?",
        persona: "curator",
        token: "mock_token_123"
      });

      expect($("aiChatBody").textContent).toContain("Yes, 100% natural and clean!");
      expect($("aiInput").disabled).toBe(false);
    });

    it("handles 401 / Security Error response and prompts auth modal", async () => {
      const m = await load();
      setupAuth(true);
      $("aiInput").value = "Secret recipe";

      vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
        ok: false,
        status: 401,
        json: async () => ({ error: "Security Error: Session expired" })
      }));

      await m.sendAIMessage();

      expect($("aiChatBody").textContent).toContain("Your login expired");
      expect($("auth-modal").style.display).toBe("flex");
    });

    it("handles AUTH_REQUIRED in reply text", async () => {
      const m = await load();
      setupAuth(true);
      $("aiInput").value = "Question";

      vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ reply: "Security Error: Please authenticate" })
      }));

      await m.sendAIMessage();

      expect($("aiChatBody").textContent).toContain("Your login expired");
      expect($("auth-modal").style.display).toBe("flex");
    });

    it("handles generic backend error", async () => {
      const m = await load();
      setupAuth(true);
      $("aiInput").value = "Hello";

      vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("Network failure")));

      await m.sendAIMessage();

      expect($("aiChatBody").textContent).toContain("Something went wrong");
    });

    it("blocks second submission while request is busy", async () => {
      const m = await load();
      setupAuth(true);
      $("aiInput").value = "First";

      let resolveFetch;
      const promise = new Promise((res) => { resolveFetch = res; });
      vi.stubGlobal("fetch", vi.fn().mockReturnValue(promise));

      const firstSend = m.sendAIMessage();
      $("aiInput").value = "Second";
      await m.sendAIMessage(); // Should return immediately due to aiBusy

      resolveFetch({
        ok: true,
        status: 200,
        json: async () => ({ reply: "First response" })
      });
      await firstSend;
    });

    it("handles backend rejection without error message and without speechSynthesis", async () => {
      const m = await load();
      setupAuth(true);
      delete window.speechSynthesis;
      $("aiInput").value = "Hello";
      vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
        json: async () => ({})
      }));
      await m.sendAIMessage();
      expect($("aiChatBody").textContent).toContain("Something went wrong");
    });

    it("stops voice recording before sending", async () => {
      let inst;
      class MockSpeechRecognition {
        constructor() {
          this.start = vi.fn();
          this.stop = vi.fn();
          inst = this;
        }
      }
      window.SpeechRecognition = MockSpeechRecognition;
      const m = await load();
      inst.onstart();
      setupAuth(true);
      $("aiInput").value = "Hello";
      vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ reply: "OK" })
      }));
      await m.sendAIMessage();
      expect(inst.stop).toHaveBeenCalled();
    });

  });

  describe("initBackToTop", () => {
    it("shows button when scrolled past threshold and scrolls to top on click", async () => {
      const m = await load();
      const btn = $("back-to-top-btn");
      expect(btn).not.toBeNull();

      Object.defineProperty(window, "scrollY", { value: 500, writable: true });
      window.dispatchEvent(new Event("scroll"));
      expect(btn.style.display).toBe("flex");

      Object.defineProperty(window, "scrollY", { value: 100, writable: true });
      window.dispatchEvent(new Event("scroll"));
      expect(btn.style.display).toBe("none");

      btn.click();
      expect(window.scrollTo).toHaveBeenCalledWith({ top: 0, behavior: "smooth" });
    });

    it("handles missing back to top button gracefully", async () => {
      const m = await load({
        mutateDom: (doc) => doc.getElementById("back-to-top-btn")?.remove()
      });
      expect(() => m.initBackToTop()).not.toThrow();
    });

    it("initializes on DOMContentLoaded if document is still loading", async () => {
      const origDescriptor = Object.getOwnPropertyDescriptor(document, "readyState");
      try {
        let domListener;
        vi.spyOn(document, "addEventListener").mockImplementation((type, fn) => {
          if (type === "DOMContentLoaded") domListener = fn;
        });
        Object.defineProperty(document, "readyState", { value: "loading", configurable: true });
        const m = await load();
        expect(domListener).toBeDefined();
        domListener();
      } finally {
        if (origDescriptor) Object.defineProperty(document, "readyState", origDescriptor);
      }
    });
  });
});
