import { Suspense } from "react";
import Ops from "./ops-view";

export default function Page() {
  return (
    <Suspense fallback={<div className="flex-1" />}>
      <Ops />
    </Suspense>
  );
}
