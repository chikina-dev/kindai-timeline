import { createServer } from "http";
import { mkdirSync, writeFileSync } from "fs";
import { dirname } from "path";
import { config } from "dotenv";
import { google } from "googleapis";
import {
  buildAuthorizedUserPayload,
  DRIVE_SCOPES,
  getErrorMessage,
  resolveOAuthClientConfig,
  resolveOAuthCredentialsOutputPath,
} from "./lib/google-drive-auth";

config({ path: ".env.local", override: false });
config({ path: ".env", override: false });

interface CliOptions {
  outputPath: string;
  redirectUri?: string;
  timeoutMs: number;
}

function printHelp(): void {
  console.log(
    [
      "Usage: tsx scripts/google-oauth-authorize.ts [--out <authorized-user-json>] [--redirect-uri <uri>] [--timeout <seconds>]",
      "",
      "Required environment:",
      "  - GOOGLE_OAUTH_CLIENT_ID and GOOGLE_OAUTH_CLIENT_SECRET",
      "    or GOOGLE_OAUTH_CLIENT_SECRET_PATH with a desktop-app OAuth client JSON",
      "",
      "Output:",
      "  Writes an authorized_user JSON that parse-pdf-gdocs.ts can consume via GOOGLE_OAUTH_CREDENTIALS_PATH.",
    ].join("\n")
  );
}

function parseArgs(): CliOptions {
  const args = process.argv.slice(2);
  let outputPath = "";
  let redirectUri = process.env.GOOGLE_OAUTH_REDIRECT_URI;
  let timeoutMs = 180_000;

  if (args.includes("--help") || args.includes("-h")) {
    printHelp();
    process.exit(0);
  }

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    const nextValue = args[index + 1];

    if (arg === "--out" && nextValue) {
      outputPath = resolveOAuthCredentialsOutputPath(nextValue);
      index += 1;
      continue;
    }

    if (arg === "--redirect-uri" && nextValue) {
      redirectUri = nextValue;
      index += 1;
      continue;
    }

    if (arg === "--timeout" && nextValue) {
      const seconds = Number.parseInt(nextValue, 10);
      if (Number.isFinite(seconds) && seconds > 0) {
        timeoutMs = seconds * 1000;
      }
      index += 1;
    }
  }

  return {
    outputPath: resolveOAuthCredentialsOutputPath(outputPath || undefined),
    redirectUri,
    timeoutMs,
  };
}

function waitForAuthorizationCode(
  redirectUri: string,
  timeoutMs: number
): Promise<string> {
  return new Promise((resolve, reject) => {
    const callbackUrl = new URL(redirectUri);
    const isLoopbackHost =
      callbackUrl.hostname === "127.0.0.1" || callbackUrl.hostname === "localhost";

    if (!isLoopbackHost || !callbackUrl.port) {
      reject(
        new Error(
          "The OAuth redirect URI must be a loopback address with an explicit port, such as http://127.0.0.1:42813/oauth2callback"
        )
      );
      return;
    }

    const server = createServer((request, response) => {
      const requestUrl = new URL(request.url ?? "/", redirectUri);

      if (requestUrl.pathname !== callbackUrl.pathname) {
        response.statusCode = 404;
        response.end("Not found");
        return;
      }

      const error = requestUrl.searchParams.get("error");
      if (error) {
        response.statusCode = 400;
        response.end("OAuth authorization failed. You can close this tab.");
        cleanup();
        reject(new Error(`OAuth authorization failed: ${error}`));
        return;
      }

      const code = requestUrl.searchParams.get("code");
      if (!code) {
        response.statusCode = 400;
        response.end("Missing OAuth code. You can close this tab.");
        cleanup();
        reject(new Error("OAuth callback did not include an authorization code"));
        return;
      }

      response.statusCode = 200;
      response.setHeader("Content-Type", "text/html; charset=utf-8");
      response.end(
        "<html><body><h1>Authorization succeeded</h1><p>You can return to the terminal.</p></body></html>"
      );

      cleanup();
      resolve(code);
    });

    const timeout = setTimeout(() => {
      cleanup();
      reject(
        new Error(
          "Timed out waiting for the OAuth callback. Re-run the command and finish the browser consent flow sooner."
        )
      );
    }, timeoutMs);

    const cleanup = () => {
      clearTimeout(timeout);
      server.close();
    };

    server.listen(Number(callbackUrl.port), callbackUrl.hostname, () => {
      console.log(`Waiting for OAuth callback on ${redirectUri}`);
    });
  });
}

async function main(): Promise<void> {
  const options = parseArgs();
  const clientConfig = resolveOAuthClientConfig();
  const redirectUri = options.redirectUri ?? clientConfig.redirectUri;
  const oauthClient = new google.auth.OAuth2(
    clientConfig.clientId,
    clientConfig.clientSecret,
    redirectUri
  );

  const authUrl = oauthClient.generateAuthUrl({
    access_type: "offline",
    scope: DRIVE_SCOPES,
    prompt: "consent",
    include_granted_scopes: true,
  });

  console.log("Open the following URL in your browser and complete the consent flow:");
  console.log(authUrl);

  const code = await waitForAuthorizationCode(
    redirectUri,
    options.timeoutMs
  );
  const tokenResponse = await oauthClient.getToken(code);
  const refreshToken = tokenResponse.tokens.refresh_token;

  if (!refreshToken) {
    throw new Error(
      "Google did not return a refresh token. Revoke previous app access for this OAuth client and run the command again with prompt=consent."
    );
  }

  const authorizedUserPayload = buildAuthorizedUserPayload(
    {
      ...clientConfig,
      redirectUri,
    },
    refreshToken
  );

  mkdirSync(dirname(options.outputPath), { recursive: true });
  writeFileSync(
    options.outputPath,
    JSON.stringify(authorizedUserPayload, null, 2),
    "utf8"
  );

  console.log(`Saved OAuth credentials to: ${options.outputPath}`);
  console.log(`Next step: export GOOGLE_OAUTH_CREDENTIALS_PATH='${options.outputPath}'`);
}

main().catch((error: unknown) => {
  console.error(`OAuth bootstrap failed: ${getErrorMessage(error)}`);
  process.exit(1);
});