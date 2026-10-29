// SPDX-License-Identifier: GPL-2.0-or-later

import Adw from 'gi://Adw';
import Gio from 'gi://Gio';
import Gtk from 'gi://Gtk';

import {ExtensionPreferences, gettext as _} from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';

const DISPLAY_MODES = ['icon', 'session', 'weekly', 'both', 'highest'];

export default class ClaudeUsageMeterPreferences extends ExtensionPreferences {
    fillPreferencesWindow(window) {
        const settings = this.getSettings();
        const page = new Adw.PreferencesPage();
        window.add(page);

        const panel = new Adw.PreferencesGroup({title: _('Top Bar')});
        page.add(panel);

        const display = new Adw.ComboRow({
            title: _('Show'),
            model: Gtk.StringList.new([
                _('Icon only'),
                _('Session'),
                _('Weekly'),
                _('Session and weekly'),
                _('Highest limit'),
            ]),
            selected: Math.max(0, DISPLAY_MODES.indexOf(settings.get_string('panel-display'))),
        });
        display.connect('notify::selected', () =>
            settings.set_string('panel-display', DISPLAY_MODES[display.selected]));
        panel.add(display);

        const showIcon = new Adw.SwitchRow({title: _('Show icon')});
        settings.bind('show-icon', showIcon, 'active', Gio.SettingsBindFlags.DEFAULT);
        panel.add(showIcon);

        panel.add(this._spinRow(settings, 'warning-threshold', _('Warning at (%)'), 1, 100));
        panel.add(this._spinRow(settings, 'critical-threshold', _('Critical at (%)'), 1, 100));

        const data = new Adw.PreferencesGroup({title: _('Data')});
        page.add(data);

        data.add(this._spinRow(settings, 'refresh-interval', _('Refresh every (minutes)'), 2, 60));

        const configDir = new Adw.EntryRow({title: _('Claude Code folder (empty: ~/.claude)')});
        settings.bind('config-dir', configDir, 'text', Gio.SettingsBindFlags.DEFAULT);
        data.add(configDir);

        const renew = new Adw.SwitchRow({
            title: _('Renew expired session'),
            subtitle: _('Runs “claude auth status”, which uses no plan usage'),
        });
        settings.bind('auto-renew', renew, 'active', Gio.SettingsBindFlags.DEFAULT);
        data.add(renew);

        const claudePath = new Adw.EntryRow({title: _('Path to claude (empty: search PATH)')});
        settings.bind('claude-path', claudePath, 'text', Gio.SettingsBindFlags.DEFAULT);
        data.add(claudePath);

        const about = new Adw.PreferencesGroup({
            description: _('Unofficial extension, not affiliated with Anthropic. Your token is read from Claude Code and only sent to api.anthropic.com.'),
        });
        page.add(about);
    }

    _spinRow(settings, key, title, lower, upper) {
        const row = new Adw.SpinRow({
            title,
            adjustment: new Gtk.Adjustment({lower, upper, step_increment: 1}),
        });
        settings.bind(key, row, 'value', Gio.SettingsBindFlags.DEFAULT);
        return row;
    }
}
