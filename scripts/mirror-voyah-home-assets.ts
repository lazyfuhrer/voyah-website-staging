import fs from "node:fs";
import path from "node:path";

type Mode = "dry-run" | "apply";

const PROJECT_ROOT = process.cwd();
const PUBLIC_VOYAH_DIR = path.join(PROJECT_ROOT, "public", "voyah");

const IMAGE_EXT_RE = /\.(avif|png|jpe?g|webp|gif|svg)(\?|#|$)/i;

function readText(filePath: string) {
  return fs.readFileSync(filePath, "utf8");
}

function fileExistsNonEmpty(filePath: string) {
  try {
    const st = fs.statSync(filePath);
    return st.isFile() && st.size > 0;
  } catch {
    return false;
  }
}

function ensureDir(dirPath: string) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function decodeMaybe(input: string) {
  try {
    return decodeURIComponent(input);
  } catch {
    return input;
  }
}

function normalizeWpRemoteUrl(raw: string): string | null {
  // Accept both JSON-escaped and normal URLs.
  const unescaped = raw
    .replaceAll("https:\\/\\/", "https://")
    .replaceAll("http:\\/\\/", "http://")
    .replaceAll("\\/", "/");

  if (!/^https?:\/\/www\.voyahsaudiarabia\.com\//i.test(unescaped)) return null;
  if (!unescaped.includes("/wp-content/")) return null;
  if (!IMAGE_EXT_RE.test(unescaped)) return null;
  return unescaped;
}

function extractRemoteImageUrls(text: string): Set<string> {
  const out = new Set<string>();

  // Normal URLs.
  for (const m of text.matchAll(/https?:\/\/www\.voyahsaudiarabia\.com\/[^\s"'()<>)\\]+/gi)) {
    const u = normalizeWpRemoteUrl(m[0]);
    if (u) out.add(u);
  }

  // JSON-escaped URLs.
  for (const m of text.matchAll(/https?:\\\/\\\/www\.voyahsaudiarabia\.com\\\/[^\s"'()<>)]+/gi)) {
    const u = normalizeWpRemoteUrl(m[0]);
    if (u) out.add(u);
  }

  return out;
}

function extractLocalDependencyPathsFromHtml(htmlPath: string): string[] {
  const html = readText(htmlPath);
  const htmlDir = path.dirname(htmlPath);
  const deps: string[] = [];

  // Pick up CSS/JS references.
  const attrRe = /<(?:link|script)\b[^>]*(?:href|src)=["']([^"']+)["'][^>]*>/gi;
  for (const match of html.matchAll(attrRe)) {
    const rawRef = match[1];
    if (!rawRef) continue;

    // Skip obvious external resources.
    if (/^https?:\/\//i.test(rawRef)) {
      continue;
    }

    const decoded = decodeMaybe(rawRef);
    let resolved: string;

    if (decoded.startsWith("/voyah/")) {
      resolved = path.join(PUBLIC_VOYAH_DIR, decoded.replace(/^\/voyah\//, ""));
    } else if (decoded.startsWith("/")) {
      // Site-root paths like /wp-content/... get rewritten to /voyah/... in next.config,
      // but the exported HTML generally uses relative paths. Still, map to public/voyah/ for scanning.
      resolved = path.join(PUBLIC_VOYAH_DIR, decoded.replace(/^\//, ""));
    } else {
      resolved = path.resolve(htmlDir, decoded);
    }

    // Only scan local files we actually have.
    if (fs.existsSync(resolved) && (resolved.endsWith(".css") || resolved.endsWith(".js"))) {
      deps.push(resolved);
    }
  }

  // Always include custom.css since it’s loaded via /voyah/css/custom.css
  const customCss = path.join(PUBLIC_VOYAH_DIR, "css", "custom.css");
  if (fs.existsSync(customCss)) deps.push(customCss);

  return Array.from(new Set(deps));
}

async function downloadTo(url: string, destPath: string) {
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`HTTP ${res.status} for ${url}`);
  }
  const buf = Buffer.from(await res.arrayBuffer());
  ensureDir(path.dirname(destPath));
  fs.writeFileSync(destPath, buf);
}

function toLocalDestPath(remoteUrl: string) {
  const u = new URL(remoteUrl);
  // Preserve /wp-content/... structure under public/voyah/
  return path.join(PUBLIC_VOYAH_DIR, u.pathname.replace(/^\//, ""));
}

function rewriteWpRemoteToLocal(text: string) {
  // Replace normal URLs.
  let out = text.replaceAll("https://www.voyahsaudiarabia.com/wp-content/", "/wp-content/");
  out = out.replaceAll("http://www.voyahsaudiarabia.com/wp-content/", "/wp-content/");

  // Replace JSON-escaped URLs.
  out = out.replaceAll(
    "https:\\/\\/www.voyahsaudiarabia.com\\/wp-content\\/",
    "\\/wp-content\\/"
  );
  out = out.replaceAll(
    "http:\\/\\/www.voyahsaudiarabia.com\\/wp-content\\/",
    "\\/wp-content\\/"
  );

  return out;
}

async function main() {
  const mode: Mode = process.argv.includes("--apply") ? "apply" : "dry-run";

  const homeHtmlPaths = [
    path.join(PUBLIC_VOYAH_DIR, "index.html"),
    path.join(PUBLIC_VOYAH_DIR, "ar", "index.html"),
  ];

  const allTextFilesToScan = new Set<string>(homeHtmlPaths);
  for (const htmlPath of homeHtmlPaths) {
    for (const dep of extractLocalDependencyPathsFromHtml(htmlPath)) {
      allTextFilesToScan.add(dep);
    }
  }

  const remoteImages = new Set<string>();
  for (const filePath of allTextFilesToScan) {
    const txt = readText(filePath);
    for (const u of extractRemoteImageUrls(txt)) remoteImages.add(u);
  }

  const sorted = Array.from(remoteImages).sort();
  const mapped = sorted.map((u) => ({ url: u, dest: toLocalDestPath(u) }));

  console.log(`[mirror-voyah-home-assets] mode=${mode}`);
  console.log(`[mirror-voyah-home-assets] scanned_files=${allTextFilesToScan.size}`);
  console.log(`[mirror-voyah-home-assets] remote_images=${mapped.length}`);

  if (mode === "dry-run") {
    for (const item of mapped) console.log(`${item.url} -> ${path.relative(PROJECT_ROOT, item.dest)}`);
    return;
  }

  // Download images (skip ones that already exist).
  let downloaded = 0;
  let skipped = 0;
  for (const item of mapped) {
    if (fileExistsNonEmpty(item.dest)) {
      skipped++;
      continue;
    }
    await downloadTo(item.url, item.dest);
    downloaded++;
  }

  console.log(`[mirror-voyah-home-assets] downloaded=${downloaded} skipped_existing=${skipped}`);

  // Rewrite references in home HTML + any scanned CSS files (JS rewriting is intentionally skipped).
  const rewriteTargets = Array.from(allTextFilesToScan).filter((p) => {
    const rel = path.relative(PUBLIC_VOYAH_DIR, p);
    return (
      rel === "index.html" ||
      rel === path.join("ar", "index.html") ||
      p.endsWith(".css")
    );
  });

  let rewrittenFiles = 0;
  for (const fp of rewriteTargets) {
    const before = readText(fp);
    const after = rewriteWpRemoteToLocal(before);
    if (after !== before) {
      fs.writeFileSync(fp, after, "utf8");
      rewrittenFiles++;
    }
  }
  console.log(`[mirror-voyah-home-assets] rewritten_files=${rewrittenFiles}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

