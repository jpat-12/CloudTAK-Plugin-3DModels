#!/usr/bin/env bash
#
# install.sh — add this plugin to a CloudTAK deployment and rebuild it.
#
# This is a web-only plugin, and this repo's root IS the plugin folder (index.ts at the top),
# so CloudTAK's own WEB_PLUGINS mechanism can install it directly. What this script does
# depends on the CloudTAK checkout:
#
#   Current CloudTAK (app/plugin.ts exists)
#       Adds this repo's git URL (and any --pack model pack URLs) to WEB_PLUGINS in
#       <CloudTAK>/.env, then rebuilds. The image build clones each repo into app/plugins/ and
#       copies its public/ (models.json and the GLBs) into the web app. Copying files into app/plugins/ by hand does NOT work there: CloudTAK's
#       .dockerignore leaves plugin folders out of the image build.
#       Because the build clones from git, push your changes (and the GLBs) first.
#
#   Older CloudTAK (api/web/plugin.ts exists)
#       Copies the plugin into api/web/plugins/3d-models/, and each --pack folder's
#       public/plugin-3d-models/ into api/web/public/, then rebuilds.
#
# Usage:
#   Install:  ./install.sh [/path/to/CloudTAK]
#   Update:   ./install.sh --pull [/path/to/CloudTAK]   (git pull this repo, then reinstall + rebuild)
#   Remove:   ./install.sh --remove [/path/to/CloudTAK]
#
# Options:
#   /path/to/CloudTAK   Your CloudTAK checkout (the dir containing docker-compose.yml). Default: ~/CloudTAK
#   --pull              git pull this plugin repo first (latest version).
#   --no-build          Change files only; skip the docker rebuild + restart.
#   --remove            Uninstall, then rebuild.
#   --url URL           Git URL for WEB_PLUGINS (default: this checkout's origin remote).
#                       Append #<branch|tag|sha> to pin a version.
#   --pack PACK         Your organization's model pack (see examples/model-pack/). A git URL
#                       on current CloudTAK, a local folder on the older layout. Repeatable.
#                       With --remove, removes that pack too.
#
# Requires: bash; git; and (unless --no-build) docker + docker compose.

set -euo pipefail

INSTALL_DIR_NAME="3d-models"
PUBLIC_DIR_NAME="plugin-3d-models"
DEFAULT_URL="https://github.com/jpat-12/CloudTAK-Plugin-3DModels.git"

REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

usage() { sed -n '/^# Usage:/,/^# Requires:/p' "${BASH_SOURCE[0]}" | sed 's/^# \{0,1\}//'; }

# --- parse args --------------------------------------------------------------------
CT_DIR=""; DO_BUILD=1; DO_PULL=0; ACTION="install"; PLUGIN_URL=""; PACKS=()
while [ $# -gt 0 ]; do
    case "$1" in
        --pull)     DO_PULL=1 ;;
        --no-build) DO_BUILD=0 ;;
        --remove)   ACTION="remove" ;;
        --url)      shift; PLUGIN_URL="${1:?--url needs a value}" ;;
        --pack)     shift; PACKS+=("${1:?--pack needs a value}") ;;
        -h|--help)  usage; exit 0 ;;
        -*)         echo "Unknown option: $1" >&2; echo >&2; usage >&2; exit 2 ;;
        *)          CT_DIR="$1" ;;
    esac
    shift
done
CT_DIR="${CT_DIR:-$HOME/CloudTAK}"

[ -d "$CT_DIR" ] || { echo "ERROR: CloudTAK dir not found: $CT_DIR" >&2; exit 1; }
if [ "$DO_BUILD" -eq 1 ] && [ ! -f "$CT_DIR/docker-compose.yml" ]; then
    echo "ERROR: no docker-compose.yml in $CT_DIR — re-run with --no-build to change files only." >&2; exit 1
fi

if [ -f "$CT_DIR/app/plugin.ts" ]; then
    LAYOUT="app"
elif [ -f "$CT_DIR/api/web/plugin.ts" ]; then
    LAYOUT="legacy"
else
    echo "ERROR: $CT_DIR is not a CloudTAK checkout (no app/plugin.ts or api/web/plugin.ts)." >&2; exit 1
fi

echo "CloudTAK:  $CT_DIR ($LAYOUT layout)"
echo "Plugin:    $REPO_DIR"
echo "Action:    $ACTION"
echo

if [ "$DO_PULL" -eq 1 ]; then
    [ -d "$REPO_DIR/.git" ] || { echo "ERROR: --pull given but $REPO_DIR is not a git checkout." >&2; exit 1; }
    echo "Pulling latest plugin source..."; git -C "$REPO_DIR" pull; echo
fi

if [ "$ACTION" = "install" ] && [ "${#PACKS[@]}" -eq 0 ] && [ ! -f "$REPO_DIR/public/$PUBLIC_DIR_NAME/models.json" ]; then
    echo "NOTE: no model pack given (--pack) and no public/$PUBLIC_DIR_NAME/models.json here."
    echo "      Users can still open .glb files from their own device; to share models with"
    echo "      everyone, publish a model pack (see examples/model-pack/README.md)."
    echo
fi

# --- current layout: WEB_PLUGINS in .env --------------------------------------------
if [ "$LAYOUT" = "app" ]; then
    if [ -z "$PLUGIN_URL" ]; then
        PLUGIN_URL="$(git -C "$REPO_DIR" remote get-url origin 2>/dev/null || true)"
        PLUGIN_URL="${PLUGIN_URL:-$DEFAULT_URL}"
    fi
    ENV_FILE="$CT_DIR/.env"
    touch "$ENV_FILE"
    current="$(grep -E '^WEB_PLUGINS=' "$ENV_FILE" | tail -n1 | cut -d= -f2- | tr -d '"' || true)"

    # Drop any existing entry for this repo (any URL form / pinned rev / letter case), then add ours.
    lower() { tr '[:upper:]' '[:lower:]'; }
    ours=("$(basename "${PLUGIN_URL%%#*}" .git | lower)")
    for pack in "${PACKS[@]:-}"; do
        [ -n "$pack" ] && ours+=("$(basename "${pack%%#*}" .git | lower)")
    done
    kept=""
    IFS=',' read -r -a entries <<< "$current"
    for e in "${entries[@]:-}"; do
        e="$(echo "$e" | xargs)"
        [ -z "$e" ] && continue
        base="$(basename "${e%%#*}" .git | lower)"
        skip=0
        for o in "${ours[@]}"; do [ "$base" = "$o" ] && skip=1; done
        [ "$skip" -eq 1 ] && continue
        kept="${kept:+$kept,}$e"
    done
    new="$kept"
    if [ "$ACTION" = "install" ]; then
        new="${new:+$new,}$PLUGIN_URL"
        for pack in "${PACKS[@]:-}"; do
            [ -n "$pack" ] && new="$new,$pack"
        done
    fi

    cp "$ENV_FILE" "$ENV_FILE.bak"
    grep -vE '^WEB_PLUGINS=' "$ENV_FILE.bak" > "$ENV_FILE" || true
    [ -n "$new" ] && echo "WEB_PLUGINS=$new" >> "$ENV_FILE"
    echo "Updated $ENV_FILE (backup: .env.bak)"
    echo "    WEB_PLUGINS=${new:-<empty>}"
    if [ "$ACTION" = "install" ]; then
        echo "    The image build clones these repos — push your commits (and the GLBs) first."
    fi

# --- older layout: copy files ------------------------------------------------------
else
    WEB_DEST="$CT_DIR/api/web/plugins/$INSTALL_DIR_NAME"
    PUBLIC_DEST="$CT_DIR/api/web/public/$PUBLIC_DIR_NAME"
    if [ "$ACTION" = "remove" ]; then
        rm -rf "$WEB_DEST" "$PUBLIC_DEST"
        echo "Removed api/web/plugins/$INSTALL_DIR_NAME and api/web/public/$PUBLIC_DIR_NAME"
    else
        rm -rf "$WEB_DEST"; mkdir -p "$WEB_DEST"
        cp -R "$REPO_DIR/index.ts" "$REPO_DIR/components" "$REPO_DIR/lib" "$REPO_DIR/vendor" "$WEB_DEST/"
        echo "Installed web plugin: api/web/plugins/$INSTALL_DIR_NAME"
        rm -rf "$PUBLIC_DEST"; mkdir -p "$PUBLIC_DEST"
        sources=()
        [ -d "$REPO_DIR/public/$PUBLIC_DIR_NAME" ] && sources+=("$REPO_DIR")
        for pack in "${PACKS[@]:-}"; do
            [ -z "$pack" ] && continue
            [ -d "$pack/public/$PUBLIC_DIR_NAME" ] || { echo "ERROR: --pack $pack has no public/$PUBLIC_DIR_NAME/ folder (on this CloudTAK layout, give a local folder)." >&2; exit 1; }
            sources+=("$pack")
        done
        for src in "${sources[@]:-}"; do
            [ -z "$src" ] && continue
            cp -R "$src/public/$PUBLIC_DIR_NAME/." "$PUBLIC_DEST/"
            echo "Installed model files from $src"
        done
        rm -f "$PUBLIC_DEST/.gitkeep"
    fi
fi
echo

# --- rebuild -----------------------------------------------------------------------
if [ "$DO_BUILD" -eq 0 ]; then
    echo "Skipped rebuild (--no-build). To apply, run in $CT_DIR:"
    echo "    docker compose build --no-cache api && docker compose up -d --force-recreate api"
    exit 0
fi

echo "Rebuilding CloudTAK API image — this takes 5-15 minutes..."
( cd "$CT_DIR" && docker compose build --no-cache api )
echo "Restarting CloudTAK API container..."
( cd "$CT_DIR" && docker compose up -d --force-recreate api )

echo
if [ "$ACTION" = "remove" ]; then
    echo "✓ Plugin removed."
else
    echo "✓ Plugin installed."
    echo "  → In CloudTAK: Settings → Refresh App to activate the new service worker."
    echo "    (A hard refresh does NOT work — the service worker intercepts requests.)"
    echo "    Then open the menu → 3D Models."
fi
