import { render,screen,waitFor } from "@testing-library/react";
import { MemoryRouter,useLocation } from "react-router-dom";
import { describe,it,expect } from "vitest";
import { App } from "./App";

function LocationProbe() {
 const location=useLocation();
 return <output data-testid="current-location">{location.pathname}{location.hash}</output>;
}

describe("reception workspace",()=>{
 it("renders a sign-in entry point without inventing a hospital or patient context",()=>{
  render(<MemoryRouter><App/></MemoryRouter>);
  expect(screen.getByRole("heading",{name:"Reception workspace"})).toBeInTheDocument();
  expect(screen.getByText(/Sign in with your hospital identity/)).toBeInTheDocument();
  expect(screen.getByRole("link",{name:"Skip to main content"})).toHaveAttribute("href","#workspace-main");
  expect(screen.getByRole("main")).toHaveAttribute("id","workspace-main");
 });

 it("normalizes a deep link to a module the signed-out identity cannot access",async()=>{
  render(<MemoryRouter initialEntries={["/billing#billing"]}><App/><LocationProbe/></MemoryRouter>);
  expect(screen.getByRole("heading",{name:"Reception workspace"})).toBeInTheDocument();
  expect(screen.queryByRole("link",{name:"Billing"})).not.toBeInTheDocument();
  await waitFor(()=>expect(screen.getByTestId("current-location")).toHaveTextContent("/"));
 });

 it("upgrades legacy hash-only module URLs to stable route URLs",async()=>{
  render(<MemoryRouter initialEntries={["/#reception"]}><App/><LocationProbe/></MemoryRouter>);
  await waitFor(()=>expect(screen.getByTestId("current-location")).toHaveTextContent("/"));
 });
});
