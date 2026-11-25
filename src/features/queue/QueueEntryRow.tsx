import type { QueueAction, QueueEntry } from "../../api/compilecare";

interface QueueEntryRowProps {
  entry: QueueEntry;
  canManageQueue: boolean;
  actionBusy?: boolean;
  saving?: boolean;
  cancellationReasonProvided: boolean;
  onAction: (entry: QueueEntry, action: QueueAction) => void;
}

function queueStatusDescription(status: QueueEntry["status"]): string {
  if (status === "Waiting") return "Awaiting call";
  if (status === "Called") return "Called to consultation";
  if (status === "InProgress") return "Consultation in progress";
  return "Queue entry closed";
}

export function QueueEntryRow({
  entry,
  canManageQueue,
  actionBusy = false,
  saving = false,
  cancellationReasonProvided,
  onAction
}: QueueEntryRowProps) {
  const token = entry.tokenNumber.toString().padStart(2, "0");

  return (
    <article
      className="queue-row queue-row-managed"
      aria-label={`Queue token ${entry.tokenNumber}`}
    >
      <div className="queue-token">
        <strong>#{token}</strong>
        <small>
          {new Date(entry.checkedInAtUtc).toLocaleTimeString([], {
            hour: "2-digit",
            minute: "2-digit"
          })}
        </small>
      </div>

      <div className="queue-state">
        <span
          className={`queue-status queue-status-${entry.status.toLowerCase()}`}
          role="status"
          aria-label={`Queue status: ${entry.status}`}
        >
          {entry.status}
        </span>
        <small>{queueStatusDescription(entry.status)}</small>
      </div>

      {canManageQueue && (
        <div
          className="queue-actions"
          role="group"
          aria-label={`Actions for queue token ${entry.tokenNumber}`}
        >
          {entry.status === "Waiting" && (
            <button
              type="button"
              onClick={() => onAction(entry, "call")}
              disabled={actionBusy}
            >
              {saving ? "Saving…" : "Call"}
            </button>
          )}

          {entry.status === "Called" && (
            <>
              <button
                type="button"
                onClick={() => onAction(entry, "recall")}
                disabled={actionBusy}
              >
                Recall
              </button>
              <button
                type="button"
                onClick={() => onAction(entry, "start")}
                disabled={actionBusy}
              >
                Start consultation
              </button>
            </>
          )}

          {entry.status === "InProgress" && (
            <button
              type="button"
              onClick={() => onAction(entry, "complete")}
              disabled={actionBusy}
            >
              {saving ? "Saving…" : "Complete"}
            </button>
          )}

          {(entry.status === "Waiting" || entry.status === "Called") && (
            <>
              <button
                className="queue-action-secondary"
                type="button"
                onClick={() => onAction(entry, "cancel")}
                disabled={actionBusy || !cancellationReasonProvided}
              >
                Cancel
              </button>
              <button
                className="queue-action-danger"
                type="button"
                onClick={() => onAction(entry, "noshow")}
                disabled={actionBusy || !cancellationReasonProvided}
              >
                No-show
              </button>
            </>
          )}
        </div>
      )}
    </article>
  );
}
