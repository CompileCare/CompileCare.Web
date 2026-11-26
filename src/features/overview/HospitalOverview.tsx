import { useEffect, useState } from "react";
import {
  getDailyCollectionReport, listAppointments, listQueue
} from "../../api/compilecare";
import type { DailyCollectionReport, Department } from "../../api/compilecare";

interface Props {
  baseUrl: string;
  accessToken: string;
  tenantId: string;
  hospitalId: string;
  hospitalName: string;
  departments: Department[];
  timeZoneId: string;
  canReadAppointments: boolean;
  canReadQueue: boolean;
  canReadCollection: boolean;
}

const today = () => {
  const date = new Date();
  return [date.getFullYear(), String(date.getMonth() + 1).padStart(2, "0"), String(date.getDate()).padStart(2, "0")].join("-");
};
const currency = new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 });

function failure(error: unknown): string {
  return error instanceof Error ? error.message : "This metric could not be loaded.";
}

export function HospitalOverview({
  baseUrl, accessToken, tenantId, hospitalId, hospitalName, departments, timeZoneId,
  canReadAppointments, canReadQueue, canReadCollection
}: Props) {
  const [departmentId, setDepartmentId] = useState("");
  const [date, setDate] = useState(today());
  const [appointmentCount, setAppointmentCount] = useState<number | null>(null);
  const [queueCount, setQueueCount] = useState<number | null>(null);
  const [collection, setCollection] = useState<DailyCollectionReport | null>(null);
  const [appointmentError, setAppointmentError] = useState("");
  const [queueError, setQueueError] = useState("");
  const [collectionError, setCollectionError] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setDepartmentId(current => departments.some(item => item.id === current)
      ? current : departments.length === 1 ? departments[0].id : "");
  }, [departments, hospitalId]);

  async function refresh() {
    setLoading(true);
    setAppointmentError(""); setQueueError(""); setCollectionError("");
    const tasks: Promise<void>[] = [];
    if (canReadAppointments && departmentId) {
      tasks.push(listAppointments(baseUrl, accessToken, tenantId, hospitalId, departmentId, date)
        .then(result => setAppointmentCount(result.totalCount))
        .catch(error => { setAppointmentCount(null); setAppointmentError(failure(error)); }));
    } else setAppointmentCount(null);
    if (canReadQueue && departmentId) {
      tasks.push(listQueue(baseUrl, accessToken, tenantId, hospitalId, departmentId, date)
        .then(result => setQueueCount(result.totalCount))
        .catch(error => { setQueueCount(null); setQueueError(failure(error)); }));
    } else setQueueCount(null);
    if (canReadCollection) {
      tasks.push(getDailyCollectionReport(baseUrl, accessToken, tenantId, hospitalId, date, timeZoneId)
        .then(result => setCollection(result))
        .catch(error => { setCollection(null); setCollectionError(failure(error)); }));
    } else setCollection(null);
    await Promise.all(tasks);
    setLoading(false);
  }

  useEffect(() => { void refresh(); }, [baseUrl, accessToken, tenantId, hospitalId, departmentId, date, timeZoneId, canReadAppointments, canReadQueue, canReadCollection]);

  return <section className="section hospital-overview-section" id="overview">
    <div className="section-heading overview-heading">
      <div><label>HOSPITAL OPERATIONS</label><h2>Today at a glance</h2><p className="helper-text">{hospitalName} · Date and collection use {timeZoneId}</p></div>
      <div className="overview-controls">
        {(canReadAppointments || canReadQueue) && <div><label htmlFor="overview-department">Department</label><select id="overview-department" value={departmentId} onChange={event => setDepartmentId(event.target.value)}><option value="">Select department</option>{departments.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></div>}
        <div><label htmlFor="overview-date">Business date</label><input id="overview-date" type="date" value={date} onChange={event => setDate(event.target.value)} /></div>
        <button type="button" onClick={() => void refresh()} disabled={loading}>{loading ? "Refreshing…" : "Refresh"}</button>
      </div>
    </div>

    <div className="overview-metrics">
      {canReadAppointments && <article className="overview-metric">
        <span className="overview-metric-icon">AP</span><small>APPOINTMENTS</small>
        <strong>{appointmentCount === null ? "—" : appointmentCount.toLocaleString("en-IN")}</strong>
        <p>{appointmentError || (departmentId ? "Scheduled for the selected department and date" : "Select a department to view appointments")}</p>
      </article>}
      {canReadQueue && <article className="overview-metric">
        <span className="overview-metric-icon">Q</span><small>QUEUE ENTRIES</small>
        <strong>{queueCount === null ? "—" : queueCount.toLocaleString("en-IN")}</strong>
        <p>{queueError || (departmentId ? "Registered arrivals for the selected department and date" : "Select a department to view the queue")}</p>
      </article>}
      {canReadCollection && <article className="overview-metric">
        <span className="overview-metric-icon">₹</span><small>COLLECTED TODAY</small>
        <strong>{collection ? currency.format(collection.totalCollected) : "—"}</strong>
        <p>{collectionError || (collection ? `${collection.paymentCount.toLocaleString("en-IN")} payments · hospital-wide` : "Daily collection summary is not available")}</p>
      </article>}
    </div>

    <div className="overview-shortcuts">
      <span>QUICK ACCESS</span>
      {canReadAppointments && <a href="#appointment-management">Appointments <span>Manage bookings</span></a>}
      {canReadQueue && <a href="#queue">Queue <span>Arrival and patient flow</span></a>}
      {canReadCollection && <a href="#billing">Billing <span>Invoices and collection</span></a>}
      <a href="#reception">Reception <span>Patient search and registration</span></a>
      <a href="#staff-management">Workforce <span>Staff and provider assignments</span></a>
    </div>
  </section>;
}
