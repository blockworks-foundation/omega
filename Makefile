
all: cli/contract_keys.json
	echo "all done"

.PHONY: clean
clean:
	rm -rf .env

keypair = ~/.config/solana/id.json

.env/keypair:
	mkdir -p .env
	solana config set --url http://arka.fm:8899
	solana-keygen new --force --no-passphrase
	solana airdrop 1000
	touch $@

.env/program_id: .env/keypair program/Cargo* program/src/*
	-rm -f $@ # remove outdated program_id to detect if solana deploy failed
	cd program && cargo build-bpf
	solana deploy program/target/deploy/omega.so | jq .programId -r >$@
	test -f $@ # verify program was successfully deployed

.env/quote_mint: .env/keypair
	spl-token create-token | head -n 1 | cut -d' ' -f3 >$@
	spl-token create-account `cat $@` | head -n 1 | cut -d' ' -f3 >.env/quote_account
	spl-token mint `cat $@` 1000000
	# send minted tokens to dev wallets
	solana airdrop 1000 3rnRtxMkaPDeoYwdVLZPzRnGoD8z4zfk25pLiERVbBWY
	spl-token transfer --fund-recipient `cat .env/quote_account` 300000 3rnRtxMkaPDeoYwdVLZPzRnGoD8z4zfk25pLiERVbBWY
	solana airdrop 1000 FJpmfVUmd75kVieMjBLixdk5611xvXVUNadhcSbhE4Hm
	spl-token transfer --fund-recipient `cat .env/quote_account` 300000 FJpmfVUmd75kVieMjBLixdk5611xvXVUNadhcSbhE4Hm

cli/contract_keys.json: .env/program_id .env/quote_mint cli/Cargo* cli/src/*
	cd cli && cargo run init-omega-contract \
		--payer $(keypair) \
		--omega-program-id `cat ../.env/program_id` \
		--oracle `solana address` \
		--quote-mint `cat ../.env/quote_mint` \
		--num-outcomes 2 \
		--outcome-names YES NO \
		--contract-name "TRUMPFEB" \
		--details "Resolution: Donald Trump is the President of the United States at 2021-02-01 00:00:00 UTC. Each YES token will be redeemable for 1 USDC if the resolution is true and 0 otherwise. Similarly, each NO token will be redeemable for 1 USDC if the resolution is false. The oracle will resolve this contract before 2021-02-08 00:00:00 UTC in the same way as the TRUMPFEB token at ftx.com." \
		--exp-time "2020-02-01 00:00:00" \
		--contract-keys-path "../ui/src/contract_keys.json"


