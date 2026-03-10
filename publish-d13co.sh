#!/usr/bin/env bash
#
# Publish @txnlab/* packages under the @d13co scope.
#
# Phase 1: Fetch npm versions, prompt for patch bumps (applied to source)
# Phase 2: Rebuild affected projects (while still @txnlab, so workspace resolves)
# Phase 3: Rewrite scope, resolve workspace refs, prompt for publish per package
# Phase 4: Restore all package.json files on exit
#
# Usage:
#   ./publish-d13co.sh [--dry-run] [--otp <code>] [--tag <tag>]
#
# Options:
#   --dry-run   Show what would be published without actually publishing
#   --otp       npm one-time password for 2FA
#   --tag       npm dist-tag (default: latest)

set -euo pipefail

ROOT="$(cd "$(dirname "$0")" && pwd)"

# ── Parse arguments ──────────────────────────────────────────────────
DRY_RUN=false
OTP=""
TAG="latest"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --dry-run)  DRY_RUN=true; shift ;;
    --otp)      OTP="$2"; shift 2 ;;
    --tag)      TAG="$2"; shift 2 ;;
    *)          echo "Unknown option: $1" >&2; exit 1 ;;
  esac
done

# ── Scope mapping ────────────────────────────────────────────────────
FROM_SCOPE="@txnlab"
TO_SCOPE="@d13co"

# All package.json files that may contain @txnlab references (names or deps)
PACKAGE_JSONS=(
  "$ROOT/projects/use-wallet/packages/use-wallet/package.json"
  "$ROOT/projects/use-wallet/packages/use-wallet-react/package.json"
  # "$ROOT/projects/use-wallet/packages/use-wallet-vue/package.json"
  # "$ROOT/projects/use-wallet/packages/use-wallet-solid/package.json"
  # "$ROOT/projects/use-wallet/packages/use-wallet-svelte/package.json"
  # use-wallet-ui packages
  "$ROOT/projects/use-wallet-ui/packages/algo-x-evm-ui/package.json"
  "$ROOT/projects/use-wallet-ui/packages/react/package.json"
)

# Publishable packages in dependency order (core first, then adapters, then UI)
PUBLISH_DIRS=(
  "$ROOT/projects/use-wallet/packages/use-wallet"
  "$ROOT/projects/use-wallet/packages/use-wallet-react"
  # "$ROOT/projects/use-wallet/packages/use-wallet-vue"
  # "$ROOT/projects/use-wallet/packages/use-wallet-solid"
  # "$ROOT/projects/use-wallet/packages/use-wallet-svelte"
  "$ROOT/projects/use-wallet-ui/packages/algo-x-evm-ui"
  "$ROOT/projects/use-wallet-ui/packages/react"
)

# Project roots that need rebuilding (deduped from PUBLISH_DIRS)
PROJECT_ROOTS=(
  "$ROOT/projects/use-wallet"
  "$ROOT/projects/use-wallet-ui"
)

# ── Helpers ──────────────────────────────────────────────────────────
backup_suffix=".publish-backup"

bump_patch() {
  local v="$1"
  local major minor patch
  IFS='.' read -r major minor patch <<< "$v"
  echo "${major}.${minor}.$((patch + 1))"
}

set_version() {
  local file="$1" new_version="$2"
  sed -i "s|\"version\": *\"[^\"]*\"|\"version\": \"${new_version}\"|" "$file"
}

backup_files() {
  for f in "${PACKAGE_JSONS[@]}"; do
    cp "$f" "${f}${backup_suffix}"
  done
}

restore_files() {
  for f in "${PACKAGE_JSONS[@]}"; do
    if [[ -f "${f}${backup_suffix}" ]]; then
      mv "${f}${backup_suffix}" "$f"
    fi
  done
}

# Only rewrite these specific @txnlab package names to @d13co.
# Other @txnlab deps (e.g. @txnlab/utils-ts) are left untouched.
REWRITE_NAMES=(
  use-wallet
  use-wallet-react
  # use-wallet-vue
  # use-wallet-solid
  # use-wallet-svelte
  use-wallet-ui-react
  use-wallet-ui-monorepo
  use-wallet-ui-e2e
  use-wallet-ui-react-example
  use-wallet-ui-react-css-only-example
  use-wallet-ui-react-custom-example
)

rewrite_scope() {
  for f in "${PACKAGE_JSONS[@]}"; do
    for pkg in "${REWRITE_NAMES[@]}"; do
      sed -i "s|${FROM_SCOPE}/${pkg}|${TO_SCOPE}/${pkg}|g" "$f"
    done
  done
}

resolve_workspace_refs() {
  for f in "${PACKAGE_JSONS[@]}"; do
    local matches
    matches=$(grep -oP '"@d13co/[^"]+": *"workspace:\*"' "$f" 2>/dev/null || true)
    [[ -z "$matches" ]] && continue

    while read -r match; do
      dep_name=$(echo "$match" | grep -oP '"@d13co/[^"]+' | tr -d '"')
      original_name="${dep_name/@d13co\//@txnlab\/}"
      for pf in "${PACKAGE_JSONS[@]}"; do
        pf_name=$(grep -m1 '"name"' "$pf" | sed 's/.*"name": *"//;s/".*//')
        if [[ "$pf_name" == "$dep_name" || "$pf_name" == "$original_name" ]]; then
          dep_version=$(grep -m1 '"version"' "$pf" | sed 's/.*"version": *"//;s/".*//')
          echo "    ${dep_name}: workspace:* → ^${dep_version}"
          sed -i "s|\"${dep_name}\": *\"workspace:\\*\"|\"${dep_name}\": \"^${dep_version}\"|" "$f"
          break
        fi
      done
    done <<< "$matches"
  done
}

# ── Phase 1: Version bumps ───────────────────────────────────────────
echo "==> Phase 1: Check versions"
echo ""

# Track which packages were bumped and which projects need rebuilding
declare -A BUMPED          # dir → new_version (only if bumped)
NEEDS_REBUILD=()           # project roots that need rebuilding

for dir in "${PUBLISH_DIRS[@]}"; do
  pkg="$dir/package.json"
  # Read the @d13co name this will become
  local_name=$(grep -m1 '"name"' "$pkg" | sed 's/.*"name": *"//;s/".*//')
  d13co_name="${local_name/@txnlab\//@d13co\/}"
  version=$(grep -m1 '"version"' "$pkg" | sed 's/.*"version": *"//;s/".*//')

  published=$(npm view "$d13co_name" version 2>/dev/null || echo "none")
  if [[ "$published" == "none" ]]; then
    echo "  ${d13co_name}  local: ${version}  npm: (not published)"
    echo -n "  [b] bump patch  [n] keep ${version}: "
  else
    bumped=$(bump_patch "$published")
    echo "  ${d13co_name}  local: ${version}  npm: ${published}  bump: ${bumped}"
    echo -n "  [b] bump to ${bumped}  [n] keep ${version}: "
  fi

  read -r answer
  case "$answer" in
    b|B)
      if [[ "$published" == "none" ]]; then
        new_ver=$(bump_patch "$version")
      else
        new_ver="$bumped"
      fi
      set_version "$pkg" "$new_ver"
      BUMPED["$dir"]="$new_ver"
      echo "    → ${new_ver}"
      ;;
    *)
      echo "    kept ${version}"
      ;;
  esac
  echo ""
done

# ── Phase 2: Rebuild ─────────────────────────────────────────────────
# Figure out which project roots had bumps
for dir in "${!BUMPED[@]}"; do
  for root in "${PROJECT_ROOTS[@]}"; do
    if [[ "$dir" == "$root"/* ]]; then
      # Add to NEEDS_REBUILD if not already there
      already=false
      for r in "${NEEDS_REBUILD[@]+"${NEEDS_REBUILD[@]}"}"; do
        [[ "$r" == "$root" ]] && already=true
      done
      $already || NEEDS_REBUILD+=("$root")
    fi
  done
done

if [[ ${#NEEDS_REBUILD[@]} -gt 0 ]]; then
  echo "==> Phase 2: Rebuilding"
  for root in "${NEEDS_REBUILD[@]}"; do
    echo "    Building $(basename "$root")..."
    (cd "$root" && pnpm build:packages 2>/dev/null || pnpm build)
  done
  echo ""
else
  echo "==> Phase 2: No bumps, skipping rebuild"
  echo ""
fi

# ── Phase 3: Scope rewrite & publish ─────────────────────────────────
# Back up AFTER bumps + rebuild so version bumps are retained on restore
echo "==> Phase 3: Preparing for publish"

echo "    Backing up package.json files"
backup_files
trap restore_files EXIT

echo "    Rewriting ${FROM_SCOPE} → ${TO_SCOPE}"
rewrite_scope

echo "    Resolving workspace:* references"
resolve_workspace_refs

echo ""
echo "==> Rewritten package names:"
for f in "${PACKAGE_JSONS[@]}"; do
  name=$(grep -m1 '"name"' "$f" | sed 's/.*"name": *"//;s/".*//')
  echo "    $name"
done
echo ""

# Build publish args
PUBLISH_ARGS=(--access public --tag "$TAG" --no-git-checks)
if [[ -n "$OTP" ]]; then
  PUBLISH_ARGS+=(--otp "$OTP")
fi

if $DRY_RUN; then
  echo "==> DRY RUN — would publish:"
  for dir in "${PUBLISH_DIRS[@]}"; do
    name=$(grep -m1 '"name"' "$dir/package.json" | sed 's/.*"name": *"//;s/".*//')
    version=$(grep -m1 '"version"' "$dir/package.json" | sed 's/.*"version": *"//;s/".*//')
    echo "    ${name}@${version}"
  done
  echo ""
  echo "    pnpm publish ${PUBLISH_ARGS[*]}"
else
  for dir in "${PUBLISH_DIRS[@]}"; do
    name=$(grep -m1 '"name"' "$dir/package.json" | sed 's/.*"name": *"//;s/".*//')
    version=$(grep -m1 '"version"' "$dir/package.json" | sed 's/.*"version": *"//;s/".*//')

    echo -n "  Publish ${name}@${version}? [y/N/q] "
    read -r answer
    case "$answer" in
      y|Y)
        echo "==> Publishing ${name}@${version}"
        (cd "$dir" && pnpm publish "${PUBLISH_ARGS[@]}")
        echo ""
        ;;
      q|Q)
        echo "==> Aborting"
        exit 0
        ;;
      *)
        echo "    Skipped"
        ;;
    esac
  done
fi

echo "==> Restoring original package.json files"
# trap handles restore
