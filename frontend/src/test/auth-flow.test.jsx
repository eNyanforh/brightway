import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, it, vi } from "vitest";

import { MemoryRouter } from "react-router-dom";
import { ThemeProvider } from "styled-components";

import AuthProvider from "../auth/AuthProvider";
import AppRoutes from "../routes/AppRoutes";
import { theme } from "../styles/theme";

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

  expect(screen.getByText("@tester")).toBeTruthy();

  await userEvent.setup().click(
    screen.getByRole("button", { name: "Log out" })
  );

  await screen.findByRole("heading", {
    name: "Log in to BrightWay",
  });
});

it("registers without sending confirmation or blank middle name, then asks for login", async () => {
  const fetchMock = vi.fn(async (url) =>
    url.endsWith("/me")
      ? anonymous()
      : reply(201, {
          success: true,
          data: { account },
        })
  );

  mount("/register", fetchMock);

  const user = userEvent.setup();

  await screen.findByRole("heading", {
    name: "Create your BrightWay account",
  });

  const values = [
    ["First name", "Test"],
    ["Last name", "User"],
    ["Username", "TESTER"],
    ["Email", "Tester@Example.com"],
    ["Password", "A long personal passphrase!"],
    ["Confirm password", "A long personal passphrase!"],
  ];

  for (const [label, value] of values) {
    await user.type(
      screen.getByLabelText(label, { exact: true }),
      value
    );
  }

  await user.click(
    screen.getByRole("button", {
      name: "Create account",
    })
  );

  await screen.findByRole("heading", {
    name: "Log in to BrightWay",
  });

  expect(screen.getByRole("status").textContent)
    .toContain("Your account is ready");

  const body = JSON.parse(
    fetchMock.mock.calls.find(
      ([url]) => url.endsWith("/register")
    )[1].body
  );

  expect(body.username).toBe("tester");
  expect(body.email).toBe("tester@example.com");
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