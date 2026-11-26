import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { QueueEntry } from "../../api/compilecare";
import { QueueEntryRow } from "./QueueEntryRow";

const entry: QueueEntry = {
  id: "queue-entry-1",
  hospitalId: "hospital-1",
  departmentId: "department-1",
  queueDateLocal: "2026-11-25",
  tokenNumber: 7,
  status: "Waiting",
  checkedInAtUtc: "2026-11-25T09:15:00Z",
  calledAtUtc: null,
  startedAtUtc: null,
  completedAtUtc: null
};

describe("QueueEntryRow", () => {
  it("exposes a named row, status and action group for a waiting token", () => {
    render(
      <QueueEntryRow
        entry={entry}
        canManageQueue
        cancellationReasonProvided
        onAction={vi.fn()}
      />
    );

    expect(screen.getByRole("article", { name: "Queue token 7" })).toBeInTheDocument();
    expect(screen.getByRole("status", { name: "Queue status: Waiting" })).toBeInTheDocument();
    expect(screen.getByRole("group", { name: "Actions for queue token 7" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Call" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Cancel" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "No-show" })).toBeEnabled();
  });

  it("requires a reason before cancellation or no-show", () => {
    render(
      <QueueEntryRow
        entry={entry}
        canManageQueue
        cancellationReasonProvided={false}
        onAction={vi.fn()}
      />
    );

    expect(screen.getByRole("button", { name: "Cancel" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "No-show" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Call" })).toBeEnabled();
  });

  it("calls the requested transition with the server-returned entry", () => {
    const onAction = vi.fn();

    render(
      <QueueEntryRow
        entry={entry}
        canManageQueue
        cancellationReasonProvided
        onAction={onAction}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "Call" }));

    expect(onAction).toHaveBeenCalledTimes(1);
    expect(onAction).toHaveBeenCalledWith(entry, "call");
  });

  it("renders only the valid actions for the current Called state", () => {
    const calledEntry = { ...entry, status: "Called" as const };

    render(
      <QueueEntryRow
        entry={calledEntry}
        canManageQueue
        cancellationReasonProvided
        onAction={vi.fn()}
      />
    );

    expect(screen.getByRole("button", { name: "Recall" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Start consultation" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Call" })).not.toBeInTheDocument();
  });

  it("renders Complete only for an in-progress queue entry", () => {
    const inProgressEntry = { ...entry, status: "InProgress" as const };

    render(
      <QueueEntryRow
        entry={inProgressEntry}
        canManageQueue
        cancellationReasonProvided={false}
        onAction={vi.fn()}
      />
    );

    expect(screen.getByRole("button", { name: "Complete" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Recall" })).not.toBeInTheDocument();
  });

  it("disables all actions while a queue transition is being saved", () => {
    render(
      <QueueEntryRow
        entry={entry}
        canManageQueue
        actionBusy
        cancellationReasonProvided
        onAction={vi.fn()}
      />
    );

    expect(screen.getByRole("button", { name: "Call" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Cancel" })).toBeDisabled();
  });

  it("does not render an empty action group for a completed queue entry", () => {
    const completedEntry = { ...entry, status: "Completed" as const };

    render(
      <QueueEntryRow
        entry={completedEntry}
        canManageQueue
        cancellationReasonProvided
        onAction={vi.fn()}
      />
    );

    expect(screen.getByRole("status", { name: "Queue status: Completed" })).toBeInTheDocument();
    expect(screen.queryByRole("group", { name: "Actions for queue token 7" })).not.toBeInTheDocument();
  });

  it("does not render transition controls without the existing queue permission", () => {
    render(
      <QueueEntryRow
        entry={entry}
        canManageQueue={false}
        cancellationReasonProvided
        onAction={vi.fn()}
      />
    );

    expect(screen.queryByRole("group", { name: "Actions for queue token 7" })).not.toBeInTheDocument();
    expect(screen.getByRole("status", { name: "Queue status: Waiting" })).toBeInTheDocument();
  });
});
