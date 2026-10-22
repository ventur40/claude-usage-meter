UUID = claude-usage-meter@ventur40.github.io
ZIP = $(UUID).shell-extension.zip
SOURCES = usage.js icons

.PHONY: pack install lint test pot clean

pack:
	gnome-extensions pack --force --podir=po --schema=schemas/org.gnome.shell.extensions.claude-usage-meter.gschema.xml \
		$(foreach f,$(SOURCES),--extra-source=$(f)) .

install: pack
	gnome-extensions install --force $(ZIP)

lint:
	npx eslint extension.js prefs.js usage.js tests/

test:
	gjs -m tests/test-usage.js

pot:
	xgettext --from-code=UTF-8 --language=JavaScript --keyword=_ \
		--package-name=claude-usage-meter -o po/claude-usage-meter.pot extension.js prefs.js

clean:
	rm -f $(ZIP)
