"use client";
import { useCallback, useEffect, useRef, useState } from "react";

export function useCustomerId() {
  const [cid, setCid] = useState<string>("");
  useEffect(() => {
    let id = localStorage.getItem("bolo_cid");
    if (!id) {
      id = crypto.randomUUID().slice(0, 13);
      localStorage.setItem("bolo_cid", id);
    }
    setCid(id);
  }, []);
  return cid;
}

/** MediaRecorder wrapper: tap to start, tap to stop. Returns the recorded Blob. */
export function useRecorder() {
  const [recording, setRecording] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const rec = useRef<MediaRecorder | null>(null);
  const chunks = useRef<Blob[]>([]);
  const resolver = useRef<((b: Blob | null) => void) | null>(null);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  const start = useCallback(async () => {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
    const mime = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/ogg"].find((m) => MediaRecorder.isTypeSupported(m)) || "";
    const r = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
    chunks.current = [];
    r.ondataavailable = (e) => e.data.size && chunks.current.push(e.data);
    r.onstop = () => {
      stream.getTracks().forEach((t) => t.stop());
      const blob = new Blob(chunks.current, { type: r.mimeType || "audio/webm" });
      resolver.current?.(blob.size ? blob : null);
    };
    r.start(250);
    rec.current = r;
    setSeconds(0);
    timer.current = setInterval(() => setSeconds((s) => s + 1), 1000);
    setRecording(true);
  }, []);

  const stop = useCallback(
    () =>
      new Promise<Blob | null>((resolve) => {
        resolver.current = resolve;
        if (timer.current) clearInterval(timer.current);
        setRecording(false);
        if (rec.current && rec.current.state !== "inactive") rec.current.stop();
        else resolve(null);
      }),
    [],
  );

  return { recording, seconds, start, stop };
}

let current: HTMLAudioElement | null = null;
export function playBase64Wav(b64: string) {
  try {
    current?.pause();
    current = new Audio(`data:audio/wav;base64,${b64}`);
    return current.play().catch(() => undefined);
  } catch {
    return Promise.resolve();
  }
}

export async function speakVia(shop: string, text: string, lang: string): Promise<boolean> {
  try {
    const r = await fetch("/api/tts", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ shop, text, lang }) });
    const d = await r.json();
    if (d.audio) {
      await playBase64Wav(d.audio);
      return true;
    }
  } catch {}
  return false;
}

export const inr = (n: number) => "₹" + Math.round(n).toLocaleString("en-IN");

export function qtyLabel(qty: number, unit: string) {
  if (unit === "kg") return qty < 1 ? `${Math.round(qty * 1000)} g` : `${+qty.toFixed(2)} kg`;
  if (unit === "box") return `${qty} box${qty === 1 ? "" : "es"}`;
  return `${qty} pc`;
}

export function stepFor(unit: string) {
  return unit === "kg" ? 0.25 : 1;
}
