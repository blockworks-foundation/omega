TEAMS="KC GB NO BUF BAL TB"
CONTRACT_NAME="Buffalo Bills"
OUTCOME_NAMES="BUF-YES BUF-NO"
DETAILS="None"
CONTRACT_KEYS_PATH="../ui/src/markets/buf.json"

ICON_URLS="/markets/SUPERBOWL21/buf.png"
ICON_URLS="$ICON_URLS /markets/SUPERBOWL21/buf_no.png"


cargo run -- "$CLUSTER" init-omega-contract \
--payer "$KEYPAIR" \
--omega-program-id $OMEGA_PROGRAM_ID \
--oracle $MY_ADDR \
--quote-mint $USDC \
--num-outcomes 2 \
--outcome-names $OUTCOME_NAMES \
--contract-name "$CONTRACT_NAME" \
--details "$DETAILS" \
--exp-time "2021-02-09 00:00:00" \
--auto-exp-time "2021-07-01 00:00:00" \
--contract-keys-path "$CONTRACT_KEYS_PATH" \
--icon-urls $ICON_URLS
