CONTRACT_NAME="SUPERBOWL21"
OUTCOME_NAMES="KC TB"
DETAILS="None"
CONTRACT_KEYS_PATHS="../ui/src/markets/kc.json"
CONTRACT_KEYS_PATHS="$CONTRACT_KEYS_PATHS ../ui/src/contract_keys.json"
ICON_URLS="/markets/SUPERBOWL21/kc.png"
ICON_URLS="$ICON_URLS /markets/SUPERBOWL21/tb.png"


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
--contract-keys-paths $CONTRACT_KEYS_PATHS \
--icon-urls $ICON_URLS
