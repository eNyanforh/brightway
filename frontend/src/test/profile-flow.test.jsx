import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";

import userEvent from "@testing-library/user-event";
import { beforeEach, expect, it, vi } from "vitest";
import { MemoryRouter } from "react-router-dom";
import { ThemeProvider } from "styled-components";

import AuthProvider from "../auth/AuthProvider";
import AppRoutes from "../routes/AppRoutes";
import { theme } from "../styles/theme";

beforeEach(() => {
  HTMLDialogElement.prototype.showModal = function () {
    this.open = true;
  };

  HTMLDialogElement.prototype.close = function () {
    this.open = false;
  };
});

const account = {
  id: "a1",
  username: "tester",
  person: {
    firstName: "Test",
    lastName: "User",
  },
};

const original = {
  id: "p1",
  version: 1,
  photo: { id: "photo-1" },
  headline: "Student",
  bio: null,
  location: {
    countryCode: "LR",
    region: "Montserrado",
    locality: "Monrovia",
  },
  careerField: { mode: "EXPLORING" },
  careerGoals: null,
  skills: ["Communication"],
  interests: ["Technology"],
};

const reply = (status, data) =>
  new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json",
    },
  });

const ok = (data) =>
  reply(200, {
    success: true,
    data,
  });

function mount(
  handler = () => ok({ profile: original }),
  path = "/profile",
  guest = false,
) {
  let signedIn = !guest;

  const fetchMock = vi.fn(async (url, options) => {
    if (url.endsWith("/auth/me")) {
      return signedIn
        ? ok({ account })
        : reply(401, { success: false });
    }

    if (url.endsWith("/auth/login")) {
      signedIn = true;
      return ok({ account });
    }

    if (url.endsWith("/auth/logout")) {
      signedIn = false;
      return ok({});
    }

    return handler(url, options);
  });

  vi.stubGlobal("fetch", fetchMock);

  render(
    <ThemeProvider theme={theme}>
      <MemoryRouter initialEntries={[path]}>
        <AuthProvider>
          <AppRoutes />
        </AuthProvider>
      </MemoryRouter>
    </ThemeProvider>,
  );

  return fetchMock;
}

async function openProfile() {
  const user = userEvent.setup();

  await user.click(
    screen.getByRole("button", {
      name: "Open account menu",
    }),
  );

  await user.click(
    screen.getByRole("button", {
      name: "View profile",
      exact: true,
    }),
  );
}

const ready = () =>
  screen.findByRole("heading", {
    name: "Test User",
    level: 1,
  });

async function edit(name = "Edit introduction") {
  await userEvent.setup().click(
    screen.getByRole("button", {
      name,
      exact: true,
    }),
  );

  return screen.findByRole("dialog");
}

const save = () =>
  userEvent.setup().click(
    screen.getByRole("button", {
      name: "Save changes",
    }),
  );

const set = (name, value) =>
  fireEvent.change(
    screen.getByLabelText(name, { exact: true }),
    { target: { value } },
  );

it("shows the saved profile first and uses the top picture as the profile navigation", async () => {
  const fetchMock = mount();
  await ready();

  expect(screen.queryByLabelText("Headline")).toBeNull();

  expect(
    screen.queryByRole("link", {
      name: "My profile",
      exact: true,
    }),
  ).toBeNull();

  const trigger = screen.getByRole("button", {
    name: "Open account menu",
  });

  expect(
    trigger.getAttribute("aria-expanded"),
  ).toBe("false");

  expect(
    trigger.querySelector("img").getAttribute("src"),
  ).toBe("/api/v1/photos/photo-1");

  expect(
    screen
      .getByRole("img", {
        name: "Test User's profile picture",
      })
      .getAttribute("src"),
  ).toBe("/api/v1/photos/photo-1");

  expect(
    screen.queryByText(
      /SUBMITTED|awaiting approval|pending review/i,
    ),
  ).toBeNull();

  const request = fetchMock.mock.calls.find(([url]) =>
    url.endsWith("/profile/me"),
  )[1];

  expect(request.credentials).toBe("include");
  expect(request.cache).toBe("no-store");
});

it("loads the header photo once and opens the profile from another app page", async () => {
  const fetchMock = mount(undefined, "/network");

  await screen.findByRole("heading", {
    name: "Network",
  });

  await waitFor(() =>
    expect(
      screen
        .getByRole("button", {
          name: "Open account menu",
        })
        .querySelector("img"),
    ).toBeTruthy(),
  );

  await openProfile();
  await ready();

  expect(
    fetchMock.mock.calls.filter(([url]) =>
      url.endsWith("/profile/me"),
    ),
  ).toHaveLength(1);
});

it("saves only the introduction changes and accepts normalized server values", async () => {
  const fetchMock = mount((url, options) =>
    options.method === "PATCH"
      ? ok({
          profile: {
            ...original,
            version: 2,
            headline: "Developer",
          },
        })
      : ok({ profile: original }),
  );

  await ready();
  await edit();

  set("Headline", " Developer ");

  await save();
  await screen.findByText("Profile saved.");

  expect(screen.queryByRole("dialog")).toBeNull();

  const body = JSON.parse(
    fetchMock.mock.calls.find(
      ([, options]) => options.method === "PATCH",
    )[1].body,
  );

  expect(body).toEqual({
    expectedVersion: 1,
    changes: {
      headline: "Developer",
    },
  });

  expect(
    screen.getByText("Developer"),
  ).toBeTruthy();
});

it("keeps unsaved edits across editor close and app navigation without refetching", async () => {
  const fetchMock = mount();

  await ready();
  await edit();

  set("Headline", "My unsaved story");

  const user = userEvent.setup();

  await user.click(
    screen.getByRole("button", {
      name: "Close editor and keep edits",
    }),
  );

  await user.click(
    screen.getByRole("link", {
      name: "BrightWay, go to Explore",
    }),
  );

  await screen.findByRole("heading", {
    name: "Explore",
  });

  await openProfile();
  await ready();

  await user.click(
    screen.getByRole("button", {
      name: "Resume editing",
    }),
  );

  expect(
    screen.getByLabelText("Headline").value,
  ).toBe("My unsaved story");

  expect(
    fetchMock.mock.calls.filter(([url]) =>
      url.endsWith("/profile/me"),
    ),
  ).toHaveLength(1);
});

it("cancel discards that section and does not persist anything", async () => {
  const fetchMock = mount();

  await ready();
  await edit();

  set("Headline", "Discard this");

  await userEvent.setup().click(
    screen.getByRole("button", {
      name: "Cancel",
    }),
  );

  await edit();

  expect(
    screen.getByLabelText("Headline").value,
  ).toBe("Student");

  expect(
    fetchMock.mock.calls.some(
      ([, options]) => options.method === "PATCH",
    ),
  ).toBe(false);
});

it("retains editable text when the save request fails", async () => {
  mount((url, options) => {
    if (options.method === "PATCH") {
      throw new TypeError("Disconnected");
    }

    return ok({ profile: original });
  });

  await ready();
  await edit("Edit about");

  set("About you", "Keep my story");

  await save();

  expect(
    (await screen.findByRole("alert")).textContent,
  ).toContain("Your edits are still here");

  expect(
    screen.getByLabelText("About you").value,
  ).toBe("Keep my story");
});

it("preserves stale edits and requires explicit discard before reloading", async () => {
  let reads = 0;

  const fetchMock = mount((url, options) =>
    options.method === "PATCH"
      ? reply(409, {
          success: false,
          message:
            "Your profile changed. Reload it before saving again.",
        })
      : ok({
          profile:
            ++reads === 1
              ? original
              : {
                  ...original,
                  version: 2,
                  headline: "Other tab won",
                },
        }),
  );

  await ready();
  await edit();

  set("Headline", "Local edit");

  await save();
  await screen.findByRole("alert");

  expect(
    screen.getByLabelText("Headline").value,
  ).toBe("Local edit");

  expect(
    screen.getByRole("button", {
      name: "Save changes",
    }).disabled,
  ).toBe(true);

  vi.spyOn(window, "confirm").mockReturnValue(false);

  await userEvent.setup().click(
    screen.getByRole("button", {
      name: "Discard edits and load latest",
    }),
  );

  expect(reads).toBe(1);

  window.confirm.mockReturnValue(true);

  await userEvent.setup().click(
    screen.getByRole("button", {
      name: "Discard edits and load latest",
    }),
  );

  await screen.findAllByText("Other tab won");

  expect(screen.queryByRole("dialog")).toBeNull();

  expect(
    fetchMock.mock.calls.filter(
      ([, options]) => options.method === "PATCH",
    ),
  ).toHaveLength(1);
});

it("updates both pictures after replacement and uses its version in the next save", async () => {
  const fetchMock = mount((url, options) =>
    url.endsWith("/photo")
      ? reply(201, {
          success: true,
          data: {
            photoAssetId: "photo-2",
          },
        })
      : options.method === "PATCH"
        ? ok({
            profile: {
              ...original,
              version: 3,
              photo: {
                id: "photo-2",
              },
              headline: "New story",
            },
          })
        : ok({ profile: original }),
  );

  await ready();
  await edit("Change profile picture");

  const user = userEvent.setup();

  const file = new File(["image"], "me.png", {
    type: "image/png",
  });

  await user.upload(
    screen.getByLabelText("Choose profile picture"),
    file,
  );

  await user.click(
    screen.getByRole("button", {
      name: "Upload picture",
    }),
  );

  await screen.findByText("Profile picture updated.");

  expect(
    screen
      .getByRole("button", {
        name: "Open account menu",
      })
      .querySelector("img")
      .getAttribute("src"),
  ).toBe("/api/v1/photos/photo-2");

  expect(
    screen
      .getByRole("img", {
        name: "Test User's profile picture",
      })
      .getAttribute("src"),
  ).toBe("/api/v1/photos/photo-2");

  const upload = fetchMock.mock.calls.find(([url]) =>
    url.endsWith("/photo"),
  )[1];

  expect(upload.headers).toEqual({
    "Content-Type": "image/png",
    "X-Profile-Version": "1",
  });

  expect(upload.credentials).toBe("include");
  expect(upload.body).toBe(file);

  await edit();

  set("Headline", "New story");

  await save();
  await screen.findByText("Profile saved.");

  expect(
    JSON.parse(
      fetchMock.mock.calls.find(
        ([, options]) => options.method === "PATCH",
      )[1].body,
    ).expectedVersion,
  ).toBe(2);
});

it("keeps the old picture and selected file when photo storage fails", async () => {
  mount((url) =>
    url.endsWith("/photo")
      ? reply(503, {
          success: false,
          message:
            "Photo storage is temporarily unavailable.",
        })
      : ok({ profile: original }),
  );

  await ready();
  await edit("Change profile picture");

  const user = userEvent.setup();

  await user.upload(
    screen.getByLabelText("Choose profile picture"),
    new File(["image"], "me.png", {
      type: "image/png",
    }),
  );

  await user.click(
    screen.getByRole("button", {
      name: "Upload picture",
    }),
  );

  expect(
    (await screen.findByRole("alert")).textContent,
  ).toContain(
    "Photo storage is temporarily unavailable",
  );

  expect(
    screen.getByText("Selected: me.png"),
  ).toBeTruthy();

  expect(
    screen
      .getByRole("button", {
        name: "Open account menu",
      })
      .querySelector("img")
      .getAttribute("src"),
  ).toBe("/api/v1/photos/photo-1");
});

it("validates duplicates and sends explicit clears without updating other sections", async () => {
  const fetchMock = mount((url, options) =>
    options.method === "PATCH"
      ? ok({
          profile: {
            ...original,
            version: 2,
            skills: [],
          },
        })
      : ok({ profile: original }),
  );

  await ready();
  await edit("Edit skills");

  set("Skills", "Writing\nwriting");

  await save();

  expect(
    (await screen.findByRole("alert")).textContent,
  ).toContain("Remove duplicate entries");

  expect(
    fetchMock.mock.calls.some(
      ([, options]) => options.method === "PATCH",
    ),
  ).toBe(false);

  set("Skills", "");

  await save();
  await screen.findByText("Profile saved.");

  expect(
    JSON.parse(
      fetchMock.mock.calls.find(
        ([, options]) => options.method === "PATCH",
      )[1].body,
    ).changes,
  ).toEqual({
    skills: [],
  });
});

it("saves one section without losing unsaved edits in another section", async () => {
  const fetchMock = mount((url, options) =>
    options.method === "PATCH"
      ? ok({
          profile: {
            ...original,
            version: 2,
            bio: "Saved about",
          },
        })
      : ok({ profile: original }),
  );

  await ready();
  await edit();

  set("Headline", "Unsaved introduction");

  await userEvent.setup().click(
    screen.getByRole("button", {
      name: "Close editor and keep edits",
    }),
  );

  await edit("Edit about");

  set("About you", "Saved about");

  await save();
  await screen.findByText("Profile saved.");

  expect(
    JSON.parse(
      fetchMock.mock.calls.find(
        ([, options]) => options.method === "PATCH",
      )[1].body,
    ).changes,
  ).toEqual({
    bio: "Saved about",
  });

  await edit();

  expect(
    screen.getByLabelText("Headline").value,
  ).toBe("Unsaved introduction");
});

it("supports virtual empty drafts with version zero", async () => {
  const empty = {
    id: null,
    version: 0,
    photo: null,
    location: {
      countryCode: null,
      region: null,
      locality: null,
    },
    headline: null,
    bio: null,
    careerField: null,
    careerGoals: null,
    skills: [],
    interests: [],
  };

  const fetchMock = mount((url, options) =>
    options.method === "PATCH"
      ? ok({
          profile: {
            ...empty,
            id: "new-profile",
            version: 1,
            headline: "Starting out",
          },
        })
      : ok({ profile: empty }),
  );

  await ready();
  await edit();

  set("Headline", "Starting out");

  await save();
  await screen.findByText("Profile saved.");

  expect(
    JSON.parse(
      fetchMock.mock.calls.find(
        ([, options]) => options.method === "PATCH",
      )[1].body,
    ),
  ).toEqual({
    expectedVersion: 0,
    changes: {
      headline: "Starting out",
    },
  });
});

it("warns before closing the document when drafts exist on another app page", async () => {
  mount();

  await ready();
  await edit();

  set("Headline", "Unsaved");

  const user = userEvent.setup();

  await user.click(
    screen.getByRole("button", {
      name: "Close editor and keep edits",
    }),
  );

  await user.click(
    screen.getByRole("link", {
      name: "BrightWay, go to Explore",
    }),
  );

  await screen.findByRole("heading", {
    name: "Explore",
  });

  const event = new Event("beforeunload", {
    cancelable: true,
  });

  window.dispatchEvent(event);

  expect(event.defaultPrevented).toBe(true);
});

it("confirms sign-out when drafts exist and clears them on successful sign-out", async () => {
  mount();

  await ready();
  await edit();

  set("Headline", "Unsaved story");

  const user = userEvent.setup();

  await user.click(
    screen.getByRole("button", {
      name: "Close editor and keep edits",
    }),
  );

  await user.click(
    screen.getByRole("button", {
      name: "Open account menu",
    }),
  );

  vi.spyOn(window, "confirm").mockReturnValue(false);

  await user.click(
    screen.getByRole("button", {
      name: "Log out",
    }),
  );

  await ready();

  window.confirm.mockReturnValue(true);

  await user.click(
    screen.getByRole("button", {
      name: "Log out",
    }),
  );

  await screen.findByRole("heading", {
    name: "Log in to BrightWay",
  });

  expect(
    screen.queryByText("You have unsaved profile edits."),
  ).toBeNull();
});

it("retries an initial profile failure", async () => {
  let reads = 0;

  mount(() =>
    ++reads === 1
      ? reply(503, {
          success: false,
          message: "Please retry later.",
        })
      : ok({ profile: original }),
  );

  expect(
    (await screen.findByRole("alert")).textContent,
  ).toBe("Please retry later.");

  await userEvent.setup().click(
    screen.getByRole("button", {
      name: "Try again",
    }),
  );

  await ready();
});

it("returns to the profile after logging into a protected profile URL", async () => {
  mount(undefined, "/profile", true);

  await screen.findByRole("heading", {
    name: "Log in to BrightWay",
  });

  const user = userEvent.setup();

  await user.type(
    screen.getByLabelText("Username or email"),
    "tester",
  );

  await user.type(
    screen.getByLabelText("Password"),
    "a test password",
  );

  await user.click(
    screen.getByRole("button", {
      name: "Log in",
    }),
  );

  await ready();

  expect(
    screen.queryByRole("heading", {
      name: "Explore",
    }),
  ).toBeNull();
});

it("handles Escape by keeping the draft rather than silently discarding it", async () => {
  mount();

  await ready();

  const dialog = await edit();

  set("Headline", "Keep after Escape");

  fireEvent(
    dialog,
    new Event("cancel", {
      cancelable: true,
    }),
  );

  await waitFor(() =>
    expect(
      screen.queryByRole("dialog"),
    ).toBeNull(),
  );

  await edit();

  expect(
    screen.getByLabelText("Headline").value,
  ).toBe("Keep after Escape");
});

it("retains an unsaved introduction through photo replacement and rebases its next save", async () => {
  const fetchMock = mount((url, options) =>
    url.endsWith("/photo")
      ? reply(201, {
          success: true,
          data: {
            photoAssetId: "photo-2",
          },
        })
      : options.method === "PATCH"
        ? ok({
            profile: {
              ...original,
              version: 3,
              photo: {
                id: "photo-2",
              },
              headline: "Still here",
            },
          })
        : ok({ profile: original }),
  );

  await ready();
  await edit();

  set("Headline", "Still here");

  const user = userEvent.setup();

  await user.click(
    screen.getByRole("button", {
      name: "Close editor and keep edits",
    }),
  );

  await edit("Change profile picture");

  await user.upload(
    screen.getByLabelText("Choose profile picture"),
    new File(["image"], "me.png", {
      type: "image/png",
    }),
  );

  await user.click(
    screen.getByRole("button", {
      name: "Upload picture",
    }),
  );

  await screen.findByText("Profile picture updated.");

  await user.click(
    screen.getByRole("button", {
      name: "Resume editing",
    }),
  );

  expect(
    screen.getByLabelText("Headline").value,
  ).toBe("Still here");

  await save();
  await screen.findByText("Profile saved.");

  expect(
    JSON.parse(
      fetchMock.mock.calls.find(
        ([, options]) => options.method === "PATCH",
      )[1].body,
    ),
  ).toEqual({
    expectedVersion: 2,
    changes: {
      headline: "Still here",
    },
  });
});

it("does not submit twice or close a dialog while a save is in flight", async () => {
  let complete;

  const fetchMock = mount((url, options) =>
    options.method === "PATCH"
      ? new Promise((resolve) => {
          complete = resolve;
        })
      : ok({ profile: original }),
  );

  await ready();

  const dialog = await edit();

  set("Headline", "Pending save");

  const user = userEvent.setup();

  await user.click(
    screen.getByRole("button", {
      name: "Save changes",
    }),
  );

  await user.click(
    screen.getByRole("button", {
      name: "Saving…",
    }),
  );

  fireEvent(
    dialog,
    new Event("cancel", {
      cancelable: true,
    }),
  );

  expect(
    screen.getByRole("dialog"),
  ).toBeTruthy();

  expect(
    fetchMock.mock.calls.filter(
      ([, options]) => options.method === "PATCH",
    ),
  ).toHaveLength(1);

  complete(
    ok({
      profile: {
        ...original,
        version: 2,
        headline: "Pending save",
      },
    }),
  );

  await screen.findByText("Profile saved.");

  expect(
    screen.queryByRole("dialog"),
  ).toBeNull();
});

it("closes the account menu with Escape and returns focus to the avatar", async () => {
  mount();
  await ready();

  const trigger = screen.getByRole("button", {
    name: "Open account menu",
  });

  await userEvent.setup().click(trigger);

  expect(
    trigger.getAttribute("aria-expanded"),
  ).toBe("true");

  expect(document.activeElement).toBe(
    screen.getByRole("button", {
      name: "View profile",
      exact: true,
    }),
  );

  fireEvent.keyDown(document, {
    key: "Escape",
  });

  await waitFor(() =>
    expect(
      trigger.getAttribute("aria-expanded"),
    ).toBe("false"),
  );

  expect(document.activeElement).toBe(trigger);

  expect(
    screen.queryByRole("button", {
      name: "Log out",
    }),
  ).toBeNull();
});

it("shows sidebar navigation without a profile card or another profile request", async () => {
  const fetchMock = mount();
  await ready();

  const sidebar = screen.getByRole("complementary", {
    name: "Navigation and organization",
  });

  expect(
    within(sidebar).queryByRole("heading", {
      name: "Test User",
    }),
  ).toBeNull();

  expect(
    within(sidebar).queryByRole("img"),
  ).toBeNull();

  expect(
    within(sidebar)
      .getByRole("link", {
        name: "Opportunities",
        exact: true,
      })
      .getAttribute("href"),
  ).toBe("/opportunities");

  expect(
    within(sidebar).getByRole("button", {
      name: "Messages",
      exact: true,
    }).disabled,
  ).toBe(true);

  expect(
    within(sidebar).getByRole("button", {
      name: "Notifications",
      exact: true,
    }).disabled,
  ).toBe(true);

  expect(
    fetchMock.mock.calls.filter(([url]) =>
      url.endsWith("/profile/me"),
    ),
  ).toHaveLength(1);
});

it("closes expanded navigation after a destination is chosen", async () => {
  mount();
  await ready();

  const user = userEvent.setup();

  const toggle = screen.getByRole("button", {
    name: "Toggle navigation",
  });

  await user.click(toggle);

  expect(
    toggle.getAttribute("aria-expanded"),
  ).toBe("true");

  const network = screen.getByRole("link", {
    name: "Network",
    exact: true,
  });

  await user.click(network);

  await screen.findByRole("heading", {
    name: "Network",
  });

  expect(
    toggle.getAttribute("aria-expanded"),
  ).toBe("false");

  expect(
    network.getAttribute("aria-current"),
  ).toBe("page");
});