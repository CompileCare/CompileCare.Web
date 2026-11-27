import { QueueEntryRow } from "./QueueEntryRow";
import type { Appointment, Department, QueueAction, QueueEntry } from "../../api/heapcare";
export interface QueueWorkspaceProps {
  hasSelectedPatient:boolean; selectedPatientName:string; selectedDepartmentName:string; selectedDepartmentId:string; departments:Department[]; isWorkflowBusy:boolean;
  hospitalTimeZone:string; walkInLoading:boolean; walkInError:string; queueEntry:QueueEntry|null; bookedAppointment:Appointment|null; queueDate:string;
  queueLoading:boolean; queueError:string; canManageQueue:boolean; canReadQueue:boolean; queueEntries:QueueEntry[]; queueActionReason:string; queueActionError:string;
  queueActionLoadingId:string|null; onHospitalTimeZoneChange:(value:string)=>void; onWalkIn:()=>void; onDepartmentChange:(value:string)=>void;
  onQueueDateChange:(value:string)=>void; onLoadQueue:()=>void; onQueueActionReasonChange:(value:string)=>void; onQueueAction:(entry:QueueEntry,action:QueueAction)=>void;
}
export function QueueWorkspace(props:QueueWorkspaceProps) {
  const {hasSelectedPatient,selectedPatientName,selectedDepartmentName,selectedDepartmentId,departments,isWorkflowBusy,hospitalTimeZone,walkInLoading,walkInError,queueEntry,bookedAppointment,queueDate,queueLoading,queueError,canManageQueue,canReadQueue,queueEntries,queueActionReason,queueActionError,queueActionLoadingId,onHospitalTimeZoneChange,onWalkIn,onDepartmentChange,onQueueDateChange,onLoadQueue,onQueueActionReasonChange,onQueueAction}=props;
  return <>
    {canManageQueue&&<section className="section walkin-section"><div className="section-heading"><div><label>WALK-IN ARRIVAL</label><h2>Register a walk-in</h2><p className="helper-text">Walk-ins are registered directly into the department queue. The API assigns the token.</p></div></div>
      <div className="search-panel walkin-panel"><div className="workflow-step"><span>02</span><div><strong>Selected patient</strong><small>{hasSelectedPatient?selectedPatientName:"Select a patient from search results"}</small></div></div>
        <div className="walkin-action"><div><strong>{selectedDepartmentName||"Choose a department above"}</strong><label htmlFor="walkin-timezone">Hospital time zone</label><input id="walkin-timezone" value={hospitalTimeZone} onChange={event=>onHospitalTimeZoneChange(event.target.value)} maxLength={100}/></div><button type="button" onClick={onWalkIn} disabled={!hasSelectedPatient||!selectedDepartmentId||walkInLoading||!!queueEntry}>{walkInLoading?"Registering…":queueEntry?"Added to queue":"Add to queue"}</button></div>
        {walkInError&&<p className="inline-error" role="alert">{walkInError}</p>}{queueEntry&&!bookedAppointment&&<div className="token-card" role="status"><small>WALK-IN QUEUE TOKEN</small><strong>{queueEntry.tokenNumber.toString().padStart(2,"0")}</strong><span>{queueEntry.status} · {queueEntry.queueDateLocal}</span></div>}
      </div>
    </section>}
    {canReadQueue&&<section className="section queue-section" id="queue"><div className="section-heading"><div><label>LIVE OPERATIONS</label><h2>Department queue</h2></div></div>
      <div className="search-panel"><div className="appointment-grid"><div><label htmlFor="queue-department">Department</label><select id="queue-department" value={selectedDepartmentId} disabled={isWorkflowBusy} onChange={event=>onDepartmentChange(event.target.value)}><option value="">Select department</option>{departments.map(d=><option key={d.id} value={d.id}>{d.name}</option>)}</select></div><div><label htmlFor="queue-date">Queue date</label><input id="queue-date" type="date" value={queueDate} disabled={isWorkflowBusy} onChange={event=>onQueueDateChange(event.target.value)}/></div></div>
        <div className="registration-actions"><button type="button" onClick={onLoadQueue} disabled={!selectedDepartmentId||queueLoading}>{queueLoading?"Refreshing queue…":"Refresh queue"}</button></div>
        {queueError&&<p className="inline-error" role="alert">{queueError}</p>}
        {canManageQueue&&queueEntries.some(entry=>entry.status==="Waiting"||entry.status==="Called")&&<div className="queue-reason-field"><label htmlFor="queue-action-reason">Reason for cancellation or no-show (required for those actions)</label><input id="queue-action-reason" value={queueActionReason} maxLength={250} onChange={event=>onQueueActionReasonChange(event.target.value)} placeholder="e.g. Patient confirmed cancellation"/></div>}
        {queueActionError&&<p className="inline-error" role="alert">{queueActionError}</p>}
        {queueEntries.length>0?<div className="queue-list">{queueEntries.map(entry=><QueueEntryRow key={entry.id} entry={entry} canManageQueue={canManageQueue} actionBusy={!!queueActionLoadingId} saving={queueActionLoadingId===entry.id} cancellationReasonProvided={!!queueActionReason.trim()} onAction={onQueueAction}/>)}</div>:!queueLoading&&!queueError&&<p className="inline-status">Queue is empty or has not been loaded for this department and date.</p>}
      </div>
    </section>}
  </>;
}
