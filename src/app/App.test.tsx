import { render,screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe,it,expect } from "vitest";
import { App } from "./App";

describe("reception workspace",()=>{
 it("renders a sign-in entry point without inventing a hospital or patient context",()=>{
  render(<MemoryRouter><App/></MemoryRouter>);
  expect(screen.getByRole("heading",{name:"Reception workspace"})).toBeInTheDocument();
  expect(screen.getByText(/Sign in with your hospital identity/)).toBeInTheDocument();
 });
});
