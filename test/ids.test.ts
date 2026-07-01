import { describe, it, expect } from "vitest";
import { slug, pageArchetypeSlug, pageId, apiId, roleId, titleCase, componentId } from "../src/core/ids.js";

describe("stable ID scheme", () => {
  it("slugs are deterministic and content-derived, never index-based", () => {
    expect(slug("Book Now!")).toBe("book-now");
    expect(slug("  Forgot Password  ")).toBe("forgot-password");
    expect(slug("book now")).toBe(slug("Book Now"));
  });

  it("collapses data-variant URLs into one archetype", () => {
    expect(pageArchetypeSlug("http://x/movie/123")).toBe(pageArchetypeSlug("http://x/movie/456"));
    expect(pageId("http://x/")).toBe("PAGE:home");
    expect(pageArchetypeSlug("http://x/movies/999")).toBe("movies-id");
  });

  it("api ids are method:path-template", () => {
    expect(apiId("get", "/movies")).toBe("API:GET:/movies");
  });

  it("role ids are lowercase slugs; titleCase only at render", () => {
    expect(roleId("Org Admin")).toBe("ROLE:org-admin");
    expect(titleCase("org-admin")).toBe("Org Admin");
  });

  it("component ids are stable for the same selector+label", () => {
    expect(componentId("home", ".btn", "Book")).toBe(componentId("home", ".btn", "Book"));
    expect(componentId("home", ".btn", "Book")).not.toBe(componentId("home", ".btn", "Cancel"));
  });
});
