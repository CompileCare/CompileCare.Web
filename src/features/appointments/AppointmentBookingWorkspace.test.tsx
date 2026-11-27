import { fireEvent, render, screen } from "@testing-library/react";
import type { ComponentProps } from "react";
import { describe, expect, it, vi } from "vitest";
import type { Appointment, AppointmentSlot, AvailabilitySession, Department, QueueEntry } from "../../api/compilecare";
import { AppointmentBookingWorkspace } from "./AppointmentBookingWorkspace";
const department:Department={id:"department-1",hospitalId:"hospital-1",name:"Medicine",code:"MED"};
const session:AvailabilitySession={id:"session-1",hospitalId:"hospital-1",departmentId:department.id,providerStaffId:"staff-1",localDate:"2026-11-28",startsAtUtc:"2026-11-28T04:00:00Z",endsAtUtc:"2026-11-28T06:00:00Z",slotDurationMinutes:30,timeZoneId:"Asia/Kolkata",createdAtUtc:"2026-11-27T00:00:00Z"};
const slot:AppointmentSlot={startsAtUtc:"2026-11-28T04:00:00Z",endsAtUtc:"2026-11-28T04:30:00Z",isAvailable:true};
const appointment:Appointment={id:"appointment-1",hospitalId:"hospital-1",departmentId:department.id,patientId:"patient-1",providerStaffId:"staff-1",availabilitySessionId:session.id,slotStartsAtUtc:slot.startsAtUtc,slotEndsAtUtc:slot.endsAtUtc,status:"Booked",reason:null,createdAtUtc:"2026-11-27T00:00:00Z",rescheduledFromAppointmentId:null};
const queueEntry:QueueEntry={id:"queue-1",hospitalId:"hospital-1",departmentId:department.id,queueDateLocal:"2026-11-28",tokenNumber:1,status:"Waiting",checkedInAtUtc:"2026-11-28T04:00:00Z",calledAtUtc:null,startedAtUtc:null,completedAtUtc:null};
function renderWorkspace(overrides:Partial<ComponentProps<typeof AppointmentBookingWorkspace>>={}) {
  const props:ComponentProps<typeof AppointmentBookingWorkspace>={hasSelectedPatient:true,selectedPatientName:"Asha Patil",departments:[department],selectedDepartmentId:department.id,selectedDepartmentName:department.name,departmentsLoading:false,departmentsError:"",isWorkflowBusy:false,appointmentDate:"2026-11-28",availabilityLoading:false,availabilityError:"",availabilitySessions:[],selectedSessionId:"",slotsLoading:false,slots:[],selectedSlotStart:"",bookedAppointment:null,appointmentReason:"",bookingLoading:false,bookingError:"",checkInLoading:false,checkInError:"",queueEntry:null,onDepartmentChange:vi.fn(),onAppointmentDateChange:vi.fn(),onLoadAvailability:vi.fn(),onSelectSession:vi.fn(),onSelectSlot:vi.fn(),onSubmit:vi.fn(event=>event.preventDefault()),onAppointmentReasonChange:vi.fn(),onCheckIn:vi.fn(),...overrides};
  return {...render(<AppointmentBookingWorkspace {...props}/>),props};
}
describe("AppointmentBookingWorkspace",()=>{
  it("requires patient, department and date before loading availability",()=>{
    const {rerender,props}=renderWorkspace({hasSelectedPatient:false});
    expect(screen.getByRole("button",{name:"Find available appointments"})).toBeDisabled();
    rerender(<AppointmentBookingWorkspace {...props} hasSelectedPatient={true}/>);
    expect(screen.getByRole("button",{name:"Find available appointments"})).toBeEnabled();
  });
  it("delegates availability search and provider session selection",()=>{
    const {props}=renderWorkspace({availabilitySessions:[session]});
    fireEvent.click(screen.getByRole("button",{name:"Find available appointments"}));
    expect(props.onLoadAvailability).toHaveBeenCalled();
    fireEvent.change(screen.getByLabelText("Provider availability"),{target:{value:session.id}});
    expect(props.onSelectSession).toHaveBeenCalledWith(session.id);
  });
  it("keeps check-in disabled after the appointment has already been checked in",()=>{
    renderWorkspace({availabilitySessions:[session],selectedSessionId:session.id,slots:[slot],selectedSlotStart:slot.startsAtUtc,selectedSessionTimeZoneId:session.timeZoneId,bookedAppointment:appointment,queueEntry});
    expect(screen.getByRole("button",{name:"Checked in"})).toBeDisabled();
  });
});
