import fs from "node:fs";
import path from "node:path";

const PROJECT_ROOT = process.cwd();
const PUBLIC_VOYAH_DIR = path.join(PROJECT_ROOT, "public", "voyah");

const IMAGE_EXT_RE = /\.(avif|png|jpe?g|webp|gif|svg)(\?|#|$)/i;
const WP_ASSET_EXT_RE = /\.(css|js)(\?|#|$)/i;

function isProbablyImagePath(p) {
  const clean = p.split("?")[0].split("#")[0];
  if (IMAGE_EXT_RE.test(clean)) return true;
  // WordPress sometimes produces compound extensions like `.png.webp`.
  return /\.(png|jpe?g)\.webp$/i.test(clean);
}

function isProbablyWpAssetPath(p) {
  const clean = p.split("?")[0].split("#")[0];
  return WP_ASSET_EXT_RE.test(clean);
}

function isProbablyWpContentFetchTarget(p) {
  // We only mirror what the static exports actually request.
  return isProbablyImagePath(p) || isProbablyWpAssetPath(p);
}

function readText(filePath) {
  return fs.readFileSync(filePath, "utf8");
}

function fileExistsNonEmpty(filePath) {
  try {
    const st = fs.statSync(filePath);
    return st.isFile() && st.size > 0;
  } catch {
    return false;
  }
}

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function decodeMaybe(input) {
  try {
    return decodeURIComponent(input);
  } catch {
    return input;
  }
}

function normalizeWpRemoteUrl(raw) {
  // Accept both JSON-escaped and normal URLs.
  const unescaped = raw
    .replaceAll("https:\\/\\/", "https://")
    .replaceAll("http:\\/\\/", "http://")
    .replaceAll("\\/", "/");

  if (!/^https?:\/\/www\.voyahsaudiarabia\.com\//i.test(unescaped)) return null;
  if (!unescaped.includes("/wp-content/")) return null;
  if (!isProbablyWpContentFetchTarget(unescaped)) return null;
  return unescaped;
}

function extractRemoteWpContentUrls(text) {
  const out = new Set();

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

function normalizeWpContentRelPath(relPath) {
  // relPath examples:
  // - "uploads/2025/05/foo.webp"
  // - "/wp-content/uploads/2025/05/foo.webp"
  // - "wp-content/uploads/2025/05/foo.webp"
  // - "voyah/wp-content/uploads/.../foo.webp" (bad export prefix; strip voyah/)
  // IMPORTANT: file paths on disk never include query/hash.
  let p = relPath.split("?")[0].split("#")[0].trim().replaceAll("\\", "/");
  p = p.replace(/^\/+/, "");
  if (p.startsWith("voyah/wp-content/")) p = p.slice("voyah/".length);
  if (p.startsWith("wp-content/")) return p;
  return `wp-content/${p}`;
}

function extractMissingLocalWpContentTargets(text, filePath) {
  const out = new Map(); // destAbsPath -> remoteUrl
  const baseDir = path.dirname(filePath);

  const addFromRel = (rel) => {
    const decoded = decodeMaybe(rel);
    if (!decoded.includes("wp-content/")) return;
    if (!isProbablyWpContentFetchTarget(decoded)) return;

    const qIndex = decoded.indexOf("?");
    const query = qIndex >= 0 ? decoded.slice(qIndex) : "";
    const withoutQuery = decoded.split("?")[0];

    const normalizedRel = normalizeWpContentRelPath(
      withoutQuery.includes("/wp-content/")
        ? withoutQuery.slice(withoutQuery.indexOf("wp-content/"))
        : withoutQuery
    );

    const destAbs = path.join(PUBLIC_VOYAH_DIR, normalizedRel);
    if (fileExistsNonEmpty(destAbs)) return;

    const remoteUrl = `https://www.voyahsaudiarabia.com/${normalizedRel}${query}`;
    out.set(destAbs, remoteUrl);
  };

  const addFromMaybeJsonEscaped = (raw) => {
    // Handles fragments like \/wp-content\/uploads\/... inside JSON strings.
    const unescaped = raw.replaceAll("\\/", "/");
    addFromRel(unescaped);
  };

  // Absolute site paths in HTML/CSS/JS: /wp-content/...
  for (const m of text.matchAll(/(?<![A-Za-z0-9])\/wp-content\/[^\s"'()<>)]+/g)) {
    addFromRel(m[0]);
  }

  // Bad exports sometimes prefix public folder name: /voyah/wp-content/...
  for (const m of text.matchAll(/(?<![A-Za-z0-9])\/voyah\/wp-content\/[^\s"'()<>)]+/g)) {
    addFromRel(m[0]);
  }

  // JSON-escaped absolute paths: \/wp-content\/...
  for (const m of text.matchAll(/\\\/wp-content\\\/[^\s"'()<>)]+/g)) {
    addFromMaybeJsonEscaped(m[0]);
  }

  // JSON-escaped: \/voyah\/wp-content\/...
  for (const m of text.matchAll(/\\\/voyah\\\/wp-content\\\/[^\s"'()<>)]+/g)) {
    addFromMaybeJsonEscaped(m[0]);
  }

  // Relative paths in HTML/CSS: ../wp-content/... or ../../wp-content/...
  for (const m of text.matchAll(/\.\.\/(?:\.\.\/)*wp-content\/[^\s"'()<>)]+/g)) {
    const rel = m[0];
    const resolvedAbs = path.resolve(baseDir, rel);
    const underVoyah = path.relative(PUBLIC_VOYAH_DIR, resolvedAbs);
    if (underVoyah.startsWith("..")) continue;
    addFromRel(underVoyah);
  }

  return out;
}

function extractLocalDependencyPathsFromHtml(htmlPath) {
  const html = readText(htmlPath);
  const htmlDir = path.dirname(htmlPath);
  const deps = [];

  const attrRe = /<(?:link|script)\b[^>]*(?:href|src)=["']([^"']+)["'][^>]*>/gi;
  for (const match of html.matchAll(attrRe)) {
    const rawRef = match[1];
    if (!rawRef) continue;

    if (/^https?:\/\//i.test(rawRef)) continue;

    const decoded = decodeMaybe(rawRef);
    let resolved;

    if (decoded.startsWith("/voyah/")) {
      resolved = path.join(PUBLIC_VOYAH_DIR, decoded.replace(/^\/voyah\//, ""));
    } else if (decoded.startsWith("/")) {
      resolved = path.join(PUBLIC_VOYAH_DIR, decoded.replace(/^\//, ""));
    } else {
      resolved = path.resolve(htmlDir, decoded);
    }

    if (fs.existsSync(resolved) && (resolved.endsWith(".css") || resolved.endsWith(".js"))) {
      deps.push(resolved);
    }
  }

  const customCss = path.join(PUBLIC_VOYAH_DIR, "css", "custom.css");
  if (fs.existsSync(customCss)) deps.push(customCss);

  return Array.from(new Set(deps));
}

async function downloadTo(url, destPath) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  const buf = Buffer.from(await res.arrayBuffer());
  ensureDir(path.dirname(destPath));
  fs.writeFileSync(destPath, buf);
}

function toLocalDestPath(remoteUrl) {
  const u = new URL(remoteUrl);
  return path.join(PUBLIC_VOYAH_DIR, u.pathname.replace(/^\//, ""));
}

function rewriteWpRemoteToLocal(text) {
  let out = text.replaceAll("https://www.voyahsaudiarabia.com/wp-content/", "/wp-content/");
  out = out.replaceAll("http://www.voyahsaudiarabia.com/wp-content/", "/wp-content/");
  out = out.replaceAll("https://www.voyahsaudiarabia.com/voyah/wp-content/", "/wp-content/");
  out = out.replaceAll("http://www.voyahsaudiarabia.com/voyah/wp-content/", "/wp-content/");

  out = out.replaceAll(
    "https:\\/\\/www.voyahsaudiarabia.com\\/wp-content\\/",
    "\\/wp-content\\/"
  );
  out = out.replaceAll(
    "http:\\/\\/www.voyahsaudiarabia.com\\/wp-content\\/",
    "\\/wp-content\\/"
  );
  out = out.replaceAll(
    "https:\\/\\/www.voyahsaudiarabia.com\\/voyah\\/wp-content\\/",
    "\\/wp-content\\/"
  );
  out = out.replaceAll(
    "http:\\/\\/www.voyahsaudiarabia.com\\/voyah\\/wp-content\\/",
    "\\/wp-content\\/"
  );

  // Static export mistake: `/voyah/wp-content/...` is not rewritten by Next; normalize to `/wp-content/...`
  out = out.replaceAll("'/voyah/wp-content/", "'/wp-content/");
  out = out.replaceAll('"/voyah/wp-content/', '"/wp-content/');
  out = out.replaceAll("(/voyah/wp-content/", "(/wp-content/");
  out = out.replaceAll("url(/voyah/wp-content/", "url(/wp-content/");
  out = out.replaceAll("url('/voyah/wp-content/", "url('/wp-content/");
  out = out.replaceAll('url("/voyah/wp-content/', 'url("/wp-content/');
  out = out.replaceAll("url('../voyah/wp-content/", "url('../wp-content/");
  out = out.replaceAll('url("../voyah/wp-content/', 'url("../wp-content/');

  out = out.replaceAll("\\/voyah\\/wp-content\\/", "\\/wp-content\\/");

  return out;
}

function parseEntryHtmlPathsFromArgv(argv) {
  const knownFlags = new Set(["--apply"]);
  const positional = argv.filter((a) => !knownFlags.has(a) && !a.startsWith("-"));
  if (positional.length === 0) {
    return [
      path.join(PUBLIC_VOYAH_DIR, "index.html"),
      path.join(PUBLIC_VOYAH_DIR, "ar", "index.html"),
    ];
  }

  return positional.map((p) => (path.isAbsolute(p) ? p : path.join(PROJECT_ROOT, p)));
}

async function main() {
  const mode = process.argv.includes("--apply") ? "apply" : "dry-run";

  const entryHtmlPaths = parseEntryHtmlPathsFromArgv(process.argv.slice(2));
  for (const p of entryHtmlPaths) {
    if (!fs.existsSync(p)) {
      throw new Error(`Entry HTML not found: ${p}`);
    }
  }

  const allTextFilesToScan = new Set(entryHtmlPaths);
  for (const htmlPath of entryHtmlPaths) {
    for (const dep of extractLocalDependencyPathsFromHtml(htmlPath)) {
      allTextFilesToScan.add(dep);
    }
  }

  const remoteImages = new Set();
  const missingLocal = new Map(); // destAbs -> remoteUrl
  for (const filePath of allTextFilesToScan) {
    const txt = readText(filePath);
    for (const u of extractRemoteWpContentUrls(txt)) remoteImages.add(u);
    for (const [destAbs, remoteUrl] of extractMissingLocalWpContentTargets(txt, filePath)) {
      missingLocal.set(destAbs, remoteUrl);
    }
  }

  const mappedFromRemote = Array.from(remoteImages)
    .sort()
    .map((u) => ({ url: u, dest: toLocalDestPath(u) }));

  const mappedFromMissingLocal = Array.from(missingLocal.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([dest, url]) => ({ url, dest }));

  const mapped = [...mappedFromRemote, ...mappedFromMissingLocal];

  console.log(`[mirror-voyah-static-assets] mode=${mode}`);
  console.log(
    `[mirror-voyah-static-assets] entry_html=${entryHtmlPaths
      .map((p) => path.relative(PROJECT_ROOT, p))
      .join(", ")}`
  );
  console.log(`[mirror-voyah-static-assets] scanned_files=${allTextFilesToScan.size}`);
  console.log(
    `[mirror-voyah-static-assets] remote_urls=${mappedFromRemote.length} missing_local=${mappedFromMissingLocal.length} total_fetch=${mapped.length}`
  );

  if (mode === "dry-run") {
    for (const item of mapped) console.log(`${item.url} -> ${path.relative(PROJECT_ROOT, item.dest)}`);
    return;
  }

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
  console.log(`[mirror-voyah-static-assets] downloaded=${downloaded} skipped_existing=${skipped}`);

  const entrySet = new Set(entryHtmlPaths);
  const rewriteTargets = Array.from(allTextFilesToScan).filter(
    (p) => entrySet.has(p) || p.endsWith(".css")
  );

  let rewrittenFiles = 0;
  for (const fp of rewriteTargets) {
    const before = readText(fp);
    const after = rewriteWpRemoteToLocal(before);
    if (after !== before) {
      fs.writeFileSync(fp, after, "utf8");
      rewrittenFiles++;
    }
  }
  console.log(`[mirror-voyah-static-assets] rewritten_files=${rewrittenFiles}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

