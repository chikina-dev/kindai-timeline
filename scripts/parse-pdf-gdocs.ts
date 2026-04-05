/**
 * Google Drive API を使って PDF を Google Docs に変換し、HTML の table から科目 JSON を生成する。
 *
 * Usage:
 *   npx tsx scripts/parse-pdf-gdocs.ts --file data/pdf/【前期】R8情報学部時間割.pdf
 *   npx tsx scripts/parse-pdf-gdocs.ts --file data/pdf/【後期】R8情報学部時間割.pdf --out data/courses-2026-後期-gdocs.json
 *   npx tsx scripts/parse-pdf-gdocs.ts --file data/html/【前期】R8情報学部時間割.zip --out data/courses-2026-前期-gdocs.json
 *
 * Required environment when --file points to a PDF:
 *   - Preferred: GOOGLE_OAUTH_CREDENTIALS_PATH or GOOGLE_OAUTH_CLIENT_ID / SECRET / REFRESH_TOKEN
 *   - Fallback: GOOGLE_SERVICE_ACCOUNT_JSON or GOOGLE_APPLICATION_CREDENTIALS
 *
 * Optional environment:
 *   - GOOGLE_DRIVE_FOLDER_ID
 */

import { createReadStream, mkdirSync, readFileSync, rmSync, writeFileSync } from "fs";
import { basename, dirname, extname, join, resolve } from "path";
import { config } from "dotenv";
import * as cheerio from "cheerio";
import { google } from "googleapis";
import JSZip from "jszip";
import TurndownService from "turndown";
import {
  parseCourseTables,
  type Row,
  type Table,
} from "./lib/course-table-parser";
import {
  getErrorMessage,
  resolveGoogleAuth,
  type ResolvedGoogleAuth,
} from "./lib/google-drive-auth";

config({ path: ".env.local", override: false });
config({ path: ".env", override: false });

type InputMode = "pdf" | "zip";

interface CliOptions {
  inputPath: string;
  inputMode: InputMode;
  outPath: string;
  artifactsDir: string;
  docTitle: string;
  folderId?: string;
  keepDoc: boolean;
  writeMarkdown: boolean;
}

interface ExtractedHtmlBundle {
  html: string;
  htmlFilePath: string;
  rawZipPath?: string;
}

interface PendingSpan {
  text: string;
  remainingRows: number;
}

function printHelp(): void {
  console.log(
    [
      "Usage: tsx scripts/parse-pdf-gdocs.ts --file <pdf-or-zip-path> [--out <json-path>] [--artifacts-dir <dir>]",
      "",
      "Options:",
      "  --file           Source PDF path or local Google Docs export ZIP path",
      "  --out            Output JSON path (default: <input>.gdocs.json)",
      "  --artifacts-dir  Directory for exported HTML/Markdown/debug artifacts",
      "  --doc-title      Google Docs title to create",
      "  --folder-id      Upload target Google Drive folder ID",
      "  --keep-doc       Keep the temporary Google Docs file instead of deleting it",
      "  --no-md          Skip writing a Markdown copy of the exported HTML",
      "",
      "Auth (only required for PDF input):",
      "  Preferred: set GOOGLE_OAUTH_CREDENTIALS_PATH or GOOGLE_OAUTH_CLIENT_ID / SECRET / REFRESH_TOKEN.",
      "  Fallback: GOOGLE_SERVICE_ACCOUNT_JSON or GOOGLE_APPLICATION_CREDENTIALS.",
    ].join("\n")
  );
}

function detectInputMode(inputPath: string): InputMode {
  const extension = extname(inputPath).toLowerCase();

  if (extension === ".pdf") {
    return "pdf";
  }

  if (extension === ".zip") {
    return "zip";
  }

  throw new Error(
    "Unsupported --file type. Use a PDF path or a Google Docs HTML export ZIP path."
  );
}

function parseArgs(): CliOptions {
  const args = process.argv.slice(2);
  let inputPath = "";
  let outPath = "";
  let artifactsDir = "";
  let docTitle = "";
  let folderId = process.env.GOOGLE_DRIVE_FOLDER_ID;
  let keepDoc = false;
  let writeMarkdown = true;

  if (args.includes("--help") || args.includes("-h")) {
    printHelp();
    process.exit(0);
  }

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    const nextValue = args[index + 1];

    if (arg === "--file" && nextValue) {
      inputPath = resolve(nextValue);
      index += 1;
      continue;
    }

    if (arg === "--out" && nextValue) {
      outPath = resolve(nextValue);
      index += 1;
      continue;
    }

    if (arg === "--artifacts-dir" && nextValue) {
      artifactsDir = resolve(nextValue);
      index += 1;
      continue;
    }

    if (arg === "--doc-title" && nextValue) {
      docTitle = nextValue;
      index += 1;
      continue;
    }

    if (arg === "--folder-id" && nextValue) {
      folderId = nextValue;
      index += 1;
      continue;
    }

    if (arg === "--keep-doc") {
      keepDoc = true;
      continue;
    }

    if (arg === "--no-md") {
      writeMarkdown = false;
    }
  }

  if (!inputPath) {
    console.error("Usage: tsx scripts/parse-pdf-gdocs.ts --file <pdf-or-zip-path> [--out <json-path>]");
    process.exit(1);
  }

  const inputMode = detectInputMode(inputPath);
  const inputBaseName = basename(inputPath, extname(inputPath));
  const resolvedOutPath = outPath || resolve(dirname(inputPath), `${inputBaseName}.gdocs.json`);
  const resolvedArtifactsDir =
    artifactsDir || resolve("data/google-doc-artifacts", basename(resolvedOutPath, extname(resolvedOutPath)));

  return {
    inputPath,
    inputMode,
    outPath: resolvedOutPath,
    artifactsDir: resolvedArtifactsDir,
    docTitle: docTitle || `${inputBaseName} (Google Docs)`,
    folderId,
    keepDoc,
    writeMarkdown,
  };
}

function ensureDirectory(path: string): void {
  mkdirSync(path, { recursive: true });
}

function createDriveClient(resolvedAuth: ResolvedGoogleAuth) {
  return google.drive({ version: "v3", auth: resolvedAuth.auth });
}

function formatGoogleApiError(
  action: string,
  error: unknown,
  resolvedAuth: ResolvedGoogleAuth
): Error {
  const message = getErrorMessage(error);

  if (/storage quota has been exceeded/i.test(message)) {
    if (resolvedAuth.mode === "oauth") {
      return new Error(
        "Google Drive reported a quota error for the authenticated user account. Confirm which account granted OAuth access and whether the target shared drive or My Drive has available space."
      );
    }

    return new Error(
      "Google Drive quota was checked against the configured service account or application-default identity, not your personal Drive. Use user OAuth via `npm run courses:auth:gdocs` or GOOGLE_OAUTH_CREDENTIALS_PATH."
    );
  }

  return new Error(`${action} failed: ${message}`);
}

function toBuffer(data: unknown): Buffer {
  if (Buffer.isBuffer(data)) return data;
  if (data instanceof ArrayBuffer) return Buffer.from(data);
  if (ArrayBuffer.isView(data)) {
    return Buffer.from(data.buffer, data.byteOffset, data.byteLength);
  }
  if (typeof data === "string") return Buffer.from(data);
  throw new Error("Unsupported response type from Google Drive export");
}

function parsePositiveInt(value: string | undefined): number {
  const parsed = value ? Number.parseInt(value, 10) : Number.NaN;
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 1;
}

function normalizeExtractedText(value: string): string {
  return value
    .replace(/\u00a0/g, " ")
    .replace(/\r/g, "")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n[ \t]+/g, "\n")
    .replace(/[ \t]{2,}/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function extractCellText(html: string): string {
  const withBreaks = html
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n")
    .replace(/<\/div>/gi, "\n")
    .replace(/<\/li>/gi, "\n")
    .replace(/<\/h\d>/gi, "\n");
  const $cell = cheerio.load(`<root>${withBreaks}</root>`);
  return normalizeExtractedText($cell("root").text());
}

function trimTrailingEmptyCells(row: Row): Row {
  const trimmed = [...row];
  while (trimmed.length > 0 && trimmed[trimmed.length - 1] === "") {
    trimmed.pop();
  }
  return trimmed;
}

function tableToRows(tableHtml: string): Table {
  const $table = cheerio.load(tableHtml);
  const carry: Array<PendingSpan | undefined> = [];
  const rows: Table = [];

  for (const rowElement of $table("tr").toArray()) {
    const row: Array<string | undefined> = [];
    const cells = $table(rowElement).children("th, td").toArray();
    let columnIndex = 0;

    for (const cellElement of cells) {
      while (carry[columnIndex]) {
        const span = carry[columnIndex];
        if (!span) break;
        row[columnIndex] = span.text;
        if (span.remainingRows === 1) {
          carry[columnIndex] = undefined;
        } else {
          span.remainingRows -= 1;
        }
        columnIndex += 1;
      }

      const $cell = $table(cellElement);
      const text = extractCellText($cell.html() ?? "");
      const rowSpan = parsePositiveInt($cell.attr("rowspan"));
      const colSpan = parsePositiveInt($cell.attr("colspan"));

      for (let offset = 0; offset < colSpan; offset += 1) {
        row[columnIndex + offset] = text;
        if (rowSpan > 1) {
          carry[columnIndex + offset] = {
            text,
            remainingRows: rowSpan - 1,
          };
        }
      }

      columnIndex += colSpan;
    }

    for (let carryIndex = columnIndex; carryIndex < carry.length; carryIndex += 1) {
      const span = carry[carryIndex];
      if (!span) continue;
      row[carryIndex] = span.text;
      if (span.remainingRows === 1) {
        carry[carryIndex] = undefined;
      } else {
        span.remainingRows -= 1;
      }
    }

    const normalizedRow = trimTrailingEmptyCells(
      Array.from({ length: Math.max(row.length, carry.length) }, (_, index) => row[index] ?? "")
        .map((cell) => normalizeExtractedText(cell))
    );

    if (normalizedRow.some(Boolean)) {
      rows.push(normalizedRow);
    }
  }

  return rows;
}

function looksLikeCourseTable(table: Table): boolean {
  const joined = table.flat().join(" ");
  return (
    table.some((row) => row.length >= 4) &&
    /(曜日|時限|共通教養|専門|外国語|月|火|水|木|金|土|日)/.test(joined)
  );
}

function hasExplicitDayCell(table: Table): boolean {
  return table.some((row) => isDayLike(row[0] ?? ""));
}

function isDayLike(value: string): boolean {
  return /^[月火水木金土日]$/.test(normalizeExtractedText(value));
}

function findDayHeadingAfterTable(
  $: cheerio.CheerioAPI,
  tableElement: unknown
): string | null {
  let current = $(tableElement as Parameters<typeof $>[0]).next();

  while (current.length > 0) {
    const text = normalizeExtractedText(current.text());
    if (!text) {
      current = current.next();
      continue;
    }

    const dayMatch = text.match(/^([月火水木金土日])$/);
    if (dayMatch) {
      return dayMatch[1];
    }

    if (/^\d+\s*ページ$/.test(text)) {
      current = current.next();
      continue;
    }

    break;
  }

  return null;
}

function prependDayHintRow(table: Table, dayHint: string): Table {
  if (!table.length) return table;

  const alreadyContainsHint = table.some((row) => normalizeExtractedText(row[0] ?? "") === dayHint);
  if (alreadyContainsHint) return table;

  return [[dayHint, "", "", "", "", "", "", "", "", ""], ...table];
}

function extractTablesFromHtml(html: string): Table[] {
  const $ = cheerio.load(html);
  const tables = $("table")
    .toArray()
    .map((tableElement) => {
      const tableHtml = $.html(tableElement) || "";
      let table = tableToRows(tableHtml);
      if (table.length === 0) return table;

      const dayHint = !hasExplicitDayCell(table)
        ? findDayHeadingAfterTable($, tableElement)
        : null;

      if (dayHint) {
        table = prependDayHintRow(table, dayHint);
      }

      return table;
    })
    .filter((table) => table.length > 0);

  const courseTables = tables.filter(looksLikeCourseTable);
  return courseTables.length > 0 ? courseTables : tables;
}

function createMarkdown(html: string): string {
  const turndownService = new TurndownService({
    headingStyle: "atx",
    codeBlockStyle: "fenced",
  });

  turndownService.keep(["table", "thead", "tbody", "tr", "th", "td"]);
  return turndownService.turndown(html);
}

async function uploadPdfAsGoogleDoc(
  drive: ReturnType<typeof google.drive>,
  options: CliOptions,
  resolvedAuth: ResolvedGoogleAuth
): Promise<string> {
  try {
    const response = await drive.files.create({
      requestBody: {
        name: options.docTitle,
        mimeType: "application/vnd.google-apps.document",
        parents: options.folderId ? [options.folderId] : undefined,
      },
      media: {
        mimeType: "application/pdf",
        body: createReadStream(options.inputPath),
      },
      fields: "id",
      supportsAllDrives: true,
    });

    const fileId = response.data.id;
    if (!fileId) {
      throw new Error("Google Docs conversion succeeded but file ID was not returned");
    }
    return fileId;
  } catch (error) {
    throw formatGoogleApiError("Google Docs upload", error, resolvedAuth);
  }
}

async function exportGoogleDocAsHtmlBundle(
  drive: ReturnType<typeof google.drive>,
  docId: string,
  artifactsDir: string,
  resolvedAuth: ResolvedGoogleAuth
): Promise<ExtractedHtmlBundle> {
  let response;

  try {
    response = await drive.files.export(
      {
        fileId: docId,
        mimeType: "application/zip",
      },
      {
        responseType: "arraybuffer",
      }
    );
  } catch (error) {
    throw formatGoogleApiError("Google Docs export", error, resolvedAuth);
  }

  return extractHtmlBundleFromZipBuffer(
    toBuffer(response.data),
    artifactsDir,
    "document-export.zip"
  );
}

async function extractHtmlBundleFromZipBuffer(
  zipBuffer: Buffer,
  artifactsDir: string,
  rawZipFileName: string
): Promise<ExtractedHtmlBundle> {

  rmSync(artifactsDir, { recursive: true, force: true });
  ensureDirectory(artifactsDir);

  const rawZipPath = join(artifactsDir, rawZipFileName);
  writeFileSync(rawZipPath, zipBuffer);

  const zip = await JSZip.loadAsync(zipBuffer);
  let html = "";
  let htmlFilePath = "";

  for (const [entryName, entry] of Object.entries(zip.files)) {
    const outputPath = join(artifactsDir, entryName);

    if (entry.dir) {
      ensureDirectory(outputPath);
      continue;
    }

    ensureDirectory(dirname(outputPath));

    if (entryName.toLowerCase().endsWith(".html") || entryName.toLowerCase().endsWith(".css")) {
      const content = await entry.async("string");
      writeFileSync(outputPath, content, "utf8");

      if (!htmlFilePath && entryName.toLowerCase().endsWith(".html")) {
        htmlFilePath = outputPath;
        html = content;
      }
      continue;
    }

    const content = await entry.async("nodebuffer");
    writeFileSync(outputPath, content);
  }

  if (!htmlFilePath || !html) {
    throw new Error("Google Docs export did not contain an HTML file");
  }

  return {
    html,
    htmlFilePath,
    rawZipPath,
  };
}

async function loadLocalHtmlBundleFromZip(
  zipPath: string,
  artifactsDir: string
): Promise<ExtractedHtmlBundle> {
  return extractHtmlBundleFromZipBuffer(
    readFileSync(zipPath),
    artifactsDir,
    basename(zipPath)
  );
}

async function deleteGoogleDoc(
  drive: ReturnType<typeof google.drive>,
  docId: string,
  resolvedAuth: ResolvedGoogleAuth
): Promise<void> {
  try {
    await drive.files.delete({
      fileId: docId,
      supportsAllDrives: true,
    });
  } catch (error) {
    throw formatGoogleApiError("Google Docs cleanup", error, resolvedAuth);
  }
}

async function main(): Promise<void> {
  const options = parseArgs();
  let resolvedAuth: ResolvedGoogleAuth | null = null;
  let drive: ReturnType<typeof google.drive> | null = null;
  let docId: string | null = null;
  let bundle: ExtractedHtmlBundle;

  try {
    if (options.inputMode === "zip") {
      console.log(`Loading local Google Docs export zip: ${options.inputPath}`);
      bundle = await loadLocalHtmlBundleFromZip(
        options.inputPath,
        options.artifactsDir
      );
    } else {
      resolvedAuth = resolveGoogleAuth();
      drive = createDriveClient(resolvedAuth);

      console.log(`Auth mode: ${resolvedAuth.mode} (${resolvedAuth.source})`);
      if (!resolvedAuth.usesUserQuota) {
        console.log(
          "This auth mode does not use your personal Google Drive quota. If that matters, switch to OAuth via `npm run courses:auth:gdocs`."
        );
      }

      console.log(`Uploading PDF to Google Docs: ${options.inputPath}`);
      docId = await uploadPdfAsGoogleDoc(drive, options, resolvedAuth);
      console.log(`Created Google Docs file: ${docId}`);

      console.log("Exporting Google Docs as zipped HTML");
      bundle = await exportGoogleDocAsHtmlBundle(
        drive,
        docId,
        options.artifactsDir,
        resolvedAuth
      );
    }

    console.log(`Saved HTML artifacts: ${bundle.htmlFilePath}`);
    if (bundle.rawZipPath) {
      console.log(`Saved raw export zip: ${bundle.rawZipPath}`);
    }

    const tables = extractTablesFromHtml(bundle.html);
    writeFileSync(
      join(options.artifactsDir, "raw-tables.json"),
      JSON.stringify(tables, null, 2),
      "utf8"
    );
    console.log(`Extracted ${tables.length} tables from exported HTML`);

    if (options.writeMarkdown) {
      const markdown = createMarkdown(bundle.html);
      const markdownPath = join(options.artifactsDir, "document.md");
      writeFileSync(markdownPath, markdown, "utf8");
      console.log(`Saved Markdown snapshot: ${markdownPath}`);
    }

    const courses = parseCourseTables(tables);
    ensureDirectory(dirname(options.outPath));
    writeFileSync(options.outPath, JSON.stringify(courses, null, 2), "utf8");

    console.log(`Extracted ${courses.length} course entries`);
    console.log(`Written JSON: ${options.outPath}`);
  } finally {
    if (docId && drive && resolvedAuth && !options.keepDoc) {
      try {
        await deleteGoogleDoc(drive, docId, resolvedAuth);
        console.log(`Deleted temporary Google Docs file: ${docId}`);
      } catch (error) {
        console.warn(
          `Failed to delete temporary Google Docs file: ${getErrorMessage(error)}`
        );
      }
    }
  }
}

main().catch((error: unknown) => {
  console.error(`Google Docs parse failed: ${getErrorMessage(error)}`);
  process.exit(1);
});