import { render,screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe,it,expect } from "vitest";
import { App } from "./App";

describe("workspace shell",()=>{
 it("renders the workspace areas without inventing authenticated capabilities",()=>{
  render(<MemoryRouter><App/></MemoryRouter>);
  expect(screen.getByRole("heading",{name:"Workspace overview"})).toBeInTheDocument();
  expect(screen.getAllByText("Reception").length).toBeGreaterThan(0);
  expect(screen.getAllByText("Queue").length).toBeGreaterThan(0);
  expect(screen.getAllByText("Clinical workspace").length).toBeGreaterThan(0);
 });
});
