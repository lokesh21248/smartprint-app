import * as fs from "fs";
import * as path from "path";

const rootDir = path.resolve(__dirname, "..");
const appDir = path.join(rootDir, "app");
const componentsDir = path.join(rootDir, "components");
const hooksDir = path.join(rootDir, "hooks");
const libDir = path.join(rootDir, "lib");
const storesDir = path.join(rootDir, "stores");

// Helper to recursively list files
function getFiles(dir: string): string[] {
  let results: string[] = [];
  if (!fs.existsSync(dir)) return [];
  const list = fs.readdirSync(dir);
  list.forEach((file) => {
    const filePath = path.join(dir, file);
    const stat = fs.statSync(filePath);
    if (stat && stat.isDirectory()) {
      results = results.concat(getFiles(filePath));
    } else {
      if (/\.(ts|tsx|js|jsx)$/.test(file)) {
        results.push(filePath);
      }
    }
  });
  return results;
}

const allFiles = [
  ...getFiles(appDir),
  ...getFiles(componentsDir),
  ...getFiles(hooksDir),
  ...getFiles(libDir),
  ...getFiles(storesDir),
].map(f => path.resolve(f));

console.log(`Found ${allFiles.length} source files.`);

// Parse package.json
const pkgJsonPath = path.join(rootDir, "package.json");
const pkgJson = JSON.parse(fs.readFileSync(pkgJsonPath, "utf-8"));
const dependencies = Object.keys(pkgJson.dependencies || {});
const devDependencies = Object.keys(pkgJson.devDependencies || {});

// Map of file path -> number of times it is imported
const fileImportCounts: Record<string, number> = {};
allFiles.forEach((f) => {
  fileImportCounts[f] = 0;
});

// Map of package -> number of times it is imported
const packageImportCounts: Record<string, number> = {};
dependencies.forEach((p) => {
  packageImportCounts[p] = 0;
});
devDependencies.forEach((p) => {
  packageImportCounts[p] = 0;
});

// Regex patterns to capture imports
const importPatterns = [
  /import\s+[\s\S]*?\s+from\s+['"]([^'"]+)['"]/g,
  /import\(['"]([^'"]+)['"]\)/g,
  /require\(['"]([^'"]+)['"]\)/g,
  /export\s+[\s\S]*?\s+from\s+['"]([^'"]+)['"]/g,
];

// Helper to resolve import path to actual file path
function resolveImport(importerPath: string, importee: string): string | null {
  if (importee.startsWith(".")) {
    // Relative import
    const importerDir = path.dirname(importerPath);
    const resolvedPath = path.resolve(importerDir, importee);
    const extensions = [".tsx", ".ts", ".jsx", ".js", "/index.tsx", "/index.ts", "/index.jsx", "/index.js"];
    for (const ext of extensions) {
      const p = path.resolve(resolvedPath + ext);
      if (fs.existsSync(p)) return p;
    }
  } else if (importee.startsWith("@/")) {
    // Absolute alias import (e.g. '@/components/foo')
    const suffix = importee.slice(2);
    const resolvedPath = path.join(rootDir, suffix);
    const extensions = [".tsx", ".ts", ".jsx", ".js", "/index.tsx", "/index.ts", "/index.jsx", "/index.js"];
    for (const ext of extensions) {
      const p = path.resolve(resolvedPath + ext);
      if (fs.existsSync(p)) return p;
    }
  }
  return null;
}

// Analyze each file's content
allFiles.forEach((file) => {
  const content = fs.readFileSync(file, "utf-8");
  importPatterns.forEach((pattern) => {
    let match;
    // Reset regex lastIndex
    pattern.lastIndex = 0;
    while ((match = pattern.exec(content)) !== null) {
      const importee = match[1];
      
      // 1. Check if it matches a package dependency
      let matchedPackage = false;
      for (const dep of dependencies.concat(devDependencies)) {
        if (importee === dep || importee.startsWith(`${dep}/`)) {
          packageImportCounts[dep]++;
          matchedPackage = true;
          break;
        }
      }

      // 2. Check if it's a local file import
      if (!matchedPackage) {
        const resolved = resolveImport(file, importee);
        if (resolved && fileImportCounts[resolved] !== undefined) {
          fileImportCounts[resolved]++;
        }
      }
    }
  });
});

console.log("\n--- UNUSED PACKAGES ---");
dependencies.forEach((dep) => {
  // Exclude core packages or config helpers
  const skipList = ["react", "react-dom", "next", "tailwindcss", "postcss", "autoprefixer", "eslint", "typescript"];
  if (skipList.includes(dep)) return;
  if (packageImportCounts[dep] === 0) {
    console.log(`${dep}: imported 0 times`);
  }
});

console.log("\n--- UNUSED FILES (0 IMPORTS) ---");
const deadFiles: string[] = [];
Object.entries(fileImportCounts).forEach(([filePath, count]) => {
  const relativePath = path.relative(rootDir, filePath);
  
  // Skip pages / layouts / routes since they are entry points and not imported directly
  if (
    relativePath.startsWith("app" + path.sep) && 
    (filePath.endsWith("page.tsx") || 
     filePath.endsWith("layout.tsx") || 
     filePath.endsWith("route.ts") ||
     filePath.endsWith("error.tsx") ||
     filePath.endsWith("not-found.tsx") ||
     filePath.endsWith("loading.tsx") ||
     filePath.endsWith("global-error.tsx") ||
     filePath.endsWith("sitemap.ts") ||
     filePath.endsWith("robots.ts"))
  ) {
    return;
  }

  if (count === 0) {
    console.log(`${relativePath}: referenced 0 times`);
    deadFiles.push(filePath);
  }
});
