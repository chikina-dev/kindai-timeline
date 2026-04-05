# OpenNext Starter

This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

Read the documentation at <https://opennext.js.org/cloudflare>.

## Develop

Run the Next.js development server:

```bash
npm run dev
# or similar package manager command
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

## Preview

Preview the application locally on the Cloudflare runtime:

```bash
npm run preview
# or similar package manager command
```

## Course Data Scripts

The repository includes timetable ingestion scripts under `scripts/`.

Parse a PDF directly with the existing local parser:

```bash
npm run courses:parse -- --file data/pdf/【前期】R8情報学部時間割.pdf --out data/courses-2026-前期.json
```

Parse a PDF via Google Drive API by converting it to Google Docs, exporting the document as HTML, and extracting `<table>` data from the exported file:

```bash
npm run courses:parse:gdocs -- --file data/pdf/【前期】R8情報学部時間割.pdf --out data/courses-2026-前期-gdocs.json
```

If you already have the intermediate Google Docs export ZIP locally, you can skip Google API auth entirely and feed that ZIP directly into the same parser:

```bash
npm run courses:parse:gdocs -- --file data/html/【前期】R8情報学部時間割.zip --out data/courses-2026-前期-gdocs.json
```

Recommended auth for the Google Docs flow is user OAuth so Google Drive uses your own account quota.

Create OAuth credentials once:

```bash
export GOOGLE_OAUTH_CLIENT_ID=your-google-oauth-client-id
export GOOGLE_OAUTH_CLIENT_SECRET=your-google-oauth-client-secret
npm run courses:auth:gdocs
export GOOGLE_OAUTH_CREDENTIALS_PATH=data/google-oauth-authorized-user.json
```

You can also point at an OAuth client secret file instead of exporting the client ID and secret directly:

```bash
export GOOGLE_OAUTH_CLIENT_SECRET_PATH=/absolute/path/to/oauth-client-secret.json
npm run courses:auth:gdocs
```

Alternative environment for the Google Docs flow:

```bash
GOOGLE_OAUTH_CREDENTIALS_PATH=data/google-oauth-authorized-user.json
# or
GOOGLE_OAUTH_CLIENT_ID=your-google-oauth-client-id
GOOGLE_OAUTH_CLIENT_SECRET=your-google-oauth-client-secret
GOOGLE_OAUTH_REFRESH_TOKEN=your-refresh-token
# fallback only
GOOGLE_SERVICE_ACCOUNT_JSON='{"type":"service_account",...}'
# or
GOOGLE_APPLICATION_CREDENTIALS=/absolute/path/to/service-account.json
# optional
GOOGLE_DRIVE_FOLDER_ID=your-folder-id
```

The Google Docs parser writes local artifacts under `data/google-doc-artifacts/`, including the exported HTML bundle, a Markdown snapshot, and `raw-tables.json` for inspection. If `--file` points to a local ZIP, the parser skips Google API access and reuses that bundle directly. If Google reports a quota error while using a service account, switch to `npm run courses:auth:gdocs` so the upload runs against your user account instead.

## Deploy

Deploy the application to Cloudflare:

```bash
npm run deploy
# or similar package manager command
```

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!
