# Omega - decentralized predictions protocol

## ⚠️ Warning

Any content produced by Blockworks, or developer resources that Blockworks provides, are for educational and inspiration purposes only. Blockworks does not encourage, induce or sanction the deployment of any such applications in violation of applicable laws or regulations.

## Contribute
Significant contributions to the source code may be compensated with a grant from the Blockworks Foundation.

## To Do
* UI performance (minor)
    * No button or page-loading should take more than 1 second.
    * e.g. issue set button in RedeemView takes more than 10 seconds because it is calling fetchAccounts fresh. That
      should be done once and used for all pages. 
* List the YES and NO tokens on serum dex and provide liquidity (major)
    * Add the market for YES and NO tokens on serum-dex
    * Make a PR in the serum-dex-ui repo to include DEMSENYES and DEMSENNO tokens
    * Make a bot to quote on serum dex based on the prices in FTX DEMSEN tokens
    * Bonus: getting listed on Bonfida will automatically give us TradingView
* Make a button to easily provide liquidity in one step (minor)
    * Remove liquidity tab in the pools
    * Add a section below "Provide Liquidity" with a input box for the user to input how much USDC he wants to provide
    * Use half of the USDC to issue set.
    * Provide liquidity to each pool using all the newly issued tokens + the value of those tokens in USDC
* Make a button to correct mispricing (minor)
    * Create button "Correct Mispricing"
    * If YES price + NO price > 1 + fees, the button should become enabled
    * When button is pressed, the UI should inform trader how much USDC in profit he will make if he confirms the trade
    * Once confirmed, issue set using enough USDC to correct mispricing -> sell all new tokens into both pools
    * Have similar button for when pYes + pNo + fees < 1 (buy from both pools and redeem set)
* Show current position and profits (minor? to show profits need to know entry price)
  * Get entry price for the user using historical blockchain state
  * Take average price of all purchases and subtract that from current price to show profit
  * Display this in a panel in top right
* Move Redeem page contents to Exchange page (minor)
  * Move the Redeem Winner, Reedeem Set and Issue Set buttons to be below the pools in ExchangeView
* Hook up a USDC on ramp (e.g. Transak) (major)
  * Contact Transak to get the ERC20 USDC on ramp
  * Integrate this into the Exchange page
  * Write tool to automatically convert the ERC20 USDC into SPL USDC using sollet.io

### setup testing
```
# Get solana tools
VERSION=v1.4.22
sh -c "$(curl -sSfL https://release.solana.com/$VERSION/install)"
git clone https://github.com/solana-labs/solana.git
cd solana
git pull
git checkout $VERSION
cargo install spl-token-cli
sudo apt install -y libssl-dev libudev-dev zlib1g-dev llvm clang

# Run solana local cluster in its own terminal
cd ~/solana
rm -rf config
NDEBUG=1 ./run.sh

# switch terminal, set up testing
CLUSTER=localnet
CLUSTER_URL="http://localhost:8899"
solana config set --url $CLUSTER_URL
solana-keygen new

cd ~/omega/program
cargo build-bpf

OMEGA_PROGRAM_ID="$(solana deploy target/deploy/omega.so | jq .programId -r)"
cd ../cli
KEYPAIR=~/.config/solana/id.json
MY_ADDR="$(solana address)"
QUOTE_MINT="$(spl-token create-token | head -n 1 | cut -d' ' -f3)"
USER_QUOTE_WALLET="$(spl-token create-account $QUOTE_MINT | head -n 1 | cut -d' ' -f3)"
spl-token mint $QUOTE_MINT 100 $USER_QUOTE_WALLET
CONTRACT_NAME=TRUMPFEB
OUTCOME_NAMES="YES NO"
DETAILS="Resolution: Donald Trump is the President of the United States at 2021-02-01 00:00:00 UTC. Each YES token will be redeemable for 1 USDC if the resolution is true and 0 otherwise. Similarly, each NO token will be redeemable for 1 USDC if the resolution is false. The oracle will resolve this contract before 2021-02-08 00:00:00 UTC in the same way as the TRUMPFEB token at ftx.com."
CONTRACT_KEYS_PATH="../ui/src/contract_keys.json"
cargo run -- $CLUSTER init-omega-contract --payer $KEYPAIR --omega-program-id $OMEGA_PROGRAM_ID --oracle $MY_ADDR \
    --quote-mint $QUOTE_MINT --num-outcomes 2 --outcome-names $OUTCOME_NAMES --contract-name $CONTRACT_NAME \
    --details "$DETAILS" --exp-time "2021-02-01 00:00:00" --contract-keys-path $CONTRACT_KEYS_PATH

```

### use sollet mnemonic
```
MNEMONIC="word0 word1 word2"
PASSPHRASE="pass"
cargo run sollet-to-local --keypair-path ~/.config/solana/id.json --sollet-mnemonic $MNEMONIC --passphrase $PASSPHRASE
```

### resolve
```
WINNER=NO
cargo run resolve --oracle-keypair $KEYPAIR --payer $KEYPAIR --winner $WINNER --contract-keys-path $CONTRACT_KEYS_PATH
```
