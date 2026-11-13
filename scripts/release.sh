#!/usr/bin/env bash
# Local, owner-operated npm release. No credentials or build artifacts are stored in the checkout.
set -euo pipefail
cd -- "$(dirname -- "$0")/.."
version="${1:-}"
mode="${2:---dry-run}"
[[ "$version" =~ ^[0-9]+\.[0-9]+\.[0-9]+(-[0-9A-Za-z.-]+)?$ ]] && [[ "$mode" = --dry-run || "$mode" = --local ]] || {
  echo 'usage: scripts/release.sh <version> [--dry-run | --local]' >&2; exit 2;
}
name=$(node -p 'require("./package.json").name')
current=$(node -p 'require("./package.json").version')
[[ "$name" = @herenfor/dsh-tune && "$current" = "$version" ]] || { echo 'Set package.json name/version before releasing.' >&2; exit 1; }
tag="v$version"
npm_tag=latest; [[ "$version" != *-* ]] || npm_tag=next
if [[ "$mode" = --local ]]; then
  [[ $(git branch --show-current) = main && -z $(git status --porcelain) ]] || { echo 'Release from a clean main checkout; commit and push first.' >&2; exit 1; }
  git fetch origin main --tags
  [[ $(git rev-parse HEAD) = $(git rev-parse origin/main) ]] || { echo 'Push/pull main before releasing.' >&2; exit 1; }
  if git rev-parse -q --verify "refs/tags/$tag" >/dev/null; then
    [[ $(git rev-list -n1 "$tag") = $(git rev-parse HEAD) ]] || { echo "$tag belongs to another commit" >&2; exit 1; }
  fi
fi
npm test
npm run check:package
release_tmp=$(mktemp -d)
trap 'rm -rf -- "$release_tmp"' EXIT
npm pack --json --pack-destination "$release_tmp" > "$release_tmp/pack.json"
filename=$(node -p 'require(process.argv[1])[0].filename' "$release_tmp/pack.json")
integrity=$(node -p 'require(process.argv[1])[0].integrity' "$release_tmp/pack.json")
registry_url="https://registry.npmjs.org/@herenfor%2fdsh-tune/$version"
registry_status() { curl --connect-timeout 10 --max-time 30 -sS -o "$release_tmp/registry.json" -w '%{http_code}' "$registry_url"; }
verify_integrity() {
  node -e 'const r=require(process.argv[1]); if(r.dist?.integrity!==process.argv[2]) { console.error("Published version differs from this checkout; never retag it."); process.exit(1) }' "$release_tmp/registry.json" "$integrity"
}
status=$(registry_status)
case "$status" in
  200) verify_integrity; echo "$name@$version is already published with matching integrity." ;;
  404) ;;
  *) echo "Registry check failed: HTTP $status" >&2; exit 1 ;;
esac
if [[ "$mode" = --dry-run ]]; then
  echo "Ready: $name@$version ($npm_tag), package and offline install verified; nothing published, committed or tagged."
  exit 0
fi
if [[ "$status" = 404 ]]; then
  npm whoami
  npm publish "$release_tmp/$filename" --access public --tag "$npm_tag"
  # The registry may take time to expose the newly published version.
  for _ in $(seq 1 60); do
    status=$(registry_status)
    [[ "$status" != 200 ]] || break
    sleep 5
  done
  [[ "$status" = 200 ]] || { echo 'Version not visible yet. Retry the same command later to finish tagging.' >&2; exit 1; }
  verify_integrity
fi
if ! git rev-parse -q --verify "refs/tags/$tag" >/dev/null; then git tag -a "$tag" -m "$name $version"; fi
git push origin main "refs/tags/$tag"
echo "Released $name@$version; update installed copies from the plugin page when idle."
