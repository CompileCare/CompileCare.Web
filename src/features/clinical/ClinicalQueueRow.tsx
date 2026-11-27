import type { QueueEntry } from "../../api/heapcare";

interface ClinicalQueueRowProps {
  entry: QueueEntry;
  opening?: boolean;
  disabled?: boolean;
  onOpen: (entry: QueueEntry) => void;
}

export function ClinicalQueueRow({
  entry,
  opening = false,
  disabled = false,
  onOpen
}: ClinicalQueueRowProps) {
  const token = String(entry.tokenNumber).padStart(2, "0");
  const description = entry.status === "InProgress"
    ? "Consultation in progress"
    : "Queue completed";
  const actionLabel = entry.status === "InProgress"
    ? `Open encounter for queue token ${entry.tokenNumber}`
    : `Resume encounter for queue token ${entry.tokenNumber}`;

  return (
    <article
      className="clinical-queue-row"
      aria-label={`Clinical queue token ${entry.tokenNumber}`}
    >
      <div>
        <strong>Token #{token}</strong>
        <small>
          {description} · {entry.startedAtUtc
            ? new Date(entry.startedAtUtc).toLocaleTimeString([], {
                hour: "2-digit",
                minute: "2-digit"
              })
            : "Start time unavailable"}
        </small>
      </div>
      <span
        className={`queue-status queue-status-${entry.status.toLowerCase()}`}
        role="status"
        aria-label={`Clinical queue status: ${entry.status}`}
      >
        {entry.status}
      </span>
      <button
        type="button"
        aria-label={actionLabel}
        onClick={() => onOpen(entry)}
        disabled={disabled || opening}
      >
        {opening ? "Opening…" : entry.status === "InProgress" ? "Open / start encounter" : "Resume encounter"}
      </button>
    </article>
  );
}
