"use client";

import "filepond/dist/filepond.min.css";

import { useRef, useCallback } from "react";
import { FilePond, registerPlugin } from "react-filepond";
import type { FilePond as FilePondInstance } from "react-filepond";
import type { FilePondFile } from "filepond";
import FilePondPluginFileValidateType from "filepond-plugin-file-validate-type";
import FilePondPluginFileValidateSize from "filepond-plugin-file-validate-size";

// Register FilePond plugins — image preview omitted (we render custom thumbnails)
registerPlugin(FilePondPluginFileValidateType, FilePondPluginFileValidateSize);

interface MultiFileDropzoneProps {
  onFilesSelected: (files: File[]) => void;
  disabled?: boolean;
}

// Custom CSS overrides — scoped to .sp-filepond-root to avoid global contamination
const FILEPOND_OVERRIDES = `
  .sp-filepond-root .filepond--root {
    font-family: 'Inter', system-ui, -apple-system, sans-serif;
    margin-bottom: 0;
  }
  .sp-filepond-root .filepond--panel-root {
    background: #f8fafc;
    border: 2px dashed #e2e8f0;
    border-radius: 20px;
    transition: border-color 0.2s ease, background 0.2s ease, box-shadow 0.2s ease;
  }
  .sp-filepond-root .filepond--root.filepond--hopper-droptarget .filepond--panel-root,
  .sp-filepond-root .filepond--root:focus-within .filepond--panel-root {
    border-color: #10b981;
    background: #f0fdf4;
    box-shadow: 0 0 0 3px rgba(16, 185, 129, 0.12);
  }
  .sp-filepond-root .filepond--drop-label {
    color: #64748b;
    font-size: 14px;
    font-weight: 600;
    min-height: 140px;
  }
  .sp-filepond-root .filepond--drop-label label {
    cursor: pointer;
    padding: 24px 16px;
  }
  .sp-filepond-root .filepond--label-action {
    text-decoration: none;
    color: #10b981;
    font-weight: 800;
  }
  .sp-filepond-root .filepond--drip-blob {
    background: #d1fae5;
  }
  .sp-filepond-root .filepond--list-scroller {
    display: none !important;
  }
  .sp-filepond-root .filepond--credits {
    display: none !important;
  }
  /* Bigger tap targets on mobile */
  @media (max-width: 640px) {
    .sp-filepond-root .filepond--panel-root {
      min-height: 120px;
      border-radius: 16px;
    }
    .sp-filepond-root .filepond--drop-label {
      font-size: 13px;
      min-height: 120px;
    }
  }
`;

export function MultiFileDropzone({ onFilesSelected, disabled = false }: MultiFileDropzoneProps) {
  const pondInstanceRef = useRef<FilePondInstance | null>(null);

  const pondCallbackRef = useCallback((instance: FilePondInstance | null) => {
    pondInstanceRef.current = instance;
  }, []);

  const handleAddFile = useCallback(
    (error: unknown, item: FilePondFile) => {
      if (error) return;
      const nativeFile = item.file as unknown as File;
      if (nativeFile) {
        onFilesSelected([nativeFile]);
        // Clear this file from FilePond's internal list immediately
        setTimeout(() => {
          pondInstanceRef.current?.removeFile(item.id);
        }, 50);
      }
    },
    [onFilesSelected]
  );

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: FILEPOND_OVERRIDES }} />
      <div className="sp-filepond-root">
        <FilePond
          ref={pondCallbackRef}
          allowMultiple={true}
          maxFiles={20}
          acceptedFileTypes={[
            "application/pdf",
            "image/png",
            "image/jpeg",
            "image/jpg",
            "image/webp",
          ]}
          maxFileSize="25MB"
          server={null}
          instantUpload={false}
          allowProcess={false}
          labelIdle={`
            <span style="display:flex;flex-direction:column;align-items:center;gap:10px;padding:4px 0;cursor:pointer">
              <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#10b981" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                <polyline points="17 8 12 3 7 8"/>
                <line x1="12" y1="3" x2="12" y2="15"/>
              </svg>
              <span style="font-weight:800;color:#1e293b;font-size:15px;letter-spacing:-0.01em">
                Drop files here or <u style="color:#10b981;text-underline-offset:2px">browse</u>
              </span>
              <span style="font-size:10px;color:#94a3b8;font-weight:700;text-transform:uppercase;letter-spacing:0.1em;background:#f1f5f9;padding:4px 10px;border-radius:999px">
                PDF · PNG · JPG · up to 25 MB
              </span>
            </span>
          `}
          labelFileTypeNotAllowed="Only PDF, PNG, JPG files are allowed."
          fileValidateTypeLabelExpectedTypes="Accepts PDF, PNG, JPG"
          labelMaxFileSizeExceeded="File exceeds the 25 MB limit."
          labelMaxFileSize="Max 25 MB per file"
          credits={false}
          disabled={disabled}
          onaddfile={handleAddFile}
        />
      </div>
    </>
  );
}
