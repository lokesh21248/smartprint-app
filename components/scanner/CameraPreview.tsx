"use client";

import React, {
  useEffect,
  useRef,
  useState,
  useImperativeHandle,
  forwardRef,
  useCallback,
} from "react";
import { Camera, SwitchCamera, AlertCircle, Zap, ZapOff, Loader2 } from "lucide-react";
import { toast } from "sonner";

export interface CameraPreviewRef {
  capture: () => {
    pixels: ArrayBuffer;
    width: number;
    height: number;
    dataUrl: string;
  } | null;
  toggleTorch: () => void;
  isTorchOn: boolean;
  hasTorch: boolean;
}

interface CameraPreviewProps {
  onCameraReady: () => void;
  onCameraError: (err: string) => void;
}

export const CameraPreview = forwardRef<CameraPreviewRef, CameraPreviewProps>(
  ({ onCameraReady, onCameraError }, ref) => {
    const videoRef = useRef<HTMLVideoElement>(null);
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const streamRef = useRef<MediaStream | null>(null);

    const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
    const [activeDeviceId, setActiveDeviceId] = useState<string>("");
    const [facingMode, setFacingMode] = useState<"user" | "environment">("environment");
    const [error, setError] = useState<string | null>(null);
    const [hasTorch, setHasTorch] = useState(false);
    const [isTorchOn, setIsTorchOn] = useState(false);
    const [isInitializing, setIsInitializing] = useState(true);

    // ── Caching Permissions & Capabilities ─────────────────────────────
    // Speed optimization: loads list of camera devices cached from the previous session 
    // to render the selection dropdown instantly without waiting for enumerateDevices.
    useEffect(() => {
      try {
        const cachedDevices = localStorage.getItem("sp_camera_devices");
        if (cachedDevices) {
          setDevices(JSON.parse(cachedDevices));
        }
        const cachedFacing = localStorage.getItem("sp_camera_facing");
        if (cachedFacing) {
          setFacingMode(cachedFacing as "user" | "environment");
        }
      } catch (e) {
        console.warn("Error loading cached camera capabilities:", e);
      }
    }, []);

    const stopCamera = useCallback(() => {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((track) => track.stop());
        streamRef.current = null;
      }
      if (videoRef.current) {
        videoRef.current.srcObject = null;
      }
      setIsTorchOn(false);
    }, []);

    // ── Start Camera Stream ─────────────────────────────────────────────
    const startCamera = useCallback(async () => {
      stopCamera();
      setError(null);
      setIsInitializing(true);

      // Pre-emptively check permission API to prevent blocking prompts on deny
      if (typeof window !== "undefined" && navigator.permissions && navigator.permissions.query) {
        try {
          const status = await navigator.permissions.query({ name: "camera" as any });
          if (status.state === "denied") {
            const errMsg = "Camera access permission denied by browser settings.";
            setError(errMsg);
            onCameraError(errMsg);
            setIsInitializing(false);
            return;
          }
        } catch (e) {
          // Permissions API query not supported or fails — proceed silently
        }
      }

      // Construct dynamic constraints focusing on rapid startup and clear frames
      const constraints: MediaStreamConstraints = {
        audio: false,
        video: activeDeviceId
          ? { deviceId: { exact: activeDeviceId } }
          : {
              facingMode: { ideal: facingMode },
              width: { ideal: 1280 },
              height: { ideal: 720 },
            },
      };

      try {
        const startTime = performance.now();
        console.log("[Camera] Requesting getUserMedia stream...");

        const stream = await navigator.mediaDevices.getUserMedia(constraints);
        streamRef.current = stream;

        if (videoRef.current) {
          videoRef.current.srcObject = stream;
        }

        // Cache successful permission grant to bypass browser security dialog checks on subsequent entries
        localStorage.setItem("sp_camera_permission", "granted");
        localStorage.setItem("sp_camera_facing", facingMode);

        // Fetch features/capabilities supported by active video track (e.g. torch, focusing)
        const track = stream.getVideoTracks()[0];
        if (track) {
          const capabilities = track.getCapabilities?.() || {};
          // Check if device supports torch flashlight
          const supportsTorch = "torch" in capabilities;
          setHasTorch(supportsTorch);
        }

        // Enumerate inputs concurrently after starting to refresh the device selector options
        navigator.mediaDevices.enumerateDevices().then((allDevices) => {
          const videoDevices = allDevices.filter((d) => d.kind === "videoinput");
          setDevices(videoDevices);
          try {
            localStorage.setItem("sp_camera_devices", JSON.stringify(videoDevices));
          } catch {}
        });

        console.log(`[Camera] Started successfully in ${(performance.now() - startTime).toFixed(1)}ms`);
        setIsInitializing(false);
        onCameraReady();
      } catch (err: any) {
        console.error("[Camera] Access failure:", err);
        const errMsg = err.message || "Failed to access webcam camera";
        setError(errMsg);
        onCameraError(errMsg);
        setIsInitializing(false);
      }
    }, [activeDeviceId, facingMode, stopCamera, onCameraReady, onCameraError]);

    // Initialize camera on mount and when deviceId/facing changes
    useEffect(() => {
      // Small delay prevents lockups on fast hot-reloading
      const t = setTimeout(() => {
        startCamera();
      }, 50);

      return () => {
        clearTimeout(t);
        stopCamera();
      };
    }, [startCamera, stopCamera]);

    // ── Switch Camera ───────────────────────────────────────────────────
    const handleToggleCamera = useCallback(() => {
      if (devices.length > 1) {
        // Switch to the next device
        const currentIdx = devices.findIndex((d) => d.deviceId === activeDeviceId);
        const nextIdx = (currentIdx + 1) % devices.length;
        setActiveDeviceId(devices[nextIdx].deviceId);
      } else {
        // Toggle default facing modes
        setFacingMode((prev) => (prev === "environment" ? "user" : "environment"));
      }
    }, [devices, activeDeviceId]);

    // ── Toggle Torch Flashlight ─────────────────────────────────────────
    const toggleTorch = useCallback(async () => {
      if (!hasTorch || !streamRef.current) return;
      const track = streamRef.current.getVideoTracks()[0];
      if (!track) return;

      const nextTorchState = !isTorchOn;
      try {
        await track.applyConstraints({
          advanced: [{ torch: nextTorchState } as any],
        });
        setIsTorchOn(nextTorchState);
      } catch (e) {
        toast.error("Failed to toggle flashlight on this device");
      }
    }, [hasTorch, isTorchOn]);

    // ── Capture Canvas Frame ────────────────────────────────────────────
    const capture = useCallback(() => {
      if (!videoRef.current || !canvasRef.current || !streamRef.current) return null;

      const video = videoRef.current;
      const canvas = canvasRef.current;

      const width = video.videoWidth || 1920;
      const height = video.videoHeight || 1080;

      canvas.width = width;
      canvas.height = height;

      const ctx = canvas.getContext("2d");
      if (!ctx) return null;

      // Draw the exact video frame onto canvas
      ctx.drawImage(video, 0, 0, width, height);

      // Extract raw image data pixels for high-performance off-main-thread processing
      const imgData = ctx.getImageData(0, 0, width, height);
      const dataUrl = canvas.toDataURL("image/jpeg", 0.9);

      // Create a copy of the pixel buffer to send to worker (transferable array buffer)
      const buffer = new Uint8ClampedArray(imgData.data).buffer;

      return {
        pixels: buffer,
        width,
        height,
        dataUrl,
      };
    }, []);

    // Expose APIs to parent container
    useImperativeHandle(ref, () => ({
      capture,
      toggleTorch,
      isTorchOn,
      hasTorch,
    }));

    return (
      <div className="relative w-full h-full bg-slate-950 flex items-center justify-center overflow-hidden rounded-2xl border border-slate-800">
        {isInitializing && (
          <div className="absolute inset-0 bg-slate-950/80 flex flex-col items-center justify-center z-20">
            <Loader2 className="w-8 h-8 text-emerald-400 animate-spin" />
            <span className="text-xs text-slate-400 font-bold uppercase tracking-wider mt-3">
              Initializing Camera...
            </span>
          </div>
        )}

        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted
          className="w-full h-full object-cover transform scale-x-1"
        />

        {/* Hidden capture canvas */}
        <canvas ref={canvasRef} className="hidden" />

        {/* Camera overlay border guide */}
        <div className="absolute inset-8 sm:inset-14 md:inset-16 border-2 border-dashed border-emerald-400/40 rounded-2xl pointer-events-none flex items-center justify-center">
          <div className="absolute top-0 left-0 w-8 h-8 border-t-4 border-l-4 border-emerald-400 rounded-tl-xl" />
          <div className="absolute top-0 right-0 w-8 h-8 border-t-4 border-r-4 border-emerald-400 rounded-tr-xl" />
          <div className="absolute bottom-0 left-0 w-8 h-8 border-b-4 border-l-4 border-emerald-400 rounded-bl-xl" />
          <div className="absolute bottom-0 right-0 w-8 h-8 border-b-4 border-r-4 border-emerald-400 rounded-br-xl" />

          {/* Simple align text indicator */}
          <span className="text-[10px] sm:text-xs font-bold uppercase tracking-widest text-slate-200/60 bg-slate-950/60 px-3 py-1 rounded-full backdrop-blur-sm select-none">
            Align document inside box
          </span>
        </div>

        {/* Interactive camera settings overlay */}
        <div className="absolute top-4 right-4 flex items-center gap-2">
          {hasTorch && (
            <button
              onClick={toggleTorch}
              className={`p-2.5 rounded-xl border backdrop-blur transition active:scale-95 ${
                isTorchOn
                  ? "bg-amber-500 border-amber-400 text-slate-900"
                  : "bg-slate-900/80 border-slate-800 text-slate-300 hover:text-white"
              }`}
              title="Toggle Flashlight"
            >
              {isTorchOn ? <Zap className="w-4 h-4 fill-current" /> : <ZapOff className="w-4 h-4" />}
            </button>
          )}

          {(devices.length > 1 || !activeDeviceId) && (
            <button
              onClick={handleToggleCamera}
              className="p-2.5 rounded-xl bg-slate-900/80 border border-slate-800 text-slate-300 hover:text-white backdrop-blur transition active:scale-95"
              title="Switch Camera Source"
            >
              <SwitchCamera className="w-4 h-4" />
            </button>
          )}
        </div>

        {/* Error overlay fallback */}
        {error && (
          <div className="absolute inset-0 bg-slate-900/90 flex flex-col items-center justify-center p-6 text-center text-white">
            <AlertCircle className="w-12 h-12 text-rose-500 mb-4 animate-bounce" />
            <h3 className="text-base font-extrabold mb-1">Camera Stream Blocked</h3>
            <p className="text-xs text-slate-400 max-w-sm mb-4">
              Please verify that camera permissions are enabled in your browser settings and try again.
            </p>
            <button
              onClick={startCamera}
              className="px-4 py-2 bg-emerald-500 hover:bg-emerald-600 rounded-xl text-xs font-bold transition active:scale-95"
            >
              Retry Connection
            </button>
          </div>
        )}
      </div>
    );
  }
);

CameraPreview.displayName = "CameraPreview";
