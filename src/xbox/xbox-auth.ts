/**
 * Xbox Web API authentication helper.
 *
 * The xbox-webapi library does not expose a public API to authenticate using
 * only a refresh token and XUID. It expects either the interactive OAuth flow
 * or loading tokens from .tokens.json. The following logic is the minimal
 * use of internal fields required to support headless CI with env vars.
 *
 * Internal fields used (as of xbox-webapi@1.4.2):
 * - _authentication._tokens.oauth.refresh_token — set so isAuthenticated() can refresh
 * - _authentication._user.xid — set after auth so titlehub uses the desired XUID in API URLs
 *
 * All access is defensive (checks for presence) and isolated in this file.
 */

const DEBUG = process.env.DEBUG_XBOX === '1' || process.env.DEBUG_XBOX === 'true';

/** Matches xbox-webapi internal token shape (oauth, user, xsts). */
type AuthTokens = {
  oauth?: { refresh_token?: string };
  user?: Record<string, unknown>;
  xsts?: Record<string, unknown>;
};

export type XboxClient = {
  _authentication?: {
    _tokens?: AuthTokens;
    _user?: { xid?: string; uhs?: string; gamertag?: string };
    loadTokens?: () => void;
    isAuthenticated: () => Promise<void>;
  };
  isAuthenticated: () => Promise<void>;
  getProvider: (name: string) => unknown;
};

/**
 * Ensures env refresh token is applied even when .tokens.json exists.
 * Call once before isAuthenticated().
 */
export function applyEnvRefreshToken(client: XboxClient, refreshToken: string): void {
  const auth = client._authentication;
  if (!auth) {
    throw new Error('Xbox client missing _authentication; library may have changed.');
  }
  if (!auth._tokens) auth._tokens = { oauth: {}, user: {}, xsts: {} };
  if (!auth._tokens.oauth) auth._tokens.oauth = {};
  auth._tokens.oauth.refresh_token = refreshToken;

  const origLoadTokens = auth.loadTokens;
  if (typeof origLoadTokens === 'function') {
    auth.loadTokens = function (this: { _tokens?: AuthTokens }) {
      origLoadTokens.call(this as XboxClient['_authentication']);
      if (this._tokens?.oauth) this._tokens.oauth.refresh_token = refreshToken;
    };
  }
  if (DEBUG) console.error('[DEBUG_XBOX] Applied refresh token from env (length=%d)', refreshToken.length);
}

/**
 * Call after isAuthenticated() resolves. Overrides the authenticated user's XUID
 * so titlehub requests use the desired account (e.g. family member).
 */
export function setUserXuid(client: XboxClient, xuid: string): void {
  const auth = client._authentication;
  if (!auth) {
    throw new Error('Xbox client missing _authentication; library may have changed.');
  }
  if (!auth._user) {
    throw new Error(
      'Xbox client has no _user after isAuthenticated(). Auth may have failed or library changed.'
    );
  }
  auth._user.xid = xuid;
  if (DEBUG) console.error('[DEBUG_XBOX] Set request XUID from env (value not logged)');
}
