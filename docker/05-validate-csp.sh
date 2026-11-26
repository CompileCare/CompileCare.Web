#!/bin/sh
set -eu

validate_origins() {
    variable_name="$1"
    origins="$2"

    if [ -z "$origins" ]; then
        echo "$variable_name must contain at least one explicit origin." >&2
        exit 1
    fi

    for origin in $origins; do
        # Accept bare HTTP(S) origins only. Paths, wildcards, quotes,
        # separators and other directives are rejected to prevent CSP
        # directive injection through container environment configuration.
        if ! printf '%s\n' "$origin" | grep -Eq '^https?://[A-Za-z0-9.-]+(:[0-9]{1,5})?$'; then
            echo "$variable_name contains an invalid origin: '$origin'. Use space-separated scheme://host[:port] values without paths or wildcards." >&2
            exit 1
        fi
    done
}

validate_origins "CSP_CONNECT_SRC" "${CSP_CONNECT_SRC:-}"
validate_origins "CSP_FRAME_SRC" "${CSP_FRAME_SRC:-}"

case "${CSP_CONNECT_SRC} ${CSP_FRAME_SRC}" in
    *http://*)
        if [ "${ALLOW_INSECURE_CSP_ORIGINS:-false}" != "true" ]; then
            echo "HTTP CSP origins are allowed only when ALLOW_INSECURE_CSP_ORIGINS=true (local development only)." >&2
            exit 1
        fi
        ;;
esac
