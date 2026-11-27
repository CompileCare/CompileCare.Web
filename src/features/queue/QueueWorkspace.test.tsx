import { fireEvent, render, screen } from "@testing-library/react";
import type { ComponentProps } from "react";
import { describe, expect, it, vi } from "vitest";
import type { QueueEntry, Department } from "../../api/compilecare";
import { QueueWorkspace } from "./QueueWorkspace";
const department:Department={id:"department-1",hospitalId:"hospital-1",name:"Medicine",code:"MED"};
const queueEntry:QueueEntry={id:"queue-1",hospitalId:"hospital-1",departmentId:department.id,queueDateLocal:"2026-11-27",tokenNumber:1,status:"Waiting",checkedInAtUtc:"2026-11-27T04:00:00Z",calledAtUtc:null,startedAtUtc:null,completedAtUtc:null};
function renderWorkspace(overrides:Partial<ComponentProps<typeof QueueWorkspace>>={}) {
  const props:ComponentProps<typeof QueueWorkspace>={hasSelectedPatient:true,selectedPatientName:"Asha Patil",selectedDepartmentName:department.name,selectedDepartmentId:department.id,departments:[department],isWorkflowBusy:false,hospitalTimeZone:"Asia/Kolkata",walkInLoading:false,walkInError:"",queueEntry:null,bookedAppointment:null,queueDate:"2026-11-27",queueLoading:false,queueError:"",canManageQueue:true,canReadQueue:true,queueEntries:[],queueActionReason:"",queueActionError:"",queueActionLoadingId:null,onHospitalTimeZoneChange:vi.fn(),onWalkIn:vi.fn(),onDepartmentChange:vi.fn(),onQueueDateChange:vi.fn(),onLoadQueue:vi.fn(),onQueueActionReasonChange:vi.fn(),onQueueAction:vi.fn(),...overrides};
  return {...render(<QueueWorkspace {...props}/>),props};
}
describe("QueueWorkspace",()=>{
  it("requires a patient and department before adding a walk-in",()=>{
    const {rerender,props}=renderWorkspace({hasSelectedPatient:false});
    expect(screen.getByRole("button",{name:"Add to queue"})).toBeDisabled();
    rerender(<QueueWorkspace {...props} hasSelectedPatient={true}/>);
    expect(screen.getByRole("button",{name:"Add to queue"})).toBeEnabled();
  });
  it("loads queue and gates cancellation on an explicit reason",()=>{
    const {props}=renderWorkspace({queueEntries:[queueEntry]});
    fireEvent.click(screen.getByRole("button",{name:"Refresh queue"}));
    expect(props.onLoadQueue).toHaveBeenCalled();
    expect(screen.getByLabelText("Reason for cancellation or no-show (required for those actions)")).toBeInTheDocument();
    expect(screen.getByRole("button",{name:"Cancel"})).toBeDisabled();
    fireEvent.change(screen.getByLabelText("Reason for cancellation or no-show (required for those actions)"),{target:{value:"Patient request"}});
    expect(props.onQueueActionReasonChange).toHaveBeenCalledWith("Patient request");
  });
});
