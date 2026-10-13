import { execSync } from "child_process";
import fs from "fs";
import path from "path";

const chromePath = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
process.env.CHROME_PATH = chromePath;

const outDir = path.join(process.cwd(), "scratch");
if (!fs.existsSync(outDir)) {
  fs.mkdirSync(outDir, { recursive: true });
}
const outPath = path.join(outDir, "lighthouse-baseline.json");

console.log("Starting Lighthouse audit on https://scan2paper.com...");
try {
  const cmd = `npx lighthouse https://scan2paper.com --output=json --output-path="${outPath}" --chrome-flags="--headless=new --no-sandbox --disable-gpu" --only-categories=performance --preset=desktop`;
  execSync(cmd, { stdio: "inherit", env: { ...process.env, CHROME_PATH: chromePath } });
  console.log("Lighthouse audit completed. Output written to:", outPath);
} catch (err) {
  console.error("Lighthouse error:", err.message);
}
