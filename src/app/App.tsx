import { useEffect,useState } from "react";
import { Route,Routes,useNavigate } from "react-router-dom";
import type { User } from "oidc-client-ts";
import { isAuthenticationConfigured,userManager } from "../auth/oidc";

function Callback(){
 const navigate=useNavigate(); const [error,setError]=useState("");
 useEffect(()=>{if(!userManager){setError("Authentication is not configured.");return;}let active=true;userManager.signinCallback().then(()=>{if(active)navigate("/",{replace:true});}).catch(()=>{if(active)setError("Sign-in could not be completed. Return to the workspace and try again.");});return()=>{active=false;};},[navigate]);
 return <main className="callback" role="status">{error||"Completing secure sign-in…"}</main>;
}
function Home(){
 const [user,setUser]=useState<User|null>(null);const [loading,setLoading]=useState(true);
 useEffect(()=>{if(!userManager){setLoading(false);return;}userManager.getUser().then(setUser).finally(()=>setLoading(false));const loaded=(u:User)=>setUser(u);const unloaded=()=>setUser(null);userManager.events.addUserLoaded(loaded);userManager.events.addUserUnloaded(unloaded);return()=>{userManager.events.removeUserLoaded(loaded);userManager.events.removeUserUnloaded(unloaded);};},[]);
 return <div className="shell"><aside className="sidebar"><div className="brand"><b>C</b><span>CompileCare<small>HOSPITAL WORKSPACE</small></span></div><nav aria-label="Primary navigation"><p>WORKSPACE</p><a className="selected" href="#overview">Overview</a><span>Reception <small>Next increment</small></span><span>Queue <small>Next increment</small></span><span>Clinical <small>Next increment</small></span></nav><footer>Secure by design<br/><small>Tenant-scoped access</small></footer></aside>
 <main className="content" id="overview"><header><div><label>HOSPITAL OPERATIONS</label><h1>Workspace overview</h1></div><div className="session">{loading?"Checking session…":user?<><span>{String(user.profile.name??user.profile.preferred_username??"Signed-in user")}</span><button onClick={()=>userManager?.signoutRedirect()}>Sign out</button></>:<button disabled={!isAuthenticationConfigured} onClick={()=>userManager?.signinRedirect()}>Sign in</button>}</div></header>
 {!isAuthenticationConfigured&&<div className="notice" role="status"><b>Authentication setup required.</b> Configure the OIDC environment variables before enabling staff sign-in. No demo identity or client-side permissions are used.</div>}
 <section className="hero"><label>YOUR HOSPITAL, ONE WORKSPACE</label><h2>Good care starts with<br/><em>connected workflows.</em></h2><p>A focused workspace for reception, patient flow and clinical teams.</p><div className="symbol" aria-hidden="true">✚</div></section>
 <section className="section"><label>WORK AREAS</label><h2>Choose where to begin</h2><div className="cards"><article><b>R</b><h3>Reception</h3><p>Find patients and manage registration workflows.</p><small>Next increment</small></article><article><b>Q</b><h3>Queue</h3><p>Follow arrivals and department hand-offs.</p><small>Next increment</small></article><article><b>C</b><h3>Clinical workspace</h3><p>Continue care with queue-linked encounters.</p><small>Next increment</small></article></div></section>
 <footer className="pagefoot">CompileCare · Hospital information workspace <span>Access is always enforced by the API.</span></footer></main></div>;
}
export function App(){return <Routes><Route path="/auth/callback" element={<Callback/>}/><Route path="*" element={<Home/>}/></Routes>;}