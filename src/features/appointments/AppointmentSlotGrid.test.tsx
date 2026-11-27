import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { AppointmentSlot } from "../../api/heapcare";
import { AppointmentSlotGrid } from "./AppointmentSlotGrid";

const slots: AppointmentSlot[] = [
  {
    startsAtUtc: "2026-11-25T09:30:00Z",
    endsAtUtc: "2026-11-25T09:45:00Z",
    isAvailable: true
  },
  {
    startsAtUtc: "2026-11-25T10:00:00Z",
    endsAtUtc: "2026-11-25T10:15:00Z",
    isAvailable: false
  },
  {
    startsAtUtc: "2026-11-25T10:30:00Z",
    endsAtUtc: "2026-11-25T10:45:00Z",
    isAvailable: true
  }
];

describe("AppointmentSlotGrid", () => {
  it("renders available and unavailable slots with explicit accessible labels", () => {
    render(<AppointmentSlotGrid slots={slots} timeZoneId="UTC" onSelect={vi.fn()} />);

    expect(screen.getByRole("button", { name: /09:30.*Available/ })).toBeEnabled();
    expect(screen.getByRole("button", { name: /10:00.*Unavailable/ })).toBeDisabled();
  });

  it("exposes the selected slot with aria-pressed and visible selected text", () => {
    render(
      <AppointmentSlotGrid
        slots={slots}
        selectedSlotStart={slots[2].startsAtUtc}
        timeZoneId="UTC"
        onSelect={vi.fn()}
      />
    );

    const selected = screen.getByRole("button", { name: /10:30.*Available/ });
    expect(selected).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByText("Selected")).toBeInTheDocument();
  });

  it("returns only the chosen slot start time", () => {
    const onSelect = vi.fn();

    render(<AppointmentSlotGrid slots={slots} timeZoneId="UTC" onSelect={onSelect} />);

    fireEvent.click(screen.getByRole("button", { name: /09:30.*Available/ }));

    expect(onSelect).toHaveBeenCalledTimes(1);
    expect(onSelect).toHaveBeenCalledWith(slots[0].startsAtUtc);
  });

  it("disables every slot while another workflow action is in flight", () => {
    render(<AppointmentSlotGrid slots={slots} timeZoneId="UTC" disabled onSelect={vi.fn()} />);

    expect(screen.getByRole("button", { name: /09:30.*Available/ })).toBeDisabled();
    expect(screen.getByRole("button", { name: /10:30.*Available/ })).toBeDisabled();
  });

  it("renders nothing for an empty slot list", () => {
    const { container } = render(<AppointmentSlotGrid slots={[]} onSelect={vi.fn()} />);

    expect(container).toBeEmptyDOMElement();
  });
});
