import type { AppointmentSlot } from "../../api/compilecare";

interface AppointmentSlotGridProps {
  slots: AppointmentSlot[];
  selectedSlotStart?: string;
  timeZoneId?: string;
  disabled?: boolean;
  onSelect: (startsAtUtc: string) => void;
}

function formatSlotTime(value: string, timeZoneId?: string): string {
  const options: Intl.DateTimeFormatOptions = {
    hour: "2-digit",
    minute: "2-digit"
  };

  if (timeZoneId) options.timeZone = timeZoneId;

  return new Date(value).toLocaleTimeString([], options);
}

export function AppointmentSlotGrid({
  slots,
  selectedSlotStart,
  timeZoneId,
  disabled = false,
  onSelect
}: AppointmentSlotGridProps) {
  if (slots.length === 0) return null;

  return (
    <div className="slot-grid" role="group" aria-label="Available appointment slots">
      {slots.map(slot => {
        const selected = selectedSlotStart === slot.startsAtUtc;
        const available = slot.isAvailable;
        const time = formatSlotTime(slot.startsAtUtc, timeZoneId);
        const stateLabel = available ? "Available" : "Unavailable";

        return (
          <button
            key={slot.startsAtUtc}
            type="button"
            className={selected ? "slot-selected" : ""}
            aria-pressed={selected}
            aria-label={`${time}, ${stateLabel}`}
            disabled={!available || disabled}
            onClick={() => onSelect(slot.startsAtUtc)}
          >
            <span>{time}</span>
            <small>{selected ? "Selected" : stateLabel}</small>
          </button>
        );
      })}
    </div>
  );
}
