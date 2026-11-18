import { expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import MobileNavigation from "../components/layout/MobileNavigation";

it("shows the five approved mobile destinations in their intended order", () => {
  render(<MemoryRouter initialEntries={["/explore"]}><MobileNavigation /></MemoryRouter>);
  const nav = screen.getByRole("navigation", { name: "Mobile navigation" });
  const links = within(nav).getAllByRole("link");
  expect(links.map(link => link.textContent.trim())).toEqual([
    "Explore", "Opportunity", "Post", "Network", "Learning",
  ]);
  expect(links.map(link => link.getAttribute("href"))).toEqual([
    "/explore", "/opportunities", "/explore?compose=post", "/network", "/learning",
  ]);
  expect(within(nav).getByRole("link", { name: "Create Post" })).toBeTruthy();
  expect(within(nav).queryByRole("link", { name: "Notifications" })).toBeNull();
  expect(links[0].getAttribute("aria-current")).toBe("page");
});

it("keeps the Post composer reachable and calls onNavigate once", async () => {
  const onNavigate = vi.fn();
  render(<MemoryRouter initialEntries={["/network"]}><MobileNavigation onNavigate={onNavigate} /></MemoryRouter>);
  const nav = screen.getByRole("navigation", { name: "Mobile navigation" });
  expect(within(nav).getByRole("link", { name: /Network/ }).getAttribute("aria-current")).toBe("page");
  await userEvent.setup().click(within(nav).getByRole("link", { name: "Create Post" }));
  expect(onNavigate).toHaveBeenCalledTimes(1);
});
