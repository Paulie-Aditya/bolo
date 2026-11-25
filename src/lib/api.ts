import { NextResponse } from "next/server";
import { SarvamError } from "./sarvam";

export function json(data: unknown, init?: number | ResponseInit) {
  return NextResponse.json(data, typeof init === "number" ? { status: init } : init);
}

export function apiError(e: unknown) {
  if (e instanceof SarvamError) {
    console.error("[sarvam]", e.api, e.message);
    return json({ error: "voice_unavailable", api: e.api, message: e.message }, 503);
  }
  console.error(e);
  return json({ error: "server_error", message: e instanceof Error ? e.message : String(e) }, 500);
}
