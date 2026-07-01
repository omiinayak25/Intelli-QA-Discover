import { describe, it, expect } from "vitest";
import { scanText, isClean, assertClean, buildAllowBlob, scanTextAllow, scanJsonAllow } from "../src/core/discipline.js";

describe("scope discipline (canonical forbidden-token list)", () => {
  it("flags test-case / pass-fail / verification / risk phrasing", () => {
    expect(isClean("Test Case 1: verify login")).toBe(false);
    expect(scanText("the expected result is 200").length).toBeGreaterThan(0);
    expect(scanText("pass/fail column").length).toBeGreaterThan(0);
    expect(scanText("it should open Seat Selection").length).toBeGreaterThan(0);
    expect(scanText("risk score 8, severity high").length).toBeGreaterThan(0);
    expect(scanText("Given a user When they click Then a modal opens").length).toBeGreaterThan(0);
    expect(scanText("confidence to pass").length).toBeGreaterThan(0);
  });

  it("permits discovery-clean phrasing (observations, not prescriptions)", () => {
    expect(isClean("Book Now button — opens Seat Selection — part of Booking Flow")).toBe(true);
    expect(isClean("Confidence 97% — Reason: discovered through hidden navigation")).toBe(true);
    expect(isClean("Login, Register, Forgot Password, Logout")).toBe(true);
    expect(isClean("Global Components: Header, Search, Footer")).toBe(true);
  });

  it("assertClean throws on a dirty object and passes a clean one", () => {
    expect(() => assertClean({ label: "verify checkout" }, "x")).toThrow();
    expect(() => assertClean({ label: "Checkout", behavior: "opens Payment" }, "x")).not.toThrow();
  });
});

describe("inventory-noun exception (captured app content)", () => {
  // the target app's own endpoint contains a forbidden token verbatim
  const allow = buildAllowBlob({
    apis: [{ endpointPattern: "POST /_sec/verify?provider", label: "POST /_sec/verify?provider" }],
    pages: [{ label: "Verify Email", title: "Verify Email" }],
  });

  it("permits a forbidden token carried by captured app content (raw + slugged)", () => {
    expect(scanTextAllow("API:POST:/_sec/verify?provider", allow)).toEqual([]);
    // slug-derived id form
    expect(scanTextAllow("MAP:apis:post-sec-verify-provider", allow)).toEqual([]);
    expect(scanTextAllow("[ ] Verify Email", allow)).toEqual([]);
  });

  it("still flags AUTHORED drift not grounded in app content", () => {
    expect(scanTextAllow("you should navigate to the dashboard", allow).length).toBeGreaterThan(0);
    expect(scanJsonAllow({ behavior: "verify the total is correct" }, allow).length).toBeGreaterThan(0);
  });

  it("assertClean with an allow-blob permits app content but still catches drift", () => {
    expect(() => assertClean({ endpointPattern: "POST /_sec/verify" }, "api", allow)).not.toThrow();
    expect(() => assertClean({ inferredPurpose: "verify the login works" }, "x", allow)).toThrow();
  });

  it("does NOT launder a multi-word forbidden phrase (critical: length gate uses full token)", () => {
    // app content contains the phrase inside a longer label
    const a = buildAllowBlob({ label: "You should return items within 30 days" });
    // the exact app phrase (longer window) is permitted...
    expect(scanTextAllow("policy: you should return items within 30 days", a)).toEqual([]);
    // ...but a bare authored "should return" is NOT laundered by it
    expect(scanTextAllow("the function should return null on error", a).length).toBeGreaterThan(0);
  });
});
