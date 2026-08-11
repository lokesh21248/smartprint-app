const fs = require("fs");
const path = require("path");
const https = require("https");

const SOUNDS_DIR = path.join(__dirname, "..", "public", "sounds");

const SOUND_SOURCES = {
  whatsapp: "https://raw.githubusercontent.com/shubhamsigdar/whatsapp-sound/master/whatsapp.mp3",
  bell: "https://raw.githubusercontent.com/shinglyu/countdown/master/bell.mp3",
  ding: "https://raw.githubusercontent.com/shinglyu/countdown/master/ding.mp3",
  cash: "https://raw.githubusercontent.com/rafaelreis-hotmart/React-Native-Sound-Example/master/cash.mp3"
};

// Generates a tiny, valid 0.5-second silent WAV file as a bulletproof local fallback
function createSilentWavBuffer() {
  const sampleRate = 8000;
  const numChannels = 1;
  const bitsPerSample = 16;
  const byteRate = (sampleRate * numChannels * bitsPerSample) / 8;
  const blockAlign = (numChannels * bitsPerSample) / 8;
  const seconds = 0.5;
  const dataSize = seconds * byteRate;
  const chunkSize = 36 + dataSize;

  const buffer = Buffer.alloc(44 + dataSize);

  // RIFF Header
  buffer.write("RIFF", 0);
  buffer.writeUInt32LE(chunkSize, 4);
  buffer.write("WAVE", 8);

  // Format Chunk
  buffer.write("fmt ", 12);
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20); // Uncompressed PCM
  buffer.writeUInt16LE(numChannels, 22);
  buffer.writeUInt32LE(sampleRate, 24);
  buffer.writeUInt32LE(byteRate, 28);
  buffer.writeUInt16LE(blockAlign, 32);
  buffer.writeUInt16LE(bitsPerSample, 34);

  // Data Chunk
  buffer.write("data", 36);
  buffer.writeUInt32LE(dataSize, 40);

  // Leaves the rest as 0 (silence)
  return buffer;
}

function downloadFile(name, url) {
  const destPath = path.join(SOUNDS_DIR, `${name}.mp3`);
  const tmpPath = destPath + ".tmp";
  console.log(`[Sound Downloader] Attempting to download ${name} from: ${url}`);

  return new Promise((resolve) => {
    let handled = false;
    let fileStream = null;

    const doFallback = () => {
      if (handled) return;
      handled = true;
      writeFallback(name, destPath);

      const cleanup = () => fs.rm(tmpPath, { force: true }, () => {});
      
      if (fileStream && !fileStream.destroyed) {
        fileStream.destroy();
        fileStream.on("close", cleanup);
      } else {
        cleanup();
      }
      resolve();
    };

    const request = https.get(url, { timeout: 10000 }, (response) => {
      if (response.statusCode !== 200) {
        console.warn(`[Sound Downloader] ⚠️ Failed to download ${name}: status code ${response.statusCode}`);
        response.resume(); // Consume response data to free up memory
        doFallback();
        return;
      }

      fileStream = fs.createWriteStream(tmpPath);
      response.pipe(fileStream);

      // Listen on 'close' instead of 'finish' to ensure the OS file descriptor is fully released
      fileStream.on("close", () => {
        if (!handled) {
          handled = true;
          // Rename tmp to actual destination safely
          fs.rename(tmpPath, destPath, (err) => {
            if (err) {
              console.error(`[Sound Downloader] ❌ Failed to rename temp file for ${name}:`, err);
              writeFallback(name, destPath);
              resolve();
              return;
            }
            console.log(`[Sound Downloader] ✅ Successfully downloaded ${name}.mp3`);
            resolve();
          });
        }
      });

      fileStream.on("error", (err) => {
        console.error(`[Sound Downloader] ❌ Error writing file ${name}:`, err);
        doFallback();
      });
    });

    request.on("error", (err) => {
      console.warn(`[Sound Downloader] ⚠️ Request error for ${name}:`, err.message);
      doFallback();
    });

    request.on("timeout", () => {
      console.warn(`[Sound Downloader] ⚠️ Request timeout for ${name}`);
      request.destroy();
      // Destroying the request will trigger the "error" event, so we don't need to resolve/fallback here again.
    });
  });
}

function writeFallback(name, destPath) {
  try {
    const buffer = createSilentWavBuffer();
    fs.writeFileSync(destPath, buffer);
    console.log(`[Sound Downloader] 🛡️ Generated fallback silent file for ${name}.mp3`);
  } catch (err) {
    console.error(`[Sound Downloader] ❌ Failed to write fallback file for ${name}:`, err);
  }
}

async function run() {
  // Ensure the output directory exists
  if (!fs.existsSync(SOUNDS_DIR)) {
    fs.mkdirSync(SOUNDS_DIR, { recursive: true });
    console.log(`[Sound Downloader] Created directory: ${SOUNDS_DIR}`);
  }

  const downloads = Object.entries(SOUND_SOURCES).map(([name, url]) => downloadFile(name, url));
  await Promise.all(downloads);
  console.log("[Sound Downloader] Complete!");
}

run();
