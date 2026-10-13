import { describe, expect, it } from "vitest";
import { GuardError, assertSafeBaseUrl, redactSecrets } from "./proxy-guard";

function codeOf(url: string): string | null {
  try {
    assertSafeBaseUrl(url);
    return null;
  } catch (e) {
    return e instanceof GuardError ? e.code : "unexpected";
  }
}

describe("assertSafeBaseUrl", () => {
  it.each([
    "http://example.com",
    "https://user:pass@example.com",
    "https://169.254.169.254/",
    "https://10.0.0.8/",
    "http://192.168.1.1/",
    "http://169.254.169.254/",
    "https://metadata.google.internal/",
    "https://0.0.0.0/",
    "https://172.20.1.1/",
    "https://127.0.0.2/",
    "https://224.0.0.1/",
    "https://[fe80::1]/",
    "https://[fd00::1]/",
    "https://[::ffff:10.0.0.1]/",
    "ftp://example.com/",
  ])("拒绝 %s", (url) => {
    expect(codeOf(url)).toBe("blocked_host");
  });

  it.each(["https://api.openai.com/v1", "http://127.0.0.1:11434/v1", "http://localhost:11434/v1", "http://[::1]:8080/v1"])(
    "放行 %s",
    (url) => {
      expect(codeOf(url)).toBeNull();
    },
  );

  it("无法解析的地址返回 invalid_base_url", () => {
    expect(codeOf("not a url")).toBe("invalid_base_url");
    expect(codeOf("")).toBe("invalid_base_url");
  });

  it("去掉尾斜杠", () => {
    expect(assertSafeBaseUrl("https://api.openai.com/v1/")).toBe("https://api.openai.com/v1");
  });
});

describe("redactSecrets", () => {
  it("去掉 sk- 开头的片段", () => {
    const out = redactSecrets("Incorrect API key provided: sk-abc123. Check it.");
    expect(out).not.toContain("sk-abc123");
    expect(out).not.toContain("sk-");
  });

  it("去掉 key= 与 api_key 片段以及请求密钥原文", () => {
    const out = redactSecrets('url?key=AIzaXYZ&x=1 {"api_key": "secret-value"} raw mykey-9999', "mykey-9999");
    expect(out).not.toContain("AIzaXYZ");
    expect(out).not.toContain("secret-value");
    expect(out).not.toContain("mykey-9999");
  });
});
