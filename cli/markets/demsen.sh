CONTRACT_NAME=DEMSEN
OUTCOME_NAMES="YES NO"
DETAILS="Resolution: The number of U.S. senators who were elected with a ballot-listed or otherwise identifiable affiliation with, or who have publicly stated an intention to caucus with the Democratic party shall be greater than or equal to 50 if the Vice President is affiliated with the Democratic party or greater than 50 otherwise. The YES tokens can be redeemed for 1 USDC if the resolution is true at 2021-02-01 00:00:00 UTC and the NO tokens can be redeemed for 1 USDC otherwise. This contract will be resolved in the same way as the similar Democratic contract on PredictIt at this URL: https://www.predictit.org/markets/detail/4366"
CONTRACT_KEYS_PATH="../ui/src/contract_keys.json"

ICON_URLS="https://az620379.vo.msecnd.net/images/Contracts/small_29b55b5a-6faf-4041-8b21-ab27421d0ade.png https://az620379.vo.msecnd.net/images/Contracts/small_77aea45d-8c93-46d6-b338-43a6af0ba8e1.png"
cargo run -- $CLUSTER init-omega-contract --payer $KEYPAIR --omega-program-id $OMEGA_PROGRAM_ID --oracle $MY_ADDR \
    --quote-mint $USDC --num-outcomes 2 --outcome-names $OUTCOME_NAMES --contract-name $CONTRACT_NAME \
    --details "$DETAILS" --exp-time "2021-02-01 00:00:00" --contract-keys-path $CONTRACT_KEYS_PATH --icon-urls $ICON_URLS
