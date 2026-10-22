// SPDX-License-Identifier: GPL-2.0-or-later

import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import Soup from 'gi://Soup?version=3.0';

Gio._promisify(Gio.File.prototype, 'load_contents_async');
Gio._promisify(Soup.Session.prototype, 'send_and_read_async');

const USAGE_URL = 'https://api.anthropic.com/api/oauth/usage';
const OAUTH_BETA = 'oauth-2025-04-20';

// Keys in the usage response that are not rolling windows.
const IGNORED_KEYS = new Set(['extra_usage']);

export const ErrorKind = {
    NO_CREDENTIALS: 'no-credentials',
    TOKEN_EXPIRED: 'token-expired',
    RATE_LIMITED: 'rate-limited',
    HTTP: 'http',
    PARSE: 'parse',
};

export class UsageError extends Error {
    constructor(kind, message) {
        super(message);
        this.name = 'UsageError';
        this.kind = kind;
    }
}

export function resolveConfigDir(configured) {
    if (configured)
        return configured.replace(/^~(?=$|\/)/, GLib.get_home_dir());

    return GLib.getenv('CLAUDE_CONFIG_DIR') ||
        GLib.build_filenamev([GLib.get_home_dir(), '.claude']);
}

export async function readAccessToken(configDir, cancellable = null) {
    const file = Gio.File.new_for_path(
        GLib.build_filenamev([configDir, '.credentials.json']));

    let contents;
    try {
        [contents] = await file.load_contents_async(cancellable);
    } catch (e) {
        if (e.matches(Gio.IOErrorEnum, Gio.IOErrorEnum.NOT_FOUND))
            throw new UsageError(ErrorKind.NO_CREDENTIALS, file.get_path());
        throw e;
    }

    let oauth;
    try {
        oauth = JSON.parse(new TextDecoder().decode(contents)).claudeAiOauth;
    } catch {
        throw new UsageError(ErrorKind.PARSE, file.get_path());
    }

    if (!oauth?.accessToken)
        throw new UsageError(ErrorKind.NO_CREDENTIALS, file.get_path());

    if (oauth.expiresAt && oauth.expiresAt <= Date.now())
        throw new UsageError(ErrorKind.TOKEN_EXPIRED, file.get_path());

    return oauth.accessToken;
}

/**
 * Turns the usage response into a list of limits, keeping the order the
 * server sends them in. Windows with a null value are inactive and skipped.
 *
 * @param {object} data - parsed JSON body
 * @returns {{id: string, utilization: number, resetsAt: Date|null}[]}
 */
export function parseUsage(data) {
    if (typeof data !== 'object' || data === null)
        throw new UsageError(ErrorKind.PARSE, 'unexpected response');

    const limits = [];
    for (const [id, window] of Object.entries(data)) {
        if (IGNORED_KEYS.has(id) || typeof window?.utilization !== 'number')
            continue;

        const resetsAt = window.resets_at ? new Date(window.resets_at) : null;
        limits.push({
            id,
            utilization: Math.max(0, window.utilization),
            resetsAt: resetsAt && !isNaN(resetsAt) ? resetsAt : null,
        });
    }
    return limits;
}

export class UsageClient {
    constructor() {
        this._session = new Soup.Session({timeout: 20});
    }

    async fetch(configDir, cancellable = null) {
        const token = await readAccessToken(configDir, cancellable);

        const message = Soup.Message.new('GET', USAGE_URL);
        message.request_headers.append('Authorization', `Bearer ${token}`);
        message.request_headers.append('anthropic-beta', OAUTH_BETA);
        message.request_headers.append('Accept', 'application/json');

        const bytes = await this._session.send_and_read_async(
            message, GLib.PRIORITY_DEFAULT, cancellable);
        const status = message.get_status();

        if (status === Soup.Status.UNAUTHORIZED)
            throw new UsageError(ErrorKind.TOKEN_EXPIRED, 'HTTP 401');
        if (status === Soup.Status.TOO_MANY_REQUESTS)
            throw new UsageError(ErrorKind.RATE_LIMITED, 'HTTP 429');
        if (status !== Soup.Status.OK)
            throw new UsageError(ErrorKind.HTTP, `HTTP ${status}`);

        let data;
        try {
            data = JSON.parse(new TextDecoder().decode(bytes.get_data()));
        } catch {
            throw new UsageError(ErrorKind.PARSE, 'invalid JSON');
        }
        return parseUsage(data);
    }

    destroy() {
        this._session.abort();
        this._session = null;
    }
}
