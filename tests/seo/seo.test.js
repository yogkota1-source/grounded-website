import fs from "node:fs";
import { describe, it, expect } from "vitest";

const read = (f) => fs.readFileSync(f, "utf8");
const BASE = "https://grounded.kinduz.com";

const PAGES = [
  {
    file: "index.html",
    url: `${BASE}/`,
    title: "Grounded | Small-Batch Nut Butters &amp; Artisanal Achar",
    desc: "Grounded brings together honest, small-batch kitchen staples crafted for everyday living—featuring Simply Seeded nut butters and traditional Achar.",
    icon: "/favicon-48.png"
  },
  {
    file: "simply-seeded.html",
    url: `${BASE}/simply-seeded`,
    title: "Simply Seeded by Grounded | Wholesome Small-Batch Nut Butters",
    desc: "Explore Simply Seeded by Grounded—wholesome, thoughtfully crafted nut butters and pantry staples made with clean, everyday ingredients.",
    icon: "/favicon-ss-48.png"
  },
  {
    file: "achar.html",
    url: `${BASE}/achar`,
    title: "Achar by Grounded | Traditional Small-Batch Pickles",
    desc: "Discover Achar by Grounded—traditional, bold, small-batch pickles crafted with authentic spices and time-honored recipes.",
    icon: "/favicon-achar-48.png"
  }
];

describe("route-specific SEO metadata", () => {
  for (const p of PAGES) {
    it(`${p.file} has its own title, description, canonical, Open Graph tags and favicon`, () => {
      const html = read(p.file);
      expect(html).toContain(`<title>${p.title}</title>`);
      expect(html).toContain(`<meta name="description" content="${p.desc}">`);
      expect(html).toContain(`<link rel="canonical" href="${p.url}">`);
      expect(html).toContain(`<meta property="og:title" content="${p.title}">`);
      expect(html).toContain(`<meta property="og:description" content="${p.desc}">`);
      expect(html).toContain(`<meta property="og:url" content="${p.url}">`);
      expect(html).toMatch(/<meta property="og:image" content="https:\/\/grounded\.kinduz\.com\/[^"]+">/);
      expect(html).toContain(`<link rel="icon" type="image/png" sizes="48x48" href="${p.icon}">`);
      expect(html).toContain('<link rel="apple-touch-icon"');
      expect(html).toContain('<meta name="robots" content="index, follow">');
      expect(html).not.toContain("noindex");
      // real icon files, not data: URIs (Google cannot use data: favicons)
      expect(html).not.toMatch(/rel="icon" href='data:/);
    });
  }

  it("every referenced favicon / og asset exists on disk", () => {
    for (const p of PAGES) {
      const html = read(p.file);
      const refs = [...html.matchAll(/(?:href|content)="(?:https:\/\/grounded\.kinduz\.com)?\/([^"/]+\.(?:png|PNG|JPG|ico))"/g)].map((m) => m[1]);
      expect(refs.length).toBeGreaterThan(0);
      for (const ref of refs) expect(fs.existsSync(ref), ref).toBe(true);
    }
  });

  it("homepage declares Grounded as the site via JSON-LD with a square logo", () => {
    const html = read("index.html");
    expect(html).toContain('"@type":"WebSite","name":"Grounded"');
    expect(html).toContain("favicon-512.png");
  });

  it("/soma stays unlaunched and noindex,nofollow (page and header)", () => {
    expect(read("soma.html")).toContain('<meta name="robots" content="noindex, nofollow">');
    const headers = read("_headers");
    expect(headers).toMatch(/\/soma\s+X-Robots-Tag: noindex, nofollow/);
    expect(read("sitemap.xml")).not.toContain("soma");
  });
});

describe("crawling and routing files", () => {
  it("sitemap.xml lists exactly the three launched routes", () => {
    const xml = read("sitemap.xml");
    const locs = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
    expect(locs).toEqual([`${BASE}/`, `${BASE}/simply-seeded`, `${BASE}/achar`]);
  });

  it("robots.txt allows Googlebot, points to the sitemap and does not block /soma", () => {
    const robots = read("robots.txt");
    expect(robots).toMatch(/User-agent: Googlebot\s+Allow: \//);
    expect(robots).toContain(`Sitemap: ${BASE}/sitemap.xml`);
    expect(robots).not.toMatch(/^Disallow:/m);
  });

  it("uses clean URLs and has no catch-all rewrite that would hide /achar behind the homepage", () => {
    expect(fs.existsSync("_redirects")).toBe(false);
    expect(fs.existsSync("vercel.json")).toBe(false);
    const nav = read("achar.html");
    expect(nav).toContain('<a href="/" class="nav-item">');
    expect(nav).toContain('<a href="/simply-seeded" class="nav-item">');
    expect(nav).toContain('<a href="/achar" class="nav-item active"');
  });

  it("sets baseline security headers for every page", () => {
    const headers = read("_headers");
    for (const h of ["X-Content-Type-Options: nosniff", "X-Frame-Options: DENY", "Referrer-Policy: strict-origin-when-cross-origin"]) {
      expect(headers).toContain(h);
    }
  });
});
