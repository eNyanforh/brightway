import { describe, expect, it } from "vitest";
import { shouldShowModuleRightRail } from "../layouts/module-rail-visibility";

describe("module discovery rail visibility", () => {
  it("preserves the existing private and public profile layout without a duplicate rail", () => {
    expect(shouldShowModuleRightRail("/profile")).toBe(false);
    expect(shouldShowModuleRightRail("/profile/achievements")).toBe(false);
    expect(shouldShowModuleRightRail("/emmanuel")).toBe(false);
    expect(shouldShowModuleRightRail("/Emmanuel_N")).toBe(false);
  });

  it("preserves the intended rail for search and other personal modules", () => {
    expect(shouldShowModuleRightRail("/search")).toBe(true);
    expect(shouldShowModuleRightRail("/network")).toBe(true);
    expect(shouldShowModuleRightRail("/opportunities")).toBe(true);
    expect(shouldShowModuleRightRail("/learning")).toBe(true);
  });

  it("keeps Explore, organization workspaces, and management on their own layouts", () => {
    expect(shouldShowModuleRightRail("/explore")).toBe(false);
    expect(shouldShowModuleRightRail("/organization-workspace/123/profile")).toBe(false);
    expect(shouldShowModuleRightRail("/superadmin/users")).toBe(false);
  });
});
