import { dashboardFixture } from "./fixtures/organization-dashboard";
import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { expect, it, vi } from "vitest";
import { AuthContext } from "../auth/auth-context";
import AppLayout from "../layouts/AppLayout";
import OrganizationWorkspacePage from "../pages/OrganizationWorkspacePage";
import MemberPostsPage from "../pages/MemberPostsPage";
import ExplorePage from "../pages/ExplorePage";
import WorkPage from "../pages/WorkPage";
import OrganizationRequestsPage from "../pages/OrganizationRequestsPage";
import CredentialReviewsPage from "../pages/CredentialReviewsPage";
const id = "843f9b44-7e5a-4ecb-9e62-1bc1c0844d59", base = `/organization-workspace/${id}`;
const MANAGE = "organization.members.manage", REVIEW = "organization.credentials.education.review";
const organization = { id, name: "Verified Test School", type: "SCHOOL", offersTraining: true };
const available = [
  { key: "profile", label: "Profile", icon: "work", shortLabel: "Profile", to: base + "/profile" },
  { key: "dashboard", label: "Dashboard", icon: "explore", shortLabel: "Dashboard", to: base },
  { key: "staff", label: "Staff", icon: "network", shortLabel: "Staff", to: base + "/staff", sensitive: true },
  { key: "credentials", label: "Credential Review", icon: "learning", shortLabel: "Reviews", to: base + "/credentials", sensitive: true },
];
const postsTool = { key: "posts", label: "Posts", icon: "post", shortLabel: "Posts", to: base + "/posts", sensitive: true };
available.push(postsTool);
const planned = [{ key: "opportunities", label: "Opportunities", sprint: 6 }, { key: "applications", label: "Applications", sprint: 6 }, { key: "programs", label: "Programs", sprint: 7 }, { key: "admissions", label: "Admissions", sprint: 7 }];
const context = { accountId: "owner", organization, permissions: [MANAGE, REVIEW, "organization.posts.publish"], membership: { role: "PRIMARY_ADMIN", version: 1 }, permissionCatalog: [{ key: MANAGE, label: "Manage staff" }, { key: REVIEW, label: "Review education credentials" }], staffVersion: 1, workspace: { available, planned, campusActive: false, campusSetup: { label: "Build Campus", to: base + "/campus", status: "COMING_SOON" } } };
const profile = { version: 1, photo: null, location: {}, skills: [], interests: [] };
const reply = (data, status = 200) => new Response(JSON.stringify(status < 400 ? { success: true, data } : { success: false, message: data }), { status, headers: { "Content-Type": "application/json" } });
function mount(path = base, handler = () => reply(context)) {
  const fetch = vi.fn((url, options) => url.endsWith("/profile/me") ? reply({ profile }) : url.includes("/dashboard?") ? reply(dashboardFixture(id, Number(new URL(url, "http://localhost").searchParams.get("days")), "permission_required")) : handler(url, options)); vi.stubGlobal("fetch", fetch);
  render(<AuthContext.Provider value={{ account: { id: "owner", username: "owner", person: { firstName: "Test", lastName: "Owner" } } }}><MemoryRouter initialEntries={[path]}><Routes><Route element={<AppLayout />}>
    <Route path="/work" element={<WorkPage />} />
    <Route path="/organizations/new" element={<OrganizationRequestsPage />} />
    <Route path="/organization-workspace/:id" element={<OrganizationWorkspacePage />} />
    <Route path="/organization-workspace/:id/profile" element={<OrganizationWorkspacePage section="profile" />} />
    <Route path="/organization-workspace/:id/campus" element={<OrganizationWorkspacePage section="campus" />} />
    <Route path="/organization-workspace/:id/posts" element={<OrganizationWorkspacePage section="posts" />} />
    <Route path="/organization-workspace/:id/staff" element={<OrganizationWorkspacePage section="staff" />} />
    <Route path="/organization-workspace/:organizationId/credentials" element={<CredentialReviewsPage />} />
    <Route path="/explore" element={<ExplorePage />} />
    <Route path="/posts" element={<MemberPostsPage />} />
    <Route path="/security" element={<h1>Account security destination</h1>} />
  </Route></Routes></MemoryRouter></AuthContext.Provider>);
  return { fetch, user: userEvent.setup() };
}
it("an approved organization in My Workspace opens its private administrator workspace instead of the public profile", async () => {
  const f = mount("/work", url => url.includes("/my-workspace") ? reply({ tab: "approved", search: "", counts: { approved: 1, pending: 0, invitations: 0, history: 0 }, items: [{ ...organization, role: "PRIMARY_ADMIN" }] }) : reply(context));
  const entry = await screen.findByRole("link", { name: "Manage" }); expect(entry.getAttribute("href")).toBe(base);
  await f.user.click(entry); expect(screen.queryByRole("heading", { name: "Switch account" })).toBeNull(); await screen.findByRole("heading", { name: organization.name, level: 1 });
  await screen.findByRole("navigation", { name: "Organization tools" });
  expect(document.querySelector(".bw-design-personal").textContent).toContain(organization.name);
  expect(f.fetch.mock.calls.some(([url]) => url.endsWith("/staff"))).toBe(false);
});
it("desktop and mobile organization navigation expose scoped operational tools without personal destinations", async () => {
  mount(); await screen.findByRole("heading", { name: organization.name, level: 1 });
  const nav = await screen.findByRole("navigation", { name: "Organization tools" });
  expect(within(nav).getByRole("link", { name: "Staff" }).getAttribute("href")).toBe(base + "/staff");
  expect(within(nav).queryByRole("link", { name: "Explore" })).toBeNull();
  const mobile = screen.getByRole("navigation", { name: "Mobile organization navigation" });
  expect(within(mobile).getByRole("link", { name: "Reviews" }).getAttribute("href")).toBe(base + "/credentials");
  expect(within(mobile).getByRole("link", { name: "Dashboard" }).getAttribute("aria-current")).toBe("page");
  expect(within(mobile).getByRole("link", { name: "Posts" }).getAttribute("href")).toBe(base + "/posts");
});
it("the organization sidebar keeps working links separate from the disabled planned tools", async () => {
  mount(); await screen.findByRole("heading", { name: "Dashboard", level: 2 });
  const nav = screen.getByRole("navigation", { name: "Organization tools" });
  expect(within(nav).getAllByRole("link").map(link => link.textContent)).toEqual(["Profile", "Dashboard", "Staff", "Credential Review", "Posts"]);
  const future = screen.getByRole("navigation", { name: "Planned organization tools" });
  expect(within(future).getAllByRole("button").map(button => button.getAttribute("aria-label"))).toEqual(["Opportunities — Coming soon", "Applications — Coming soon", "Programs — Coming soon", "Admissions — Coming soon"]);
  expect(within(future).getAllByRole("button").every(button => button.disabled)).toBe(true); expect(within(future).queryByRole("link")).toBeNull();
  expect(screen.queryByRole("heading", { name: "Planned workspace tools" })).toBeNull();
  expect(screen.queryByRole("heading", { name: "Posts" })).toBeNull();
  expect(screen.queryByRole("button", { name: /activate campus/i })).toBeNull();
});
it("staff management is a dedicated scoped destination and revoked permission clears private rows and navigation", async () => {
  let revoked = false;
  const f = mount(base + "/staff", url => url.endsWith("/staff") ? reply({ staffVersion: 1, members: [{ id: "member", username: "private_staff", fullName: "Private Staff Member", role: "STAFF", version: 1, enabled: true, permissions: [] }], invitations: [] }) : reply(revoked ? { ...context, permissions: [], workspace: { available: available.slice(0, 2), planned: [], campusActive: false } } : context));
  await screen.findByText("Private Staff Member"); revoked = true; act(() => window.dispatchEvent(new Event("focus")));
  await screen.findByRole("alert"); expect(screen.queryByText("Private Staff Member")).toBeNull();
  const nav = screen.getByRole("navigation", { name: "Organization tools" }); expect(within(nav).queryByRole("link", { name: "Staff" })).toBeNull(); expect(f.fetch).toHaveBeenCalled(); expect(screen.queryByRole("navigation", { name: "Planned organization tools" })).toBeNull();
});
it("a direct issuer review URL keeps the organization tools available and links back to staff management", async () => {
  const f = mount(base + "/credentials", url => url.includes("/credential-reviews") ? reply({ reviews: [], nextCursor: null, organization, workspace: context.workspace }) : url.endsWith("/staff") ? reply({ staffVersion: 1, members: [], invitations: [] }) : reply(context));
  await screen.findByRole("heading", { name: "Credential Review", level: 1 });
  const nav = screen.getByRole("navigation", { name: "Organization tools" }); await f.user.click(within(nav).getByRole("link", { name: "Staff" }));
  const invite = await screen.findByRole("button", { name: "Invite staff", exact: true }); await waitFor(() => expect(invite.disabled).toBe(false)); await f.user.click(invite);
  await screen.findByLabelText("BrightWay username"); expect(document.querySelector(".bw-design-personal").textContent).toContain(organization.name);
});
it("denied organization membership cannot leave another organization's tools or name in the workspace", async () => {
  mount(base, () => reply("Organization membership required", 403)); await screen.findByRole("alert");
  expect(screen.queryByRole("heading", { name: organization.name })).toBeNull();
  expect(within(screen.getByRole("navigation", { name: "Organization tools" })).queryByRole("link")).toBeNull();
});
it("a publishing-only member sees their available scope and no staff, review or school-management tools", async () => {
  const f = mount(base, () => reply({ ...context, membership: { role: "STAFF" }, permissions: ["organization.posts.publish"], workspace: { available: [...available.slice(0, 2), postsTool], planned: [], campusActive: false } }));
  await screen.findByRole("heading", { name: organization.name, level: 1 });
  const nav = screen.getByRole("navigation", { name: "Organization tools" }); expect(within(nav).queryByRole("link", { name: "Staff" })).toBeNull(); expect(within(nav).queryByRole("link", { name: "Credential Review" })).toBeNull();
  expect(screen.queryByRole("heading", { name: "Admissions" })).toBeNull();
  expect(screen.queryByRole("navigation", { name: "Planned organization tools" })).toBeNull();
  expect(within(nav).getByRole("link", { name: "Posts" }).getAttribute("href")).toBe(base + "/posts");
  const mobile = screen.getByRole("navigation", { name: "Mobile organization navigation" }); expect(within(mobile).getAllByRole("link")).toHaveLength(4);
  await screen.findByRole("heading", { name: "Analytics access is limited" });
  expect(screen.queryByRole("link", { name: "Open Staff" })).toBeNull();
  expect(screen.queryByRole("link", { name: "Open Credential Review" })).toBeNull();
  expect(screen.getByText("Staff member")).toBeTruthy();
  expect(screen.queryByRole("heading", { name: "Posts" })).toBeNull();
  expect(f.fetch.mock.calls.some(([url]) => /\/staff$|\/credential-reviews/.test(url))).toBe(false);
});

it("a publisher can retry a failed organization post and withdraw it from the workspace", async () => {
  let requestKey;
  const body = "The workshop opens Monday.";
  const f = mount(base + "/posts", (url, options) => {
    if (url.endsWith("/posts") && options?.method === "POST") {
      const draft = JSON.parse(options.body);
      expect(draft.body).toBe(body);
      expect(draft).not.toHaveProperty("type");
      expect(draft).not.toHaveProperty("tags");
      if (!requestKey) { requestKey = draft.requestKey; return reply("Try again shortly.", 503); }
      expect(draft.requestKey).toBe(requestKey);
      return reply({ post: { id: "new-post", organization, body, createdAt: "2026-11-05T09:00:00Z" } }, 201);
    }
    if (url.endsWith("/posts/new-post") && options?.method === "DELETE") return reply({ id: "new-post" });
    if (url.endsWith("/posts")) return reply({ items: [], nextCursor: null });
    return reply(context);
  });
  await screen.findByText("Your organization has no published posts yet.");
  expect(screen.queryByRole("group", { name: "Post type" })).toBeNull();
  expect(screen.queryByRole("textbox", { name: "Topic tags" })).toBeNull();
  const field = screen.getByRole("textbox", { name: "Write an organization post" });
  await f.user.type(field, body);
  const publish = screen.getByRole("button", { name: "Publish post" });
  await f.user.click(publish);
  await screen.findByText("Try again shortly.");
  expect(field.value).toBe(body);
  await f.user.click(publish);
  await screen.findByText("Post published.");
  expect(screen.getByText(body)).toBeTruthy();
  expect(field.value).toBe("");
  await f.user.click(screen.getByRole("button", { name: "Withdraw post" }));
  await f.user.click(screen.getByRole("button", { name: "Confirm withdrawal" }));
  await screen.findByText("Post withdrawn.");
  expect(screen.queryByText(body)).toBeNull();
});

it("Explore separates recent posts from posts by organizations the viewer follows", async () => {
  const body = "Registration opens today.";
  const f = mount("/explore", url => {
    if (url.endsWith("/explore/posts?view=for-you")) return reply({
      items: [{ id: "recent-post", organization, body, createdAt: "2026-11-05T09:00:00Z" }],
      nextCursor: null,
    });
    if (url.endsWith("/explore/posts?view=following")) return reply({ items: [], nextCursor: null });
    return reply(context);
  });
  await screen.findByText(body);
  const following = screen.getByRole("button", { name: "Following", exact: true });
  await f.user.click(following);
  expect(following.getAttribute("aria-pressed")).toBe("true");
  await screen.findByText("Posts from people and organizations you follow will appear here.");
  expect(screen.queryByText(body)).toBeNull();
});

it("Explore updates likes in place and removes only the post that becomes unavailable", async () => {
  const id = "shared-post-id";
  const createdAt = "2026-11-05T10:00:00Z";
  const reaction = { liked: false, count: 0 };
  const f = mount("/explore", (url, options) => {
    if (url.includes("/explore/posts?")) return reply({
      items: [
        { id, organization, body: "Registration opens today.", createdAt, reaction },
        { id, member: { name: "Test Member", username: "member" }, body: "A member update.", createdAt, reaction },
      ],
      nextCursor: null,
    });
    if (url.endsWith("/explore/posts/organization/" + id + "/like")) {
      expect(options.method).toBe("PUT");
      const { liked } = JSON.parse(options.body);
      return reply({ reaction: { liked, count: liked ? 1 : 0 } });
    }
    if (url.endsWith("/explore/posts/member/" + id + "/like")) return reply("This post is no longer available.", 404);
    return reply(context);
  });
  const cards = await screen.findAllByRole("article");
  const organizationLike = within(cards[0]).getByRole("button", { name: "Like", pressed: false });
  const memberLike = within(cards[1]).getByRole("button", { name: "Like", pressed: false });
  await f.user.click(organizationLike);
  await within(cards[0]).findByText("1 like");
  expect(organizationLike.getAttribute("aria-pressed")).toBe("true");
  expect(memberLike.getAttribute("aria-pressed")).toBe("false");
  await f.user.click(organizationLike);
  await waitFor(() => expect(organizationLike.getAttribute("aria-pressed")).toBe("false"));
  await f.user.click(memberLike);
  await screen.findByText("This post is no longer available.");
  expect(screen.queryByText("A member update.")).toBeNull();
  expect(screen.getByText("Registration opens today.")).toBeTruthy();
  expect(f.fetch.mock.calls.filter(([url]) => url.includes("/explore/posts?"))).toHaveLength(1);
});

it("Explore saves a post privately and removes it from Saved without reloading that view", async () => {
  const id = "organization-post", body = "Applications are open.";
  let saved = false;
  const post = () => ({ id, body, organization, createdAt: "2026-11-06T10:00:00Z", reaction: { liked: false, count: 0 }, saved });
  const f = mount("/explore", (url, options) => {
    if (url.endsWith("/explore/posts?view=for-you")) return reply({ items: [post()], nextCursor: null });
    if (url.endsWith("/explore/posts?view=saved")) return reply({ items: saved ? [post()] : [], nextCursor: null });
    if (url.endsWith("/explore/posts/organization/" + id + "/save")) {
      expect(options.method).toBe("PUT");
      saved = JSON.parse(options.body).saved;
      return reply({ saved });
    }
    return reply(context);
  });
  await f.user.click(await screen.findByRole("button", { name: "Save post", pressed: false }));
  await screen.findByRole("button", { name: "Save post", pressed: true });
  expect(f.fetch.mock.calls.filter(([url]) => url.endsWith("/explore/posts?view=for-you"))).toHaveLength(1);
  await f.user.click(screen.getByRole("button", { name: "Saved", exact: true }));
  await screen.findByText(body);
  await f.user.click(screen.getByRole("button", { name: "Save post", pressed: true }));
  await screen.findByText("Save a post to find it here later.");
  expect(screen.queryByText(body)).toBeNull();
  expect(f.fetch.mock.calls.filter(([url]) => url.endsWith("/explore/posts?view=saved"))).toHaveLength(1);
});

it("Explore attributes reposts and undo removes only the repost card", async () => {
  const id = "organization-post", body = "Apply for the workshop.";
  const createdAt = "2026-11-06T10:00:00Z";
  const original = { id, organization, body, createdAt, saved: false, reposted: false, reaction: { liked: false, count: 0 } };
  let denied = true;
  const f = mount("/explore", (url, options) => {
    if (url.endsWith("/explore/posts?view=for-you")) return reply({ items: [original], nextCursor: null });
    if (url.endsWith("/explore/posts/organization/" + id + "/repost")) {
      expect(options.method).toBe("PUT");
      if (denied) return reply("Verify your identity before reposting.", 403);
      const { reposted } = JSON.parse(options.body);
      return reply(reposted ? {
        reposted, repost: { id: "repost", createdAt, member: { username: "owner", name: "Test Owner" }, mine: true },
      } : { reposted });
    }
    return reply(context);
  });
  const action = await screen.findByRole("button", { name: "Repost", exact: true });
  await f.user.click(action);
  await screen.findByRole("alert");
  expect(screen.getByText(body)).toBeTruthy();
  denied = false;
  await f.user.click(action);
  await screen.findByRole("link", { name: "You" });
  const cards = screen.getAllByRole("article");
  expect(cards).toHaveLength(2);
  await f.user.click(within(cards[0]).getByRole("button", { name: "Undo repost" }));
  await waitFor(() => expect(screen.getAllByRole("article")).toHaveLength(1));
  expect(screen.getByText(body)).toBeTruthy();
  expect(screen.getByRole("button", { name: "Repost", exact: true })).toBeTruthy();
  expect(f.fetch.mock.calls.filter(([url]) => url.endsWith("/explore/posts?view=for-you"))).toHaveLength(1);
});

it("Explore loads comments on demand and retries a draft without refreshing the feed", async () => {
  const id = "organization-post";
  const createdAt = "2026-11-06T10:00:00Z";
  const commentBody = "May I bring my project team?";
  let firstKey;
  const f = mount("/explore", (url, options) => {
    if (url.includes("/explore/posts?")) return reply({
      items: [{ id, organization, body: "Register for the workshop.", createdAt }], nextCursor: null,
    });
    if (url.endsWith("/comments/own-comment") && options.method === "DELETE") return reply({ id: "own-comment" });
    if (url.endsWith("/comments") && options.method === "POST") {
      const draft = JSON.parse(options.body);
      expect(draft.body).toBe(commentBody);
      if (!firstKey) {
        firstKey = draft.requestKey;
        return reply("Try again shortly.", 503);
      }
      expect(draft.requestKey).toBe(firstKey);
      return reply({ comment: { id: "own-comment", body: commentBody, username: "owner", createdAt, canDelete: true } });
    }
    if (url.endsWith("/comments")) return reply({
      items: [{ id: "other-comment", body: "I signed up.", username: "other", createdAt, canDelete: false }], nextCursor: null,
    });
    return reply(context);
  });
  const toggle = await screen.findByRole("button", { name: "Comments" });
  expect(f.fetch.mock.calls.some(([url]) => url.endsWith("/comments"))).toBe(false);
  await f.user.click(toggle);
  await screen.findByText("I signed up.");
  expect(screen.queryByRole("button", { name: "Delete comment" })).toBeNull();
  const field = screen.getByRole("textbox", { name: "Write a comment" });
  await f.user.type(field, commentBody);
  const send = screen.getByRole("button", { name: "Post comment" });
  await f.user.click(send);
  await screen.findByText("Try again shortly.");
  expect(field.value).toBe(commentBody);
  await f.user.click(send);
  await screen.findByText(commentBody);
  expect(field.value).toBe("");
  await f.user.click(screen.getByRole("button", { name: "Delete comment" }));
  await f.user.click(screen.getByRole("button", { name: "Confirm deletion" }));
  await waitFor(() => expect(screen.queryByText(commentBody)).toBeNull());
  expect(screen.getByText("I signed up.")).toBeTruthy();
  expect(f.fetch.mock.calls.filter(([url]) => url.includes("/explore/posts?"))).toHaveLength(1);
});

it("the personal Post destination checks verification and lets authors withdraw after unpublishing their profile", async () => {
  let verified = false, published = true;
  const body = "Join our research showcase on November 12 at 10 a.m. in the campus library.";
  const post = { id: "personal-post", body, type: "EVENT", tags: ["Research"], createdAt: "2026-11-05T10:00:00Z", member: { username: "owner", name: "Test Owner" } };
  const f = mount("/explore", (url, options) => {
    if (url.includes("/explore/posts?")) return reply({ items: [], nextCursor: null });
    if (url.endsWith("/posts/me") && options?.method === "POST") {
      expect(JSON.parse(options.body)).toMatchObject({ body, type: "EVENT", tags: ["Research"] });
      return reply({ post }, 201);
    }
    if (url.endsWith("/posts/me/personal-post") && options?.method === "DELETE") return reply({ id: post.id });
    if (url.endsWith("/posts/me")) return reply({
      items: published ? [] : [post], nextCursor: null,
      access: { identityVerified: verified, profilePublic: published },
    });
    return reply(context);
  });
  await f.user.click(screen.getByRole("link", { name: "View my posts" }));
  expect((await screen.findByRole("link", { name: "Verify your identity" })).getAttribute("href")).toBe("/manual-identity");
  expect(screen.queryByRole("button", { name: "Create an Event" })).toBeNull();
  verified = true;
  const refresh = screen.getByRole("button", { name: "Refresh posts" });
  await f.user.click(refresh);
  await f.user.click(await screen.findByRole("button", { name: "Create an Event" }));
  await f.user.type(screen.getByRole("textbox", { name: "Write an event" }), body);
  const publish = screen.getByRole("button", { name: "Publish event" });
  expect(publish.disabled).toBe(true);
  await f.user.type(screen.getByRole("textbox", { name: "Topic tags" }), "Research{Enter}");
  await f.user.click(publish);
  await screen.findByText("Event published.");
  expect(screen.getByRole("link", { name: "Test Owner" }).getAttribute("href")).toBe("/people/owner");
  expect(within(screen.getByRole("article")).getByText("Event", { exact: true })).toBeTruthy();
  expect(within(screen.getByRole("list", { name: "Topic tags" })).getByText("Research")).toBeTruthy();
  published = false;
  await f.user.click(refresh);
  await screen.findByRole("link", { name: "Publish your public profile" });
  expect(screen.queryByRole("button", { name: "Create an Event" })).toBeNull();
  await f.user.click(screen.getByRole("button", { name: "Withdraw post" }));
  await f.user.click(screen.getByRole("button", { name: "Confirm withdrawal" }));
  await screen.findByText("Post withdrawn.");
  expect(screen.queryByText(body)).toBeNull();
});

it("Dashboard refresh cannot duplicate a pending read and clears analytics when membership is revoked", async () => {
  let refresh = false, release;
  const pending = new Promise(resolve => { release = resolve; });
  const f = mount(base, url => url.endsWith(base) && refresh ? pending : reply(context));
  await screen.findByRole("heading", { name: "Analytics access is limited" });
  refresh = true;
  const button = screen.getByRole("button", { name: "Reload account workspace" });
  await f.user.click(button); await f.user.click(button);
  expect(button.disabled).toBe(true);
  expect(f.fetch.mock.calls.filter(([url]) => url.endsWith(base))).toHaveLength(2);
  await act(async () => release(reply("Active organization membership is required.", 403)));
  await screen.findByRole("alert");
  expect(screen.queryByRole("heading", { name: "Analytics access is limited" })).toBeNull();
  expect(screen.queryByRole("heading", { name: organization.name })).toBeNull();
  expect(button.disabled).toBe(false);
});
it("a direct staff URL never exposes staff controls to a member without staff-management permission", async () => {
  const limited = { ...context, membership: { role: "STAFF" }, permissions: ["organization.posts.publish"], workspace: { available: [...available.slice(0, 2), postsTool], planned: [], campusActive: false } };
  const f = mount(base + "/staff", url => url.endsWith("/staff") ? reply({ staffVersion: 1, members: [{ id: "private", username: "private_staff" }], invitations: [] }) : reply(limited));
  await screen.findByRole("heading", { name: "This tool is not available to your role" });
  expect(screen.queryByText("Private Staff Member")).toBeNull();
  expect(screen.queryByLabelText("BrightWay username")).toBeNull();
  expect(f.fetch.mock.calls.some(([url]) => url.endsWith("/staff"))).toBe(false);
  expect(screen.getByRole("link", { name: "Return to your workspace" }).getAttribute("href")).toBe(base);
});

it("direct organization entry shows workspace loading rather than an account picker", async () => {
  let release; const pending = new Promise(resolve => { release = resolve; });
  mount(base, url => url.endsWith(base) ? pending : reply({}));
  await screen.findByRole("heading", { name: "Organization workspace", level: 1 });
  expect(screen.queryByRole("heading", { name: "Switch account" })).toBeNull();
  await act(async () => release(reply(context)));
  await screen.findByRole("heading", { name: organization.name, level: 1 });
});

it("Build Campus is a separate sidebar block and opens an informational overview without activation", async () => {
  const f = mount(); await screen.findByRole("heading", { name: organization.name, level: 1 });
  const sidebar = screen.getByRole("complementary", { name: "Organization navigation" });
  const entry = within(sidebar).getByRole("link", { name: "Build Campus" });
  expect(within(screen.getByRole("navigation", { name: "Organization tools" })).queryByRole("link", { name: "Build Campus" })).toBeNull();
  expect(entry.getAttribute("href")).toBe(base + "/campus"); await f.user.click(entry);
  await screen.findByRole("heading", { name: "Build Campus" });
  expect(screen.getByText("Campus setup is not available yet.")).toBeTruthy();
  expect(screen.queryByRole("button", { name: /activate|pay|submit/i })).toBeNull();
  expect(f.fetch.mock.calls.some(([, options]) => options?.method && options.method !== "GET")).toBe(false);
});
it("Campus overview rejects ordinary members and non-training company administrators", async () => {
  const limited = { ...context, organization: { ...organization, type: "COMPANY", offersTraining: false }, workspace: { available: available.slice(0, 2), planned: [], campusActive: false, campusSetup: null } };
  mount(base + "/campus", () => reply(limited));
  await screen.findByRole("heading", { name: "This tool is not available to your role" });
  expect(screen.queryByRole("heading", { name: "Build Campus" })).toBeNull();
  expect(within(screen.getByRole("complementary", { name: "Organization navigation" })).queryByRole("link", { name: "Build Campus" })).toBeNull();
});
it("ordinary school staff cannot open the Campus administrator overview through a copied URL", async () => {
  mount(base + "/campus", () => reply({ ...context, membership: { role: "STAFF" }, workspace: { available: available.slice(0, 2), planned: [], campusActive: false, campusSetup: null } }));
  await screen.findByRole("heading", { name: "This tool is not available to your role" });
  expect(screen.queryByRole("heading", { name: "Build Campus" })).toBeNull();
  expect(within(screen.getByRole("complementary", { name: "Organization navigation" })).queryByRole("link", { name: "Build Campus" })).toBeNull();
});
it("Profile opens inside the organization workspace with verified details and the existing operating location", async () => {
  const f = mount(base, url => url.endsWith(`/organizations/${id}`) ? reply({ ...organization, verified: true, locations: [{ countryCode: "GH", city: "Accra", region: "Greater Accra", address: "Approved address", primary: true }] }) : reply(context));
  await screen.findByRole("heading", { name: "Dashboard", level: 2 });
  const nav = screen.getByRole("navigation", { name: "Organization tools" });
  const profile = within(nav).getByRole("link", { name: "Profile", exact: true }); expect(profile.getAttribute("href")).toBe(base + "/profile"); expect(profile.getAttribute("target")).toBeNull();
  await f.user.click(profile); await screen.findByRole("heading", { name: "Operating locations" });
  const page = screen.getByRole("region", { name: "Organization profile" });
  expect(within(page).getByRole("heading", { level: 1, name: organization.name })).toBeTruthy();
  expect(within(page).queryByRole("heading", { name: "Profile", exact: true })).toBeNull();
  for (const name of ["Personal account", "Back to My Workspace", "Account security"]) expect(within(page).queryByRole("link", { name, exact: true })).toBeNull();
  expect(within(page).queryByRole("link", { name: "View public profile" })).toBeNull();
  expect(within(page).getByRole("button", { name: "Edit Profile" })).toBeTruthy();
  expect(within(page).getByRole("button", { name: "Reload organization profile" })).toBeTruthy();
  expect(within(page).queryByRole("button", { name: "Reload account workspace" })).toBeNull();
  const contexts = screen.getByRole("navigation", { name: "Account contexts" });
  expect(within(contexts).getByRole("link", { name: "My Workspace" }).getAttribute("href")).toBe("/work");
  expect(within(contexts).getByRole("link", { name: "Return to Personal" }).getAttribute("href")).toBe("/explore");
  expect(screen.getByLabelText("Verified organization")).toBeTruthy();
  expect(screen.getByText("Approved address, Accra, Greater Accra, Ghana")).toBeTruthy();
  expect(within(screen.getByRole("navigation", { name: "Organization tools" })).getByRole("link", { name: "Profile", exact: true }).getAttribute("aria-current")).toBe("page");
  const call = f.fetch.mock.calls.find(([url]) => url.endsWith(`/organizations/${id}`)); expect(call[1].credentials).toBe("include");
  await f.user.click(screen.getByRole("button", { name: "Open account menu" }));
  await f.user.click(screen.getByRole("button", { name: "Account security", exact: true }));
  await screen.findByRole("heading", { name: "Account security destination" });
});
it("a denied organization context cannot load the internal Profile or leave another organization's details visible", async () => {
  const f = mount(base + "/profile", () => reply("Membership required", 403)); await screen.findByRole("alert");
  expect(screen.queryByRole("heading", { name: "Operating locations" })).toBeNull();
  expect(f.fetch.mock.calls.some(([url]) => url.endsWith(`/organizations/${id}`))).toBe(false);
});
it("a mismatched public-profile response cannot populate the selected organization profile", async () => {
  mount(base + "/profile", url => url.endsWith(`/organizations/${id}`) ? reply({ id: "foreign", name: "Foreign organization", locations: [] }) : reply(context));
  await screen.findByRole("alert"); expect(screen.queryByRole("heading", { name: "Foreign organization" })).toBeNull();
});

it("Dashboard attention links open a server-filtered issuer queue and keep that filter on reload", async () => {
  const f = mount(base + "/credentials?filter=unassigned", url => url.includes("/credential-reviews") ? reply({ reviews: [], nextCursor: null, organization, workspace: context.workspace }) : reply(context));
  await screen.findByText("Showing: Unassigned submissions.");
  await screen.findByText("No credential submissions match this view.");
  expect(f.fetch.mock.calls.some(([url]) => url.endsWith("/credential-reviews?filter=unassigned"))).toBe(true);
  await f.user.click(screen.getByRole("button", { name: "Reload reviews" }));
  expect(f.fetch.mock.calls.filter(([url]) => url.endsWith("/credential-reviews?filter=unassigned")).length).toBeGreaterThan(1);
  await f.user.click(screen.getByRole("button", { name: "Clear review filter" }));
  expect(screen.queryByText("Showing: Unassigned submissions.")).toBeNull();
  expect(f.fetch.mock.calls.some(([url]) => url.endsWith("/credential-reviews"))).toBe(true);
});

it("the organization menu exposes planned tools while the mobile navigation includes only available destinations", async () => {
  const f = mount(); await screen.findByRole("navigation", { name: "Planned organization tools" });
  const toggle = screen.getByRole("button", { name: "Toggle navigation" }); await f.user.click(toggle);
  expect(toggle.getAttribute("aria-expanded")).toBe("true"); expect(screen.getByRole("complementary", { name: "Organization navigation" }).classList.contains("bw-design-sidebar-open")).toBe(true);
  await f.user.keyboard("{Escape}"); expect(toggle.getAttribute("aria-expanded")).toBe("false"); expect(document.activeElement).toBe(toggle);
  await f.user.click(toggle); await f.user.click(within(screen.getByRole("navigation", { name: "Organization tools" })).getByRole("link", { name: "Dashboard" }));
  expect(toggle.getAttribute("aria-expanded")).toBe("false");
  const mobile = screen.getByRole("navigation", { name: "Mobile organization navigation" });
  expect(within(mobile).getAllByRole("link")).toHaveLength(6); expect(within(mobile).queryByRole("button", { name: /Coming soon/ })).toBeNull();
});

it("keeps the same organization navigation mounted while switching tabs and clears it only on confirmed access loss", async () => {
  let hold = false, release;
  const f = mount(base, url => {
    if (url.endsWith('/work/access')) return reply({ hasWork: true });
    if (hold) return new Promise(resolve => { release = resolve; });
    return reply(context);
  });
  await screen.findByRole("heading", { name: "Dashboard", level: 2 });
  const nav = screen.getByRole("navigation", { name: "Organization tools" });
  hold = true;
  await f.user.click(within(nav).getByRole("link", { name: "Staff" }));
  await waitFor(() => expect(release).toBeTypeOf("function"));
  expect(nav.isConnected).toBe(true);
  expect(within(nav).getAllByRole("link")).toHaveLength(5);
  expect(within(nav).getByRole("link", { name: "Staff" }).getAttribute("aria-current")).toBe("page");
  expect(screen.queryByText("Organization access is checked before tools are shown.")).toBeNull();
  await act(async () => release(reply(context)));
  // The subsequent staff read must also leave navigation intact while pending.
  expect(within(nav).getAllByRole("link")).toHaveLength(5);
  await act(async () => release(reply({ members: [], invitations: [], staffVersion: 1 })));
  await f.user.click(within(nav).getByRole("link", { name: "Credential Review" }));
  await waitFor(() => expect(f.fetch.mock.calls.some(([url]) => url.includes("credential-reviews"))).toBe(true));
  expect(within(nav).getAllByRole("link")).toHaveLength(5);
  await act(async () => release(reply("Organization access revoked", 403)));
  await screen.findByRole("alert");
  expect(within(nav).queryByRole("link", { name: "Staff" })).toBeNull();
});

it("leaving an organization hides its navigation and name in the real account layout", async () => {
  const f = mount(); await screen.findByRole("heading", { name: "Dashboard", level: 2 });
  await f.user.click(within(screen.getByRole("navigation", { name: "Account contexts" })).getByRole("link", { name: "Return to Personal" }));
  await screen.findByRole("region", { name: "Explore" });
  expect(screen.queryByRole("navigation", { name: "Organization tools" })).toBeNull();
  expect(screen.queryByRole("navigation", { name: "Mobile organization navigation" })).toBeNull();
  expect(document.querySelector(".bw-design-personal").textContent).not.toContain(organization.name);
});
