import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, it, vi } from "vitest";

import { MemoryRouter } from "react-router-dom";
import { ThemeProvider } from "styled-components";

import AuthProvider from "../auth/AuthProvider";
import AppRoutes from "../routes/AppRoutes";
import { theme } from "../styles/theme";
import { enterEmail, verifyEmail, enterPersonalAndPassword, submitPhoto } from "./signup-helpers";

const account = {
  id: "a1",
  username: "tester",
  person: {
    firstName: "Test",
    lastName: "User",
  },
};

const reply = (status, data) =>
  new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json",
    },
  });

const success = () =>
  reply(200, {
    success: true,
    data: { account },
  });

const anonymous = () =>
  reply(401, {
    success: false,
    message: "Please log in to continue.",
  });

function mount(path, fetchMock) {
  vi.stubGlobal("fetch", fetchMock);

  render(
    <ThemeProvider theme={theme}>
      <MemoryRouter initialEntries={[path]}>
        <AuthProvider>
          <AppRoutes />
        </AuthProvider>
      </MemoryRouter>
    </ThemeProvider>
  );
}

it("returns to a protected page after login and includes the session cookie", async () => {
  const fetchMock = vi.fn(async (url) =>
    url.endsWith("/me") ? anonymous() : success()
  );

  mount("/network", fetchMock);

  const user = userEvent.setup();

  await screen.findByRole("heading", {
    name: "Log in to BrightWay",
  });

  await user.type(
    screen.getByLabelText("Username or email"),
    " TESTER "
  );

  await user.type(
    screen.getByLabelText("Password"),
    " keep my spaces "
  );

  await user.click(
    screen.getByRole("button", { name: "Log in" })
  );

  await screen.findByRole("heading", {
    name: "Network",
  });

  const [, options] = fetchMock.mock.calls.find(
    ([url]) => url.endsWith("/login")
  );

  expect(options.credentials).toBe("include");

  expect(JSON.parse(options.body)).toEqual({
    identifier: "tester",
    password: " keep my spaces ",
  });
});

it("restores an existing session and leaves protected pages after logout", async () => {
  mount(
    "/explore",
    vi.fn(async (url) =>
      url.endsWith("/logout")
        ? reply(200, { success: true })
        : success()
    )
  );

  await screen.findByRole("heading", {
    name: "Explore",
  });

  await userEvent.setup().click(
    screen.getByRole("button", { name: "Open account menu" })
  );

  expect(screen.getByText("@tester")).toBeTruthy();

  await userEvent.setup().click(
    screen.getByRole("button", { name: "Log out" })
  );

  await screen.findByRole("heading", {
    name: "Log in to BrightWay",
  });
});

it("verifies email before registering without sending password confirmation or blank middle name, then asks for login", async () => {
  const fetchMock = vi.fn(async (url) =>
    url.endsWith("/me")
      ? anonymous()
      : reply(201, {
          success: true,
          data: { account, photoAssetId: "11111111-1111-4111-8111-111111111111" },
        })
  );

  mount("/register", fetchMock);

  const user = userEvent.setup();

  await enterEmail(user);
  expect(screen.queryByLabelText("First name")).toBeNull();
  expect(fetchMock.mock.calls.some(([url]) => url.endsWith("/signup-drafts/photo"))).toBe(false);
  await verifyEmail(user);
  expect(fetchMock.mock.calls.some(([url]) => url.endsWith("/register"))).toBe(false);
  await enterPersonalAndPassword(user);
  await submitPhoto(user);
  await screen.findByRole("heading", { name: "Log in to BrightWay" });
  const verifyIndex = fetchMock.mock.calls.findIndex(([url]) => url.endsWith("/signup-email/verify"));
  const registerIndex = fetchMock.mock.calls.findIndex(([url]) => url.endsWith("/register"));
  expect(verifyIndex).toBeLessThan(registerIndex);
  expect(JSON.parse(fetchMock.mock.calls[verifyIndex][1].body)).toEqual({ email: "tester@example.com", code: "123456" });

  expect(screen.getByRole("status").textContent)
    .toContain("Your account is ready");

  const body = JSON.parse(
    fetchMock.mock.calls.find(
      ([url]) => url.endsWith("/register")
    )[1].body
  );

  expect(body.photoAssetId).toBe("11111111-1111-4111-8111-111111111111");
  const photoRequest = fetchMock.mock.calls.find(([url]) => url.endsWith("/signup-drafts/photo"))[1];
  expect(photoRequest.credentials).toBe("include");
  expect(photoRequest.body).toBeInstanceOf(File);
  expect(photoRequest.headers["Content-Type"]).toBe("image/png");
  expect(body.username).toBe("tester");
  expect(body.email).toBe("tester@example.com");
  expect(body.gender).toBe("MALE");
  expect(body.birthDate).toBe("2000-06-15");
  expect(body.countryCode).toBe("LR");
  expect(body).not.toHaveProperty("confirmPassword");
  expect(body).not.toHaveProperty("middleName");
});

it("shows a failed login without granting access", async () => {
  mount(
    "/login",
    vi.fn(async (url) =>
      url.endsWith("/me")
        ? anonymous()
        : reply(401, {
            success: false,
            message: "Invalid username/email or password.",
          })
    )
  );

  const user = userEvent.setup();

  await screen.findByRole("heading", {
    name: "Log in to BrightWay",
  });

  await user.type(
    screen.getByLabelText("Username or email"),
    "tester"
  );

  await user.type(
    screen.getByLabelText("Password"),
    "incorrect password"
  );

  await user.click(
    screen.getByRole("button", { name: "Log in" })
  );

  expect((await screen.findByRole("alert")).textContent)
    .toContain("Invalid username/email or password.");

  expect(
    screen.queryByRole("heading", { name: "Explore" })
  ).toBeNull();
});

it("keeps signup details and stops account creation when photo storage fails", async () => {
  const fetchMock = vi.fn(async (url) => url.endsWith("/me") ? anonymous()
    : url.endsWith("/signup-drafts/photo")
      ? reply(503, { success: false, message: "Photo storage is temporarily unavailable." })
      : reply(200, { success: true, data: { verified: true, retryAfterSeconds: 60 } }));
  mount("/register", fetchMock);
  const user = userEvent.setup();
  await enterEmail(user);
  await verifyEmail(user);
  await enterPersonalAndPassword(user);
  await submitPhoto(user);
  expect((await screen.findByRole("alert")).textContent).toContain("Photo storage is temporarily unavailable");
  expect(screen.getByText("Selected photo: photo.png")).toBeTruthy();
  await user.click(screen.getByRole("button", { name: "Back", exact: true }));
  expect(screen.getByLabelText("Password", { exact: true }).value).toBe("A long personal passphrase!");
  await user.click(screen.getByRole("button", { name: "Back", exact: true }));
  expect(screen.getByLabelText("Country of residence").value).toBe("LR");
  await user.click(screen.getByRole("button", { name: "Back", exact: true }));
  expect(screen.getByLabelText("First name").value).toBe("Test");
  expect(fetchMock.mock.calls.some(([url]) => url.endsWith("/register"))).toBe(false);
});
