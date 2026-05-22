"use client";

/**
 * FilePondDropzone — the actual FilePond instance.
 *
 * THIS FILE IS INTENTIONALLY SEPARATE from ModernUploaderV2.
 * It must be a standalone module so that `dynamic(() => import('./FilePondDropzone'), { ssr: false })`
 * works correctly in Next.js App Router.
 *
 * FilePond accesses `window`, `document`, and the File API at module-load time.
 * If this code runs on the server, it crashes with "document is not defined".
 * The dynamic import with ssr:false ensures it only executes in the browser.
 *
 * FilePond is configured to:
 *   - Accept PDF, PNG, JPG files
 *   - Enforce 25 MB limit
 *   - Provide rich drag-drop + tap UX
 *   - NOT upload files (server prop is null) — upload is handled externally
 *
 * @module components/upload/FilePondDropzone
 */

// FilePond CSS must be imported here — this component is client-only.
import "filepond/dist/filepond.min.css";
import "filepond-plugin-image-preview/dist/filepond-plugin-image-preview.css";

import { useEffect, useRef, useCallback } from "react";
import { FilePond, registerPlugin } from "react-filepond";
import type { FilePond as FilePondInstance } from "react-filepond";
import type { FilePondFile, FilePondErrorDescription } from "filepond";
import FilePondPluginFileValidateType from "filepond-plugin-file-validate-type";
import FilePondPluginFileValidateSize from "filepond-plugin-file-validate-size";
import FilePondPluginImagePreview from "filepond-plugin-image-preview";

// Register plugins once (safe to call multiple times — FilePond deduplicates)
registerPlugin(
  FilePondPluginFileValidateType,
  FilePondPluginFileValidateSize,
  FilePondPluginImagePreview
);

// ─── Types ────────────────────────────────────────────────────────────────────

interface FilePondDropzoneProps {
  onFileSelected: (file: File) => void;
  onResetRef: (resetFn: () => void) => void;
  disabled?: boolean;
}

// ─── Custom FilePond CSS overrides ────────────────────────────────────────────
// Injected as a <style> tag — scoped to .sp-filepond-root to avoid polluting
// other FilePond instances (e.g. if used elsewhere in the app).
const FILEPOND_OVERRIDES = `
  .sp-filepond-root .filepond--root {
    font-family: 'Inter', system-ui, sans-serif;
    margin-bottom: 0;
  }
  .sp-filepond-root .filepond--panel-root {
    background: #f8fafc;
    border: 2px dashed #e2e8f0;
    border-radius: 16px;
    transition: border-color 0.2s, background 0.2s;
  }
  .sp-filepond-root .filepond--root:not(.filepond--hopper-droptarget) .filepond--panel-root:hover {
    border-color: #10b981;
    background: #f0fdf4;
  }
  .sp-filepond-root .filepond--drop-label {
    color: #64748b;
    font-size: 14px;
    font-weight: 600;
  }
  .sp-filepond-root .filepond--drop-label label {
    cursor: pointer;
  }
  .sp-filepond-root .filepond--label-action {
    text-decoration: none;
    color: #10b981;
    font-weight: 700;
  }
  .sp-filepond-root .filepond--drip-blob {
    background: #d1fae5;
  }
  .sp-filepond-root .filepond--item-panel {
    background: #ffffff;
    border-radius: 12px;
    border: 1px solid #f1f5f9;
  }
  .sp-filepond-root .filepond--file-action-button {
    background: rgba(15, 23, 42, 0.06);
  }
  .sp-filepond-root .filepond--file-action-button:hover {
    background: rgba(15, 23, 42, 0.12);
  }
  .sp-filepond-root .filepond--progress-indicator path {
    stroke: #10b981;
  }
  .sp-filepond-root [data-filepond-item-state='processing-complete'] .filepond--item-panel {
    background: #f0fdf4;
  }
  .sp-filepond-root [data-filepond-item-state~='error'] .filepond--item-panel,
  .sp-filepond-root [data-filepond-item-state~='invalid'] .filepond--item-panel {
    background: #fff1f2;
  }
  .sp-filepond-root .filepond--image-preview-overlay-idle {
    color: rgba(0,0,0,0.25);
  }
  .sp-filepond-root .filepond--image-preview-wrapper {
    border-radius: 10px;
  }
  /* Mobile: larger drop label tap area */
  @media (max-width: 640px) {
    .sp-filepond-root .filepond--panel-root {
      min-height: 140px;
    }
    .sp-filepond-root .filepond--drop-label {
      font-size: 13px;
    }
  }
`;

// ─── Component ────────────────────────────────────────────────────────────────

export function FilePondDropzone({
  onFileSelected,
  onResetRef,
  disabled = false,
}: FilePondDropzoneProps) {
  // Use a callback ref instead of useRef<T> to avoid LegacyRef<FilePond> incompatibility.
  // FilePond's prop type is LegacyRef which accepts (instance: T | null) => void callbacks.
  const pondInstanceRef = useRef<FilePondInstance | null>(null);

  const pondCallbackRef = useCallback((instance: FilePondInstance | null) => {
    pondInstanceRef.current = instance;
  }, []);

  // Expose a reset function to the parent
  useEffect(() => {
    onResetRef(() => {
      pondInstanceRef.current?.removeFiles();
    });
  }, [onResetRef]);

  const handleAddFile = useCallback(
    (error: FilePondErrorDescription | null, fileItem: FilePondFile) => {
      if (error) return; // validation errors handled by FilePond UI
      // FilePond wraps the native File in fileItem.file
      const nativeFile = fileItem.file as unknown as File;
      if (nativeFile) {
        onFileSelected(nativeFile);
      }
    },
    [onFileSelected]
  );

  return (
    <>
      {/* Scoped CSS overrides */}
      <style dangerouslySetInnerHTML={{ __html: FILEPOND_OVERRIDES }} />

      <div className="sp-filepond-root">
        <FilePond
          ref={pondCallbackRef}
          // ── File rules ──────────────────────────────────────────────────
          allowMultiple={false}
          maxFiles={1}
          acceptedFileTypes={["application/pdf", "image/png", "image/jpeg"]}
          maxFileSize="25MB"
          // ── Upload: DISABLED — we use existing presign flow ─────────────
          server={null}
          instantUpload={false}
          allowProcess={false}
          // ── UX ─────────────────────────────────────────────────────────
          labelIdle={`
            <span class="filepond--label-action" style="display:flex;flex-direction:column;align-items:center;gap:8px;padding:8px 0">
              <svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#10b981" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/>
              </svg>
              <span style="font-weight:700;color:#1e293b;font-size:15px">Drop file here or <u style='color:#10b981'>browse</u></span>
              <span style="font-size:11px;color:#94a3b8;font-weight:600;text-transform:uppercase;letter-spacing:0.08em">PDF · PNG · JPG · up to 25 MB</span>
            </span>
          `}
          labelFileTypeNotAllowed="Only PDF, PNG and JPG files are allowed."
          fileValidateTypeLabelExpectedTypes="Accepts PDF, PNG, JPG"
          labelMaxFileSizeExceeded="File exceeds 25 MB limit."
          labelMaxFileSize="Max size: 25 MB"
          labelFileProcessingError="Upload failed — please retry."
          credits={false}
          disabled={disabled}
          // ── Callbacks ───────────────────────────────────────────────────
          onaddfile={handleAddFile}
          // Image preview config
          allowImagePreview={true}
          imagePreviewHeight={80}
        />
      </div>
    </>
  );
}
