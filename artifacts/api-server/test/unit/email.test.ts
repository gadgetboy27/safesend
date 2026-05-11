import { describe, expect, it } from "vitest";
import { esc, sanitizeSubject } from "../../src/lib/email";

describe("esc — HTML body escaping", () => {
  it("escapes angle brackets", () => {
    expect(esc("<script>")).toBe("&lt;script&gt;");
    expect(esc("</strong>")).toBe("&lt;/strong&gt;");
  });

  it("escapes ampersands before angle brackets to avoid double-encoding", () => {
    expect(esc("A&B")).toBe("A&amp;B");
    expect(esc("A&lt;B")).toBe("A&amp;lt;B");
  });

  it("escapes double and single quotes", () => {
    expect(esc('"quoted"')).toBe("&quot;quoted&quot;");
    expect(esc("it's")).toBe("it&#39;s");
  });

  it("neutralises a realistic phishing payload", () => {
    const payload = '</strong><a href="https://evil.example">Verify now</a><strong>';
    const result = esc(payload);
    expect(result).not.toContain("<");
    expect(result).not.toContain(">");
    expect(result).not.toContain('"');
    expect(result).toContain("&lt;/strong&gt;");
    expect(result).toContain("&lt;a href=&quot;https://evil.example&quot;&gt;");
  });

  it("leaves safe plain text unchanged", () => {
    expect(esc("Gibson Les Paul")).toBe("Gibson Les Paul");
    expect(esc("$850 NZD")).toBe("$850 NZD");
  });

  it("handles empty string", () => {
    expect(esc("")).toBe("");
  });
});

describe("sanitizeSubject — subject line control character stripping", () => {
  it("strips carriage return and line feed (header injection vectors)", () => {
    expect(sanitizeSubject("Deal\r\nBcc: attacker@evil.example")).not.toContain("\r");
    expect(sanitizeSubject("Deal\r\nBcc: attacker@evil.example")).not.toContain("\n");
  });

  it("strips lone CR", () => {
    expect(sanitizeSubject("Deal\rTitle")).not.toContain("\r");
  });

  it("strips lone LF", () => {
    expect(sanitizeSubject("Deal\nTitle")).not.toContain("\n");
  });

  it("strips other ASCII control characters", () => {
    expect(sanitizeSubject("Deal\x00\x08Title")).not.toMatch(/[\x00-\x1f]/);
    expect(sanitizeSubject("Deal\x7fTitle")).not.toContain("\x7f");
  });

  it("trims leading and trailing whitespace", () => {
    expect(sanitizeSubject("  my item  ")).toBe("my item");
  });

  it("preserves safe unicode and punctuation", () => {
    expect(sanitizeSubject("Gibson Les Paul — Sunburst")).toBe("Gibson Les Paul — Sunburst");
    expect(sanitizeSubject("Deal #12 (NZD $850)")).toBe("Deal #12 (NZD $850)");
  });

  it("handles empty string", () => {
    expect(sanitizeSubject("")).toBe("");
  });
});
