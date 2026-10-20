import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, it, vi } from "vitest";
import { MemoryRouter } from "react-router-dom";
import { ThemeProvider } from "styled-components";
import AuthProvider from "../auth/AuthProvider";
import AppRoutes from "../routes/AppRoutes";
import { theme } from "../styles/theme";

const reply = (status, data) => new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json" } });
function mount(path = "/", account = null) {
  const fetchMock = vi.fn(async (url) => url.endsWith("/auth/me")
    ? reply(account ? 200 : 401, account ? { success: true, data: { account } } : { success: false })
    : reply(401, { success: false, message: "Invalid username/email or password." }));
  vi.stubGlobal("fetch", fetchMock);
  render(<ThemeProvider theme={theme}><MemoryRouter initialEntries={[path]}><AuthProvider><AppRoutes /></AuthProvider></MemoryRouter></ThemeProvider>);
  return fetchMock;
}

it("matches the reference homepage content and connects Join to registration", async () => {
  const fetchMock = mount();
  await screen.findByRole("heading", { name: "The all-in-one ecosystem for learning, connection, career growth, and opportunities." });
  expect(screen.getByText("Welcome to Brightway")).toBeTruthy();
  for (const text of [
    "Learn the skills that matter, gain practical experience, and unlock your potential.",
    "Join a network of learners, mentors, employers, and schools.",
    "Find the best internships, scholarships, and job placements.",
  ]) expect(screen.getByText(text)).toBeTruthy();
  const auth = screen.getByRole("navigation", { name: "Public navigation" });
  expect(within(auth).getByRole("link", { name: "Login", exact: true }).getAttribute("href")).toBe("/login");
  await userEvent.setup().click(within(auth).getByRole("link", { name: "Join for free" }));
  await screen.findByRole("heading", { name: "Create your BrightWay account" });
  expect(fetchMock.mock.calls.some(([, options]) => options.method === "POST")).toBe(false);
});

it("offers signed-in visitors a route back to BrightWay", async () => {
  mount("/", { id: "account", username: "tester", person: { firstName: "Test", lastName: "User" } });
  const auth = screen.getByRole("navigation", { name: "Public navigation" });
  const link = await within(auth).findByRole("link", { name: "Open BrightWay" });
  expect(link.getAttribute("href")).toBe("/explore");
});

it("toggles password visibility without changing its value or the login payload", async () => {
  const fetchMock = mount("/login"); const user = userEvent.setup();
  await screen.findByRole("heading", { name: "Log in to BrightWay" });
  await user.type(screen.getByLabelText("Username or email"), " TESTER ");
  const password = screen.getByLabelText("Password", { exact: true });
  await user.type(password, " Keep my password spaces ");
  expect(password.type).toBe("password");
  await user.click(screen.getByRole("button", { name: "Show password", exact: true }));
  expect(password.type).toBe("text"); expect(password.value).toBe(" Keep my password spaces ");
  await user.click(screen.getByRole("button", { name: "Hide password", exact: true }));
  expect(password.type).toBe("password");
  await user.click(screen.getByRole("button", { name: "Log in", exact: true }));
  await screen.findByRole("alert");
  expect(JSON.parse(fetchMock.mock.calls.find(([url]) => url.endsWith("/login"))[1].body)).toEqual({ identifier: "tester", password: " Keep my password spaces " });
});

it("switches the reference homepage between individual and school audiences", async () => {
  const fetchMock = mount(); const user = userEvent.setup();
  const audience = screen.getByRole("navigation", { name: "Choose your audience" });
  expect(within(audience).getByRole("link", { name: "For Individuals" }).getAttribute("aria-current")).toBe("page");
  await user.click(within(audience).getByRole("link", { name: "For Schools" }));
  await screen.findByRole("heading", { name: "Connect with learners globally, empower their growth, and transform potential into results." });
  expect(within(audience).getByRole("link", { name: "For Schools" }).getAttribute("aria-current")).toBe("page");
  expect(screen.getByText("Build direct, trusted relationships with students and graduates.")).toBeTruthy();
  expect(screen.getByRole("link", { name: "Build Online Campus" }).getAttribute("href")).toBe("/partners#partner-next");
  await user.click(within(audience).getByRole("link", { name: "For Individuals" }));
  await screen.findByRole("heading", { name: /The all-in-one ecosystem/ });
  expect(fetchMock.mock.calls.some(([, options]) => options.method === "POST")).toBe(false);
});

it("loads the shared school URL directly", async () => {
  mount("/?audience=schools");
  await screen.findByRole("heading", { name: /Connect with learners globally/ });
  const audience = screen.getByRole("navigation", { name: "Choose your audience" });
  expect(within(audience).getByRole("link", { name: "For Schools" }).getAttribute("aria-current")).toBe("page");
});

it("keeps the Companies navigation connected to the public organization page", async () => {
  const fetchMock = mount();
  const audience = screen.getByRole("navigation", { name: "Choose your audience" });
  await userEvent.setup().click(within(audience).getByRole("link", { name: "For Companies" }));
  await screen.findByRole("heading", { name: /Shared purpose.*Brighter futures/ });
  expect(screen.getByText(/partnership applications and review are not yet open/)).toBeTruthy();
  expect(fetchMock.mock.calls.some(([, options]) => options.method === "POST")).toBe(false);
});

it("opens the mobile menu, follows a link and closes the menu", async () => {
  mount(); const user = userEvent.setup();
  const menu = screen.getByRole("button", { name: "Open navigation menu" });
  expect(menu.getAttribute("aria-expanded")).toBe("false");
  await user.click(menu);
  expect(menu.getAttribute("aria-expanded")).toBe("true");
  const nav = screen.getByRole("navigation", { name: "Mobile public navigation" });
  await user.click(within(nav).getByRole("link", { name: "For Schools" }));
  expect(menu.getAttribute("aria-expanded")).toBe("false");
  await screen.findByRole("heading", { name: /Connect with learners globally/ });
});