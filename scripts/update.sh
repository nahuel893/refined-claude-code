#!/usr/bin/env bash
# Update the refined-claude-code mods in one command, with or without a clone:
#   curl -fsSL https://raw.githubusercontent.com/nahuel893/refined-claude-code/main/scripts/update.sh | bash
# It refreshes the marketplace, updates every mod of it you have and installs
# the ones it added since. Run from a clone, it pulls the clone first.
# Needs no sudo and installs nothing else; scripts/install.sh sets things up.
set -euo pipefail

marketplace="refined-claude-code"

usage() {
	cat <<'EOF'
Usage: scripts/update.sh
       curl -fsSL https://raw.githubusercontent.com/nahuel893/refined-claude-code/main/scripts/update.sh | bash

Refreshes the refined-claude-code marketplace, updates every mod of it that is
installed and installs the ones it lists that are not. From a clone, it pulls
the clone first. Restart Claude Code afterwards (or run /reload-plugins when the
marketplace is a clone).
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

command -v claude >/dev/null 2>&1 || die "claude is not on PATH; install Claude Code first"

# Run from a clone, pull it: a folder marketplace (install.sh --local) reads the
# code from there. Piped from curl there is no file and nothing to pull. A clone
# that cannot fast-forward (local commits, no upstream) is used as it is.
script="${BASH_SOURCE[0]:-}"
if [[ -f $script ]]; then
	repo="$(cd "$(dirname "$script")/.." && pwd)"
	if git -C "$repo" rev-parse --is-inside-work-tree >/dev/null 2>&1; then
		say "Pulling $repo"
		git -C "$repo" pull --ff-only --quiet 2>/dev/null ||
			printf 'warning: %s did not fast-forward; updating from it as it is\n' "$repo" >&2
	fi
fi

say "Refreshing the $marketplace marketplace"
claude plugin marketplace update "$marketplace" >/dev/null ||
	die "the $marketplace marketplace is not added; run: claude plugin marketplace add nahuel893/refined-claude-code"

# Claude Code lists the mods of the marketplace itself: the installed ones by
# "id", the ones not installed yet by "pluginId". A mod added to the marketplace
# shows up in the second list, so it is installed with no edit here.
# An empty list is normal (nothing new to install): grep finding nothing is not an error.
ids_of() { { grep -o "\"$1\": *\"[^\"@]*@$marketplace\"" || true; } | sed 's/.*"\([^"@]*\)@.*/\1/' | sort -u; }
installed="$(claude plugin list --json | ids_of id)"
missing="$(claude plugin list --available --json | ids_of pluginId)"
[[ -n $installed$missing ]] || die "the $marketplace marketplace lists no mods"

for mod in $installed; do
	say "Updating $mod"
	claude plugin update "$mod@$marketplace" | tail -n 1
done
for mod in $missing; do
	say "Installing $mod (new)"
	claude plugin install "$mod@$marketplace" | tail -n 1
done

say "Done. Restart Claude Code to load the new versions (/reload-plugins for a folder marketplace)."
