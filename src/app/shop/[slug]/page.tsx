import { Suspense } from "react";
import Dashboard from "./dashboard";

export default function Page() {
  return (
    <Suspense fallback={<div className="flex-1" />}>
      <Dashboard />
    </Suspense>
  );
}
