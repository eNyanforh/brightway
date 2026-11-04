import { act, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { expect, it, vi } from "vitest";
import { AuthContext } from "../auth/auth-context";
import IdentityReviewerLink from "../components/profile/IdentityReviewerLink";
it.each(["MEMBER", "CREDENTIAL_REVIEWER"])("personal %s sessions never discover or display internal identity approval navigation", async platformRole => {
  const fetch = vi.fn(); vi.stubGlobal("fetch", fetch);
  render(<MemoryRouter><AuthContext.Provider value={{ account: { id: "legacy", platformRole } }}><IdentityReviewerLink /></AuthContext.Provider></MemoryRouter>);
  act(() => window.dispatchEvent(new Event("focus"))); await act(async () => {});
  expect(screen.queryByRole("link", { name: "Identity review workspace" })).toBeNull(); expect(fetch).not.toHaveBeenCalled();
});
