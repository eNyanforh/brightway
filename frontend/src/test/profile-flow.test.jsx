import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, expect, it, vi } from "vitest";
import { MemoryRouter } from "react-router-dom";
import { ThemeProvider } from "styled-components";
import AuthProvider from "../auth/AuthProvider";
import AppRoutes from "../routes/AppRoutes";
import { theme } from "../styles/theme";

// jsdom has no modal rendering/focus implementation. Browser checks cover those.
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
  person: { firstName: "Test", lastName: "User" },
};
const original = {
  id: "p1",
  version: 1,
  photo: { id: "photo-1" },
  headline: "Student",
  bio: null,
  location: { countryCode: "LR", region: "Montserrado", locality: "Monrovia" },
  careerField: { mode: "EXPLORING" },
  careerGoals: null,
  skills: ["Communication"],
  interests: ["Technology"],
};
const reply = (status, data) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
const ok = (data) => reply(200, { success: true, data });
function mount(
  handler = () => ok({ profile: original }),
  path = "/profile",
  guest = false,
) {
  let signedIn = !guest;
  const fetchMock = vi.fn(async (url, options) => {
    if (url.endsWith("/work/access")) return ok({ hasWork: false });
    if (url.includes("/my-workspace")) return ok({ items: [], counts: { approved: 0, pending: 0, invitations: 0, history: 0 } });
    if (url.endsWith("/my-campus")) return ok({ items: [] });
    if (url.endsWith("/auth/me"))
      return signedIn ? ok({ account }) : reply(401, { success: false });
    if (url.endsWith("/auth/login")) {
      signedIn = true;
      return ok({ account });
    }
    if (url.endsWith("/auth/logout")) {
      signedIn = false;
      return ok({});
    }
    if (url.endsWith("/manual-identity/status"))
      return ok({ accountId: account.id, profileVersion: original.version, status: "NOT_STARTED", identityVerified: false, canSubmit: false });
    if (url.endsWith("/profile/me/dashboard"))
      return ok({ periodDays: 7, profileViews: 9, postImpressions: 0,
        searchAppearances: 6,
        recentProfileViewers: [
          { username: "share_one", name: "Sharing Viewer", photoId: null },
          { username: "share_two", name: "Second Viewer", photoId: null },
        ],
      });
    if (url.endsWith("/posts/me"))
      return ok({ access: { identityVerified: false, profilePublic: false },
        items: [], nextCursor: null });
    if (url.endsWith("/admin/manual-identity/access"))
      return reply(403, { success: false, message: "Identity reviewer access is required." });
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
  await user.click(screen.getByRole("button", { name: "Open account menu" }));
  await user.click(screen.getByRole("button", { name: "View profile", exact: true }));
}

const ready = () =>
  screen.findByRole("heading", { name: "Test User", level: 1 });
async function edit(name = "Edit introduction") {
  const user = userEvent.setup();
  if (/^Edit (education|experience|licenses and certifications)$/i.test(name))
    await user.click(screen.getByRole("tab", { name: "Achievements" }));
  else if (/^Edit (about|skills|interests|contact|my direction)$/i.test(name))
    await user.click(screen.getByRole("tab", { name: "About Me" }));
  await user.click(screen.getByRole("button", { name, exact: true }));
  return screen.findByRole("dialog");
}
const save = () =>
  userEvent.setup().click(screen.getByRole("button", { name: "Save changes" }));
const set = (name, value) =>
  fireEvent.change(screen.getByLabelText(name, { exact: true }), {
    target: { value },
  });

it("organizes the private profile into About Me, Achievements and Activity tabs", async () => {
  const fetchMock = mount();
  await ready();
  const tabs = screen.getByRole("tablist", { name: "Profile sections" });
  expect(within(tabs).getAllByRole("tab").map(tab => tab.textContent)).toEqual([
    "About Me", "Achievements", "Activity",
  ]);
  expect(screen.getByRole("tab", { name: "About Me" }).getAttribute("aria-selected")).toBe("true");
  expect(screen.getByRole("tabpanel", { name: "About Me" })).toBeTruthy();
  expect(screen.queryByRole("tabpanel", { name: "Achievements" })).toBeNull();
  expect(screen.queryByRole("tabpanel", { name: "Activity" })).toBeNull();
  const dashboard = screen.getByRole("region", { name: "Dashboard" });
  expect(dashboard).toBeTruthy();
  expect(dashboard.compareDocumentPosition(document.getElementById("profile-about")) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  expect(await within(dashboard).findByRole("button", { name: /9.*Profile views/ })).toBeTruthy();
  expect(within(dashboard).getByRole("button", { name: /0.*Post impressions/ })).toBeTruthy();
  expect(within(dashboard).getByRole("button", { name: /6.*Search appearances/ })).toBeTruthy();
  const people = within(dashboard).getByRole("group", { name: "Recent profile viewers" });
  expect(within(people).getAllByRole("link")).toHaveLength(2);
  expect(within(people).getByRole("link", { name: "Sharing Viewer viewed your profile" })
    .getAttribute("href")).toBe("/share_one");
  expect(within(people).getAllByRole("img", { name: "Private profile view" })).toHaveLength(1);
  const searches = within(dashboard).getByRole("group", { name: "Anonymous search appearances" });
  expect(within(searches).queryAllByRole("link")).toHaveLength(0);
  expect(within(searches).getAllByRole("img", { name: "Anonymous search appearance" })).toHaveLength(3);
  await userEvent.setup().click(within(dashboard).getByRole("button", { name: /9.*Profile views/ }));
  expect(within(dashboard).getByText(/Counted once per viewer per UTC day/)).toBeTruthy();
  expect(within(dashboard).getByRole("link", { name: "View profile notifications" }).getAttribute("href")).toBe("/notifications");
  expect(screen.getByRole("navigation", { name: "Profile tools" })).toBeTruthy();
  expect(within(screen.getByRole("navigation", { name: "Profile tools" }))
    .getByRole("link", { name: "Account security" }).getAttribute("href")).toBe("/security");
  expect(screen.queryByText("Public profile private")).toBeNull();
  expect(screen.queryByText("Identity not verified")).toBeNull();
  const hero = document.querySelector(".bw-profile-hero");
  expect(within(hero).queryByRole("button", { name: "Edit career direction" })).toBeNull();
  expect(within(hero).queryByRole("link", { name: "View public profile" })).toBeNull();
  expect(within(hero).queryByRole("link", { name: "See activity" })).toBeNull();
  expect(screen.queryByRole("heading", { name: "My profile" })).toBeNull();
  expect(screen.queryByText("YOUR BRIGHTWAY PROFILE")).toBeNull();
  expect(screen.queryByRole("heading", { name: "Activities" })).toBeNull();
  expect(screen.getByRole("heading", { name: "About" })).toBeTruthy();
  expect(screen.getByRole("heading", { name: "Skills" })).toBeTruthy();
  expect(screen.getByRole("heading", { name: "Interests" })).toBeTruthy();
  expect(screen.getByRole("heading", { name: "Contact" })).toBeTruthy();
  expect(screen.getByRole("heading", { name: "My direction" })).toBeTruthy();
  expect(screen.queryByRole("heading", { name: "Control your profile" })).toBeNull();
  expect(screen.queryByRole("checkbox", { name: /Publish my basic profile/ })).toBeNull();
  expect(screen.getByRole("button", { name: "Change profile picture" })).toBeTruthy();
  expect(screen.getByRole("button", { name: "Edit my direction" })).toBeTruthy();

  const user = userEvent.setup();
  await user.click(screen.getByRole("tab", { name: "Achievements" }));
  expect(screen.getByRole("tabpanel", { name: "Achievements" })).toBeTruthy();
  expect(screen.getByRole("heading", { name: "Education" })).toBeTruthy();
  expect(screen.getByRole("heading", { name: "Experience" })).toBeTruthy();
  expect(screen.getByRole("heading", { name: "Licenses and certifications" })).toBeTruthy();
  expect(screen.queryByRole("heading", { name: "About" })).toBeNull();

  await user.click(screen.getByRole("tab", { name: "Activity" }));
  expect(screen.getByRole("tabpanel", { name: "Activity" })).toBeTruthy();
  expect(screen.getByRole("region", { name: "Your community posts" })).toBeTruthy();
  expect(screen.queryByRole("heading", { name: "Activities" })).toBeNull();
  expect(await screen.findByText("No activity yet")).toBeTruthy();
  expect(screen.queryByRole("heading", { name: "Education" })).toBeNull();
  await user.click(screen.getByRole("tab", { name: "About Me" }));
  expect(screen.queryByRole("link", { name: "View public profile" })).toBeNull();
  expect(fetchMock.mock.calls.filter(([url]) => url.endsWith("/profile/me"))).toHaveLength(1);
  await userEvent.setup().click(screen.getByRole("button", { name: "Edit introduction", exact: true }));
  expect(await screen.findByRole("dialog", { name: "Edit introduction" })).toBeTruthy();
});

it("keeps photo-review policy in the picture editor without displaying a review panel on the profile", async () => {
  const profile = { ...original, photoReview: {
    required: true,
    pending: { id: "review-1", state: "IN_REVIEW", photoAssetId: "pending-photo", version: 1 },
  } };
  mount(() => ok({ profile }));
  await ready();
  expect(screen.queryByRole("heading", { name: "Profile photo review" })).toBeNull();
  expect(screen.queryByRole("button", { name: "Refresh photo review" })).toBeNull();
  expect(screen.queryByRole("button", { name: "Cancel photo request" })).toBeNull();

  await userEvent.setup().click(screen.getByRole("button", { name: "Change profile picture" }));
  const editor = await screen.findByRole("dialog", { name: "Change profile picture" });
  expect(within(editor).getByText(/Your approved photo stays visible while BrightWay reviews the replacement/)).toBeTruthy();
});

it("styles only server-approved public history records as verified, with formatted dates", async () => {
  const viewed = {
    fullName: "Maya Cole", username: "maya", headline: "Mentor", identityVerified: true,
    verifiedCredentials: [{
      id: "credential-1", kind: "education", title: "BSc Computer Science",
      organization: "Starz University", startMonth: "2022-09", endMonth: null,
      current: true, verifiedBy: "Starz University",
      organizationAvatar: { id: "school-1", name: "Starz University", photoUrl: "/org-logo.webp" },
    }],
  };
  mount((url) => url.endsWith("/profiles/maya/view") ? ok(viewed) : ok({ profile: original }), "/maya");
  const name = await screen.findByRole("heading", { name: "Maya Cole", level: 1 });
  const headerName = name.closest(".bw-public-person-name");
  expect(within(headerName).getByRole("img", { name: "Verified identity" })).toBeTruthy();
  expect(screen.getAllByRole("img", { name: "Verified identity" })).toHaveLength(1);
  await userEvent.setup().click(screen.getByRole("tab", { name: "Achievements" }));
  const record = screen.getByText("BSc Computer Science").closest(".bw-public-person-history-record");
  expect(record).toBeTruthy();
  expect(within(record).getByText("Sep 2022 – Present")).toBeTruthy();
  expect(within(record).getByRole("link", { name: "Starz University" }).getAttribute("href"))
    .toBe("/organizations/school-1");
  expect(within(record).getByRole("img", { name: "Starz University profile picture" }).getAttribute("src"))
    .toBe("/org-logo.webp");
  expect(within(record).queryByLabelText("Verified credential")).toBeNull();
  expect(screen.getByRole("heading", { name: "Education and experience" })).toBeTruthy();
  expect(screen.queryByText("Not submitted for verification")).toBeNull();
});

it("shows only published fields on the redesigned public profile without a second view request", async () => {
  const viewed = {
    fullName: "Maya Cole", username: "maya", headline: "Software engineer and mentor", identityVerified: false,
    bio: "Building accessible education software.", location: {
      countryCode: "LR", region: "Montserrado", locality: "Monrovia",
    }, careerField: { mode: "SPECIFIED", label: "Software development" },
    careerGoals: "Mentor new developers.", skills: ["React", "TypeScript"],
    interests: ["Education", "Community"],
  };
  const fetchMock = mount((url) =>
    url.endsWith("/profiles/maya/view") ? ok(viewed) : ok({ profile: original }), "/maya");
  await screen.findByRole("heading", { name: "Maya Cole", level: 1 });
  expect(screen.queryByRole("link", { name: /Back to Network/i })).toBeNull();
  expect(screen.queryByText("BrightWay member")).toBeNull();
  expect(screen.queryByRole("img", { name: "Verified identity" })).toBeNull();
  const tabs = screen.getByRole("tablist", { name: "Public profile sections" });
  expect(within(tabs).getAllByRole("tab").map(tab => tab.textContent)).toEqual([
    "About Me", "Achievements", "Activities",
  ]);
  expect(within(tabs).getByRole("tab", { name: "About Me" }).getAttribute("aria-selected")).toBe("true");
  expect(screen.getByRole("tabpanel", { name: "About Me" })).toBeTruthy();
  expect(screen.queryByRole("tabpanel", { name: "Achievements" })).toBeNull();
  expect(screen.queryByRole("tabpanel", { name: "Activities" })).toBeNull();
  expect(screen.getByRole("img", { name: "Profile avatar" })).toBeTruthy();
  expect(document.querySelector(".bw-public-person-note")).toBeNull();
  expect(screen.queryByText(/Member profiles, current profile photos/)).toBeNull();
  expect(screen.getByText("Building accessible education software.")).toBeTruthy();
  expect(screen.getByText("Mentor new developers.")).toBeTruthy();
  expect(screen.getByText("TypeScript")).toBeTruthy();
  expect(screen.queryByText("existing@example.com")).toBeNull();
  expect(screen.queryByRole("heading", { name: "Contact" })).toBeNull();
  expect(fetchMock.mock.calls.filter(([url]) => url.endsWith("/profiles/maya/view"))).toHaveLength(1);
});

it("renders public activities without leaking contact details or requiring an identity badge for current photos", async () => {
  const viewed = {
    fullName: "Maya Cole", username: "maya", identityVerified: false,
    photoId: "55555555-5555-4555-8555-555555555555",
    coverPhoto: { id: "66666666-6666-4666-8666-666666666666" },
    achievements: [{ id: "a1", type: "ACHIEVEMENT", body: "Completed a course.",
      tags: ["Learning"], createdAt: "2026-11-02T10:00:00Z" }],
    activities: [
      { id: "a1", type: "ACHIEVEMENT", body: "Completed a course.",
        tags: ["Learning"], createdAt: "2026-11-02T10:00:00Z" },
      { id: "e1", type: "EVENT", body: "Hosting a learning session.",
        tags: ["Education"], createdAt: "2026-11-01T10:00:00Z" },
      { id: "q1", type: "QUESTION", body: "How can I learn backend development?",
        tags: ["Coding"], createdAt: "2026-10-31T10:00:00Z" },
    ],
  };
  const posted = viewed.activities.map(item => ({
    ...item,
    member: { username: "maya", name: "Maya Cole", photoId: viewed.photoId, verified: false },
    reaction: { count: 3, liked: false }, views: 15, commentCount: 2,
    repostCount: 1, reposted: false, saved: false,
    ...(item.type === "EVENT" ? {
      eventDetails: {
        title: "Learning session", startAt: "2026-12-01T12:00:00Z",
        endAt: "2026-12-01T14:00:00Z", timezone: "UTC",
        format: "IN_PERSON", venue: "Monrovia", ticketPriceCents: 0,
      }, registration: { count: 2, registered: false }, eventAttendees: [],
    } : {}),
    ...(item.type === "QUESTION" ? {
      questionDetails: { title: "How do I learn backend development?" },
      answerCount: 4, answerParticipants: [],
    } : {}),
  }));
  const fetchMock = mount(url =>
    url.endsWith("/profiles/maya/view") ? ok(viewed)
      : url.includes("/posts/members/maya") ? ok({ items: posted, nextCursor: null })
        : ok({ profile: original }), "/maya");
  await screen.findByRole("heading", { name: "Maya Cole", level: 1 });
  expect(screen.getByRole("img", { name: "Profile avatar" }).getAttribute("src"))
    .toBe("/api/v1/explore/members/maya/photo/55555555-5555-4555-8555-555555555555");
  expect(document.querySelector(".bw-public-person-cover-image").getAttribute("src"))
    .toBe("/api/v1/profiles/maya/cover/66666666-6666-4666-8666-666666666666");
  expect(screen.queryByRole("img", { name: "Verified identity" })).toBeNull();
  const user = userEvent.setup();
  await user.click(screen.getByRole("tab", { name: "Achievements" }));
  expect(within(screen.getByRole("tabpanel", { name: "Achievements" }))
    .getByText("Completed a course.")).toBeTruthy();
  await user.click(screen.getByRole("tab", { name: "Activities" }));
  await screen.findByText("Hosting a learning session.");
  const rail = screen.getByRole("region", { name: "Member posts" });
  expect(within(rail).getAllByRole("article")).toHaveLength(3);
  expect(within(rail).getAllByLabelText("15 views")).toHaveLength(3);
  expect(within(rail).getAllByLabelText("2 comments")).toHaveLength(2); // Questions have an Answer action, not comments.
  expect(within(rail).getByText("Learning session")).toBeTruthy();
  expect(within(rail).getByText("How do I learn backend development?")).toBeTruthy();
  expect(within(rail).getAllByRole("link", { name: /View full post/ })).toHaveLength(3);
  expect(within(rail).getAllByRole("button", { name: "Post options" })).toHaveLength(3);
  expect(within(rail).queryByRole("button", { name: "Review registration requests" })).toBeNull();
  expect(fetchMock.mock.calls.some(([url]) => url.includes("/posts/members/maya"))).toBeTruthy();
  expect(screen.queryByText("synthetic@example.org")).toBeNull();
  expect(screen.queryByRole("heading", { name: "Contact" })).toBeNull();
});

it("shows the saved profile first and uses the top picture as the profile navigation", async () => {
  const fetchMock = mount();
  await ready();
  expect(screen.queryByLabelText("Headline")).toBeNull();
  expect(
    screen.queryByRole("link", { name: "My profile", exact: true }),
  ).toBeNull();
  const link = screen.getByRole("button", { name: "Open account menu" });
  expect(link.getAttribute("aria-expanded")).toBe("false");
  expect(link.querySelector("img").getAttribute("src")).toBe(
    "/api/v1/photos/photo-1",
  );
  expect(
    screen
      .getByRole("img", { name: "Test User's profile picture" })
      .getAttribute("src"),
  ).toBe("/api/v1/photos/photo-1");
  expect(
    screen.queryByText(/SUBMITTED|awaiting approval|pending review/i),
  ).toBeNull();
  const request = fetchMock.mock.calls.find(([url]) =>
    url.endsWith("/profile/me"),
  )[1];
  expect(request.credentials).toBe("include");
  expect(request.cache).toBe("no-store");
});

it("loads the header photo once and opens the profile from another app page", async () => {
  const fetchMock = mount(undefined, "/network");
  await screen.findByRole("heading", { name: "Network" });
  await waitFor(() =>
    expect(
      screen
        .getByRole("button", { name: "Open account menu" })
        .querySelector("img"),
    ).toBeTruthy(),
  );
  await openProfile();
  await ready();
  expect(
    fetchMock.mock.calls.filter(([url]) => url.endsWith("/profile/me")),
  ).toHaveLength(1);
});

it("saves only the introduction changes and accepts normalized server values", async () => {
  const fetchMock = mount((url, options) =>
    options.method === "PATCH"
      ? ok({ profile: { ...original, version: 2, headline: "Developer" } })
      : ok({ profile: original }),
  );
  await ready();
  await edit();
  set("Headline", " Developer ");
  await save();
  await screen.findByText("Profile saved.");
  expect(screen.queryByRole("dialog")).toBeNull();
  const body = JSON.parse(
    fetchMock.mock.calls.find(([, options]) => options.method === "PATCH")[1]
      .body,
  );
  expect(body).toEqual({
    expectedVersion: 1,
    changes: { headline: "Developer" },
  });
  expect(screen.getByText("Developer")).toBeTruthy();
});

it("keeps unsaved edits across editor close and app navigation without refetching", async () => {
  const fetchMock = mount();
  await ready();
  await edit();
  set("Headline", "My unsaved story");
  const user = userEvent.setup();
  await user.click(
    screen.getByRole("button", { name: "Close editor and keep edits" }),
  );
  await user.click(screen.getByRole("link", { name: "BrightWay, go to Explore" }));
  await screen.findByRole("region", { name: "Explore" });
  await openProfile();
  await ready();
  await user.click(screen.getByRole("button", { name: "Resume editing" }));
  expect(screen.getByLabelText("Headline").value).toBe("My unsaved story");
  expect(
    fetchMock.mock.calls.filter(([url]) => url.endsWith("/profile/me")),
  ).toHaveLength(1);
});

it("cancel discards that section and does not persist anything", async () => {
  const fetchMock = mount();
  await ready();
  await edit();
  set("Headline", "Discard this");
  await userEvent.setup().click(screen.getByRole("button", { name: "Cancel" }));
  await edit();
  expect(screen.getByLabelText("Headline").value).toBe("Student");
  expect(
    fetchMock.mock.calls.some(([, options]) => options.method === "PATCH"),
  ).toBe(false);
});

it("retains editable text when the save request fails", async () => {
  mount((url, options) => {
    if (options.method === "PATCH") throw new TypeError("Disconnected");
    return ok({ profile: original });
  });
  await ready();
  await edit("Edit about");
  set("About you", "Keep my story");
  await save();
  expect((await screen.findByRole("alert")).textContent).toContain(
    "Your edits are still here",
  );
  expect(screen.getByLabelText("About you").value).toBe("Keep my story");
});

it("preserves stale edits and requires explicit discard before reloading", async () => {
  let reads = 0;
  const fetchMock = mount((url, options) =>
    options.method === "PATCH"
      ? reply(409, {
          success: false,
          message: "Your profile changed. Reload it before saving again.",
        })
      : ok({
          profile:
            ++reads === 1
              ? original
              : { ...original, version: 2, headline: "Other tab won" },
        }),
  );
  await ready();
  await edit();
  set("Headline", "Local edit");
  await save();
  await screen.findByRole("alert");
  expect(screen.getByLabelText("Headline").value).toBe("Local edit");
  expect(screen.getByRole("button", { name: "Save changes" }).disabled).toBe(
    true,
  );
  vi.spyOn(window, "confirm").mockReturnValue(false);
  await userEvent
    .setup()
    .click(
      screen.getByRole("button", { name: "Discard edits and load latest" }),
    );
  expect(reads).toBe(1);
  window.confirm.mockReturnValue(true);
  await userEvent
    .setup()
    .click(
      screen.getByRole("button", { name: "Discard edits and load latest" }),
    );
  await screen.findAllByText("Other tab won");
  expect(screen.queryByRole("dialog")).toBeNull();
  expect(
    fetchMock.mock.calls.filter(([, options]) => options.method === "PATCH"),
  ).toHaveLength(1);
});

it("updates both pictures after replacement and uses its version in the next save", async () => {
  const fetchMock = mount((url, options) =>
    url.endsWith("/photo")
      ? reply(201, { success: true, data: { photoAssetId: "photo-2" } })
      : options.method === "PATCH"
        ? ok({
            profile: {
              ...original,
              version: 3,
              photo: { id: "photo-2" },
              headline: "New story",
            },
          })
        : ok({ profile: original }),
  );
  await ready();
  await edit("Change profile picture");
  const user = userEvent.setup();
  const file = new File(["image"], "me.png", { type: "image/png" });
  await user.upload(screen.getByLabelText("Choose profile picture"), file);
  await user.click(screen.getByRole("button", { name: "Upload picture" }));
  await screen.findByText("Profile picture updated.");
  expect(
    screen
      .getByRole("button", { name: "Open account menu" })
      .querySelector("img")
      .getAttribute("src"),
  ).toBe("/api/v1/photos/photo-2");
  expect(
    screen
      .getByRole("img", { name: "Test User's profile picture" })
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
      fetchMock.mock.calls.find(([, options]) => options.method === "PATCH")[1]
        .body,
    ).expectedVersion,
  ).toBe(2);
});

it("keeps the old picture and selected file when photo storage fails", async () => {
  mount((url) =>
    url.endsWith("/photo")
      ? reply(503, {
          success: false,
          message: "Photo storage is temporarily unavailable.",
        })
      : ok({ profile: original }),
  );
  await ready();
  await edit("Change profile picture");
  const user = userEvent.setup();
  await user.upload(
    screen.getByLabelText("Choose profile picture"),
    new File(["image"], "me.png", { type: "image/png" }),
  );
  await user.click(screen.getByRole("button", { name: "Upload picture" }));
  expect((await screen.findByRole("alert")).textContent).toContain(
    "Photo storage is temporarily unavailable",
  );
  expect(screen.getByText("Selected: me.png")).toBeTruthy();
  expect(
    screen
      .getByRole("button", { name: "Open account menu" })
      .querySelector("img")
      .getAttribute("src"),
  ).toBe("/api/v1/photos/photo-1");
});

it("sends explicit skill clears without updating other sections", async () => {
  const fetchMock = mount((url, options) =>
    options.method === "PATCH"
      ? ok({ profile: { ...original, version: 2, skills: [] } })
      : ok({ profile: original }),
  );
  await ready();
  await edit("Edit skills");
  await userEvent.setup().click(screen.getByRole("button", { name: "Remove Communication" }));
  await save();
  await screen.findByText("Profile saved.");
  expect(
    JSON.parse(
      fetchMock.mock.calls.find(([, options]) => options.method === "PATCH")[1]
        .body,
    ).changes,
  ).toEqual({ skills: [] });
});

it("saves one section without losing unsaved edits in another section", async () => {
  const fetchMock = mount((url, options) =>
    options.method === "PATCH"
      ? ok({ profile: { ...original, version: 2, bio: "Saved about" } })
      : ok({ profile: original }),
  );
  await ready();
  await edit();
  set("Headline", "Unsaved introduction");
  await userEvent
    .setup()
    .click(screen.getByRole("button", { name: "Close editor and keep edits" }));
  await edit("Edit about");
  set("About you", "Saved about");
  await save();
  await screen.findByText("Profile saved.");
  expect(
    JSON.parse(
      fetchMock.mock.calls.find(([, options]) => options.method === "PATCH")[1]
        .body,
    ).changes,
  ).toEqual({ bio: "Saved about" });
  await edit();
  expect(screen.getByLabelText("Headline").value).toBe("Unsaved introduction");
});

it("supports virtual empty drafts with version zero", async () => {
  const empty = {
    id: null,
    version: 0,
    photo: null,
    location: { countryCode: null, region: null, locality: null },
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
      fetchMock.mock.calls.find(([, options]) => options.method === "PATCH")[1]
        .body,
    ),
  ).toEqual({ expectedVersion: 0, changes: { headline: "Starting out" } });
});

it("warns before closing the document when drafts exist on another app page", async () => {
  mount();
  await ready();
  await edit();
  set("Headline", "Unsaved");
  const user = userEvent.setup();
  await user.click(
    screen.getByRole("button", { name: "Close editor and keep edits" }),
  );
  await user.click(screen.getByRole("link", { name: "BrightWay, go to Explore" }));
  await screen.findByRole("region", { name: "Explore" });
  const event = new Event("beforeunload", { cancelable: true });
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
    screen.getByRole("button", { name: "Close editor and keep edits" }),
  );
  await user.click(screen.getByRole("button", { name: "Open account menu" }));
  vi.spyOn(window, "confirm").mockReturnValue(false);
  await user.click(screen.getByRole("button", { name: "Log out" }));
  await ready();
  window.confirm.mockReturnValue(true);
  await user.click(screen.getByRole("button", { name: "Log out" }));
  await screen.findByRole("heading", { name: "Log in to BrightWay" });
  expect(screen.queryByText("You have unsaved profile edits.")).toBeNull();
});

it("retries an initial profile failure", async () => {
  let reads = 0;
  mount(() =>
    ++reads === 1
      ? reply(503, { success: false, message: "Please retry later." })
      : ok({ profile: original }),
  );
  expect((await screen.findByRole("alert")).textContent).toBe(
    "Please retry later.",
  );
  await userEvent
    .setup()
    .click(screen.getByRole("button", { name: "Try again" }));
  await ready();
});

it("returns to the profile after logging into a protected profile URL", async () => {
  mount(undefined, "/profile", true);
  await screen.findByRole("heading", { name: "Log in to BrightWay" });
  const user = userEvent.setup();
  await user.type(screen.getByLabelText("Username or email"), "tester");
  await user.type(screen.getByLabelText("Password"), "a test password");
  await user.click(screen.getByRole("button", { name: "Log in" }));
  await ready();
  expect(screen.queryByRole("region", { name: "Explore" })).toBeNull();
});

it("handles Escape by keeping the draft rather than silently discarding it", async () => {
  mount();
  await ready();
  const dialog = await edit();
  set("Headline", "Keep after Escape");
  fireEvent(dialog, new Event("cancel", { cancelable: true }));
  await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  await edit();
  expect(screen.getByLabelText("Headline").value).toBe("Keep after Escape");
});

it("retains an unsaved introduction through photo replacement and rebases its next save", async () => {
  const fetchMock = mount((url, options) =>
    url.endsWith("/photo")
      ? reply(201, { success: true, data: { photoAssetId: "photo-2" } })
      : options.method === "PATCH"
        ? ok({
            profile: {
              ...original,
              version: 3,
              photo: { id: "photo-2" },
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
    screen.getByRole("button", { name: "Close editor and keep edits" }),
  );
  await edit("Change profile picture");
  await user.upload(
    screen.getByLabelText("Choose profile picture"),
    new File(["image"], "me.png", { type: "image/png" }),
  );
  await user.click(screen.getByRole("button", { name: "Upload picture" }));
  await screen.findByText("Profile picture updated.");
  await user.click(screen.getByRole("button", { name: "Resume editing" }));
  expect(screen.getByLabelText("Headline").value).toBe("Still here");
  await save();
  await screen.findByText("Profile saved.");
  expect(
    JSON.parse(
      fetchMock.mock.calls.find(([, options]) => options.method === "PATCH")[1]
        .body,
    ),
  ).toEqual({ expectedVersion: 2, changes: { headline: "Still here" } });
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
  await user.click(screen.getByRole("button", { name: "Save changes" }));
  await user.click(screen.getByRole("button", { name: "Saving…" }));
  fireEvent(dialog, new Event("cancel", { cancelable: true }));
  expect(screen.getByRole("dialog")).toBeTruthy();
  expect(
    fetchMock.mock.calls.filter(([, options]) => options.method === "PATCH"),
  ).toHaveLength(1);
  complete(
    ok({ profile: { ...original, version: 2, headline: "Pending save" } }),
  );
  await screen.findByText("Profile saved.");
  expect(screen.queryByRole("dialog")).toBeNull();
});
it("closes the account menu with Escape and returns focus to the avatar", async () => {
  mount();
  await ready();
  const trigger = screen.getByRole("button", { name: "Open account menu" });
  await userEvent.setup().click(trigger);
  expect(trigger.getAttribute("aria-expanded")).toBe("true");
  expect(document.activeElement).toBe(screen.getByRole("button", { name: "View profile", exact: true }));
  fireEvent.keyDown(document, { key: "Escape" });
  await waitFor(() => expect(trigger.getAttribute("aria-expanded")).toBe("false"));
  expect(document.activeElement).toBe(trigger);
  expect(screen.queryByRole("button", { name: "Log out" })).toBeNull();
});

it("shows sidebar navigation without a profile card or another profile request", async () => {
  const fetchMock = mount();
  await ready();
  const sidebar = screen.getByRole("complementary", { name: "Navigation and organization" });
  expect(within(sidebar).queryByRole("heading", { name: "Test User" })).toBeNull();
  expect(within(sidebar).queryByRole("img")).toBeNull();
  expect(within(sidebar).getByRole("link", { name: "Opportunities", exact: true }).getAttribute("href"))
    .toBe("/opportunities");
  expect(within(sidebar).getByRole("link", { name: "Messages", exact: true }).getAttribute("href")).toBe("/messages");
  expect(within(sidebar).getByRole("link", { name: "Notifications", exact: true }).getAttribute("href"))
    .toBe("/notifications");
  expect(fetchMock.mock.calls.filter(([url]) => url.endsWith("/profile/me"))).toHaveLength(1);
});

it("closes expanded navigation after a destination is chosen", async () => {
  mount();
  await ready();
  const user = userEvent.setup();
  const toggle = screen.getByRole("button", { name: "Toggle navigation" });
  await user.click(toggle);
  expect(toggle.getAttribute("aria-expanded")).toBe("true");
  const network = within(screen.getByRole("navigation", { name: "Main navigation" })).getByRole("link", { name: "Network", exact: true });
  await user.click(network);
  await screen.findByRole("heading", { name: "Network" });
  expect(toggle.getAttribute("aria-expanded")).toBe("false");
  expect(network.getAttribute("aria-current")).toBe("page");
});

it("provides four mobile destinations and a floating Post shortcut without another profile read", async () => {
  const fetchMock = mount();
  await ready();
  const navigation = screen.getByRole("navigation", { name: "Mobile navigation" });
  expect([...navigation.children].map((item) => item.textContent)).toEqual([
    "Explore", "Opportunities", "Network", "Learning", "Post",
  ]);
  const floatingPost = within(navigation).getByRole("link", { name: "Create Post" });
  expect(floatingPost.getAttribute("href")).toBe("/explore?compose=post");
  expect(floatingPost.classList.contains("bw-mobile-compose-fab")).toBe(true);
  const header = screen.getByRole("banner");
  expect(within(header).getByRole("link", { name: "Search BrightWay" }).getAttribute("href")).toBe("/search");
  expect(within(header).getByRole("link", { name: "Messages", exact: true }).getAttribute("href")).toBe("/messages");
  expect(within(header).getByRole("link", { name: "Notifications", exact: true }).getAttribute("href"))
    .toBe("/notifications");
  expect(within(header).getByRole("button", { name: "Open account menu" })).toBeTruthy();
  const network = within(navigation).getByRole("link", { name: "Network", exact: true });
  await userEvent.setup().click(network);
  await screen.findByRole("heading", { name: "Network" });
  expect(network.getAttribute("aria-current")).toBe("page");
  await openProfile(userEvent.setup());
  await ready();
  expect(fetchMock.mock.calls.filter(([url]) => url.endsWith("/profile/me"))).toHaveLength(1);
});

it("places the organization invitation beneath logout in the account disclosure", async () => {
  const fetchMock = mount();
  await ready();
  await userEvent.setup().click(screen.getByRole("button", { name: "Open account menu" }));
  const logout = screen.getByRole("button", { name: "Log out", exact: true });
  const invitation = screen.getByLabelText("Grow your organization");
  expect(logout.nextElementSibling).toBe(invitation);
  expect(within(invitation).getByText("Make room for your organization.")).toBeTruthy();
  expect(within(invitation).getByText("Bring your school, company, or community to BrightWay.")).toBeTruthy();
  expect(within(invitation).getByText("Create an organization").closest("button").disabled).toBe(false);
  expect(fetchMock.mock.calls.filter(([url]) => url.endsWith("/profile/me"))).toHaveLength(1);
});

function historyServer() {
  let profile = { ...original, education: { mode: "UNSET", records: [] }, experience: { mode: "UNSET", records: [] } };
  const writes = [];
  const fetchMock = mount((url, options) => {
    if (options?.method === "PUT") {
      const kind = url.endsWith("/education") ? "education" : "experience";
      const body = JSON.parse(options.body); writes.push({ kind, body });
      profile = { ...profile, version: profile.version + 1, [kind]: { mode: body.mode, records: body.records.map((row, index) => ({ ...row, id: row.id || `00000000-0000-4000-8000-00000000000${index}`, revision: row.revision || 1, status: "DRAFT" })) } };
    } else if (options?.method === "PATCH") {
      const body = JSON.parse(options.body); writes.push({ kind: "profile", body });
      profile = { ...profile, ...body.changes, version: profile.version + 1 };
    }
    return ok({ profile });
  });
  return { writes, fetchMock };
}
function recordField(group, label, value) {
  fireEvent.change(within(group).getByLabelText(label, { exact: true }), { target: { value } });
}

it("saves explicit no-education and no-experience declarations without inventing verification", async () => {
  const { writes } = historyServer(); await ready();
  await edit("Edit education");
  set("Education history", "NONE"); await save();
  await screen.findByText("No formal education declared.");
  expect(writes[0]).toEqual({ kind: "education", body: { expectedVersion: 1, mode: "NONE", records: [] } });
  await edit("Edit experience"); set("Experience history", "NONE"); await save();
  await screen.findByText("No work experience declared.");
  expect(writes[1].body.expectedVersion).toBe(2);
  expect(screen.queryByText("Verified", { exact: true })).toBeNull();
});

it("saves multiple education records with month/year dates and current enrollment", async () => {
  const { writes } = historyServer(); await ready(); const user = userEvent.setup();
  await edit("Edit education"); set("Education history", "RECORDS");
  await user.click(screen.getByRole("button", { name: "Add education record" }));
  const first = screen.getByRole("group", { name: "Education record 1" });
  recordField(first, "Institution", "School"); recordField(first, "Qualification or program", "Diploma");
  recordField(first, "Start month and year", "2020-09"); recordField(first, "End month and year", "2023-06");
  await user.click(screen.getByRole("button", { name: "Add education record" }));
  const second = screen.getByRole("group", { name: "Education record 2" });
  recordField(second, "Institution", "University"); recordField(second, "Qualification or program", "Information Technology");
  recordField(second, "Start month and year", "2024-09"); await user.click(within(second).getByLabelText("Currently studying here"));
  await save(); await screen.findByRole("heading", { name: "Information Technology" });
  expect(writes[0].body.records).toHaveLength(2);
  expect(writes[0].body.records[1].endMonth).toBeNull();
  expect(writes[0].body.records[1].current).toBe(true);
  expect(writes[0].body.records[0].status).toBeUndefined();
  expect(writes[0].body.records[0]._key).toBeUndefined();
  expect(screen.getAllByText("Not submitted for verification")).toHaveLength(2);
});

it("renders modern history cards with organization avatars, dates, types and truthful review states", async () => {
  const profile = {
    ...original,
    experience: { mode: "RECORDS", records: [{
      id: "experience-1", organization: "Community Labs", role: "Frontend engineer",
      type: "EMPLOYMENT", current: true, startMonth: "2025-01", endMonth: null,
      status: "IN_REVIEW", description: "Built accessible learning features.",
      organizationAvatar: { id: "lab-1", name: "Community Labs", photoUrl: "/api/v1/organizations/lab-1/photo" },
    }] },
    education: { mode: "RECORDS", records: [{
      id: "education-1", institution: "Starz University", qualification: "Computer Science",
      current: false, startMonth: "2021-09", endMonth: "2025-06", status: "VERIFIED",
      description: "Capstone in education technology.",
    }] },
  };
  mount(() => ok({ profile }));
  await ready();
  await userEvent.setup().click(screen.getByRole("tab", { name: "Achievements" }));
  const experience = document.querySelector("#profile-experience .bw-history-record");
  expect(within(experience).getByRole("heading", { name: "Frontend engineer" })).toBeTruthy();
  expect(experience.dataset.status).toBe("pending");
  expect(within(experience).getByRole("img", { name: "Community Labs profile picture" })
    .getAttribute("src")).toBe("/api/v1/organizations/lab-1/photo");
  expect(within(experience).getByRole("link", { name: "Community Labs" })
    .getAttribute("href")).toBe("/organizations/lab-1");
  expect(within(experience).getByText("Jan 2025 – Present")).toBeTruthy();
  expect(within(experience).getByText("Currently working")).toBeTruthy();
  expect(within(experience).getByText("Paid employment")).toBeTruthy();
  expect(within(experience).getByText("In review")).toBeTruthy();
  expect(within(experience).queryByText("Verified", { exact: true })).toBeNull();
  expect(within(experience).getByText("Built accessible learning features.")).toBeTruthy();
  expect(within(experience).getByRole("link", { name: /Verification details/ })
    .getAttribute("href")).toBe("/credentials/experience/experience-1");

  const education = document.querySelector("#profile-education .bw-history-record");
  expect(within(education).getByRole("heading", { name: "Computer Science" })).toBeTruthy();
  expect(education.dataset.status).toBe("verified");
  expect(within(education).getByText("Sep 2021 – Jun 2025")).toBeTruthy();
  expect(within(education).getByText("Verified")).toBeTruthy();
  expect(within(education).getByText("Capstone in education technology.")).toBeTruthy();
  expect(within(education).queryByRole("link", { name: "Starz University" })).toBeNull();
});

it("keeps the no-formal-education declaration distinguishable from an empty history", async () => {
  mount(() => ok({ profile: { ...original,
    education: { mode: "NONE", records: [] },
    experience: { mode: "UNSET", records: [] },
  } }));
  await ready();
  await userEvent.setup().click(screen.getByRole("tab", { name: "Achievements" }));
  expect(screen.getByText("No formal education declared.")).toBeTruthy();
  expect(screen.getByRole("button", { name: "Update history" })).toBeTruthy();
  expect(screen.getByText("Build your experience history")).toBeTruthy();
  expect(screen.getByRole("button", { name: "Add experience" })).toBeTruthy();
});

it("accepts all four experience types in separate records", async () => {
  const { writes } = historyServer(); await ready(); const user = userEvent.setup();
  await edit("Edit experience"); set("Experience history", "RECORDS");
  const types = ["EMPLOYMENT", "INTERNSHIP", "VOLUNTEERING", "SELF_EMPLOYMENT"];
  for (const [index, type] of types.entries()) {
    await user.click(screen.getByRole("button", { name: "Add experience record" }));
    const group = screen.getByRole("group", { name: `Experience record ${index + 1}` });
    recordField(group, "Organization or business", `Organization ${index + 1}`); recordField(group, "Role or position", `Role ${index + 1}`);
    recordField(group, "Experience type", type); recordField(group, "Start month and year", "2023-01");
    await user.click(within(group).getByLabelText("Currently working in this role"));
  }
  await save(); await screen.findByText("Role 4");
  expect(writes[0].body.records.map((r) => r.type)).toEqual(types);
});

it("keeps unsaved introduction edits across a history save and uses the new version", async () => {
  const { writes } = historyServer(); await ready(); const user = userEvent.setup();
  await edit(); set("Headline", "Unsaved headline");
  await user.click(screen.getByRole("button", { name: "Close editor and keep edits" }));
  await edit("Edit education"); set("Education history", "NONE"); await save();
  await screen.findByText("No formal education declared.");
  await edit(); expect(screen.getByLabelText("Headline").value).toBe("Unsaved headline");
  await save(); await screen.findByText("Unsaved headline");
  expect(writes[1].body).toEqual({ expectedVersion: 2, changes: { headline: "Unsaved headline" } });
});

it("requires explicit confirmation before a declaration removes records and cancel restores them", async () => {
  const row = { id: "00000000-0000-4000-8000-000000000001", revision: 1, status: "DRAFT", institution: "Saved school", qualification: "Diploma", startMonth: "2020-09", endMonth: "2023-06", current: false, description: "" };
  const fetchMock = mount(() => ok({ profile: { ...original, education: { mode: "RECORDS", records: [row] } } }));
  await ready(); await edit("Edit education");
  const confirmation = vi.spyOn(window, "confirm").mockReturnValue(false);
  set("Education history", "NONE"); expect(screen.getByRole("group", { name: "Education record 1" })).toBeTruthy();
  confirmation.mockReturnValue(true); set("Education history", "NONE");
  expect(screen.queryByRole("group", { name: "Education record 1" })).toBeNull();
  await userEvent.setup().click(screen.getByRole("button", { name: "Cancel", exact: true }));
  await edit("Edit education"); expect(screen.getByLabelText("Institution").value).toBe("Saved school");
  expect(fetchMock.mock.calls.some(([, options]) => options?.method === "PUT")).toBe(false);
  confirmation.mockRestore();
});

it("retains history drafts through navigation and a stale save without overwriting", async () => {
  const fetchMock = mount((url, options) => options?.method === "PUT" ? reply(409, { success: false, message: "Your profile changed." }) : ok({ profile: original }));
  await ready(); const user = userEvent.setup(); await edit("Edit education"); set("Education history", "NONE");
  await user.click(screen.getByRole("button", { name: "Close editor and keep edits" }));
  await user.click(screen.getByRole("link", { name: "BrightWay, go to Explore" })); await openProfile(); await ready();
  await edit("Edit education"); expect(screen.getByLabelText("Education history").value).toBe("NONE");
  await save(); await screen.findByText("Your profile changed.");
  expect(screen.getByLabelText("Education history").value).toBe("NONE");
  expect(screen.getByRole("button", { name: "Save changes" }).disabled).toBe(true);
  expect(fetchMock.mock.calls.filter(([, options]) => options?.method === "PUT")).toHaveLength(1);
  expect(fetchMock.mock.calls.filter(([url]) => url.endsWith("/profile/me"))).toHaveLength(1);
});

it("does not close or resubmit a history editor while its save is pending", async () => {
  let complete;
  const pending = new Promise((resolve) => { complete = resolve; });
  const fetchMock = mount((url, options) => options?.method === "PUT" ? pending : ok({ profile: original }));
  await ready(); await edit("Edit experience"); set("Experience history", "NONE"); await save();
  const dialog = screen.getByRole("dialog");
  expect(screen.getByRole("button", { name: "Close editor and keep edits" }).disabled).toBe(true);
  expect(screen.getByRole("button", { name: "Cancel", exact: true }).disabled).toBe(true);
  fireEvent(dialog, new Event("cancel", { cancelable: true })); fireEvent.submit(dialog.querySelector("form"));
  expect(screen.getByRole("dialog")).toBeTruthy();
  expect(fetchMock.mock.calls.filter(([, options]) => options?.method === "PUT")).toHaveLength(1);
  complete(ok({ profile: { ...original, version: 2, experience: { mode: "NONE", records: [] } } }));
  await screen.findByText("No work experience declared."); expect(screen.queryByRole("dialog")).toBeNull();
});

it("saves predefined interest selections without changing another profile section", async () => {
  const writes = [];
  mount((url, options) => {
    if (options?.method === "PATCH") {
      const body = JSON.parse(options.body); writes.push(body);
      return ok({ profile: { ...original, version: 2, interests: body.changes.interests } });
    }
    return ok({ profile: original });
  });
  await ready(); await edit("Edit interests");
  expect(screen.queryByRole("textbox", { name: "Interests", exact: true })).toBeNull();
  await userEvent.setup().click(screen.getByRole("checkbox", { name: "Education", exact: true }));
  await save(); await screen.findByText("Profile saved.");
  expect(writes).toEqual([{ expectedVersion: 1, changes: { interests: ["Technology", "Education"] } }]);
  expect(screen.getByText("Education", { exact: true, selector: ".bw-profile-tag" })).toBeTruthy();
});

it("preserves interest choices through editor close and navigation, and cancel discards only interest changes", async () => {
  const fetchMock = mount(); await ready(); const user = userEvent.setup();
  await edit(); set("Headline", "Another unsaved section");
  await user.click(screen.getByRole("button", { name: "Close editor and keep edits" }));
  await edit("Edit interests"); await user.click(screen.getByRole("checkbox", { name: "Education", exact: true }));
  await user.click(screen.getByRole("button", { name: "Close editor and keep edits" }));
  await user.click(screen.getByRole("link", { name: "BrightWay, go to Explore" })); await openProfile(); await ready();
  await edit("Edit interests"); expect(screen.getByRole("checkbox", { name: "Education", exact: true }).checked).toBe(true);
  await user.click(screen.getByRole("button", { name: "Cancel", exact: true }));
  await edit("Edit interests"); expect(screen.getByRole("checkbox", { name: "Education", exact: true }).checked).toBe(false);
  await user.click(screen.getByRole("button", { name: "Close editor and keep edits" }));
  await edit(); expect(screen.getByLabelText("Headline").value).toBe("Another unsaved section");
  expect(fetchMock.mock.calls.some(([, options]) => options?.method === "PATCH")).toBe(false);
});

it("saves predefined skill selections without changing another profile section", async () => {
  const writes = [];
  mount((url, options) => {
    if (options?.method === "PATCH") {
      const body = JSON.parse(options.body); writes.push(body);
      return ok({ profile: { ...original, version: 2, skills: body.changes.skills } });
    }
    return ok({ profile: original });
  });
  await ready(); await edit("Edit skills");
  expect(screen.queryByRole("textbox", { name: "Skills", exact: true })).toBeNull();
  await userEvent.setup().click(screen.getByRole("checkbox", { name: "Python", exact: true }));
  await save(); await screen.findByText("Profile saved.");
  expect(writes).toEqual([{ expectedVersion: 1, changes: { skills: ["Communication", "Python"] } }]);
  expect(screen.getByText("Python", { exact: true, selector: ".bw-profile-tag" })).toBeTruthy();
});

it("preserves skill choices through editor close and navigation, and cancel discards only skill changes", async () => {
  const fetchMock = mount(); await ready(); const user = userEvent.setup();
  await edit(); set("Headline", "Another unsaved section");
  await user.click(screen.getByRole("button", { name: "Close editor and keep edits" }));
  await edit("Edit skills"); await user.click(screen.getByRole("checkbox", { name: "Python", exact: true }));
  await user.click(screen.getByRole("button", { name: "Close editor and keep edits" }));
  await user.click(screen.getByRole("link", { name: "BrightWay, go to Explore" })); await openProfile(); await ready();
  await edit("Edit skills"); expect(screen.getByRole("checkbox", { name: "Python", exact: true }).checked).toBe(true);
  await user.click(screen.getByRole("button", { name: "Cancel", exact: true }));
  await edit("Edit skills"); expect(screen.getByRole("checkbox", { name: "Python", exact: true }).checked).toBe(false);
  await user.click(screen.getByRole("button", { name: "Close editor and keep edits" }));
  await edit(); expect(screen.getByLabelText("Headline").value).toBe("Another unsaved section");
  expect(fetchMock.mock.calls.some(([, options]) => options?.method === "PATCH")).toBe(false);
});

const savedContact = { email: "tester@example.com", phoneNumber: "+231770000000", whatsappNumber: null, visibility: { email: "ONLY_ME", phone: "ONLY_ME", whatsapp: "ONLY_ME" } };
function contactServer() {
  let profile = { ...original, contact: savedContact }; const writes = [];
  mount((url, options) => {
    if (options?.method === "PATCH") {
      const body = JSON.parse(options.body); writes.push(body);
      const { contact, ...other } = body.changes;
      profile = { ...profile, ...other, version: profile.version + 1, contact: contact ? { ...profile.contact, ...contact, visibility: { ...profile.contact.visibility, ...contact.visibility } } : profile.contact };
    }
    return ok({ profile });
  });
  return writes;
}

it("edits separate contact fields and visibility, keeps account email readonly, and saves only contact changes", async () => {
  const writes = contactServer(); await ready(); const user = userEvent.setup();
  const section = screen.getByRole("heading", { name: "Contact", exact: true }).closest("section");
  expect(within(section).getAllByText("Only me")).toHaveLength(3);
  await edit("Edit contact");
  expect(screen.getByLabelText("Email", { exact: true }).readOnly).toBe(true);
  expect(screen.getByLabelText("Email", { exact: true }).value).toBe("tester@example.com");
  expect(screen.getByLabelText("WhatsApp number (optional)").value).toBe("");
  set("Phone number", "+231 77 111 1111");
  expect(screen.getByLabelText("WhatsApp number (optional)").value).toBe("");
  set("WhatsApp number (optional)", "+231 88 222 2222");
  await user.selectOptions(screen.getByLabelText("Who can see your email?"), "PUBLIC");
  await user.selectOptions(screen.getByLabelText("Who can see your phone number?"), "CONNECTIONS");
  await save(); await screen.findByText("Profile saved.");
  expect(writes).toEqual([{ expectedVersion: 1, changes: { contact: { phoneNumber: "+231771111111", whatsappNumber: "+231882222222", visibility: { email: "PUBLIC", phone: "CONNECTIONS" } } } }]);
  expect(within(section).getByText("+231771111111")).toBeTruthy();
  expect(within(section).getByText("Connections", { exact: true })).toBeTruthy();
});

it("validates contact format while permitting incomplete draft saves and optional WhatsApp clears", async () => {
  const writes = contactServer(); await ready(); await edit("Edit contact");
  set("Phone number", "0771111111"); await save();
  expect((await screen.findByRole("alert")).textContent).toContain("international number");
  expect(writes).toHaveLength(0);
  set("Phone number", ""); await save(); await screen.findByText("Profile saved.");
  expect(writes[0].changes).toEqual({ contact: { phoneNumber: null } });
  expect(screen.getByText("Add a phone number to complete your profile.")).toBeTruthy();
});

it("preserves unsaved contact edits through navigation and another section save, rebasing the next version", async () => {
  const writes = contactServer(); await ready(); const user = userEvent.setup();
  await edit("Edit contact"); set("Phone number", "+231771111111"); set("Who can see your phone number?", "CONNECTIONS");
  await user.click(screen.getByRole("button", { name: "Close editor and keep edits" }));
  await user.click(screen.getByRole("link", { name: "BrightWay, go to Explore" })); await openProfile(); await ready();
  await edit("Edit about"); set("About you", "A saved story"); await save(); await screen.findByText("Profile saved.");
  await edit("Edit contact"); expect(screen.getByLabelText("Phone number").value).toBe("+231771111111");
  expect(screen.getByLabelText("Who can see your phone number?").value).toBe("CONNECTIONS");
  await save(); await screen.findByText("Profile saved.");
  expect(writes[1]).toEqual({ expectedVersion: 2, changes: { contact: { phoneNumber: "+231771111111", visibility: { phone: "CONNECTIONS" } } } });
});

it("cancel restores saved contact values and visibility without sending changes", async () => {
  const writes = contactServer(); await ready(); const user = userEvent.setup();
  await edit("Edit contact"); set("Phone number", "+231771111111"); set("Who can see your email?", "PUBLIC");
  await user.click(screen.getByRole("button", { name: "Cancel", exact: true }));
  await edit("Edit contact"); expect(screen.getByLabelText("Phone number").value).toBe(savedContact.phoneNumber);
  expect(screen.getByLabelText("Who can see your email?").value).toBe("ONLY_ME"); expect(writes).toHaveLength(0);
});

it("a stale contact save retains the number and privacy choices without a retry overwrite", async () => {
  const fetchMock = mount((url, options) => options?.method === "PATCH" ? reply(409, { success: false, message: "Your profile changed." }) : ok({ profile: { ...original, contact: savedContact } }));
  await ready(); await edit("Edit contact"); set("Phone number", "+231771111111"); set("Who can see your email?", "PUBLIC"); await save();
  await screen.findByText("Your profile changed."); expect(screen.getByLabelText("Phone number").value).toBe("+231771111111");
  expect(screen.getByLabelText("Who can see your email?").value).toBe("PUBLIC"); expect(screen.getByRole("button", { name: "Save changes" }).disabled).toBe(true);
  expect(fetchMock.mock.calls.filter(([, options]) => options?.method === "PATCH")).toHaveLength(1);
});

it("offers Liberian counties and allows saving an incomplete draft after clearing the county", async () => {
  const fetchMock = mount((url, options) => options.method === "PATCH"
    ? ok({ profile: { ...original, version: 2, location: { ...original.location, region: null } } })
    : ok({ profile: original }));
  await ready(); await edit();
  const county = screen.getByRole("combobox", { name: "County" });
  expect(county.value).toBe("Montserrado");
  expect(county.options.length).toBe(16);
  expect(county.required).toBe(false);
  expect(screen.getByText(/Required for profile completion in Liberia/)).toBeTruthy();
  await userEvent.setup().selectOptions(county, "");
  await save();
  await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  const body = JSON.parse(fetchMock.mock.calls.find(([, options]) => options.method === "PATCH")[1].body);
  expect(body).toEqual({ expectedVersion: 1, changes: { location: { region: null } } });
});

it("makes region optional after a country change and sends explicit clears without deleting other location fields", async () => {
  const fetchMock = mount((url, options) => options.method === "PATCH"
    ? ok({ profile: { ...original, version: 2, location: { ...original.location, countryCode: "GH", region: null } } })
    : ok({ profile: original }));
  await ready(); await edit(); const user = userEvent.setup();
  await user.selectOptions(screen.getByLabelText("Country or territory"), "GH");
  expect(screen.queryByRole("combobox", { name: "County" })).toBeNull();
  const region = screen.getByLabelText("Region or state (optional)");
  expect(region.value).toBe("Montserrado");
  await user.clear(region); await save();
  await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  const body = JSON.parse(fetchMock.mock.calls.find(([, options]) => options.method === "PATCH")[1].body);
  expect(body.changes).toEqual({ location: { countryCode: "GH", region: null } });
});

it("keeps an unrecognized saved county until the user selects a replacement", async () => {
  const legacy = { ...original, location: { ...original.location, region: "Legacy location" } };
  const fetchMock = mount((url, options) => options.method === "PATCH"
    ? ok({ profile: { ...legacy, version: 2, location: { ...legacy.location, region: "River Cess" } } })
    : ok({ profile: legacy }));
  await ready(); await edit();
  const county = screen.getByRole("combobox", { name: "County" });
  expect(county.value).toBe("Legacy location");
  expect(screen.getByText(/Your previous value is kept until you change it/)).toBeTruthy();
  await userEvent.setup().selectOptions(county, "River Cess"); await save();
  await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  const body = JSON.parse(fetchMock.mock.calls.find(([, options]) => options.method === "PATCH")[1].body);
  expect(body.changes).toEqual({ location: { region: "River Cess" } });
});

it("edits self-reported certifications without modifying other profile fields", async () => {
  const certificate = {
    title: "Data Analytics Professional Certificate",
    issuer: "Training Center",
    issuedMonth: "2026-09",
    expiresMonth: null,
    credentialUrl: "https://example.org/certificate/123",
  };
  const stored = { ...original, certifications: [] };
  const fetchMock = mount((url, options) => {
    if (options?.method === "PATCH") {
      const { changes } = JSON.parse(options.body);
      return ok({ profile: { ...stored, ...changes, version: 2 } });
    }
    return ok({ profile: stored });
  });
  await ready();
  const user = userEvent.setup();
  await user.click(screen.getByRole("tab", { name: "Achievements" }));
  await user.click(screen.getByRole("button", { name: "Edit licenses and certifications" }));
  await user.click(screen.getByRole("button", { name: "Add certification" }));
  await user.type(screen.getByLabelText("Certification name"), certificate.title);
  await user.type(screen.getByLabelText("Issuing organization"), certificate.issuer);
  fireEvent.change(screen.getByLabelText("Issued (month)"), { target: { value: certificate.issuedMonth } });
  await user.type(screen.getByLabelText("Credential URL (optional)"), certificate.credentialUrl);
  await save();
  await screen.findByText("Profile saved.");
  const payload = JSON.parse(fetchMock.mock.calls.find(([, options]) => options?.method === "PATCH")[1].body);
  expect(payload).toEqual({ expectedVersion: 1, changes: { certifications: [certificate] } });
  expect(screen.getByText(certificate.title)).toBeTruthy();
  expect(screen.getByText("Self-reported · Not BrightWay verified")).toBeTruthy();
});
