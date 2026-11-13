#!/usr/bin/env bash
# Install the refined-claude-code mods and what they need: git, Claude Code,
# the marketplace with every mod it lists, and better-claude's narrator with a
# speech tool. Safe to run again: every step skips what is already there.
set -euo pipefail

# The real path, so a symlink to this script (say, in ~/bin) still finds the repo.
repo="$(cd "$(dirname "$(readlink -f "${BASH_SOURCE[0]}")")/.." && pwd)"
github="nahuel893/refined-claude-code"
# Every mod the marketplace lists, from each entry's "./plugins/<mod>" source:
# a mod added to .claude-plugin/marketplace.json is installed with no edit here.
mods=()
while IFS= read -r mod; do mods+=("$mod"); done < <(
	sed -n 's|.*"source": *"\./plugins/\([^"]*\)".*|\1|p' "$repo/.claude-plugin/marketplace.json"
)
# sed failing inside < <(...) does not stop the script: check the list instead.
((${#mods[@]})) || { printf 'error: no mods found in %s\n' "$repo/.claude-plugin/marketplace.json" >&2; exit 1; }

usage() {
	cat <<'EOF'
Usage: scripts/install.sh [--local] [--no-narrator] [--piper [locale]]

Installs git and Claude Code when they are missing, then the refined-claude-code
marketplace with every mod it lists, and
better-claude's narrator with a speech tool.

  --local         add this checkout as the marketplace instead of GitHub, so
                  edits apply after /reload-plugins
  --no-narrator   skip better-claude's narrator and the speech tool
  --piper [loc]   Arch Linux only: also give the narrator a Piper voice through
                  scripts/narrator-piper-arch.sh (default locale es-ar)
EOF
}

say() { printf '\033[1m==> %s\033[0m\n' "$*"; }
die() {
	printf 'error: %s\n' "$*" >&2
	exit 1
}
has() { command -v "$1" >/dev/null 2>&1; }

local_source=false
narrator=true
piper=""
while (($#)); do
	case "$1" in
	--local) local_source=true ;;
	--no-narrator) narrator=false ;;
	--piper)
		piper="es-ar"
		if (($# > 1)) && [[ $2 != -* ]]; then
			piper="$2"
			shift
		fi
		;;
	-h | --help)
		usage
		exit 0
		;;
	*)
		usage >&2
		exit 2
		;;
	esac
	shift
done

pkg_install() {
	if has pacman; then
		sudo pacman -S --needed --noconfirm "$@"
	elif has apt-get; then
		sudo apt-get update && sudo apt-get install -y "$@"
	elif has dnf; then
		sudo dnf install -y "$@"
	elif has zypper; then
		sudo zypper install -y "$@"
	elif has brew; then
		brew install "$@"
	else
		die "install $* with your package manager, then run this again"
	fi
}

for tool in git curl; do
	if ! has "$tool"; then
		say "Installing $tool"
		pkg_install "$tool"
	fi
done

if ! has claude; then
	say "Installing Claude Code"
	curl -fsSL https://claude.ai/install.sh | bash
	export PATH="$HOME/.local/bin:$PATH"
	has claude || die "claude is not on PATH; open a new shell and run this again"
fi

if $local_source; then
	src="$repo"
else
	src="$github"
fi
say "Adding the refined-claude-code marketplace ($src)"
claude plugin marketplace add "$src"
claude plugin marketplace update refined-claude-code

for mod in "${mods[@]}"; do
	say "Installing $mod"
	claude plugin install "$mod@refined-claude-code"
done

if $narrator; then
	# The narrator speaks through spd-say or espeak-ng on Linux and say on macOS.
	if [[ $(uname -s) == Linux ]] && ! has spd-say && ! has espeak-ng; then
		say "Installing speech-dispatcher for the narrator"
		pkg_install speech-dispatcher
	fi
	say "Adding better-claude and installing its narrator"
	claude plugin marketplace add midudev/better-claude
	claude plugin install narrator@better-claude
fi

if [[ -n $piper ]]; then
	if has pacman; then
		say "Setting up the Piper voice ($piper)"
		"$repo/scripts/narrator-piper-arch.sh" "$piper"
	else
		say "Skipping Piper: scripts/narrator-piper-arch.sh needs Arch Linux"
	fi
fi

say "Done. Restart Claude Code, or run /reload-plugins in an open session."
if ! grep -qs openskin "$HOME/.claude/statusline.sh"; then
	echo "The openskin panel shows your status line once ~/.claude/statusline.sh keeps"
	echo "its input; see plugins/openskin/README.md, \"Feeding the panel from your"
	echo "status line script\"."
fi
