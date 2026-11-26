import { useEffect, useMemo, useState } from "react";
import type { FormEvent } from "react";
import {
  ApiError, cancelAppointment, createAvailabilitySession, getAppointmentSlots,
  listAppointments, listAvailabilitySessions, listStaffProfiles, rescheduleAppointment
} from "../../api/compilecare";
import type {
  Appointment, AppointmentSlot, AvailabilitySession, Department, StaffProfile
} from "../../api/compilecare";

interface Props {
  baseUrl: string;
  accessToken: string;
  tenantId: string;
  hospitalId: string;
  departments: Department[];
  canRead: boolean;
  canManage: boolean;
  canPublishAvailability: boolean;
  onBusyChange: (busy: boolean) => void;
}

const today = () => {
  const date = new Date();
  return [date.getFullYear(), String(date.getMonth() + 1).padStart(2, "0"), String(date.getDate()).padStart(2, "0")].join("-");
};

function errorMessage(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.status === 409) return "The appointment or slot changed. Refresh the list and try again.";
    return error.message;
  }
  return error instanceof Error ? error.message : "The appointment request could not be completed.";
}

function formatDateTime(value: string): string {
  return new Date(value).toLocaleString([], { dateStyle: "medium", timeStyle: "short" });
}

function providerName(staff: StaffProfile): string {
  return [staff.givenName, staff.middleName, staff.familyName].filter(Boolean).join(" ");
}

export function AppointmentManagement({
  baseUrl, accessToken, tenantId, hospitalId, departments, canRead, canManage,
  canPublishAvailability, onBusyChange
}: Props) {
  const [departmentId, setDepartmentId] = useState("");
  const [date, setDate] = useState(today());
  const [status, setStatus] = useState("");
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [confirmCancelId, setConfirmCancelId] = useState("");

  const [staff, setStaff] = useState<StaffProfile[]>([]);
  const [staffLoading, setStaffLoading] = useState(false);
  const [staffError, setStaffError] = useState("");
  const [providerStaffId, setProviderStaffId] = useState("");
  const [startTime, setStartTime] = useState("09:00");
  const [endTime, setEndTime] = useState("13:00");
  const [slotDuration, setSlotDuration] = useState("30");
  const [timeZoneId, setTimeZoneId] = useState("Asia/Kolkata");
  const [publishing, setPublishing] = useState(false);
  const [availabilityNotice, setAvailabilityNotice] = useState("");
  const [availabilityError, setAvailabilityError] = useState("");

  const [rescheduling, setRescheduling] = useState<Appointment | null>(null);
  const [rescheduleDate, setRescheduleDate] = useState(today());
  const [rescheduleSessions, setRescheduleSessions] = useState<AvailabilitySession[]>([]);
  const [rescheduleSessionId, setRescheduleSessionId] = useState("");
  const [rescheduleSlots, setRescheduleSlots] = useState<AppointmentSlot[]>([]);
  const [rescheduleSlotStart, setRescheduleSlotStart] = useState("");
  const [rescheduleLoading, setRescheduleLoading] = useState(false);
  const [rescheduleError, setRescheduleError] = useState("");

  const providers = useMemo(() => staff.filter(item =>
    item.isActive && !!item.providerDesignation && item.assignments.some(assignment =>
      assignment.isActive && assignment.hospitalId === hospitalId &&
      assignment.departmentId === departmentId && assignment.effectiveFrom <= date &&
      (!assignment.effectiveTo || assignment.effectiveTo >= date)
    )
  ), [staff, hospitalId, departmentId, date]);

  useEffect(() => {
    setDepartmentId(current => departments.some(item => item.id === current)
      ? current : departments.length === 1 ? departments[0].id : "");
  }, [departments, hospitalId]);

  useEffect(() => {
    if (!canPublishAvailability) return;
    let active = true;
    setStaffLoading(true);
    setStaffError("");
    listStaffProfiles(baseUrl, accessToken, tenantId)
      .then(result => { if (active) setStaff(result.items); })
      .catch(cause => { if (active) setStaffError(errorMessage(cause)); })
      .finally(() => { if (active) setStaffLoading(false); });
    return () => { active = false; };
  }, [baseUrl, accessToken, tenantId, canPublishAvailability]);

  useEffect(() => {
    setAppointments([]);
    setTotalCount(0);
    setPage(1);
    setTotalPages(0);
    setError("");
    setNotice("");
    setConfirmCancelId("");
    setRescheduling(null);
    setRescheduleSessions([]);
    setRescheduleSlots([]);
  }, [hospitalId, tenantId, departmentId, date]);

  async function refreshAppointments(nextPage = 1) {
    if (!canRead || !departmentId || !date) return;
    setLoading(true); setError(""); setNotice(""); setConfirmCancelId("");
    try {
      const result = await listAppointments(baseUrl, accessToken, tenantId, hospitalId, departmentId, date, status || undefined, nextPage);
      setAppointments(result.items);
      setTotalCount(result.totalCount);
      setPage(result.page);
      setTotalPages(result.totalPages);
    } catch (cause) {
      setError(errorMessage(cause));
      setAppointments([]);
      setTotalCount(0);
      setTotalPages(0);
    } finally { setLoading(false); }
  }

  async function publishAvailability(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canPublishAvailability || !departmentId || !providerStaffId || publishing) return;
    setPublishing(true); onBusyChange(true); setAvailabilityError(""); setAvailabilityNotice("");
    try {
      await createAvailabilitySession(baseUrl, accessToken, tenantId, hospitalId, {
        departmentId, providerStaffId, localDate: date, startLocalTime: startTime,
        endLocalTime: endTime, slotDurationMinutes: Number(slotDuration), timeZoneId: timeZoneId.trim()
      });
      setAvailabilityNotice("Provider availability published. Reception can now book its slots.");
      setProviderStaffId("");
    } catch (cause) { setAvailabilityError(errorMessage(cause)); }
    finally { setPublishing(false); onBusyChange(false); }
  }

  async function beginReschedule(appointment: Appointment) {
    setRescheduling(appointment);
    setRescheduleDate(date);
    setRescheduleError("");
    setRescheduleSessions([]);
    setRescheduleSlots([]);
    setRescheduleSessionId("");
    setRescheduleSlotStart("");
    try {
      const result = await listAvailabilitySessions(baseUrl, accessToken, tenantId, hospitalId, date, appointment.departmentId);
      setRescheduleSessions(result.items);
    } catch (cause) { setRescheduleError(errorMessage(cause)); }
  }

  async function loadRescheduleDate(nextDate: string) {
    setRescheduleDate(nextDate);
    setRescheduleSessionId(""); setRescheduleSlots([]); setRescheduleSlotStart(""); setRescheduleError("");
    if (!rescheduling || !nextDate) return;
    try {
      const result = await listAvailabilitySessions(baseUrl, accessToken, tenantId, hospitalId, nextDate, rescheduling.departmentId);
      setRescheduleSessions(result.items);
    } catch (cause) { setRescheduleError(errorMessage(cause)); }
  }

  async function chooseRescheduleSession(sessionId: string) {
    setRescheduleSessionId(sessionId); setRescheduleSlots([]); setRescheduleSlotStart(""); setRescheduleError("");
    if (!sessionId) return;
    try {
      setRescheduleSlots(await getAppointmentSlots(baseUrl, accessToken, tenantId, hospitalId, sessionId));
    } catch (cause) { setRescheduleError(errorMessage(cause)); }
  }

  async function saveReschedule() {
    if (!rescheduling || !rescheduleSessionId || !rescheduleSlotStart || !canManage || rescheduleLoading) return;
    setRescheduleLoading(true); onBusyChange(true); setRescheduleError("");
    try {
      await rescheduleAppointment(baseUrl, accessToken, tenantId, hospitalId, rescheduling.id, {
        availabilitySessionId: rescheduleSessionId, patientId: rescheduling.patientId,
        slotStartsAtUtc: rescheduleSlotStart, reason: rescheduling.reason
      });
      setRescheduling(null);
      await refreshAppointments(page);
      setNotice("Appointment rescheduled. Its previous booking remains in the appointment lineage.");
    } catch (cause) { setRescheduleError(errorMessage(cause)); }
    finally { setRescheduleLoading(false); onBusyChange(false); }
  }

  async function cancelSelected(appointment: Appointment) {
    if (!canManage || confirmCancelId !== appointment.id) {
      setConfirmCancelId(appointment.id);
      return;
    }
    setLoading(true); onBusyChange(true); setError(""); setNotice("");
    try {
      await cancelAppointment(baseUrl, accessToken, tenantId, hospitalId, appointment.id);
      setConfirmCancelId("");
      await refreshAppointments(page);
      setNotice("Appointment cancelled.");
    } catch (cause) { setError(errorMessage(cause)); }
    finally { setLoading(false); onBusyChange(false); }
  }

  return <section className="section appointment-management-section" id="appointment-management">
    <div className="section-heading"><div><label>SCHEDULING OPERATIONS</label><h2>Appointment management</h2><p className="helper-text">Publish provider availability and manage bookings for the selected department and local date.</p></div></div>

    {canPublishAvailability && <div className="search-panel appointment-publish-panel">
      <div className="workflow-step"><span>01</span><div><strong>Publish provider availability</strong><small>Only active providers assigned to this hospital and department on the selected date are eligible.</small></div></div>
      <form className="appointment-publish-form" onSubmit={publishAvailability}>
        <div><label htmlFor="availability-provider">Provider</label><select id="availability-provider" value={providerStaffId} onChange={event => setProviderStaffId(event.target.value)} required disabled={!departmentId || staffLoading}><option value="">Select assigned provider</option>{providers.map(provider => <option key={provider.id} value={provider.id}>{providerName(provider)} · {provider.providerDesignation}</option>)}</select></div>
        <div><label htmlFor="availability-start">Start time</label><input id="availability-start" type="time" value={startTime} onChange={event => setStartTime(event.target.value)} required /></div>
        <div><label htmlFor="availability-end">End time</label><input id="availability-end" type="time" value={endTime} onChange={event => setEndTime(event.target.value)} required /></div>
        <div><label htmlFor="availability-duration">Slot duration</label><select id="availability-duration" value={slotDuration} onChange={event => setSlotDuration(event.target.value)}><option value="10">10 minutes</option><option value="15">15 minutes</option><option value="20">20 minutes</option><option value="30">30 minutes</option><option value="45">45 minutes</option><option value="60">60 minutes</option></select></div>
        <div><label htmlFor="availability-timezone">Hospital time zone</label><input id="availability-timezone" value={timeZoneId} onChange={event => setTimeZoneId(event.target.value)} maxLength={100} required /></div>
        <div className="appointment-publish-action"><button type="submit" disabled={publishing || !departmentId || !providerStaffId || !date || !timeZoneId.trim() || staffLoading || providers.length === 0}>{publishing ? "Publishing…" : "Publish availability"}</button></div>
      </form>
      {staffLoading && <p className="inline-status" role="status">Loading assigned providers…</p>}
      {staffError && <p className="inline-error" role="alert">{staffError}</p>}
      {!staffLoading && !staffError && departmentId && providers.length === 0 && <p className="inline-status">No active provider assignment was found for this department and date.</p>}
      {availabilityError && <p className="inline-error" role="alert">{availabilityError}</p>}
      {availabilityNotice && <p className="registration-success" role="status">{availabilityNotice}</p>}
    </div>}

    {canRead && <div className="search-panel appointment-list-panel">
      <div className="appointment-list-toolbar">
        <div><label htmlFor="appointment-list-department">Department</label><select id="appointment-list-department" value={departmentId} onChange={event => setDepartmentId(event.target.value)} disabled={loading}><option value="">Select department</option>{departments.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></div>
        <div><label htmlFor="appointment-list-date">Local date</label><input id="appointment-list-date" type="date" value={date} onChange={event => setDate(event.target.value)} disabled={loading} /></div>
        <div><label htmlFor="appointment-list-status">Status</label><select id="appointment-list-status" value={status} onChange={event => setStatus(event.target.value)} disabled={loading}><option value="">All statuses</option><option value="Booked">Booked</option><option value="Cancelled">Cancelled</option><option value="Completed">Completed</option><option value="NoShow">No-show</option></select></div>
        <button type="button" onClick={() => refreshAppointments(1)} disabled={!departmentId || !date || loading}>{loading ? "Loading…" : "Load appointments"}</button>
      </div>
      {error && <p className="inline-error" role="alert">{error}</p>}
      {notice && <p className="registration-success" role="status">{notice}</p>}
      {appointments.length > 0 && <p className="result-count" role="status">{totalCount} appointment{totalCount === 1 ? "" : "s"} · page {page} of {Math.max(totalPages, 1)}</p>}
      {appointments.length === 0 && !loading && !error && <p className="inline-status">Select a department and date, then load appointments.</p>}
      {appointments.length > 0 && <div className="appointment-record-list">
        {appointments.map(appointment => <article className="appointment-record" key={appointment.id}>
          <div className="appointment-record-main">
            <div><strong>{formatDateTime(appointment.slotStartsAtUtc)}</strong><small>Patient reference · {appointment.patientId.slice(0, 8)} · Provider · {appointment.providerStaffId.slice(0, 8)}</small></div>
            <span className={`appointment-status status-${appointment.status.toLowerCase()}`}>{appointment.status}</span>
          </div>
          {appointment.reason && <p>{appointment.reason}</p>}
          {canManage && appointment.status === "Booked" && <div className="appointment-record-actions">
            <button type="button" onClick={() => void beginReschedule(appointment)} disabled={loading || !!rescheduling}>Reschedule</button>
            <button type="button" onClick={() => void cancelSelected(appointment)} disabled={loading}>{confirmCancelId === appointment.id ? "Confirm cancellation" : "Cancel appointment"}</button>
            {confirmCancelId === appointment.id && <button type="button" className="secondary-action" onClick={() => setConfirmCancelId("")}>Keep appointment</button>}
          </div>}
          {rescheduling?.id === appointment.id && <div className="reschedule-panel">
            <strong>Choose a new appointment slot</strong>
            <div className="appointment-list-toolbar"><div><label htmlFor={`reschedule-date-${appointment.id}`}>New local date</label><input id={`reschedule-date-${appointment.id}`} type="date" min={today()} value={rescheduleDate} onChange={event => void loadRescheduleDate(event.target.value)} /></div><div><label htmlFor={`reschedule-session-${appointment.id}`}>Provider session</label><select id={`reschedule-session-${appointment.id}`} value={rescheduleSessionId} onChange={event => void chooseRescheduleSession(event.target.value)}><option value="">Select session</option>{rescheduleSessions.map(session => <option key={session.id} value={session.id}>{formatDateTime(session.startsAtUtc)} · {session.providerStaffId.slice(0, 8)}</option>)}</select></div></div>
            {rescheduleSlots.length > 0 && <div className="slot-grid" role="group" aria-label="Reschedule appointment slots">{rescheduleSlots.map(slot => <button type="button" key={slot.startsAtUtc} disabled={!slot.isAvailable} aria-pressed={rescheduleSlotStart === slot.startsAtUtc} className={rescheduleSlotStart === slot.startsAtUtc ? "slot-selected" : ""} onClick={() => setRescheduleSlotStart(slot.startsAtUtc)}><span>{new Date(slot.startsAtUtc).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span><small>{slot.isAvailable ? "Available" : "Unavailable"}</small></button>)}</div>}
            {rescheduleError && <p className="inline-error" role="alert">{rescheduleError}</p>}
            <div className="registration-actions"><button type="button" onClick={() => void saveReschedule()} disabled={!rescheduleSlotStart || rescheduleLoading}>{rescheduleLoading ? "Rescheduling…" : "Confirm new slot"}</button><button type="button" className="secondary-action" onClick={() => setRescheduling(null)}>Close</button></div>
          </div>}
        </article>)}
      </div>}
      {totalPages > 1 && <div className="pagination"><button type="button" onClick={() => void refreshAppointments(page - 1)} disabled={loading || page <= 1}>Previous</button><span>Page {page} of {totalPages}</span><button type="button" onClick={() => void refreshAppointments(page + 1)} disabled={loading || page >= totalPages}>Next</button></div>}
    </div>}
  </section>;
}
