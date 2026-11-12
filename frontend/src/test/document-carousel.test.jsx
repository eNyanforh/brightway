import { fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, expect, it, vi } from "vitest";
import DocumentCarousel from "../components/posts/DocumentCarousel";
import PurposefulPostChooser from "../components/posts/PurposefulPostChooser";
import PersonalPostComposer from "../components/posts/PersonalPostComposer";
const { openPdf } = vi.hoisted(() => ({ openPdf: vi.fn() }));
vi.mock("../components/posts/pdf-document", () => ({ openPdfDocument: openPdf }));
const item = { id:"document-1", name:"Study guide.pdf", kind:"DOCUMENT", pageCount:3 };
let destroy;
let pdf;
beforeEach(() => {
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({});
  destroy = vi.fn();
  pdf = { numPages:3, getPage:vi.fn(async number => ({
    getViewport:({ scale }) => ({ width:600 * scale, height:750 * scale }),
    render:() => ({ promise:Promise.resolve(), cancel:vi.fn() }),
    getTextContent:async () => ({ items:[{ str:"Slide " + number }] }),
  })) };
  openPdf.mockReset().mockResolvedValue({ pdf, destroy, downloadUrl:"blob:synthetic-document", aspect:.8 });
});

it("renders actual pages in a moving slide track and supports arrows, keyboard and page selection", async () => {
  const user = userEvent.setup();
  const { container } = render(<DocumentCarousel item={item} />);
  await screen.findByText("Slide 1");
  expect(container.querySelector("iframe")).toBeNull();
  expect(container.querySelector("canvas")).toBeTruthy();
  expect(screen.getByRole("link", { name:"Download document" }).getAttribute("download")).toBe(item.name);
  await user.click(screen.getByRole("button", { name:"Next document page" }));
  await screen.findByText("Slide 2");
  expect(container.querySelector(".bw-document-track").style.transform).toBe("translateX(-100%)");
  expect(screen.getByRole("group", { name:"Page 2", exact:true })).toBeTruthy();
  fireEvent.change(screen.getByRole("slider", { name:"Document page" }), { target:{ value:"3" } });
  expect(screen.getByRole("button", { name:"Next document page" }).disabled).toBe(true);
  fireEvent.keyDown(screen.getByRole("group", { name:/Document pages for/ }), { key:"Home" });
  expect(screen.getByLabelText("Page 1 of 3")).toBeTruthy();
  expect(screen.getByRole("button", { name:"Previous document page" }).disabled).toBe(true);
});

it("swipes horizontally without advancing on vertical scroll gestures", async () => {
  render(<DocumentCarousel item={item} />);
  await screen.findByText("Slide 1");
  const viewport = screen.getByRole("group", { name:/Document pages for/ });
  fireEvent.touchStart(viewport, { touches:[{ clientX:200,clientY:100 }] });
  fireEvent.touchEnd(viewport, { changedTouches:[{ clientX:180,clientY:300 }] });
  expect(screen.getByLabelText("Page 1 of 3")).toBeTruthy();
  fireEvent.touchStart(viewport, { touches:[{ clientX:200,clientY:100 }] });
  fireEvent.touchEnd(viewport, { changedTouches:[{ clientX:50,clientY:110 }] });
  expect(screen.getByLabelText("Page 2 of 3")).toBeTruthy();
});

it("expands the current page and restores the reader position and focus on close", async () => {
  const user = userEvent.setup();
  render(<DocumentCarousel item={item} />);
  await screen.findByText("Slide 1");
  await user.click(screen.getByRole("button", { name:"Next document page" }));
  await user.click(screen.getByRole("button", { name:"Expand document" }));
  const dialog = screen.getByRole("dialog", { name:"Document viewer " + item.name });
  expect(within(dialog).getByLabelText("Page 2 of 3")).toBeTruthy();
  expect(document.activeElement).toBe(within(dialog).getByRole("button", { name:"Close document viewer" }));
  await user.keyboard("{Escape}");
  expect(screen.queryByRole("dialog")).toBeNull();
  expect(screen.getByLabelText("Page 2 of 3")).toBeTruthy();
  expect(document.activeElement).toBe(screen.getByRole("button", { name:"Expand document" }));
});

it("recovers from a document failure and destroys the document when removed", async () => {
  const user = userEvent.setup();
  openPdf.mockRejectedValueOnce(Error("Connection interrupted"));
  const { unmount } = render(<DocumentCarousel item={item} />);
  expect(await screen.findByRole("alert")).toBeTruthy();
  await user.click(screen.getByRole("button", { name:"Try again" }));
  await screen.findByText("Slide 1");
  unmount();
  expect(destroy).toHaveBeenCalled();
  expect(openPdf.mock.calls[0][1].aborted).toBe(true);
});

it("offers only achievement, event and question creation for individuals", async () => {
  const onSelect = vi.fn();
  render(<PersonalPostComposer type="ACHIEVEMENT" tags={[]} body="" open={false} onSelect={onSelect} />);
  const options = screen.getByRole("group", { name:"Choose how to contribute" });
  expect(within(options).getAllByRole("button")).toHaveLength(3);
  expect(within(options).queryByRole("button", { name:"Create Post" })).toBeNull();
  await userEvent.setup().click(within(options).getByRole("button", { name:"Share an Achievement" }));
  expect(onSelect).toHaveBeenCalledWith("ACHIEVEMENT");
});

it("lets the mobile chooser select all three purposeful types without a regular-post option", async () => {
  const select = vi.fn();
  render(<PurposefulPostChooser onSelect={select} onCancel={vi.fn()} />);
  const dialog = screen.getByRole("dialog", { name:"Create a post" });
  expect(within(dialog).getAllByRole("button")).toHaveLength(4);
  expect(within(dialog).queryByRole("textbox")).toBeNull();
  const user = userEvent.setup();
  for (const [name, type] of [[/Share an Achievement/, "ACHIEVEMENT"],[/Create an Event/,"EVENT"],[/Ask a Question/,"QUESTION"]]) {
    await user.click(within(dialog).getByRole("button", { name }));
    expect(select).toHaveBeenLastCalledWith(type);
  }
});
