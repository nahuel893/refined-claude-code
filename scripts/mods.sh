# shellcheck shell=bash
# Shared by install.sh and update.sh: the mods the marketplace lists, one per
# line, read from each entry's "./plugins/<mod>" source. A mod added to
# .claude-plugin/marketplace.json is installed and updated with no edit here.
mods_of() {
	sed -n 's|.*"source": *"\./plugins/\([^"]*\)".*|\1|p' "$1"
}
