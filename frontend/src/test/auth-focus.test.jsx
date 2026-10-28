import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
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

const anonymous = () =>
  reply(401, {
    success: false,
    message: "Please log in to continue.",
  });

const authenticated = () =>
  reply(200, {
    success: true,
    data: { account },
  });

function mount(path, fetchMock) {
  // Header profile loading is independent of the auth-session response queue.
  vi.stubGlobal("fetch", (url, options) =>
    url.endsWith("/work/access") ? reply(200, { success: true, data: { hasWork: false } }) : url.endsWith("/profile/me")
      ? reply(200, {
          success: true,
          data: {
            profile: {
              id: null,
              version: 0,
              photo: null,
              location: {},
              skills: [],
              interests: [],
            },
          },
        })
      : fetchMock(url, options),
  );

  render(
    <ThemeProvider theme={theme}>
      <MemoryRouter initialEntries={[path]}>
        <AuthProvider>
          <AppRoutes />
        </AuthProvider>
      </MemoryRouter>
    </ThemeProvider>,
  );
}

it("keeps entered login details while a focus check is pending or fails", async () => {
  let rejectFocus;

  const fetchMock = vi
    .fn()
    .mockResolvedValueOnce(anonymous())
    .mockImplementationOnce(
      () =>
        new Promise((resolve, reject) => {
          void resolve;
          rejectFocus = reject;
        }),
    )
    .mockResolvedValue(anonymous());

  mount("/login", fetchMock);

  const user = userEvent.setup();

  await screen.findByRole("heading", {
    name: "Log in to BrightWay",
  });

  await user.type(screen.getByLabelText("Username or email"), "tester");

  await user.type(screen.getByLabelText("Password"), "my unsent passphrase");

  fireEvent.focus(window);
  fireEvent.focus(window);

  expect(screen.getByLabelText("Username or email").value).toBe("tester");

  expect(screen.getByLabelText("Password").value).toBe("my unsent passphrase");

  expect(fetchMock).toHaveBeenCalledTimes(2);

  await act(async () => {
    rejectFocus(new TypeError("offline"));
  });

  expect(screen.getByLabelText("Password").value).toBe("my unsent passphrase");

  await act(async () => {
    fireEvent.focus(window);
  });

  expect(screen.getByLabelText("Password").value).toBe("my unsent passphrase");
});

it("keeps the account visible during background checks but rejects a revoked session", async () => {
  let resolveFocus;

  const fetchMock = vi
    .fn()
    .mockResolvedValueOnce(authenticated())
    .mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveFocus = resolve;
        }),
    )
    .mockResolvedValue(anonymous());

  mount("/explore", fetchMock);

  await screen.findByRole("heading", {
    name: "Explore",
  });

  fireEvent.focus(window);

  expect(screen.getByRole("heading", { name: "Explore" })).toBeTruthy();

  expect(screen.getByRole("button", { name: "Open account menu" })).toBeTruthy();

  await act(async () => {
    resolveFocus(authenticated());
  });

  expect(screen.getByRole("button", { name: "Open account menu" })).toBeTruthy();

  fireEvent.focus(window);

  await screen.findByRole("heading", {
    name: "Log in to BrightWay",
  });
});

it("does not duplicate an initial session check on focus", async () => {
  let resolve;

  const fetchMock = vi.fn(
    () =>
      new Promise((done) => {
        resolve = done;
      }),
  );

  mount("/login", fetchMock);

  fireEvent.focus(window);

  expect(fetchMock).toHaveBeenCalledTimes(1);

  await act(async () => {
    resolve(anonymous());
  });

  await waitFor(() => {
    expect(
      screen.getByRole("heading", {
        name: "Log in to BrightWay",
      }),
    ).toBeTruthy();
  });
});