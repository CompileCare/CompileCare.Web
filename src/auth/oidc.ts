import { UserManager, WebStorageStateStore } from "oidc-client-ts";
const authority=import.meta.env.VITE_OIDC_AUTHORITY as string|undefined;
const clientId=import.meta.env.VITE_OIDC_CLIENT_ID as string|undefined;
const redirectUri=import.meta.env.VITE_OIDC_REDIRECT_URI as string|undefined;
export const isAuthenticationConfigured=Boolean(authority&&clientId&&redirectUri);
export const userManager=isAuthenticationConfigured?new UserManager({authority:authority!,client_id:clientId!,redirect_uri:redirectUri!,post_logout_redirect_uri:import.meta.env.VITE_OIDC_POST_LOGOUT_REDIRECT_URI||window.location.origin,response_type:"code",scope:import.meta.env.VITE_OIDC_SCOPE||"openid profile",userStore:new WebStorageStateStore({store:window.sessionStorage}),stateStore:new WebStorageStateStore({store:window.sessionStorage}),automaticSilentRenew:false,loadUserInfo:false}):null;