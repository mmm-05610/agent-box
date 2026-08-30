import type { ReactNode } from "react";
export function Modal({ children }: { children: ReactNode }) {
  return (
    <div className="wb-modal" role="dialog" aria-modal="true">
      {children}
    </div>
  );
}
