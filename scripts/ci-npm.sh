#!/usr/bin/env bash
# scripts/ci-npm.sh ci | install -g <package…> — the Actions mirror's ONE npm door (lane ci-npm-retry, B-fa5e, .332).
# .330's heavy 6/6 (run 39462417012) died in `npm ci` with «npm error network read ECONNRESET», exit 152 (= the socket's
# errno, −104): the registry reset a tarball MID-DOWNLOAD. npm retries a request only until its headers arrive
# (make-fetch-happen's promiseRetry around fetch(), `fetch-retries`); a body that dies after them is retried by pacote
# only on EINTEGRITY / Z_DATA_ERROR / ENOENT / EISDIR — measured on a loopback registry (lane ci-npm-retry's report): a
# reset before the headers is retried per --fetch-retries, a reset mid-body fails the first attempt even at 5. So npm's
# knobs take the request phase and this loop the rest: 3 attempts, 20 s apart, each a FRESH `npm ci` (it removes
# node_modules first; never an `npm install` fallback — the lockfile stays the law); every failed attempt is a
# ::warning:: (a blip is seen, never silent) and the step fails only after the third, with npm's own exit code.
# An INSTALL may be retried; a SUITE never (a flake is a race) — test-ci-gate §2g holds every workflow install to this
# door and no `node scripts/ci.mjs` step to any retry, and runs this file over a stub npm + sleep.
set -uo pipefail
ATTEMPTS=3 PAUSE=20
KNOBS=(--fetch-retries=5 --fetch-retry-mintimeout=2000 --fetch-retry-maxtimeout=60000)
usage() { echo "usage: ci-npm.sh ci | install -g <package…>" >&2; exit 2; }
if [ "$#" -eq 1 ] && [ "$1" = ci ]; then cmd=(npm ci "${KNOBS[@]}")
elif [ "$#" -ge 3 ] && [ "$1" = install ] && [ "$2" = -g ]; then cmd=(npm install -g "${KNOBS[@]}" "${@:3}")
else usage; fi
code=1
for ((n = 1; n <= ATTEMPTS; n++)); do
  echo "install attempt $n/$ATTEMPTS: ${cmd[*]}"
  "${cmd[@]}" && exit 0
  code=$?
  if [ "$n" -lt "$ATTEMPTS" ]; then
    echo "::warning::install attempt $n/$ATTEMPTS failed (npm exit $code) — a fresh attempt in ${PAUSE} s"
    sleep "$PAUSE"
  fi
done
echo "::error::install failed $ATTEMPTS times (npm exit $code): ${cmd[*]}"
exit "$code"
