#!/bin/sh
# Fixed, trusted secret-env launcher (architecture override §五).
#
# argv: <env_name> <guest_secret_file> -- <harness argv...>
#
# The launcher reads the read-only-projected secret source INSIDE the
# sandbox, sets exactly one target environment variable (fixed-name
# assignment; the value is never interpreted, word-split, echoed or
# placed in argv), then execs the harness.  The secret never appears in this
# process' argv, in any error message, or in any file other than the
# projected source it was read from.
[ "$#" -ge 4 ] || exit 64
env_name=$1
secret_file=$2
[ "$3" = "--" ] || exit 64
shift 3
case "$env_name" in *[!A-Za-z0-9_]*) exit 64 ;; esac
[ -r "$secret_file" ] || exit 65
value=$(cat "$secret_file") || exit 66
[ -n "$value" ] || exit 67
export "${env_name}=${value}"
exec "$@"
