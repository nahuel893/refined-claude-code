#!/usr/bin/env bash
# Update the refined-claude-code mods in one command: pull this checkout,
# refresh the marketplace, update every mod it lists and install the new ones.
# Needs no sudo and installs nothing else; scripts/install.sh sets things up.
set -euo pipefail

repo="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
marketplace="refined-claude-code"
# shellcheck source=scripts/mods.sh
. "$repo/scripts/mods.sh"

usage() {
	cat <<'EOF'
Usage: scripts/update.sh

Pulls this checkout, refreshes the refined-claude-code marketplace, updates
every mod it lists and installs the ones not installed yet. Restart Claude Code
afterwards (or run /reload-plugins when the marketplace is this folder).
EOF
}

say() { printf '\033[1m==> %s\033[0m\n' "$*"; }
die() {
	printf 'error: %s\n' "$*" >&2
	exit 1
}

case "${1:-}" in
"") ;;
-h | --help)
	usage
	exit 0
	;;
*)
	usage >&2
	exit 2
	;;
esac

command -v claude >/dev/null 2>&1 || die "claude is not on PATH; run scripts/install.sh first"

# A folder marketplace (install.sh --local) reads the code from this checkout,
# and the mod list comes from it too, so bring it up to date first. A checkout
# that cannot fast-forward (local commits, no upstream) is used as it is.
if git -C "$repo" rev-parse --is-inside-work-tree >/dev/null 2>&1; then
	say "Pulling $repo"
	git -C "$repo" pull --ff-only --quiet 2>/dev/null ||
		printf 'warning: %s did not fast-forward; updating from it as it is\n' "$repo" >&2
fi

say "Refreshing the $marketplace marketplace"
claude plugin marketplace update "$marketplace" >/dev/null ||
	die "the $marketplace marketplace is not added; run scripts/install.sh first"

mods=()
while IFS= read -r mod; do mods+=("$mod"); done < <(mods_of "$repo/.claude-plugin/marketplace.json")
((${#mods[@]})) || die "no mods found in $repo/.claude-plugin/marketplace.json"

installed="$(claude plugin list --json)"
for mod in "${mods[@]}"; do
	if grep -q "\"id\": \"$mod@$marketplace\"" <<<"$installed"; then
		say "Updating $mod"
		claude plugin update "$mod@$marketplace" | tail -n 1
	else
		say "Installing $mod (new)"
		claude plugin install "$mod@$marketplace" | tail -n 1
	fi
done

say "Done. Restart Claude Code to load the new versions (/reload-plugins for a folder marketplace)."
