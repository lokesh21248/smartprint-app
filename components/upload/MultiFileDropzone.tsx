"use client";

import "filepond/dist/filepond.min.css";
import "filepond-plugin-image-preview/dist/filepond-plugin-image-preview.css";

import { useEffect, useRef, useCallback } from "react";
import { FilePond, registerPlugin } from "react-filepond";
import type { FilePond as FilePondInstance } from "react-filepond";
import type { FilePondFile, FilePondErrorDescription } from "filepond";
import FilePondPluginFileValidateType from "filepond-plugin-file-validate-type";
import FilePondPluginFileValidateSize from "filepond-plugin-file-validate-size";
import FilePondPluginImagePreview from "filepond-plugin-image-preview";

// Register FilePond plugins
registerPlugin(
  FilePondPluginFileValidateType,
  FilePondPluginFileValidateSize,
  FilePondPluginImagePreview
);

interface MultiFileDropzoneProps {
  onFilesSelected: (files: File[]) => void;
  disabled?: boolean;
}

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
  .sp-filepond-root .filepond--list-scroller {
    display: none !important; /* Hide FilePond's internal file list since we render a custom UI */
  }
  @media (max-width: 640px) {
    .sp-filepond-root .filepond--panel-root {
      min-height: 140px;
    }
    .sp-filepond-root .filepond--drop-label {
      font-size: 13px;
    }
  }
`;

export function MultiFileDropzone({ onFilesSelected, disabled = false }: MultiFileDropzoneProps) {
  const pondInstanceRef = useRef<FilePondInstance | null>(null);

  const pondCallbackRef = useCallback((instance: FilePondInstance | null) => {
    pondInstanceRef.current = instance;
  }, []);

  const handleUpdateFiles = useCallback(
    (fileItems: FilePondFile[]) => {
      if (fileItems.length === 0) return;

      const validFiles: File[] = [];
      fileItems.forEach((item) => {
        // fileItem.file wraps the native File object
        const nativeFile = item.file as unknown as File;
        if (nativeFile) {
          validFiles.push(nativeFile);
        }
      });

      if (validFiles.length > 0) {
        onFilesSelected(validFiles);
        // Clear FilePond's internal file queue immediately so it's always ready for more drops
        // and we don't display items in the default list
        setTimeout(() => {
          pondInstanceRef.current?.removeFiles();
        }, 100);
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
          acceptedFileTypes={["application/pdf", "image/png", "image/jpeg", "image/jpg"]}
          maxFileSize="25MB"
          server={null}
          instantUpload={false}
          allowProcess={false}
          labelIdle={`
            <span class="filepond--label-action" style="display:flex;flex-direction:column;align-items:center;gap:8px;padding:8px 0">
              <svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#10b981" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/>
              </svg>
              <span style="font-weight:700;color:#1e293b;font-size:15px">Drop multiple files here or <u style='color:#10b981'>browse</u></span>
              <span style="font-size:11px;color:#94a3b8;font-weight:600;text-transform:uppercase;letter-spacing:0.08em">PDF · PNG · JPG · up to 25 MB each</span>
            </span>
          `}
          labelFileTypeNotAllowed="Only PDF, PNG and JPG files are allowed."
          fileValidateTypeLabelExpectedTypes="Accepts PDF, PNG, JPG"
          labelMaxFileSizeExceeded="File exceeds 25 MB limit."
          labelMaxFileSize="Max size: 25 MB per file"
          credits={false}
          disabled={disabled}
          onupdatefiles={handleUpdateFiles}
          allowImagePreview={false} // Disable since we hide the list and render custom thumbnails
        />
      </div>
    </>
  );
}
