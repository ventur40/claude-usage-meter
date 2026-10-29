// Run with: gjs -m tests/test-usage.js
import GLib from 'gi://GLib';
import System from 'system';
import {
    parseUsage, readAccessToken, renewSession, resolveConfigDir, ErrorKind, UsageClient,
} from '../usage.js';

let failures = 0;
function check(name, cond) {
    print(`${cond ? 'ok  ' : 'FAIL'} ${name}`);
    if (!cond)
        failures++;
}

const limits = parseUsage({
    five_hour: {utilization: 42.5, resets_at: '2026-10-22T15:00:00+00:00'},
    seven_day: {utilization: 18, resets_at: '2026-10-27T08:00:00+00:00'},
    seven_day_opus: null,
    seven_day_sonnet: {utilization: 7, resets_at: null},
    extra_usage: {is_enabled: false, utilization: null},
    omelette_promotional: {utilization: 0, resets_at: null},
});
check('keeps windows with numeric utilization', limits.map(l => l.id).join() ===
    'five_hour,seven_day,seven_day_sonnet,omelette_promotional');
check('parses reset date', limits[0].resetsAt.toISOString() === '2026-10-22T15:00:00.000Z');
check('null reset stays null', limits[2].resetsAt === null);

try {
    parseUsage(null);
    check('rejects null body', false);
} catch (e) {
    check('rejects null body', e.kind === ErrorKind.PARSE);
}

check('expands ~ in config dir', resolveConfigDir('~/x') === `${GLib.get_home_dir()}/x`);

const dir = GLib.dir_make_tmp('cum-XXXXXX');
const write = obj => GLib.file_set_contents(`${dir}/.credentials.json`, JSON.stringify(obj));

async function expectKind(name, kind) {
    try {
        await readAccessToken(dir);
        check(name, false);
    } catch (e) {
        check(name, e.kind === kind);
    }
}

await expectKind('missing file', ErrorKind.NO_CREDENTIALS);
write({claudeAiOauth: {accessToken: 'abc', expiresAt: Date.now() - 1000}});
await expectKind('expired token', ErrorKind.TOKEN_EXPIRED);
write({claudeAiOauth: {accessToken: 'abc', expiresAt: Date.now() + 60000}});
check('valid token', await readAccessToken(dir) === 'abc');

// renewSession runs `claude auth status` without CLAUDE_CODE_OAUTH_TOKEN.
const fake = `${dir}/claude`;
GLib.file_set_contents(fake,
    `#!/bin/sh\necho "$* token=\${CLAUDE_CODE_OAUTH_TOKEN:-unset} dir=$CLAUDE_CONFIG_DIR" > "${dir}/called"\n`);
GLib.spawn_command_line_sync(`chmod +x ${fake}`);
GLib.setenv('CLAUDE_CODE_OAUTH_TOKEN', 'secret', true);
await renewSession(fake, '/tmp/cfg');
const [, called] = GLib.file_get_contents(`${dir}/called`);
check('renew runs auth status without the env token',
    new TextDecoder().decode(called).trim() === 'auth status token=unset dir=/tmp/cfg');

try {
    await renewSession(`${dir}/missing`, '');
    check('missing claude binary', false);
} catch (e) {
    check('missing claude binary', e.kind === ErrorKind.NO_CLI);
}

// A 429 must become RATE_LIMITED with the server's Retry-After.
const port = GLib.getenv('TEST_429_PORT');
if (port) {
    write({claudeAiOauth: {accessToken: 'abc', expiresAt: Date.now() + 60000}});
    try {
        await new UsageClient(`http://127.0.0.1:${port}/`).fetch(dir);
        check('429 is rate limited', false);
    } catch (e) {
        check('429 is rate limited', e.kind === ErrorKind.RATE_LIMITED && e.retryAfter === 120);
    }
}

if (failures)
    System.exit(1);
