import type { ReactNode } from "react";
import { AdminNav } from "./admin-nav";

export default function AdminLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <div>
      <AdminNav />
      {children}
    </div>
  );
}
