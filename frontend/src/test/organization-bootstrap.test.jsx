import { render, screen } from "@testing-library/react";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import { it, expect, vi } from "vitest";
import { AuthContext } from "../auth/auth-context";
import OrganizationSetupGate from "../components/organizations/OrganizationSetupGate";
import OrganizationWorkspacePage from "../pages/OrganizationWorkspacePage";
import { dashboardFixture } from "./fixtures/organization-dashboard";
const id = "22222222-2222-4222-8222-222222222222";
it("reuses one server-authorized context for setup and workspace entry before requesting statistics", async () => {
  const organization = { id, name: "Synthetic School", type: "SCHOOL", offersTraining: true };
  const context = { accountId: "owner", organization, membership: { role: "PRIMARY_ADMIN" }, permissions: [], permissionCatalog: [], staffVersion: 1, setup: { organization, required: false, canEdit: true, version: 5 } };
  const reply = data => new Response(JSON.stringify({ success: true, data }), { status: 200 });
  const fetch = vi.fn(async url => url.includes("/dashboard") ? reply(dashboardFixture(id)) : reply(context)); vi.stubGlobal("fetch", fetch);
  render(<AuthContext.Provider value={{ account: { id: "owner" } }}><MemoryRouter initialEntries={[`/organization-workspace/${id}`]}><Routes><Route path="/organization-workspace/:id" element={<OrganizationSetupGate><OrganizationWorkspacePage /></OrganizationSetupGate>} /></Routes></MemoryRouter></AuthContext.Provider>);
  await screen.findByText("Enabled members");
  expect(fetch.mock.calls.filter(([url]) => url === `/api/v1/organization-workspace/${id}`)).toHaveLength(1);
  expect(fetch.mock.calls.some(([url]) => url.includes("/profile"))).toBe(false);
  expect(fetch.mock.calls).toHaveLength(2);
});
