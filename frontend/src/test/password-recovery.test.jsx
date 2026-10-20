import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, it, vi } from "vitest";
import { MemoryRouter } from "react-router-dom";
import PasswordRecoveryPage from "../pages/PasswordRecoveryPage";
const acknowledgement = "If an eligible account uses that email, a reset code will be sent.";
const response = (data, status = 200) => new Response(JSON.stringify({ success: status < 400, ...(status < 400 ? { data } : { message: data }) }), { status, headers: { "Content-Type": "application/json" } });
function mount(handler) {
  const fetchMock = vi.fn(handler); vi.stubGlobal("fetch", fetchMock);
  render(<MemoryRouter><PasswordRecoveryPage /></MemoryRouter>);
  return { user: userEvent.setup(), fetchMock };
}
async function request(user) {
  await user.type(screen.getByLabelText("Email"), "PERSON@example.com");
  await user.click(screen.getByRole("button", { name: "Send reset code" }));
  await screen.findByLabelText("Reset code");
}
it("requests a code then resets with only email, code and an unchanged password", async () => {
  const { user, fetchMock } = mount(async (url) => response({ message: url.endsWith("/request") ? acknowledgement : "Your password has been reset." }));
  await request(user);
  expect(screen.getByRole("status").textContent).toBe(acknowledgement);
  expect(screen.getByRole("button", { name: /Resend code in/ }).disabled).toBe(true);
  await user.type(screen.getByLabelText("Reset code"), "123456");
  const password = "  my new long passphrase  ";
  await user.type(screen.getByLabelText("New password"), password);
  await user.type(screen.getByLabelText("Confirm new password"), password);
  await user.click(screen.getByRole("button", { name: "Reset password" }));
  await screen.findByRole("heading", { name: "Your password has changed" });
  expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({ email: "person@example.com" });
  expect(JSON.parse(fetchMock.mock.calls[1][1].body)).toEqual({ email: "person@example.com", code: "123456", password });
  expect(fetchMock.mock.calls[1][1].credentials).toBe("include");
  expect(screen.queryByLabelText("New password")).toBeNull();
  expect(screen.getByRole("link", { name: "Log in with your new password" }).getAttribute("href")).toBe("/login");
});
it("keeps inputs after a rejected code and never submits password confirmation", async () => {
  const { user, fetchMock } = mount(async (url) => url.endsWith("/request") ? response({ message: acknowledgement }) : response("This code is invalid or expired.", 400));
  await request(user);
  await user.type(screen.getByLabelText("Reset code"), "123456");
  for (const label of ["New password", "Confirm new password"]) await user.type(screen.getByLabelText(label), "my new long passphrase");
  await user.click(screen.getByRole("button", { name: "Reset password" }));
  expect((await screen.findByRole("alert")).textContent).toContain("invalid or expired");
  expect(screen.getByLabelText("New password").value).toBe("my new long passphrase");
  expect(screen.getByLabelText("Reset code").value).toBe("123456");
  expect(JSON.parse(fetchMock.mock.calls[1][1].body)).not.toHaveProperty("confirmation");
});
it("rejects mismatched confirmation locally and clears secrets when changing email", async () => {
  const { user, fetchMock } = mount(async () => response({ message: acknowledgement }));
  await request(user);
  await user.type(screen.getByLabelText("Reset code"), "123456");
  await user.type(screen.getByLabelText("New password"), "first long passphrase");
  await user.type(screen.getByLabelText("Confirm new password"), "other long passphrase");
  await user.click(screen.getByRole("button", { name: "Reset password" }));
  expect(screen.getByRole("alert").textContent).toBe("Passwords do not match."); expect(fetchMock).toHaveBeenCalledTimes(1);
  await user.click(screen.getByRole("button", { name: "Use another email" }));
  expect(screen.getByLabelText("Email").readOnly).toBe(false);
  expect(screen.queryByLabelText("New password")).toBeNull();
});
it("blocks duplicate requests while preserving the email on delivery-service failure", async () => {
  let release;
  const pending = new Promise((resolve) => { release = resolve; });
  const { user, fetchMock } = mount(() => pending);
  await user.type(screen.getByLabelText("Email"), "person@example.com");
  const form = screen.getByLabelText("Email").closest("form");
  fireEvent.submit(form); fireEvent.submit(form);
  await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
  release(response("Password recovery is temporarily unavailable.", 503));
  await screen.findByRole("alert");
  expect(screen.getByLabelText("Email").value).toBe("person@example.com");
  expect(screen.queryByLabelText("Reset code")).toBeNull();
});
