import { readFile, writeFile } from "node:fs/promises";
import process from "node:process";

const branding = JSON.parse(await readFile(new URL("../branding.json", import.meta.url), "utf8"));
const configUrl = new URL("../src-tauri/tauri.conf.json", import.meta.url);
const indexUrl = new URL("../index.html", import.meta.url);

const escapeHtmlAttribute = (value) =>
  String(value)
    .replaceAll("&", "&amp;")
    .replaceAll('"', "&quot;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");

try {
  const config = JSON.parse(await readFile(configUrl, "utf8"));
  config.productName = branding.productName;
  config.app.windows = config.app.windows.map((windowConfig) =>
    windowConfig.label === "main" ? { ...windowConfig, title: branding.productName } : windowConfig,
  );
  config.bundle.shortDescription = branding.description;
  await writeFile(configUrl, `${JSON.stringify(config, null, 2)}\n`, "utf8");

  const index = await readFile(indexUrl, "utf8");
  const nextIndex = index
    .replace(/<title>.*?<\/title>/u, `<title>${escapeHtmlAttribute(branding.productName)}</title>`)
    .replace(
      /(<meta name="description" content=")[^"]*(" \/>)/u,
      `$1${escapeHtmlAttribute(branding.description)}$2`,
    );
  await writeFile(indexUrl, nextIndex, "utf8");
} catch (error) {
  if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") {
    process.exitCode = 0;
  } else {
    throw error;
  }
}
