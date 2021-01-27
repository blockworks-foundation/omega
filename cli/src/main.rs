use std::{thread, time};
use std::fs::File;
use std::mem::size_of;
use std::str::FromStr;

use anyhow::Result;
use chrono::NaiveDateTime;
use clap::Clap;
use client::utils::{Cluster, create_account_instr, create_and_init_mint_instr,
                    create_signer_key_and_nonce, create_token_account_instr, get_account,
                    mnemonic_to_keypair, read_keypair_file, send_instructions};
use omega::instruction::{init_omega_contract, resolve};
use omega::state::{DETAILS_BUFFER_LEN, OmegaContract};
use serde_json::{json, Value};
use solana_client::rpc_client::RpcClient;
use solana_sdk::commitment_config::CommitmentConfig;
use solana_sdk::pubkey::Pubkey;
use solana_sdk::signature::{Keypair, Signer, write_keypair_file};
use spl_token::state::Mint;

#[derive(Clap, Debug)]
pub struct Opts {
    #[clap(default_value = "devnet")]
    pub cluster: Cluster,
    #[clap(subcommand)]
    pub command: Command,
}

#[derive(Clap, Debug)]
pub enum Command {
    InitOmegaContract {
        #[clap(long, short)]
        payer: String,
        #[clap(long)]
        omega_program_id: String,
        #[clap(long)]
        oracle: String,
        #[clap(long, short)]
        quote_mint: String,
        #[clap(long, short)]
        num_outcomes: usize,
        #[clap(long, short)]
        contract_keys_paths: Vec<String>,
        #[clap(long)]
        contract_name: String,
        #[clap(long)]
        outcome_names: Vec<String>,
        #[clap(long)]
        details: String,
        #[clap(long)]
        exp_time: String,
        #[clap(long)]
        auto_exp_time: String,
        #[clap(long)]
        icon_urls: Option<Vec<String>>
    },
    IssueSet {
        #[clap(long, short, default_value="~/.config/solana/id.json")]
        payer: String,
        #[clap(long, short)]
        contract_keys_path: String,
        #[clap(long, short)]
        user: Option<String>
    },
    Resolve {
        #[clap(long, short)]
        payer: String,
        #[clap(long, short)]
        contract_keys_path: String,
        #[clap(long, short)]
        oracle_keypair: String,
        #[clap(long, short)]
        winner: String,
    },

    SolletToLocal {
        #[clap(long, short, default_value="~/.config/solana/sollet.json")]
        keypair_path: String,
        #[clap(long, short)]
        sollet_mnemonic: Vec<String>,
        #[clap(long, short)]
        passphrase: Option<String>,
    },
    CreateSwapPools {
        #[clap(long, short)]
        payer: String,
        #[clap(long, short)]
        contract_keys_path: String,
        #[clap(long, short)]
        swap_program_id: String
    },

    PrintBs58 {
        #[clap(long, short)]
        keypair: String,
        #[clap(long, short)]
        filepath: Option<String>,
    },

}

impl Opts {
    fn client(&self) -> RpcClient {
        RpcClient::new_with_commitment(self.cluster.url().to_string(), CommitmentConfig::single_gossip())
    }
}

#[allow(unused_variables)]
pub fn start(opts: Opts) -> Result<()> {
    let client = opts.client();

    match opts.command {
        Command::InitOmegaContract {
            payer,
            omega_program_id,
            oracle,
            quote_mint,
            num_outcomes,
            contract_keys_paths,
            contract_name,
            outcome_names,
            details,
            exp_time,
            auto_exp_time,
            icon_urls
        } => {
            println!("InitOmegaContract");
            assert_eq!(num_outcomes, outcome_names.len());
            assert!(details.len() <= DETAILS_BUFFER_LEN);

            let icon_urls: Vec<String> = match icon_urls {
                None => { vec![
                    String::from("https://ftx.com/static/media/trumphappy.055aa6c3.svg"),
                    String::from("https://ftx.com/static/media/trumpsad.5f8806cd.svg")
                ] }
                Some(v) => v
            };
            assert_eq!(icon_urls.len(), num_outcomes);
            let payer = read_keypair_file(payer.as_str())?;
            let omega_program_id = Pubkey::from_str(omega_program_id.as_str())?;
            let oracle_pk = Pubkey::from_str(oracle.as_str())?;
            let quote_mint_pk = Pubkey::from_str(quote_mint.as_str())?;
            let mut instructions = vec![];
            let mut signers = vec![];

            let omega_contract_kp = Keypair::new();
            let omega_contract_pk = omega_contract_kp.pubkey();
            instructions.push(create_account_instr(
                &client, &payer, &omega_contract_kp,
                size_of::<OmegaContract>(), &omega_program_id
            )?);
            signers.push(&payer);
            signers.push(&omega_contract_kp);

            let (signer_key, signer_nonce) = create_signer_key_and_nonce(&omega_program_id, &omega_contract_pk);

            let quote_vault_kp = Keypair::new();
            let quote_vault_pk = quote_vault_kp.pubkey();
            create_token_account_instr(
                &client,
                &quote_vault_kp,
                &quote_mint_pk,
                &signer_key,
                &payer,
                &mut instructions,
                &mut signers
            )?;

            let quote_mint: Mint = get_account(&client, &quote_mint_pk)?;
            let mut outcome_infos = Vec::<Value>::new();
            let mut outcome_mint_pks = vec![];
            let mut outcome_mint_kps = vec![];
            for i in 0..num_outcomes {
                outcome_mint_kps.push(Keypair::new());
            }
            for i in 0..num_outcomes {
                let outcome_mint_kp = &outcome_mint_kps[i];
                create_and_init_mint_instr(
                    &client,
                    outcome_mint_kp,
                    &payer,
                    &signer_key,
                    quote_mint.decimals,
                    &mut instructions,
                    &mut signers
                )?;

                let outcome_json = json!(
                    {
                        "mint_pk": outcome_mint_kp.pubkey().to_string(),
                        "name": outcome_names[i],
                        "icon": icon_urls[i].clone()
                    }
                );
                outcome_infos.push(outcome_json);
                outcome_mint_pks.push(outcome_mint_kp.pubkey());
            }

            // send first transaction because otherwise it's too big
            println!("Sending account creation instructions");
            send_instructions(&client, instructions, signers, &payer.pubkey())?;

            let exp_time = NaiveDateTime::parse_from_str(exp_time.as_str(), "%Y-%m-%d %H:%M:%S")?;
            let exp_time = exp_time.timestamp() as u64;
            let auto_exp_time = NaiveDateTime::parse_from_str(auto_exp_time.as_str(), "%Y-%m-%d %H:%M:%S")?;
            let auto_exp_time = auto_exp_time.timestamp() as u64;

            let instruction = init_omega_contract(
                &omega_program_id,
                &omega_contract_pk,
                &oracle_pk,
                &quote_mint_pk,
                &quote_vault_pk,
                &signer_key,
                outcome_mint_pks.as_slice(),
                exp_time,
                auto_exp_time,
                signer_nonce,
                details.as_str()
            )?;

            let instructions = vec![instruction];
            let signers = vec![&payer];
            thread::sleep(time::Duration::from_secs(5));
            println!("Sending InitOmegaContract instruction");
            send_instructions(&client, instructions, signers, &payer.pubkey())?;

            let contract_keys = json!({
                "contract_name": contract_name,
                "omega_program_id": omega_program_id.to_string(),
                "omega_contract_pk": omega_contract_pk.to_string(),
                "oracle_pk": oracle_pk.to_string(),
                "quote_mint_pk": quote_mint_pk.to_string(),
                "quote_vault_pk": quote_vault_pk.to_string(),
                "signer_pk": signer_key.to_string(),
                "signer_nonce": signer_nonce,

                "outcomes": outcome_infos,
                "details": details
            });

            for contract_keys_path in contract_keys_paths.iter() {
                let f = File::create(contract_keys_path).unwrap();
                serde_json::to_writer_pretty(&f, &contract_keys).unwrap();
                println!("contract keys were written into: {}", contract_keys_path);
            }
        }
        Command::IssueSet { .. } => {
            println!("IssueSet");
            unimplemented!()
        }
        Command::Resolve {
            payer,
            contract_keys_path,
            oracle_keypair,
            winner
        } => {
            println!("Resolve");

            let payer = read_keypair_file(payer.as_str())?;
            let oracle_keypair = read_keypair_file(oracle_keypair.as_str())?;
            let contract_keys: Value = serde_json::from_reader(File::open(contract_keys_path)?)?;

            let outcomes = contract_keys["outcomes"].as_array().unwrap();
            let outcome = outcomes.iter().find(
                |v| v["name"].as_str().unwrap() == winner.as_str()
            );
            let winner_pk = match outcome {
                None => Pubkey::from_str(winner.as_str())?,
                Some(v) => Pubkey::from_str(v["mint_pk"].as_str().unwrap())?
            };
            let omega_program_id = Pubkey::from_str(contract_keys["omega_program_id"].as_str().unwrap())?;
            let omega_contract_pk = Pubkey::from_str(contract_keys["omega_contract_pk"].as_str().unwrap())?;

            let instruction = resolve(
                &omega_program_id,
                &omega_contract_pk,
                &oracle_keypair.pubkey(),
                &winner_pk
            )?;
            let instructions = vec![instruction];
            let mut signers = vec![&payer];
            if oracle_keypair != payer {
                signers.push(&oracle_keypair)
            }
            send_instructions(&client, instructions, signers, &payer.pubkey())?;

        }

        Command::SolletToLocal {
            keypair_path,
            sollet_mnemonic,
            passphrase
        } => {
            let derive_path = "m/501'/0'/0/0";
            let sollet_mnemonic: String = sollet_mnemonic.join(" ");
            let passphrase = passphrase.unwrap_or(String::from(""));

            let kp = mnemonic_to_keypair(
                sollet_mnemonic.as_str(),
                passphrase.as_str(),
                derive_path
            )?;
            write_keypair_file(&kp, keypair_path.as_str()).unwrap();
        }
        Command::CreateSwapPools {
            payer,
            contract_keys_path,
            swap_program_id
        } => {
            unimplemented!()
            // Create two swap pools based on contract keys, fund them with initial liquidity
            // let payer = read_keypair_file(payer.as_str())?;
            // let swap_program_id = Pubkey::from_str(swap_program_id.as_str())?;
            // let contract_keys: Value = serde_json::from_reader(File::open(Path::new(contract_keys_path.as_str())).unwrap())?;
            //
            // let swap_kp = Keypair::new();
            // let swap_pk = swap_kp.pubkey();
            // let create_swap_instr = create_account_instr(
            //     &client, &payer, &swap_kp,
            //     spl_token_swap::state::SwapInfo::get_packed_len(),
            //     &swap_program_id
            // )?;
            //
            // let (swap_auth_pk, nonce) = u8::create_signer_key_and_nonce(&swap_program_id, &swap_pk);
            //
            //
            // let outcome_pk = Pubkey::from_str(contract_keys["outcomes"][0]["mint_pk"].as_str().unwrap())?;
            // let quote_mint_pk = Pubkey::from_str(contract_keys["quote_mint_pk"].as_str().unwrap())?;
            // // let accounts: Vec<RpcKeyedAccount> = client.get_token_accounts_by_owner(&payer.pubkey(), TokenAccountsFilter::Mint(outcome_pk.clone()))?;
            // // for acc in accounts {
            // //     println!("{}", acc.pubkey);
            // // }
            // // panic!();
            // let outcome_wallet_kp = create_token_account(&client, &outcome_pk, &swap_auth_pk, &payer)?;
            // let quote_wallet_kp = create_token_account(&client, &quote_mint_pk, &swap_auth_pk, &payer)?;
            // let outcome_wallet_pk = outcome_wallet_kp.pubkey();
            // let quote_wallet_pk = quote_wallet_kp.pubkey();
            //
            // let lp_mint_kp = Keypair::new();
            // let lp_mint_pk = lp_mint_kp.pubkey();
            // create_and_init_mint(&client, &payer, &lp_mint_kp, &swap_auth_pk, 9)?;
            //
            // let fee_acc_kp = create_token_account(&client, &lp_mint_pk, &payer.pubkey(), &payer)?;
            // let fee_acc_pk = fee_acc_kp.pubkey();
            //
            // let payer_outcome_wallet_pk = Pubkey::from_str("CqUbC9APNS5WsA26aPy1w3R5ArcUnFDPmkTuCdYBUgju")?;
            // let payer_quote_wallet_pk = Pubkey::from_str("Ggh42YAn4oUcBWbLc3orbqJq1BWjqs8VaGzwAD5f8Vbb")?;
            // let transfer0 = spl_token::instruction::transfer(
            //     &spl_token::id(),
            //     &payer_outcome_wallet_pk,
            //     &outcome_wallet_pk,
            //     &payer.pubkey(),
            //     &[],
            //     1_000_000_000
            // )?;
            // let transfer1 = spl_token::instruction::transfer(
            //     &spl_token::id(),
            //     &payer_quote_wallet_pk,
            //     &quote_wallet_pk,
            //     &payer.pubkey(),
            //     &[],
            //     1_000_000_000
            // )?;
            // let swap_init_instruction = spl_token_swap::instruction::initialize(
            //     &swap_program_id,
            //     &spl_token::id(),
            //     &swap_pk,
            //     &swap_auth_pk,
            //     &outcome_wallet_pk,
            //     &quote_wallet_pk,
            //     &lp_mint_pk,
            //     &fee_acc_pk,
            //     &fee_acc_pk,
            //     nonce,
            //     SwapCurve::default()
            // )?;
            //
            // let instructions = vec![transfer0, transfer1, create_swap_instr, swap_init_instruction];
            // let signers = vec![&payer, &swap_kp];
            // send_instructions(&client, instructions, signers, &payer.pubkey())?;
            // println!("finished");
        }

        Command::PrintBs58 {
            keypair,
            filepath
        } => {

            let keypair = read_keypair_file(keypair.as_str())?;
            match filepath {
                None => {
                    println!("{}", keypair.to_base58_string());
                }
                Some(filepath) => {
                    let mut f = File::create(filepath.as_str()).unwrap();
                    write!(&mut f, "{}", keypair.to_base58_string())?;
                }
            }
        }
    }
    Ok(())
}



fn main() {
    let opts = Opts::parse();
    start(opts).unwrap();
}
