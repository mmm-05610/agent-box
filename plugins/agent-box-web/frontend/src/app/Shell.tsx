import type { ReactNode } from "react";
import { route } from "./router";
export function Shell({ children }: { children: ReactNode }) {
  const current = route();
  return (
    <div className="wb-shell">
      <aside>
        <a className="wb-brand" href="#/works">
          <b>◇ Agent-Box</b>
          <small>UNIFIED WEB</small>
        </a>
        <nav aria-label="Primary">
          <a
            className={current.startsWith("/works") ? "active" : ""}
            href="#/works"
          >
            Works
          </a>
          <a href="#/harnesses">Harnesses</a>
          <a href="#/skills">Skills</a>
          <a href="#/integrations">Integrations</a>
          <a href="#/settings">Settings</a>
        </nav>
      </aside>
      <main>{children}</main>
    </div>
  );
}
