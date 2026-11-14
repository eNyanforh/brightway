import { render, screen, within, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { expect, it, vi } from "vitest";
import ChallengeCollaboratorPicker from "../components/opportunities/ChallengeCollaboratorPicker";
import ChallengeCollaborationInvites from "../components/opportunities/ChallengeCollaborationInvites";
import ChallengeCoHosts from "../components/opportunities/ChallengeCoHosts";

const owner = "22222222-2222-4222-8222-222222222222";
const partnerId = "99999999-9999-4999-8999-999999999999";
const oppId = "33333333-3333-4333-8333-333333333333";
const partner = { id: partnerId, name: "Research Academy", username: "research_academy",
  profilePhotoId: "photo-academy", verifiedAt: "2026-11-01T12:00:00Z" };
const host = { id: owner, name: "BrightWay Institute", username: "brightway_institute",
  profilePhotoId: "photo-host", verifiedAt: "2026-11-01T12:00:00Z" };
const reply = data => Promise.resolve(new Response(JSON.stringify({ success: true, data }),
  { status: 200, headers: { "Content-Type": "application/json" } }));

it("finds verified collaborator by name or @username and displays avatar, badge, and name", async () => {
  const onChange = vi.fn();
  const fetch = vi.fn(() => reply({ items: [partner] }));
  vi.stubGlobal("fetch", fetch);
  const user = userEvent.setup();
  render(<MemoryRouter><ChallengeCollaboratorPicker organizationId={owner}
    selected={[]} onChange={onChange} /></MemoryRouter>);
  await user.type(screen.getByRole("searchbox", { name: "Search organization collaborators" }), "@research");
  const add = await screen.findByRole("button", { name: "Invite Research Academy" });
  expect(within(add).getByRole("img", { name: "Research Academy profile picture" })).toBeTruthy();
  expect(within(add).getByRole("img", { name: "Verified organization" })).toBeTruthy();
  expect(within(add).getByText("@research_academy")).toBeTruthy();
  await user.click(add);
  expect(onChange).toHaveBeenCalledWith([{
    organizationId: partnerId, organization: partner, state: "UNSENT",
  }]);
  expect(fetch.mock.calls.some(([url]) => url.includes("q=%40research"))).toBe(true);
});

it("only accepted invitations appear as public co-hosts", () => {
  const entries = [
    { organizationId: partnerId, organization: partner, state: "PENDING" },
    { organizationId: owner, organization: host, state: "ACCEPTED" },
  ];
  render(<MemoryRouter><ChallengeCoHosts collaborators={entries} /></MemoryRouter>);
  expect(screen.getByRole("link", { name: "View co-host BrightWay Institute" })).toBeTruthy();
  expect(screen.queryByRole("link", { name: "View co-host Research Academy" })).toBeNull();
});

it("recipient organization may accept a pending collaboration through its own workspace", async () => {
  const fetch = vi.fn((url, options) => {
    if (options?.method === "PUT") return reply({ opportunityId: oppId, state: "ACCEPTED" });
    return reply({ items: [{
      opportunityId: oppId, state: "PENDING", invitedAt: "2026-11-14T17:00:00Z",
      opportunity: { id: oppId, title: "Education Challenge", status: "PUBLISHED", organization: host },
    }] });
  });
  vi.stubGlobal("fetch", fetch);
  const user = userEvent.setup();
  render(<MemoryRouter><ChallengeCollaborationInvites organizationId={partnerId} /></MemoryRouter>);
  expect(fetch).not.toHaveBeenCalled();
  await user.click(screen.getByRole("button", { name: "Review invitations" }));
  await screen.findByText("Education Challenge");
  expect(screen.getByText("Pending your decision")).toBeTruthy();
  await user.click(screen.getByRole("button", { name: "Accept" }));
  await waitFor(() => expect(screen.getByText("Accepted co-host")).toBeTruthy());
  expect(fetch.mock.calls.find(([, options]) => options?.method === "PUT")?.[0])
    .toContain("/challenge-collaborations/" + oppId);
  expect(JSON.parse(fetch.mock.calls.find(([, options]) => options?.method === "PUT")[1].body))
    .toEqual({ decision: "ACCEPTED" });
});
