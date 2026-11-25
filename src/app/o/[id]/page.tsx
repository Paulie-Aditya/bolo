import { Suspense } from "react";
import Tracker from "./tracker";

export default function Page() {
  return (
    <Suspense fallback={<div className="flex-1" />}>
      <Tracker />
    </Suspense>
  );
}
