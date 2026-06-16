/**
 * public/workers/scanner.worker.js
 *
 * High-performance Web Worker for off-main-thread scanner operations.
 * Handles:
 *  1. Image Filters (Grayscale, Thresholding/Document Enhancement, Contrast)
 *  2. Image Compression
 *  3. PDF Compilation (zero-dependency binary compiler)
 */

self.onmessage = function (e) {
  const { command, id, payload } = e.data;

  try {
    switch (command) {
      case "applyFilters":
        handleApplyFilters(id, payload);
        break;

      case "generatePdf":
        handleGeneratePdf(id, payload);
        break;

      case "compressImage":
        handleCompressImage(id, payload);
        break;

      default:
        self.postMessage({ id, error: `Unknown command: ${command}` });
    }
  } catch (err) {
    self.postMessage({ id, error: err.message });
  }
};

/**
 * Applies filters (grayscale, thresholding, contrast) to ImageData pixels.
 * Uses transferable array buffers for zero-copy memory transfer.
 */
function handleApplyFilters(id, payload) {
  const { width, height, pixels, filters } = payload;
  const data = new Uint8ClampedArray(pixels);

  const length = data.length;
  const { grayscale, threshold, contrast } = filters;

  // Apply Grayscale
  if (grayscale || threshold) {
    for (let i = 0; i < length; i += 4) {
      const r = data[i];
      const g = data[i + 1];
      const b = data[i + 2];
      // Luminance formula
      const gray = Math.round(0.299 * r + 0.587 * g + 0.114 * b);
      data[i] = gray;
      data[i + 1] = gray;
      data[i + 2] = gray;
    }
  }

  // Apply Threshold (Binary Black & White Document style)
  if (threshold) {
    const limit = typeof threshold === "number" ? threshold : 128;
    for (let i = 0; i < length; i += 4) {
      const gray = data[i];
      const v = gray >= limit ? 255 : 0;
      data[i] = v;
      data[i + 1] = v;
      data[i + 2] = v;
    }
  }

  // Apply Contrast Enhancement
  if (contrast && contrast !== 1) {
    const factor = (259 * (contrast * 255 + 255)) / (255 * (259 - contrast * 255));
    for (let i = 0; i < length; i += 4) {
      data[i] = clamp(factor * (data[i] - 128) + 128);
      data[i + 1] = clamp(factor * (data[i + 1] - 128) + 128);
      data[i + 2] = clamp(factor * (data[i + 2] - 128) + 128);
    }
  }

  // Transfer pixel buffer back to main thread
  self.postMessage(
    {
      id,
      result: {
        width,
        height,
        pixels: data.buffer,
      },
    },
    [data.buffer]
  );
}

function clamp(value) {
  return Math.max(0, Math.min(255, Math.round(value)));
}

/**
 * Compiles a list of JPEG buffers into a single, perfectly structured PDF document.
 * This runs with zero external dependencies and does not block the UI thread.
 */
function handleGeneratePdf(id, payload) {
  const { images } = payload; // Array of { data: ArrayBuffer, width: number, height: number }
  const pdfBytes = generatePdfBytes(images);

  self.postMessage(
    {
      id,
      result: {
        pdfData: pdfBytes.buffer,
      },
    },
    [pdfBytes.buffer]
  );
}

function generatePdfBytes(images) {
  const numPages = images.length;
  const pdfParts = [];
  let currentOffset = 0;
  const offsets = [];

  function write(bytes) {
    if (typeof bytes === "string") {
      const encoder = new TextEncoder();
      bytes = encoder.encode(bytes);
    }
    pdfParts.push(bytes);
    currentOffset += bytes.byteLength;
  }

  // PDF Version Header
  write("%PDF-1.4\n");

  const catalogId = 1;
  const pagesId = 2;

  // Catalog Object
  offsets[catalogId] = currentOffset;
  write(`${catalogId} 0 obj\n<< /Type /Catalog /Pages ${pagesId} 0 R >>\nendobj\n`);

  // Pages Root Object
  offsets[pagesId] = currentOffset;
  let kidsStr = "";
  for (let i = 0; i < numPages; i++) {
    const pageId = 3 + 3 * i;
    kidsStr += `${pageId} 0 R `;
  }
  write(`${pagesId} 0 obj\n<< /Type /Pages /Kids [ ${kidsStr.trim()} ] /Count ${numPages} >>\nendobj\n`);

  // Build each page dynamically
  for (let i = 0; i < numPages; i++) {
    const img = images[i];
    const pageId = 3 + 3 * i;
    const contentId = 3 + 3 * i + 1;
    const imageId = 3 + 3 * i + 2;

    const width = img.width;
    const height = img.height;

    // Page object references resources and content streams
    offsets[pageId] = currentOffset;
    write(
      `${pageId} 0 obj\n<< /Type /Page /Parent ${pagesId} 0 R /Resources << /XObject << /Im1 ${imageId} 0 R >> >> /MediaBox [0 0 ${width} ${height}] /Contents ${contentId} 0 R >>\nendobj\n`
    );

    // Content Stream: draws the image to scale
    offsets[contentId] = currentOffset;
    const streamContent = `q ${width} 0 0 ${height} 0 0 cm /Im1 Do Q\n`;
    write(`${contentId} 0 obj\n<< /Length ${streamContent.length} >>\nstream\n${streamContent}endstream\nendobj\n`);

    // Image XObject embeds the JPEG payload directly using DCTDecode
    offsets[imageId] = currentOffset;
    const imgHeader = `${imageId} 0 obj\n<< /Type /XObject /Subtype /Image /Width ${width} /Height ${height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${img.data.byteLength} >>\nstream\n`;
    const imgFooter = "\nendstream\nendobj\n";

    write(imgHeader);
    write(new Uint8Array(img.data));
    write(imgFooter);
  }

  // Write Cross-Reference (xref) Table
  const xrefOffset = currentOffset;
  const numObjects = 2 + 3 * numPages;
  write("xref\n");
  write(`0 ${numObjects + 1}\n`);
  write("0000000000 65535 f \n"); // Index 0 is special free object
  for (let i = 1; i <= numObjects; i++) {
    const offsetStr = String(offsets[i]).padStart(10, "0");
    write(`${offsetStr} 00000 n \n`);
  }

  // Write PDF Trailer
  write(`trailer\n<< /Size ${numObjects + 1} /Root ${catalogId} 0 R >>\n`);
  write("startxref\n");
  write(`${xrefOffset}\n`);
  write("%%EOF\n");

  // Merge bytes
  const totalLength = pdfParts.reduce((sum, chunk) => sum + chunk.byteLength, 0);
  const pdfBytes = new Uint8Array(totalLength);
  let offset = 0;
  for (const chunk of pdfParts) {
    pdfBytes.set(chunk, offset);
    offset += chunk.byteLength;
  }

  return pdfBytes;
}

/**
 * Resizes and compresses image data using canvas operations inside Worker if OffscreenCanvas is available,
 * otherwise does simple pixel-thinning compression.
 */
function handleCompressImage(id, payload) {
  const { width, height, pixels, maxDimension = 1600, quality = 0.8 } = payload;
  
  // Downscale size if exceeding maxDimension
  let newWidth = width;
  let newHeight = height;
  if (width > maxDimension || height > maxDimension) {
    if (width > height) {
      newWidth = maxDimension;
      newHeight = Math.round((height * maxDimension) / width);
    } else {
      newHeight = maxDimension;
      newWidth = Math.round((width * maxDimension) / height);
    }
  }

  const srcData = new Uint8ClampedArray(pixels);

  // If OffscreenCanvas is supported in the worker browser thread, we can compress using canvas
  if (typeof OffscreenCanvas !== "undefined") {
    const canvas = new OffscreenCanvas(newWidth, newHeight);
    const ctx = canvas.getContext("2d");
    
    // Put original image data on offscreen canvas
    const origCanvas = new OffscreenCanvas(width, height);
    const origCtx = origCanvas.getContext("2d");
    const origImageData = origCtx.createImageData(width, height);
    origImageData.data.set(srcData);
    origCtx.putImageData(origImageData, 0, 0);

    // Draw scaled down
    ctx.drawImage(origCanvas, 0, 0, width, height, 0, 0, newWidth, newHeight);

    // Export as JPEG blob
    canvas.convertToBlob({ type: "image/jpeg", quality: quality }).then((blob) => {
      blob.arrayBuffer().then((buffer) => {
        self.postMessage({
          id,
          result: {
            width: newWidth,
            height: newHeight,
            compressedBuffer: buffer,
          }
        }, [buffer]);
      });
    }).catch(err => {
      fallbackCompress(id, srcData, width, height, newWidth, newHeight);
    });
  } else {
    fallbackCompress(id, srcData, width, height, newWidth, newHeight);
  }
}

/** Simple pixel-thinned bilinear resizing fallback if OffscreenCanvas is unavailable */
function fallbackCompress(id, srcData, oldW, oldH, newW, newH) {
  const destData = new Uint8ClampedArray(newW * newH * 4);
  const xRatio = oldW / newW;
  const yRatio = oldH / newH;

  for (let i = 0; i < newH; i++) {
    for (let j = 0; j < newW; j++) {
      const px = Math.floor(j * xRatio);
      const py = Math.floor(i * yRatio);
      const srcIdx = (py * oldW + px) * 4;
      const destIdx = (i * newW + j) * 4;

      destData[destIdx] = srcData[srcIdx];
      destData[destIdx + 1] = srcData[srcIdx + 1];
      destData[destIdx + 2] = srcData[srcIdx + 2];
      destData[destIdx + 3] = srcData[srcIdx + 3];
    }
  }

  self.postMessage({
    id,
    result: {
      width: newW,
      height: newH,
      pixels: destData.buffer,
    }
  }, [destData.buffer]);
}
