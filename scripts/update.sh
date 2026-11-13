#!/usr/bin/env bash
# Update the refined-claude-code mods in one command, with or without a clone:
#   curl -fsSL https://raw.githubusercontent.com/nahuel893/refined-claude-code/main/scripts/update.sh | bash
# It refreshes the marketplace, updates every mod of it you have and installs
# the ones you do not have. Run from a clone, it pulls the clone first.
# Needs no sudo and installs nothing else; scripts/install.sh sets things up.
set -euo pipefail

marketplace="refined-claude-code"

usage() {
	cat <<'EOF'
Usage: scripts/update.sh
       curl -fsSL https://raw.githubusercontent.com/nahuel893/refined-claude-code/main/scripts/update.sh | bash

Refreshes the refined-claude-code marketplace, updates every mod of it that is
installed and installs every mod it lists that is not, so a new mod arrives with
the next update (and so does one you skipped). From a clone, it pulls the clone
first. Restart Claude Code afterwards (or run /reload-plugins when the
marketplace is a clone).
EOF
}

say() { printf '\033[1m==> %s\033[0m\n' "$*"; }
die() {
	printf 'error: %s\n' "$*" >&2
	exit 1
}

# Claude Code lists the mods of the marketplace itself: the installed ones by
# "id", the ones not installed by "pluginId". An empty list is normal (nothing
# new to install): grep finding nothing is not an error.
ids_of() { { grep -o "\"$1\": *\"[^\"@]*@$marketplace\"" || true; } | sed 's/.*"\([^"@]*\)@.*/\1/' | sort -u; }

# Every claude call reads from /dev/null: piped from curl, the rest of this
# script is on stdin, and a command reading it would cut the run short.
main() {
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

	# Run from a clone, pull it: a folder marketplace (install.sh --local) reads
	# the code from there. Piped from curl there is no file and nothing to pull.
	# The real path, so a symlink to this script pulls the clone, not the folder
	# holding the link. A clone that cannot fast-forward is used as it is.
	local script="${BASH_SOURCE[0]:-}" repo
	if [[ -f $script ]]; then
		repo="$(cd "$(dirname "$(readlink -f "$script")")/.." && pwd)"
		if git -C "$repo" rev-parse --is-inside-work-tree >/dev/null 2>&1; then
			say "Pulling $repo"
			git -C "$repo" pull --ff-only --quiet </dev/null 2>/dev/null ||
				printf 'warning: %s did not fast-forward; updating from it as it is\n' "$repo" >&2
		fi
	fi

	say "Refreshing the $marketplace marketplace"
	claude plugin marketplace update "$marketplace" </dev/null >/dev/null ||
		die "could not refresh the $marketplace marketplace (no network, or not added: claude plugin marketplace add nahuel893/refined-claude-code)"

	local installed missing mod
	installed="$(claude plugin list --json </dev/null | ids_of id)"
	missing="$(claude plugin list --available --json </dev/null | ids_of pluginId)"
	[[ -n $installed$missing ]] || die "the $marketplace marketplace lists no mods"

	for mod in $installed; do
		say "Updating $mod"
		claude plugin update "$mod@$marketplace" </dev/null | tail -n 1 ||
			die "updating $mod failed; the mods after it were not updated"
	done
	for mod in $missing; do
		say "Installing $mod (new)"
		claude plugin install "$mod@$marketplace" </dev/null | tail -n 1 ||
			die "installing $mod failed; the mods after it were not installed"
	done

	say "Done. Restart Claude Code to load the new versions (/reload-plugins for a folder marketplace)."
}

# Called on the last line, so a download cut short runs nothing.
main "$@"
