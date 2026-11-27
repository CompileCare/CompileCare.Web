import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { QueueEntry } from "../../api/heapcare";
import { ClinicalQueueRow } from "./ClinicalQueueRow";

const entry: QueueEntry = {
  id: "queue-entry-clinical-1",
  hospitalId: "hospital-1",
  departmentId: "department-1",
  queueDateLocal: "2026-11-25",
  tokenNumber: 12,
  status: "InProgress",
  checkedInAtUtc: "2026-11-25T09:00:00Z",
  calledAtUtc: "2026-11-25T09:05:00Z",
  startedAtUtc: "2026-11-25T09:10:00Z",
  completedAtUtc: null
};

describe("ClinicalQueueRow", () => {
  it("names the clinical queue row and announces the server-returned status", () => {
    render(<ClinicalQueueRow entry={entry} onOpen={vi.fn()} />);

    expect(screen.getByRole("article", { name: "Clinical queue token 12" })).toBeInTheDocument();
    expect(screen.getByRole("status", { name: "Clinical queue status: InProgress" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Open encounter for queue token 12" })).toBeEnabled();
  });

  it("passes the selected server-returned queue entry to the existing open handler", () => {
    const onOpen = vi.fn();

    render(<ClinicalQueueRow entry={entry} onOpen={onOpen} />);
    fireEvent.click(screen.getByRole("button", { name: "Open encounter for queue token 12" }));

    expect(onOpen).toHaveBeenCalledTimes(1);
    expect(onOpen).toHaveBeenCalledWith(entry);
  });

  it("uses a resume label for completed visits", () => {
    const completed = { ...entry, status: "Completed" as const, completedAtUtc: "2026-11-25T09:40:00Z" };

    render(<ClinicalQueueRow entry={completed} onOpen={vi.fn()} />);

    expect(screen.getByRole("button", { name: "Resume encounter for queue token 12" })).toBeInTheDocument();
    expect(screen.getByRole("status", { name: "Clinical queue status: Completed" })).toBeInTheDocument();
  });

  it("disables the action during encounter loading", () => {
    render(<ClinicalQueueRow entry={entry} opening onOpen={vi.fn()} />);

    expect(screen.getByRole("button", { name: "Open encounter for queue token 12" })).toBeDisabled();
    expect(screen.getByText("Opening…")).toBeInTheDocument();
  });

  it("does not allow the action when the parent workspace is busy", () => {
    render(<ClinicalQueueRow entry={entry} disabled onOpen={vi.fn()} />);

    expect(screen.getByRole("button", { name: "Open encounter for queue token 12" })).toBeDisabled();
  });
});
