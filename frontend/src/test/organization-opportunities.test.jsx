import { render, screen, within, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { expect, it, vi } from "vitest";
import OrganizationOpportunities from "../components/opportunities/OrganizationOpportunities";

const organization = { id: "22222222-2222-4222-8222-222222222222", name: "Research Institute" };
const items = [
  { id: "10000000-0000-4000-8000-000000000001", title: "Community research assistant", type: "JOB", status: "PUBLISHED", version: 3, description: "Support community research.", location: "Monrovia", workMode: "IN_PERSON", deadline: "2099-12-01T12:00:00Z", createdAt: "2026-11-14T10:00:00Z" },
  { id: "10000000-0000-4000-8000-000000000002", title: "Education innovation challenge", type: "CHALLENGE", status: "DRAFT", version: 1, description: "Build a learning tool.", location: "Liberia", workMode: "REMOTE", deadline: "2099-12-11T12:00:00Z", createdAt: "2026-11-14T11:00:00Z" },
  { id: "10000000-0000-4000-8000-000000000003", title: "Student scholarship", type: "SCHOLARSHIP", status: "PAUSED", version: 5, description: "Support student achievement.", location: "Worldwide", workMode: "HYBRID", deadline: "2099-12-03T12:00:00Z", createdAt: "2026-11-14T09:00:00Z" },
];
const response = (data, status = 200) => Promise.resolve(new Response(JSON.stringify(status < 400
  ? { success: true, data } : { success: false, message: data }), {
  status, headers: { "Content-Type": "application/json" },
}));
const listPath = `/api/v1/organization-workspace/${organization.id}/opportunities`;
function mount(props = {}) {
  render(<MemoryRouter><OrganizationOpportunities organization={organization} {...props} /></MemoryRouter>);
  return userEvent.setup();
}

it("shows loaded counts, searchable listings, type and status filters", async () => {
  const fetch = vi.fn(() => response({ items, nextCursor: null }));
  vi.stubGlobal("fetch", fetch);
  const user = mount();
  await screen.findByRole("article", { name: "Community research assistant" });
  const stats = screen.getByLabelText("Loaded opportunity summary");
  expect(within(stats).getByText("3")).toBeTruthy();
  expect(within(stats).getByText("Listings loaded")).toBeTruthy();
  expect(screen.getAllByRole("article")).toHaveLength(3);
  expect(screen.getByRole("link", { name: "Research Institute" }).getAttribute("href"))
    .toBe("/organization-workspace/" + organization.id);

  await user.click(screen.getByRole("button", { name: /Drafts/ }));
  expect(screen.getAllByRole("article")).toHaveLength(1);
  expect(screen.getByRole("article", { name: "Education innovation challenge" })).toBeTruthy();
  expect(screen.getByRole("button", { name: /Drafts/ }).getAttribute("aria-pressed")).toBe("true");
  await user.click(screen.getByRole("button", { name: /^All/ }));
  await user.selectOptions(screen.getByRole("combobox", { name: "Filter opportunity type" }), "SCHOLARSHIP");
  expect(screen.getAllByRole("article")).toHaveLength(1);
  expect(screen.getByRole("article", { name: "Student scholarship" })).toBeTruthy();
  await user.selectOptions(screen.getByRole("combobox", { name: "Filter opportunity type" }), "ALL");
  await user.type(screen.getByRole("searchbox", { name: "Search opportunities" }), "innovation");
  expect(screen.getAllByRole("article")).toHaveLength(1);
  expect(screen.getByRole("article", { name: "Education innovation challenge" })).toBeTruthy();
  await user.clear(screen.getByRole("searchbox", { name: "Search opportunities" }));
  expect(screen.getAllByRole("article")).toHaveLength(3);
  expect(fetch).toHaveBeenCalledTimes(1);
  expect(fetch.mock.calls[0][0]).toContain(listPath);
});

it("publishes a draft through the existing version-safe API and updates the counts", async () => {
  const writes = [];
  vi.stubGlobal("confirm", vi.fn(() => true));
  const fetch = vi.fn((url, options) => {
    if (url.endsWith("/status")) {
      const body = JSON.parse(options.body);
      writes.push(body);
      return response({ ...items[1], status: body.status, version: items[1].version + 1 });
    }
    return response({ items, nextCursor: null });
  });
  vi.stubGlobal("fetch", fetch);
  const user = mount();
  const draft = await screen.findByRole("article", { name: "Education innovation challenge" });
  await user.click(within(draft).getByRole("button", { name: "Publish" }));
  await waitFor(() => expect(writes).toEqual([{ expectedVersion: 1, status: "PUBLISHED" }]));
  await waitFor(() => expect(within(screen.getByRole("article", { name: "Education innovation challenge" }))
    .getByText("Published")).toBeTruthy());
  const stats = screen.getByLabelText("Loaded opportunity summary");
  expect(within(stats).getByText("Drafts").previousElementSibling.textContent).toBe("0");
  expect(within(stats).getByText("Published").previousElementSibling.textContent).toBe("2");
});

it("keeps destructive actions in an accessible menu and blocks mutations without access", async () => {
  const fetch = vi.fn(() => response({ items, nextCursor: null }));
  vi.stubGlobal("fetch", fetch);
  const user = mount({ disabled: true });
  const published = await screen.findByRole("article", { name: "Community research assistant" });
  expect(within(published).getByRole("button", { name: "Pause" }).disabled).toBe(true);
  expect(screen.getByRole("button", { name: "+ Create opportunity" }).disabled).toBe(true);
  expect(within(published).queryByRole("button", { name: "Cancel" })).toBeNull();
  await user.click(within(published).getByLabelText("More actions for Community research assistant"));
  expect(within(published).getByRole("button", { name: "Cancel" }).disabled).toBe(true);
  expect(within(published).getByRole("button", { name: "Close" }).disabled).toBe(true);
  expect(fetch).toHaveBeenCalledTimes(1);
});

it("does not report unloaded pages as global totals", async () => {
  vi.stubGlobal("fetch", vi.fn(() => response({ items: [items[0]], nextCursor: items[0].id })));
  mount();
  await screen.findByRole("article", { name: "Community research assistant" });
  expect(screen.getByText("Counts reflect listings loaded so far.")).toBeTruthy();
  expect(screen.getByRole("button", { name: "Load more" })).toBeTruthy();
  expect(screen.getByText("Showing 1 of 1 loaded listings")).toBeTruthy();
});
