import type { FormEvent } from "react";
import { AppointmentSlotGrid } from "./AppointmentSlotGrid";
import type { Appointment, AppointmentSlot, AvailabilitySession, Department, QueueEntry } from "../../api/compilecare";
export interface AppointmentBookingWorkspaceProps {
  hasSelectedPatient:boolean; selectedPatientName:string; departments:Department[]; selectedDepartmentId:string; selectedDepartmentName:string;
  departmentsLoading:boolean; departmentsError:string; isWorkflowBusy:boolean; appointmentDate:string; availabilityLoading:boolean; availabilityError:string;
  availabilitySessions:AvailabilitySession[]; selectedSessionId:string; slotsLoading:boolean; slots:AppointmentSlot[]; selectedSlotStart:string;
  selectedSessionTimeZoneId?:string; bookedAppointment:Appointment|null; appointmentReason:string; bookingLoading:boolean; bookingError:string;
  checkInLoading:boolean; checkInError:string; queueEntry:QueueEntry|null; onDepartmentChange:(value:string)=>void; onAppointmentDateChange:(value:string)=>void;
  onLoadAvailability:()=>void; onSelectSession:(sessionId:string)=>void; onSelectSlot:(slotStart:string)=>void; onSubmit:(event:FormEvent<HTMLFormElement>)=>void;
  onAppointmentReasonChange:(value:string)=>void; onCheckIn:()=>void;
}
const localDateToday=()=>{const date=new Date();return [date.getFullYear(),String(date.getMonth()+1).padStart(2,"0"),String(date.getDate()).padStart(2,"0")].join("-");};
export function AppointmentBookingWorkspace(props:AppointmentBookingWorkspaceProps) {
  const {hasSelectedPatient,selectedPatientName,departments,selectedDepartmentId,selectedDepartmentName,departmentsLoading,departmentsError,isWorkflowBusy,appointmentDate,availabilityLoading,availabilityError,availabilitySessions,selectedSessionId,slotsLoading,slots,selectedSlotStart,selectedSessionTimeZoneId,bookedAppointment,appointmentReason,bookingLoading,bookingError,checkInLoading,checkInError,queueEntry,onDepartmentChange,onAppointmentDateChange,onLoadAvailability,onSelectSession,onSelectSlot,onSubmit,onAppointmentReasonChange,onCheckIn}=props;
  return <section className="section appointment-section" id="appointments">
    <div className="section-heading"><div><label>APPOINTMENTS</label><h2>Book a consultation</h2><p className="helper-text">Select a patient from the search results above, then choose a published provider slot.</p></div></div>
    <div className="search-panel">
      <div className="workflow-step"><span>01</span><div><strong>Patient</strong><small>{hasSelectedPatient?selectedPatientName:"Choose a patient from the search results"}</small></div></div>
      <div className="appointment-grid">
        <div><label htmlFor="appointment-department">Department</label><select id="appointment-department" value={selectedDepartmentId} onChange={event=>onDepartmentChange(event.target.value)} disabled={departmentsLoading||departments.length===0||isWorkflowBusy}><option value="">Select department</option>{departments.map(d=><option key={d.id} value={d.id}>{d.name}{d.code?" · "+d.code:""}</option>)}</select></div>
        <div><label htmlFor="appointment-date">Appointment date</label><input id="appointment-date" type="date" min={localDateToday()} value={appointmentDate} disabled={isWorkflowBusy} onChange={event=>onAppointmentDateChange(event.target.value)} /></div>
      </div>
      {departmentsLoading&&<p className="inline-status" role="status">Loading departments available to your hospital context…</p>}{departmentsError&&<p className="inline-error" role="alert">{departmentsError}</p>}
      <div className="registration-actions"><button type="button" onClick={onLoadAvailability} disabled={!hasSelectedPatient||!selectedDepartmentId||!appointmentDate||availabilityLoading}>{availabilityLoading?"Finding availability…":"Find available appointments"}</button></div>
      {availabilityError&&<p className="inline-error" role="alert">{availabilityError}</p>}
      {availabilitySessions.length>0&&<div className="slot-panel"><label htmlFor="availability-session">Provider availability</label><select id="availability-session" value={selectedSessionId} onChange={event=>onSelectSession(event.target.value)}><option value="">Choose a provider session</option>{availabilitySessions.map(session=><option key={session.id} value={session.id}>Session · {new Date(session.startsAtUtc).toLocaleTimeString([],{hour:"2-digit",minute:"2-digit",timeZone:session.timeZoneId})}–{new Date(session.endsAtUtc).toLocaleTimeString([],{hour:"2-digit",minute:"2-digit",timeZone:session.timeZoneId})}</option>)}</select>
        {slotsLoading&&<p className="inline-status" role="status">Loading available slots…</p>}{selectedSessionId&&!slotsLoading&&slots.length===0&&<p className="inline-status">No slots are available in this session.</p>}
        {slots.length>0&&<AppointmentSlotGrid slots={slots} selectedSlotStart={selectedSlotStart} timeZoneId={selectedSessionTimeZoneId} disabled={isWorkflowBusy||!!bookedAppointment} onSelect={onSelectSlot}/>}
      </div>}
      {selectedSlotStart&&<form onSubmit={onSubmit} className="booking-review"><div className="review-summary"><strong>Review appointment</strong><span>{selectedPatientName} · {selectedDepartmentName}</span><span>{new Date(selectedSlotStart).toLocaleString([],{dateStyle:"medium",timeStyle:"short",timeZone:selectedSessionTimeZoneId})} ({selectedSessionTimeZoneId})</span></div>
        <label htmlFor="appointment-reason">Visit reason (optional)</label><input id="appointment-reason" maxLength={250} value={appointmentReason} onChange={event=>onAppointmentReasonChange(event.target.value)} placeholder="e.g. Follow-up"/>
        <div className="registration-actions"><button type="submit" disabled={bookingLoading||!!bookedAppointment}>{bookingLoading?"Confirming booking…":bookedAppointment?"Appointment confirmed":"Confirm appointment"}</button></div>
      </form>}
      {bookingError&&<p className="inline-error" role="alert">{bookingError}</p>}
      {bookedAppointment&&<div className="arrival-success" role="status"><div><strong>Appointment confirmed</strong><span>Reference {bookedAppointment.id.slice(0,8)} · {bookedAppointment.status}</span></div><button type="button" onClick={onCheckIn} disabled={checkInLoading||!!queueEntry}>{checkInLoading?"Checking in…":queueEntry?"Checked in":"Check in patient"}</button></div>}
      {checkInError&&<p className="inline-error" role="alert">{checkInError}</p>}
      {queueEntry&&<div className="token-card" role="status"><small>QUEUE TOKEN</small><strong>{queueEntry.tokenNumber.toString().padStart(2,"0")}</strong><span>{queueEntry.status} · {queueEntry.queueDateLocal}</span></div>}
    </div>
  </section>;
}
