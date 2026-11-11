import { afterEach, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import CampusSetupOverview from "../components/organizations/CampusSetupOverview";
import { campusApi as api } from "../api/campus";
vi.mock("../api/campus", () => ({ campusApi: { read: vi.fn(), announcements: vi.fn(), publish: vi.fn() } }));
afterEach(() => { cleanup(); vi.resetAllMocks(); });
it("Campus announcements default to staff-only and require an explicit audience choice to reach learners", async () => {
  const organization = { id: "school", name: "Synthetic Academy", type: "SCHOOL", offersTraining: false };
  api.read.mockResolvedValue({ organizationId: "school", eligible: true, eligibility: { eligible: true, verifiedOrganization: true, verifiedLiberiaOperation: true, productEnabled: true, supportedEngines: ["GRADE_SCHOOL"], reasons: [] }, campus: { engine: "GRADE_SCHOOL", status: "ACTIVE", storedStatus: "ACTIVE", version: 2, displayName: organization.name, contactEmail: null }, permissions: ["organization.campus.announcements.manage"], canSetup: false, canManage: false, canAnnounce: true });
  api.announcements.mockResolvedValue({ items: [], nextCursor: null }); api.publish.mockResolvedValue({ id: "announcement" });
  const user = userEvent.setup(); render(<MemoryRouter><CampusSetupOverview organization={organization} /></MemoryRouter>);
  const audience = await screen.findByLabelText("Announcement audience", { exact: true }); expect(audience.value).toBe("STAFF");
  await user.selectOptions(audience, "CAMPUS"); await user.type(screen.getByLabelText("Announcement title"), "Semester welcome"); await user.type(screen.getByLabelText("Announcement details"), "Check your timetable before class."); await user.click(screen.getByRole("button", { name: "Publish announcement", exact: true }));
  await waitFor(() => expect(api.publish).toHaveBeenCalledWith("school", { title: "Semester welcome", body: "Check your timetable before class.", audience: "CAMPUS", requestKey: expect.stringMatching(/^[a-f0-9-]{36}$/) }));
  await waitFor(() => expect(screen.getByLabelText("Announcement audience", { exact: true }).value).toBe("STAFF"));
});
