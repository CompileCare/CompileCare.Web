import { useEffect,useState } from "react";
import type { FormEvent } from "react";
import {
  ApiError,
  createBillingInvoice,
  createBillingServiceItem,
  getBillingReceipt,
  getDailyCollectionReport,
  getInvoiceForVisit,
  listBillingPayments,
  listBillingServiceItems,
  listQueue,
  recordBillingPayment,
  type BillingInvoice,
  type BillingPayment,
  type BillingReceipt,
  type BillingServiceItem,
  type DailyCollectionReport,
  type Department,
  type QueueEntry
} from "../../api/heapcare";

const localBusinessDate=()=>new Intl.DateTimeFormat("en-CA",{timeZone:"Asia/Kolkata"}).format(new Date());
const money=(value:number)=>new Intl.NumberFormat("en-IN",{style:"currency",currency:"INR",maximumFractionDigits:2}).format(value);
const errorMessage=(error:unknown)=>error instanceof ApiError?error.message:error instanceof Error?error.message:"The billing request could not be completed.";

export function BillingWorkspace({baseUrl,accessToken,tenantId,hospitalId,departments,permissions}:{baseUrl:string;accessToken:string;tenantId:string;hospitalId:string;departments:Department[];permissions:string[]}) {
  const canManageInvoice=permissions.includes("billing.invoice.manage");
  const canReadInvoice=permissions.includes("billing.invoice.read")||canManageInvoice;
  const canManagePayment=permissions.includes("billing.payment.manage");
  const canManageCatalogue=permissions.includes("billing.catalogue.manage");
  const canReadReport=permissions.includes("billing.report.read");
  const [departmentId,setDepartmentId]=useState("");
  const [businessDate,setBusinessDate]=useState(localBusinessDate());
  const [queueEntries,setQueueEntries]=useState<QueueEntry[]>([]);
  const [selectedQueueEntryId,setSelectedQueueEntryId]=useState("");
  const [queueLoading,setQueueLoading]=useState(false);
  const [serviceItems,setServiceItems]=useState<BillingServiceItem[]>([]);
  const [invoice,setInvoice]=useState<BillingInvoice|null>(null);
  const [quantities,setQuantities]=useState<Record<string,number>>({});
  const [paymentAmount,setPaymentAmount]=useState("");
  const [paymentMethod,setPaymentMethod]=useState("Cash");
  const [paymentReference,setPaymentReference]=useState("");
  const [receipt,setReceipt]=useState<BillingReceipt|null>(null);
  const [payments,setPayments]=useState<BillingPayment[]>([]);
  const [receiptLoadingId,setReceiptLoadingId]=useState("");
  const [dailyReport,setDailyReport]=useState<DailyCollectionReport|null>(null);
  const [loading,setLoading]=useState(false);
  const [error,setError]=useState("");
  const [success,setSuccess]=useState("");
  const [serviceCode,setServiceCode]=useState("");
  const [serviceName,setServiceName]=useState("");
  const [serviceCategory,setServiceCategory]=useState("Consultation");
  const [servicePrice,setServicePrice]=useState("");

  useEffect(()=>{setDepartmentId(current=>departments.some(x=>x.id===current)?current:departments[0]?.id??"");},[departments]);

  useEffect(()=>{
    if(!canReadInvoice||!hospitalId)return;
    listBillingServiceItems(baseUrl,accessToken,tenantId,hospitalId)
      .then(setServiceItems).catch(error=>setError(errorMessage(error)));
  },[baseUrl,accessToken,tenantId,hospitalId,canReadInvoice]);

  useEffect(()=>{
    setInvoice(null);setReceipt(null);setPayments([]);setQuantities({});setSelectedQueueEntryId("");setQueueEntries([]);
  },[departmentId,businessDate]);

  useEffect(()=>{
    if(!selectedQueueEntryId||!canReadInvoice){setInvoice(null);setPayments([]);return;}
    let active=true;
    setInvoice(null);setReceipt(null);setPayments([]);setError("");setLoading(true);
    getInvoiceForVisit(baseUrl,accessToken,tenantId,hospitalId,selectedQueueEntryId)
      .then(async value=>{
        if(!active)return;
        setInvoice(value);
        const history=await listBillingPayments(baseUrl,accessToken,tenantId,hospitalId,value.id);
        if(active)setPayments(history);
      })
      .catch(error=>{
        if(!active)return;
        if(error instanceof ApiError&&error.status===404){setInvoice(null);setPayments([]);return;}
        setError(errorMessage(error));
      })
      .finally(()=>{if(active)setLoading(false);});
    return ()=>{active=false;};
  },[baseUrl,accessToken,tenantId,hospitalId,selectedQueueEntryId,canReadInvoice]);

  async function refreshVisits(){
    if(!departmentId)return;
    setQueueLoading(true);setError("");setSuccess("");setQueueEntries([]);setSelectedQueueEntryId("");setInvoice(null);
    try{
      const page=await listQueue(baseUrl,accessToken,tenantId,hospitalId,departmentId,businessDate);
      const eligible=page.items.filter(x=>x.status==="InProgress"||x.status==="Completed");
      setQueueEntries(eligible);
      if(eligible.length===0)setSuccess("No in-progress or completed visits are available for billing on this date.");
    }catch(error){setError(errorMessage(error));}
    finally{setQueueLoading(false);}
  }

  async function refreshCatalogue(){
    const items=await listBillingServiceItems(baseUrl,accessToken,tenantId,hospitalId);
    setServiceItems(items);
  }

  async function issueInvoice(){
    if(!selectedQueueEntryId)return;
    const lines=serviceItems.filter(x=>x.isActive&&(quantities[x.id]??0)>0).map(x=>({serviceItemId:x.id,quantity:quantities[x.id]}));
    if(lines.length===0){setError("Select at least one service and quantity.");return;}
    setLoading(true);setError("");setSuccess("");setReceipt(null);
    try{
      const created=await createBillingInvoice(baseUrl,accessToken,tenantId,hospitalId,{queueEntryId:selectedQueueEntryId,lines});
      setInvoice(created);setQuantities({});setSuccess("Invoice issued successfully.");
    }catch(error){setError(errorMessage(error));}
    finally{setLoading(false);}
  }

  async function acceptPayment(event:FormEvent<HTMLFormElement>){
    event.preventDefault();
    if(!invoice)return;
    const amount=Number(paymentAmount);
    if(!Number.isFinite(amount)||amount<=0||amount>invoice.balanceDue){setError("Enter a payment amount within the outstanding balance.");return;}
    setLoading(true);setError("");setSuccess("");setReceipt(null);
    try{
      const payment=await recordBillingPayment(baseUrl,accessToken,tenantId,hospitalId,invoice.id,{amount,method:paymentMethod,reference:paymentReference.trim()||null});
      const [updated,receiptValue,history]=await Promise.all([
        getInvoiceForVisit(baseUrl,accessToken,tenantId,hospitalId,selectedQueueEntryId),
        getBillingReceipt(baseUrl,accessToken,tenantId,hospitalId,payment.id),
        listBillingPayments(baseUrl,accessToken,tenantId,hospitalId,invoice.id)
      ]);
      setInvoice(updated);setReceipt(receiptValue);setPayments(history);setPaymentAmount("");setPaymentReference("");
      setSuccess(updated.status==="Paid"?"Invoice fully settled.":"Payment recorded; balance remains outstanding.");
    }catch(error){setError(errorMessage(error));}
    finally{setLoading(false);}
  }

  async function openReceipt(paymentId:string){
    setReceiptLoadingId(paymentId);setError("");
    try{setReceipt(await getBillingReceipt(baseUrl,accessToken,tenantId,hospitalId,paymentId));}
    catch(error){setError(errorMessage(error));}
    finally{setReceiptLoadingId("");}
  }

  async function createService(event:FormEvent<HTMLFormElement>){
    event.preventDefault();setLoading(true);setError("");setSuccess("");
    try{
      await createBillingServiceItem(baseUrl,accessToken,tenantId,hospitalId,{code:serviceCode.trim(),name:serviceName.trim(),category:serviceCategory.trim(),unitPrice:Number(servicePrice),isActive:true});
      await refreshCatalogue();setServiceCode("");setServiceName("");setServicePrice("");setSuccess("Service added to the hospital catalogue.");
    }catch(error){setError(errorMessage(error));}
    finally{setLoading(false);}
  }

  async function loadDailyReport(){
    if(!canReadReport)return;
    setLoading(true);setError("");
    try{setDailyReport(await getDailyCollectionReport(baseUrl,accessToken,tenantId,hospitalId,businessDate,"Asia/Kolkata"));}
    catch(error){setError(errorMessage(error));}
    finally{setLoading(false);}
  }

  const eligibleSelected=queueEntries.find(x=>x.id===selectedQueueEntryId);
  return <section className="section billing-section" id="billing">
    <div className="section-heading"><div><label>REVENUE OPERATIONS</label><h2>OPD billing and settlement</h2></div></div>
    <div className="billing-panel">
      <div className="billing-toolbar">
        <div><label htmlFor="billing-department">Department</label><select id="billing-department" value={departmentId} disabled={loading||queueLoading} onChange={e=>setDepartmentId(e.target.value)}><option value="">Select department</option>{departments.map(x=><option key={x.id} value={x.id}>{x.name}</option>)}</select></div>
        <div><label htmlFor="billing-date">Business date</label><input id="billing-date" type="date" value={businessDate} disabled={loading||queueLoading} onChange={e=>setBusinessDate(e.target.value)}/></div>
        <button type="button" onClick={refreshVisits} disabled={!departmentId||queueLoading||loading}>{queueLoading?"Loading visits…":"Load billable visits"}</button>
      </div>
      {error&&<p className="inline-error" role="alert">{error}</p>}
      {success&&<p className="inline-status" role="status">{success}</p>}
      <div className="billing-grid">
        <div className="billing-card">
          <h3>Visit selection</h3>
          <label htmlFor="billing-visit">In-progress or completed visit</label>
          <select id="billing-visit" value={selectedQueueEntryId} onChange={e=>setSelectedQueueEntryId(e.target.value)} disabled={queueEntries.length===0}>
            <option value="">Select a visit</option>{queueEntries.map(x=><option key={x.id} value={x.id}>Token #{String(x.tokenNumber).padStart(2,"0")} · {x.status}</option>)}
          </select>
          <p className="helper-text">Patient identity is not exposed in the billing queue selector. The invoice is linked to the selected OPD visit.</p>
          {eligibleSelected&&<p className="billing-meta">Visit token #{eligibleSelected.tokenNumber} · {eligibleSelected.queueDateLocal}</p>}
        </div>
        <div className="billing-card">
          <h3>Service catalogue</h3>
          {serviceItems.length===0?<p className="helper-text">No active services are available. Ask a billing catalogue administrator to configure services.</p>:
            <div className="billing-service-list">{serviceItems.filter(x=>x.isActive).map(item=><div className="billing-service-row" key={item.id}><div><strong>{item.name}</strong><small>{item.code} · {item.category} · {money(item.unitPrice)}</small></div><input aria-label={"Quantity for "+item.name} type="number" min="0" max="100" step="1" value={quantities[item.id]??0} onChange={e=>setQuantities(current=>({...current,[item.id]:Math.max(0,Math.min(100,Number(e.target.value)||0))}))} disabled={!canManageInvoice||!!invoice||loading}/></div>)}</div>}
          {canManageInvoice&&!invoice&&<button type="button" onClick={issueInvoice} disabled={!selectedQueueEntryId||loading||serviceItems.every(x=>!x.isActive||(quantities[x.id]??0)===0)}>{loading?"Issuing…":"Issue invoice"}</button>}
        </div>
      </div>
      {canManageCatalogue&&<details className="billing-catalogue"><summary>Manage service catalogue</summary><form onSubmit={createService} className="billing-toolbar"><div><label htmlFor="billing-service-code">Service code</label><input id="billing-service-code" value={serviceCode} onChange={e=>setServiceCode(e.target.value)} maxLength={40} required/></div><div><label htmlFor="billing-service-name">Service name</label><input id="billing-service-name" value={serviceName} onChange={e=>setServiceName(e.target.value)} maxLength={160} required/></div><div><label htmlFor="billing-service-category">Category</label><input id="billing-service-category" value={serviceCategory} onChange={e=>setServiceCategory(e.target.value)} maxLength={80} required/></div><div><label htmlFor="billing-service-price">Unit price (INR)</label><input id="billing-service-price" type="number" min="0" step="0.01" value={servicePrice} onChange={e=>setServicePrice(e.target.value)} required/></div><button type="submit" disabled={loading}>Add service</button></form></details>}
      {invoice&&<div className="billing-invoice">
        <div className="billing-invoice-heading"><div><label>INVOICE</label><h3>{invoice.invoiceNumber}</h3><small>{new Date(invoice.issuedAtUtc).toLocaleString()}</small></div><span className={"invoice-status invoice-status-"+invoice.status.toLowerCase()}>{invoice.status}</span></div>
        <div className="billing-lines">{invoice.lines.map(line=><div className="billing-line" key={line.id}><div><strong>{line.description}</strong><small>{line.serviceCode} · Qty {line.quantity} × {money(line.unitPrice)}</small></div><b>{money(line.lineTotal)}</b></div>)}</div>
        <div className="billing-totals"><div><span>Subtotal</span><b>{money(invoice.subtotal)}</b></div><div><span>Paid</span><b>{money(invoice.amountPaid)}</b></div><div className="billing-balance"><span>Balance due</span><b>{money(invoice.balanceDue)}</b></div></div>
        {canManagePayment&&invoice.balanceDue>0&&<form className="billing-payment-form" onSubmit={acceptPayment}>
          <h3>Record payment</h3>
          <div><label htmlFor="billing-payment-amount">Amount (INR)</label><input id="billing-payment-amount" type="number" min="0.01" max={invoice.balanceDue} step="0.01" value={paymentAmount} onChange={e=>setPaymentAmount(e.target.value)} required/></div>
          <div><label htmlFor="billing-payment-method">Method</label><select id="billing-payment-method" value={paymentMethod} onChange={e=>setPaymentMethod(e.target.value)}><option value="Cash">Cash</option><option value="UPI">UPI</option><option value="Card">Card</option><option value="BankTransfer">Bank transfer</option></select></div>
          <div><label htmlFor="billing-payment-reference">Reference (optional)</label><input id="billing-payment-reference" value={paymentReference} onChange={e=>setPaymentReference(e.target.value)} maxLength={80}/></div>
          <button type="submit" disabled={loading}>{loading?"Recording…":"Record payment"}</button>
        </form>}
        {payments.length>0&&<div className="billing-payment-history">
          <h3>Payment history</h3>
          {payments.map(payment=><div className="billing-payment-history-row" key={payment.id}>
            <div><strong>{payment.receiptNumber}</strong><small>{money(payment.amount)} · {payment.method} · {new Date(payment.paidAtUtc).toLocaleString()}</small></div>
            <button type="button" onClick={()=>openReceipt(payment.id)} disabled={loading||receiptLoadingId===payment.id}>{receiptLoadingId===payment.id?"Loading…":"View receipt"}</button>
          </div>)}
        </div>}
        {receipt&&<div className="billing-receipt">
          <label>PAYMENT RECEIPT</label><strong>{receipt.receiptNumber}</strong>
          <span>Invoice {receipt.invoiceNumber}</span>
          <span>{money(receipt.amount)} · {receipt.method} · {new Date(receipt.paidAtUtc).toLocaleString()}</span>
          {receipt.reference&&<span>Reference: {receipt.reference}</span>}
          <button type="button" onClick={()=>window.print()}>Print receipt</button>
        </div>}
      </div>}
    </div>
    {canReadReport&&<div className="billing-report">
      <div><label>DAILY COLLECTION</label><h3>Collection summary</h3></div>
      <button type="button" onClick={loadDailyReport} disabled={loading}>{loading?"Loading…":"Load daily report"}</button>
      {dailyReport&&<div className="billing-report-summary"><div><small>Total collected</small><strong>{money(dailyReport.totalCollected)}</strong></div><div><small>Payments</small><strong>{dailyReport.paymentCount}</strong></div>{Object.entries(dailyReport.byMethod).map(([method,total])=><div key={method}><small>{method}</small><strong>{money(total)}</strong></div>)}</div>}
    </div>}
  </section>;
}
