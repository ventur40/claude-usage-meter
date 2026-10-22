// Run with: gjs -m tests/test-usage.js
import GLib from 'gi://GLib';
import System from 'system';
import {parseUsage, readAccessToken, resolveConfigDir, ErrorKind} from '../usage.js';

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

if (failures)
    System.exit(1);
