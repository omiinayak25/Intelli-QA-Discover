import { describe, it, expect } from "vitest";
import { scanText, isClean, assertClean } from "../src/core/discipline.js";

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
