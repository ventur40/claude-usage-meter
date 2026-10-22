// SPDX-License-Identifier: GPL-2.0-or-later

import Clutter from 'gi://Clutter';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import GObject from 'gi://GObject';
import St from 'gi://St';

import {Extension, gettext as _} from 'resource:///org/gnome/shell/extensions/extension.js';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as PanelMenu from 'resource:///org/gnome/shell/ui/panelMenu.js';
import * as PopupMenu from 'resource:///org/gnome/shell/ui/popupMenu.js';

import {ErrorKind, UsageClient, UsageError, resolveConfigDir} from './usage.js';

const BAR_WIDTH = 220;
const MIN_REFRESH_ON_OPEN = 60 * 1000;
const KNOWN_LIMITS = ['five_hour', 'seven_day'];

function limitName(id) {
    switch (id) {
    case 'five_hour':
        return _('Session (5 h)');
    case 'seven_day':
        return _('Weekly');
    }

    const model = id.match(/^seven_day_(.+)$/);
    const words = (model ? model[1] : id).replaceAll('_', ' ');
    const title = words.charAt(0).toUpperCase() + words.slice(1);
    return model ? _('Weekly · %s').format(title) : title;
}

function formatReset(date) {
    const minutes = Math.max(0, Math.round((date - Date.now()) / 60000));
    let relative;
    if (minutes < 60) {
        relative = _('%d min').format(minutes);
    } else if (minutes < 24 * 60) {
        relative = _('%d h %d min').format(Math.floor(minutes / 60), minutes % 60);
    } else {
        const hours = Math.floor(minutes / 60);
        relative = _('%d d %d h').format(Math.floor(hours / 24), hours % 24);
    }

    const local = GLib.DateTime.new_from_unix_local(Math.floor(date / 1000));
    const clock = local.format(minutes < 24 * 60 ? '%H:%M' : '%a %H:%M');
    return _('Resets in %s (%s)').format(relative, clock);
}

function errorText(error) {
    switch (error.kind) {
    case ErrorKind.NO_CREDENTIALS:
        return _('Claude Code credentials not found. Install Claude Code and sign in.');
    case ErrorKind.TOKEN_EXPIRED:
        return _('The Claude Code session has expired. Run Claude Code to renew it.');
    case ErrorKind.RATE_LIMITED:
        return _('Too many requests. Trying again later.');
    default:
        return _('Could not get usage: %s').format(error.message);
    }
}

const LimitItem = GObject.registerClass(
class LimitItem extends PopupMenu.PopupBaseMenuItem {
    _init() {
        super._init({reactive: false, can_focus: false});

        const column = new St.Widget({
            layout_manager: new Clutter.BoxLayout({
                orientation: Clutter.Orientation.VERTICAL,
                spacing: 4,
            }),
            x_expand: true,
        });
        this.add_child(column);

        const header = new St.BoxLayout({x_expand: true});
        this._name = new St.Label({x_expand: true, style_class: 'cum-limit-name'});
        this._percent = new St.Label({style_class: 'cum-limit-percent'});
        header.add_child(this._name);
        header.add_child(this._percent);
        column.add_child(header);

        const track = new St.Bin({
            style_class: 'cum-bar-track',
            style: `width: ${BAR_WIDTH}px;`,
            x_align: Clutter.ActorAlign.START,
        });
        this._fill = new St.Widget({
            style_class: 'cum-bar-fill',
            x_align: Clutter.ActorAlign.START,
        });
        track.set_child(this._fill);
        column.add_child(track);

        this._reset = new St.Label({style_class: 'cum-limit-reset'});
        column.add_child(this._reset);
    }

    update(limit, level) {
        const percent = Math.min(100, limit.utilization);
        this._name.text = limitName(limit.id);
        this._percent.text = `${Math.round(limit.utilization)}%`;
        this._fill.style = `width: ${Math.round(BAR_WIDTH * percent / 100)}px;`;
        this._reset.text = limit.resetsAt ? formatReset(limit.resetsAt) : '';
        this._reset.visible = limit.resetsAt !== null;

        for (const name of ['warning', 'critical'])
            this._fill.remove_style_class_name(`cum-${name}`);
        if (level)
            this._fill.add_style_class_name(`cum-${level}`);
    }
});

const UsageIndicator = GObject.registerClass(
class UsageIndicator extends PanelMenu.Button {
    _init(extension) {
        super._init(0.5, _('Claude Usage'));

        this._settings = extension.getSettings();
        this._client = new UsageClient();
        this._cancellable = new Gio.Cancellable();
        this._limits = [];
        this._lastSuccess = 0;
        this._error = null;
        this._busy = false;
        this._timeoutId = 0;

        const box = new St.BoxLayout({style_class: 'panel-status-menu-box'});
        this._icon = new St.Icon({
            gicon: Gio.icon_new_for_string(
                `${extension.path}/icons/claude-usage-meter-symbolic.svg`),
            style_class: 'system-status-icon',
        });
        this._label = new St.Label({
            text: '…',
            y_align: Clutter.ActorAlign.CENTER,
            style_class: 'cum-panel-label',
        });
        box.add_child(this._icon);
        box.add_child(this._label);
        this.add_child(box);

        this._limitsSection = new PopupMenu.PopupMenuSection();
        this.menu.addMenuItem(this._limitsSection);

        this._status = new PopupMenu.PopupMenuItem('', {reactive: false, can_focus: false});
        this._status.label.add_style_class_name('cum-status');
        this._status.label.clutter_text.line_wrap = true;
        this.menu.addMenuItem(this._status);

        this.menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());
        this.menu.addAction(_('Refresh now'), () => this._refresh());
        this.menu.addAction(_('Settings'), () => extension.openPreferences());

        this.menu.connectObject('open-state-changed', (_menu, open) => {
            if (!open)
                return;
            if (Date.now() - this._lastSuccess > MIN_REFRESH_ON_OPEN)
                this._refresh();
            else
                this._render();
        }, this);

        this._settings.connectObject(
            'changed::refresh-interval', () => this._schedule(),
            'changed::config-dir', () => this._refresh(),
            'changed', () => this._render(),
            this);

        this._render();
        this._schedule();
        this._refresh();
    }

    _schedule() {
        if (this._timeoutId)
            GLib.Source.remove(this._timeoutId);

        const seconds = this._settings.get_uint('refresh-interval') * 60;
        this._timeoutId = GLib.timeout_add_seconds(GLib.PRIORITY_DEFAULT, seconds, () => {
            this._refresh();
            return GLib.SOURCE_CONTINUE;
        });
    }

    async _refresh() {
        if (this._busy)
            return;
        this._busy = true;

        try {
            const configDir = resolveConfigDir(this._settings.get_string('config-dir'));
            this._limits = await this._client.fetch(configDir, this._cancellable);
            this._lastSuccess = Date.now();
            this._error = null;
        } catch (e) {
            if (e.matches?.(Gio.IOErrorEnum, Gio.IOErrorEnum.CANCELLED))
                return;
            if (!(e instanceof UsageError))
                console.warn(`Claude Usage Meter: ${e.message}`);
            this._error = e;
        } finally {
            this._busy = false;
        }

        // The indicator may have been destroyed while the request was running.
        if (!this._cancellable.is_cancelled())
            this._render();
    }

    _level(utilization) {
        if (utilization >= this._settings.get_uint('critical-threshold'))
            return 'critical';
        if (utilization >= this._settings.get_uint('warning-threshold'))
            return 'warning';
        return null;
    }

    _visibleLimits() {
        return this._limits.filter(l =>
            KNOWN_LIMITS.includes(l.id) || l.utilization > 0 || l.resetsAt);
    }

    _panelLimits(limits) {
        const byId = id => limits.filter(l => l.id === id);
        switch (this._settings.get_string('panel-display')) {
        case 'session':
            return byId('five_hour');
        case 'weekly':
            return byId('seven_day');
        case 'both':
            return [...byId('five_hour'), ...byId('seven_day')];
        case 'highest':
            return limits.length
                ? [limits.reduce((a, b) => (b.utilization > a.utilization ? b : a))]
                : [];
        default:
            return [];
        }
    }

    _render() {
        const limits = this._visibleLimits();
        const shown = this._panelLimits(limits);
        const display = this._settings.get_string('panel-display');

        this._label.visible = display !== 'icon';
        if (shown.length)
            this._label.text = shown.map(l => `${Math.round(l.utilization)}%`).join(' · ');
        else
            this._label.text = this._error ? '!' : '…';

        const worst = Math.max(0, ...(display === 'icon' ? limits : shown).map(l => l.utilization));
        const level = this._level(worst);
        for (const actor of [this._icon, this._label]) {
            actor.remove_style_class_name('cum-warning');
            actor.remove_style_class_name('cum-critical');
            if (level)
                actor.add_style_class_name(`cum-${level}`);
        }
        this._icon.opacity = this._error && limits.length ? 128 : 255;

        this._limitsSection.removeAll();
        for (const limit of limits) {
            const item = new LimitItem();
            item.update(limit, this._level(limit.utilization));
            this._limitsSection.addMenuItem(item);
        }

        if (this._error) {
            this._status.label.text = errorText(this._error);
        } else if (this._lastSuccess) {
            const time = GLib.DateTime.new_from_unix_local(
                Math.floor(this._lastSuccess / 1000)).format('%H:%M');
            this._status.label.text = _('Updated at %s').format(time);
        } else {
            this._status.label.text = _('Loading…');
        }
    }

    destroy() {
        this._cancellable.cancel();
        if (this._timeoutId) {
            GLib.Source.remove(this._timeoutId);
            this._timeoutId = 0;
        }
        this._settings.disconnectObject(this);
        this._settings = null;
        this._client.destroy();
        this._client = null;

        super.destroy();
    }
});

export default class ClaudeUsageMeterExtension extends Extension {
    enable() {
        this._indicator = new UsageIndicator(this);
        Main.panel.addToStatusArea(this.uuid, this._indicator);
    }

    disable() {
        this._indicator?.destroy();
        this._indicator = null;
    }
}
