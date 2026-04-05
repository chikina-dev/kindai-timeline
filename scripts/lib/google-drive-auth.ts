import { existsSync, readFileSync } from "fs";
import { resolve } from "path";
import { google } from "googleapis";
import type { OAuth2Client } from "google-auth-library";

export const DRIVE_SCOPES = ["https://www.googleapis.com/auth/drive"];
export const DEFAULT_OAUTH_CREDENTIALS_PATH = resolve(
  "data/google-oauth-authorized-user.json"
);
export const DEFAULT_OAUTH_REDIRECT_URI =
  "http://127.0.0.1:42813/oauth2callback";

type AuthorizedUserCredentials = {
  type?: string;
  client_id?: string;
  client_secret?: string;
  refresh_token?: string;
};

type ServiceAccountCredentials = {
  type?: string;
  client_email?: string;
  private_key?: string;
};

type OAuthClientSecretFile = {
  installed?: {
    client_id?: string;
    client_secret?: string;
    redirect_uris?: string[];
  };
  web?: {
    client_id?: string;
    client_secret?: string;
    redirect_uris?: string[];
  };
};

type OAuthClientSecretBlock = {
  client_id?: string;
  client_secret?: string;
  redirect_uris?: string[];
};

export type ResolvedGoogleAuth = {
  auth: InstanceType<typeof google.auth.GoogleAuth> | OAuth2Client;
  mode: "oauth" | "service-account" | "application-default";
  source: string;
  usesUserQuota: boolean;
};

export type OAuthClientConfig = {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
};

function parseJson<T>(raw: string, label: string): T {
  try {
    return JSON.parse(raw) as T;
  } catch (error) {
    throw new Error(`${label} is not valid JSON: ${getErrorMessage(error)}`);
  }
}

function readJsonFile<T>(filePath: string, label: string): T {
  return parseJson<T>(readFileSync(filePath, "utf8"), label);
}

function isAuthorizedUserCredentials(
  value: unknown
): value is AuthorizedUserCredentials {
  return Boolean(
    value &&
      typeof value === "object" &&
      "client_id" in value &&
      "client_secret" in value &&
      "refresh_token" in value
  );
}

function isServiceAccountCredentials(
  value: unknown
): value is ServiceAccountCredentials {
  return Boolean(
    value &&
      typeof value === "object" &&
      "client_email" in value &&
      "private_key" in value
  );
}

function getOAuthClientSecretBlock(value: unknown): OAuthClientSecretBlock | null {
  if (!value || typeof value !== "object") return null;

  if ("installed" in value && value.installed && typeof value.installed === "object") {
    return value.installed as OAuthClientSecretBlock;
  }

  if ("web" in value && value.web && typeof value.web === "object") {
    return value.web as OAuthClientSecretBlock;
  }

  return null;
}

function toOAuthClientConfig(
  value: unknown,
  fallbackRedirectUri = DEFAULT_OAUTH_REDIRECT_URI
): OAuthClientConfig | null {
  if (isAuthorizedUserCredentials(value)) {
    return {
      clientId: value.client_id ?? "",
      clientSecret: value.client_secret ?? "",
      redirectUri: fallbackRedirectUri,
    };
  }

  const secretBlock = getOAuthClientSecretBlock(value as OAuthClientSecretFile);
  if (!secretBlock) {
    return null;
  }

  return {
    clientId: secretBlock.client_id ?? "",
    clientSecret: secretBlock.client_secret ?? "",
    redirectUri: secretBlock.redirect_uris?.[0] ?? fallbackRedirectUri,
  };
}

function createOAuthClient(credentials: AuthorizedUserCredentials): OAuth2Client {
  const client = new google.auth.OAuth2(
    credentials.client_id,
    credentials.client_secret
  );

  client.setCredentials({
    refresh_token: credentials.refresh_token,
  });

  return client;
}

function loadAuthorizedUserFromPath(
  filePath: string,
  label: string
): AuthorizedUserCredentials | null {
  if (!existsSync(filePath)) {
    return null;
  }

  const credentials = readJsonFile<unknown>(filePath, label);
  if (!isAuthorizedUserCredentials(credentials)) {
    return null;
  }

  return credentials;
}

function getAuthorizedUserFromEnvironment(): {
  credentials: AuthorizedUserCredentials;
  source: string;
} | null {
  if (process.env.GOOGLE_OAUTH_CREDENTIALS_JSON) {
    const credentials = parseJson<unknown>(
      process.env.GOOGLE_OAUTH_CREDENTIALS_JSON,
      "GOOGLE_OAUTH_CREDENTIALS_JSON"
    );

    if (!isAuthorizedUserCredentials(credentials)) {
      throw new Error(
        "GOOGLE_OAUTH_CREDENTIALS_JSON must contain an authorized_user JSON with client_id, client_secret, and refresh_token"
      );
    }

    return {
      credentials,
      source: "GOOGLE_OAUTH_CREDENTIALS_JSON",
    };
  }

  const oauthCredentialsPath =
    process.env.GOOGLE_OAUTH_CREDENTIALS_PATH ?? DEFAULT_OAUTH_CREDENTIALS_PATH;
  const fromOauthPath = loadAuthorizedUserFromPath(
    oauthCredentialsPath,
    process.env.GOOGLE_OAUTH_CREDENTIALS_PATH
      ? "GOOGLE_OAUTH_CREDENTIALS_PATH"
      : "default OAuth credentials file"
  );
  if (fromOauthPath) {
    return {
      credentials: fromOauthPath,
      source: oauthCredentialsPath,
    };
  }

  if (
    process.env.GOOGLE_OAUTH_CLIENT_ID &&
    process.env.GOOGLE_OAUTH_CLIENT_SECRET &&
    process.env.GOOGLE_OAUTH_REFRESH_TOKEN
  ) {
    return {
      credentials: {
        type: "authorized_user",
        client_id: process.env.GOOGLE_OAUTH_CLIENT_ID,
        client_secret: process.env.GOOGLE_OAUTH_CLIENT_SECRET,
        refresh_token: process.env.GOOGLE_OAUTH_REFRESH_TOKEN,
      },
      source: "GOOGLE_OAUTH_CLIENT_ID/SECRET/REFRESH_TOKEN",
    };
  }

  const applicationCredentialsPath = process.env.GOOGLE_APPLICATION_CREDENTIALS;
  if (applicationCredentialsPath && existsSync(applicationCredentialsPath)) {
    const credentials = readJsonFile<unknown>(
      applicationCredentialsPath,
      "GOOGLE_APPLICATION_CREDENTIALS"
    );
    if (isAuthorizedUserCredentials(credentials)) {
      return {
        credentials,
        source: applicationCredentialsPath,
      };
    }
  }

  return null;
}

function getServiceAccountCredentials(): {
  credentials?: ServiceAccountCredentials;
  source: string;
} | null {
  if (process.env.GOOGLE_SERVICE_ACCOUNT_JSON) {
    const credentials = parseJson<unknown>(
      process.env.GOOGLE_SERVICE_ACCOUNT_JSON,
      "GOOGLE_SERVICE_ACCOUNT_JSON"
    );

    if (!isServiceAccountCredentials(credentials)) {
      throw new Error(
        "GOOGLE_SERVICE_ACCOUNT_JSON must contain a service account JSON with client_email and private_key"
      );
    }

    return {
      credentials,
      source: "GOOGLE_SERVICE_ACCOUNT_JSON",
    };
  }

  const applicationCredentialsPath = process.env.GOOGLE_APPLICATION_CREDENTIALS;
  if (applicationCredentialsPath && existsSync(applicationCredentialsPath)) {
    const credentials = readJsonFile<unknown>(
      applicationCredentialsPath,
      "GOOGLE_APPLICATION_CREDENTIALS"
    );

    if (isServiceAccountCredentials(credentials)) {
      return {
        credentials,
        source: applicationCredentialsPath,
      };
    }

    if (toOAuthClientConfig(credentials)) {
      throw new Error(
        "GOOGLE_APPLICATION_CREDENTIALS points to an OAuth client secret file, not an authorized user token. Run `npm run courses:auth:gdocs` first, or set GOOGLE_OAUTH_CREDENTIALS_PATH."
      );
    }
  }

  return null;
}

export function resolveGoogleAuth(): ResolvedGoogleAuth {
  const authorizedUser = getAuthorizedUserFromEnvironment();
  if (authorizedUser) {
    return {
      auth: createOAuthClient(authorizedUser.credentials),
      mode: "oauth",
      source: authorizedUser.source,
      usesUserQuota: true,
    };
  }

  const serviceAccount = getServiceAccountCredentials();
  if (serviceAccount?.credentials) {
    const credentials = {
      ...serviceAccount.credentials,
      private_key: serviceAccount.credentials.private_key?.replace(/\\n/g, "\n"),
    };

    return {
      auth: new google.auth.GoogleAuth({
        credentials,
        scopes: DRIVE_SCOPES,
      }),
      mode: "service-account",
      source: serviceAccount.source,
      usesUserQuota: false,
    };
  }

  if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
    return {
      auth: new google.auth.GoogleAuth({ scopes: DRIVE_SCOPES }),
      mode: "application-default",
      source: "GOOGLE_APPLICATION_CREDENTIALS",
      usesUserQuota: false,
    };
  }

  throw new Error(
    [
      "Google auth is not configured.",
      "Preferred: configure user OAuth via `npm run courses:auth:gdocs` and use GOOGLE_OAUTH_CREDENTIALS_PATH.",
      "Alternative: set GOOGLE_SERVICE_ACCOUNT_JSON or GOOGLE_APPLICATION_CREDENTIALS to a service account JSON.",
    ].join(" ")
  );
}

export function resolveOAuthClientConfig(): OAuthClientConfig {
  if (process.env.GOOGLE_OAUTH_CLIENT_ID && process.env.GOOGLE_OAUTH_CLIENT_SECRET) {
    return {
      clientId: process.env.GOOGLE_OAUTH_CLIENT_ID,
      clientSecret: process.env.GOOGLE_OAUTH_CLIENT_SECRET,
      redirectUri:
        process.env.GOOGLE_OAUTH_REDIRECT_URI ?? DEFAULT_OAUTH_REDIRECT_URI,
    };
  }

  const jsonCandidates: Array<{
    label: string;
    rawJson?: string;
    filePath?: string;
  }> = [
    {
      label: "GOOGLE_OAUTH_CLIENT_SECRET_JSON",
      rawJson: process.env.GOOGLE_OAUTH_CLIENT_SECRET_JSON,
    },
    {
      label: "GOOGLE_OAUTH_CLIENT_SECRET_PATH",
      filePath: process.env.GOOGLE_OAUTH_CLIENT_SECRET_PATH,
    },
    {
      label: "GOOGLE_APPLICATION_CREDENTIALS",
      filePath: process.env.GOOGLE_APPLICATION_CREDENTIALS,
    },
  ];

  for (const candidate of jsonCandidates) {
    if (candidate.rawJson) {
      const config = toOAuthClientConfig(
        parseJson<unknown>(candidate.rawJson, candidate.label),
        process.env.GOOGLE_OAUTH_REDIRECT_URI ?? DEFAULT_OAUTH_REDIRECT_URI
      );
      if (config) {
        return config;
      }
    }

    if (candidate.filePath && existsSync(candidate.filePath)) {
      const config = toOAuthClientConfig(
        readJsonFile<unknown>(candidate.filePath, candidate.label),
        process.env.GOOGLE_OAUTH_REDIRECT_URI ?? DEFAULT_OAUTH_REDIRECT_URI
      );
      if (config) {
        return config;
      }
    }
  }

  throw new Error(
    [
      "OAuth client configuration is not available.",
      "Set GOOGLE_OAUTH_CLIENT_ID and GOOGLE_OAUTH_CLIENT_SECRET, or provide GOOGLE_OAUTH_CLIENT_SECRET_PATH with a desktop-app OAuth client JSON.",
    ].join(" ")
  );
}

export function buildAuthorizedUserPayload(
  clientConfig: OAuthClientConfig,
  refreshToken: string
): AuthorizedUserCredentials {
  return {
    type: "authorized_user",
    client_id: clientConfig.clientId,
    client_secret: clientConfig.clientSecret,
    refresh_token: refreshToken,
  };
}

export function resolveOAuthCredentialsOutputPath(outputPath?: string): string {
  return resolve(outputPath ?? DEFAULT_OAUTH_CREDENTIALS_PATH);
}

export function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  return String(error);
}