const fs = require("fs");
const path = require("path");

function walk(dir) {
  let results = [];
  if (!fs.existsSync(dir)) return results;
  const list = fs.readdirSync(dir);
  list.forEach((file) => {
    const filePath = path.join(dir, file);
    const stat = fs.statSync(filePath);
    if (stat && stat.isDirectory()) {
      results = results.concat(walk(filePath));
    } else {
      if (file.endsWith(".ts") || file.endsWith(".tsx")) {
        results.push(filePath);
      }
    }
  });
  return results;
}

const searchDirs = ["app", "components"];
let files = [];
searchDirs.forEach((dir) => {
  files = files.concat(walk(dir));
});

let leaks = [];

files.forEach((file) => {
  const normalizedPath = file.replace(/\\/g, "/");
  const content = fs.readFileSync(file, "utf8");
  
  // Strip comments (both single-line and multi-line) to avoid matching "use client" inside comments
  const cleanContent = content
    .replace(/\/\*[\s\S]*?\*\/|([^\\:]|^)\/\/.*$/gm, "")
    .trim();
  
  // Next.js directive must be at the very start of the file content (excluding comments/whitespace)
  const isClientComponent =
    cleanContent.startsWith('"use client"') ||
    cleanContent.startsWith("'use client'");
  
  if (isClientComponent) {
    if (
      content.includes("createAdminClient") ||
      content.includes("SUPABASE_SERVICE_ROLE_KEY")
    ) {
      leaks.push(normalizedPath);
    }
  }
});

if (leaks.length > 0) {
  console.error("LEAK FOUND: Administrative clients/keys found in client-side components:");
  leaks.forEach((file) => console.error(`  - ${file}`));
  process.exit(1);
} else {
  console.log("OK - No client-side administrative client leaks detected");
  process.exit(0);
}
