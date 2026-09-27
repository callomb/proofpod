"use client";

import { useEffect, useRef, useState } from "react";
import jsQR from "jsqr";

import { Sheet } from "../app-shell";
import { Button, FormError } from "../ui";

/**
 * A button that opens a camera sheet and decodes a QR code into a text value
 * via onScan. The scanned text is treated as an opaque asset-number string —
 * no assumption about payload format, since the label format isn't finalised
 * yet. Manual entry always remains available next to this button.
 */
export function QrScanButton({
  onScan,
  label = "Scan QR",
  full = false,
}: {
  onScan: (value: string) => void;
  label?: string;
  /** Full-width, primary-styled — for when scanning is the lead action, not a fallback. */
  full?: boolean;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button
        type="button"
        variant={full ? "primary" : "secondary"}
        size={full ? "lg" : "sm"}
        className={full ? "w-full" : undefined}
        onClick={() => setOpen(true)}
      >
        {label}
      </Button>
      <QrScanSheet
        open={open}
        onClose={() => setOpen(false)}
        onScan={(value) => {
          onScan(value);
          setOpen(false);
        }}
      />
    </>
  );
}

function QrScanSheet({
  open,
  onClose,
  onScan,
}: {
  open: boolean;
  onClose: () => void;
  onScan: (value: string) => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const rafRef = useRef<number | null>(null);
  const onScanRef = useRef(onScan);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    onScanRef.current = onScan;
  }, [onScan]);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;

    function tick() {
      const video = videoRef.current;
      const canvas = canvasRef.current;
      if (video && canvas && video.readyState === video.HAVE_ENOUGH_DATA) {
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        const ctx = canvas.getContext("2d");
        if (ctx) {
          ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
          const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
          const code = jsQR(imageData.data, imageData.width, imageData.height);
          if (code?.data) {
            onScanRef.current(code.data);
            return;
          }
        }
      }
      rafRef.current = requestAnimationFrame(tick);
    }

    async function start() {
      setError(null);
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: "environment" },
        });
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play();
        }
        tick();
      } catch {
        if (!cancelled) setError("Couldn't access the camera — enter the value manually instead.");
      }
    }

    start();

    return () => {
      cancelled = true;
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    };
  }, [open]);

  return (
    <Sheet open={open} onClose={onClose} title="Scan QR code">
      <div className="overflow-hidden rounded-2xl bg-ink">
        <video ref={videoRef} className="aspect-square w-full object-cover" muted playsInline />
      </div>
      <canvas ref={canvasRef} className="hidden" />
      <FormError>{error}</FormError>
      <p className="mt-3 text-center text-[12px] text-muted">
        Point the camera at the asset&apos;s QR label.
      </p>
    </Sheet>
  );
}
