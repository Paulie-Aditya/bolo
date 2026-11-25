import { Suspense } from "react";
import Storefront from "./storefront";

export default function Page() {
  return (
    <Suspense fallback={<div className="flex-1" />}>
      <Storefront />
    </Suspense>
  );
}
