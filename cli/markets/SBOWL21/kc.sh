TEAMS="KC GB NO BUF BAL TB"
CONTRACT_NAME="Kansas City Chiefs"
OUTCOME_NAMES="KC-YES KC-NO"
DETAILS="None"
CONTRACT_KEYS_PATH="../ui/src/markets/kc.json"

ICON_URLS="/markets/SUPERBOWL21/kc.png"
ICON_URLS="$ICON_URLS /markets/SUPERBOWL21/kc_no.png"


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
