use std::convert::Into;
use std::str::FromStr;

use anyhow::{anyhow, format_err, Result};
use bytemuck::{bytes_of, Pod};
use solana_client::rpc_client::RpcClient;
use solana_client::rpc_config::RpcSendTransactionConfig;
use solana_client::rpc_request::RpcRequest;
use solana_client::rpc_response::{RpcResult, RpcSimulateTransactionResult};
use solana_sdk::commitment_config::CommitmentConfig;
use solana_sdk::program_pack::{Pack as TokenPack, Pack};
use solana_sdk::pubkey::Pubkey;
use solana_sdk::signature::{Keypair, Signature, Signer};
use solana_sdk::transaction::Transaction;
use spl_token::instruction as token_instruction;
use spl_token::solana_program::instruction::Instruction;
use spl_token::solana_program::program_pack::IsInitialized;
use bip39::{Mnemonic, Seed, Language};
use tiny_hderive::bip32::ExtendedPrivKey;


#[derive(Clone, Debug)]
pub enum Cluster {
    Testnet,
    Mainnet,
    VipMainnet,
    Devnet,
    Localnet,
    Debug,
}

impl FromStr for Cluster {
    type Err = anyhow::Error;
    fn from_str(s: &str) -> Result<Cluster> {
        match s.to_lowercase().as_str() {
            "t" | "testnet" => Ok(Cluster::Testnet),
            "m" | "mainnet" => Ok(Cluster::Mainnet),
            "v" | "vipmainnet" => Ok(Cluster::VipMainnet),
            "d" | "devnet" => Ok(Cluster::Devnet),
            "l" | "localnet" => Ok(Cluster::Localnet),
            "g" | "debug" => Ok(Cluster::Debug),
            _ => Err(anyhow::Error::msg(
                "Cluster must be one of [testnet, mainnet, devnet]\n",
            )),
        }
    }
}

impl std::fmt::Display for Cluster {
    fn fmt(&self, f: &mut std::fmt::Formatter) -> std::fmt::Result {
        write!(f, "{}", self.name())
    }
}

impl Cluster {
    pub fn url(&self) -> &'static str {
        match self {
            Cluster::Devnet => "https://devnet.solana.com",
            Cluster::Testnet => "https://testnet.solana.com",
            // Cluster::Mainnet => "https://api.mainnet-beta.solana.com",
            Cluster::Mainnet => "https://solana-api.projectserum.com",
            Cluster::VipMainnet => "https://vip-api.mainnet-beta.solana.com",
            Cluster::Localnet => "http://127.0.0.1:8899",
            Cluster::Debug => "http://34.90.18.145:8899",
        }
    }
    pub fn name(&self) -> &'static str {
        match self {
            Cluster::Devnet => "devnet",
            Cluster::Testnet => "testnet",
            Cluster::Mainnet => "mainnet",
            Cluster::VipMainnet => "vipmainnet",
            Cluster::Localnet => "localnet",
            Cluster::Debug => "debug",
        }

    }
}

pub fn read_keypair_file(s: &str) -> Result<Keypair> {
    solana_sdk::signature::read_keypair_file(s)
        .map_err(|_| format_err!("failed to read keypair from {}", s))
}


pub fn create_account_instr(
    client: &RpcClient,
    payer: &Keypair,
    account: &Keypair,
    data_size: usize,
    owner: &Pubkey,
) -> Result<Instruction> {
    let lamports = client.get_minimum_balance_for_rent_exemption(data_size)?;

    Ok(solana_sdk::system_instruction::create_account(
        &payer.pubkey(),
        &account.pubkey(),
        lamports,
        data_size as u64,
        owner,
    ))

}

pub fn create_account_rent_exempt(
    client: &RpcClient,
    payer: &Keypair,
    data_size: usize,
    owner: &Pubkey,
) -> Result<Keypair> {
    let account = Keypair::new();
    let signers = [payer, &account];
    let instructions = vec![create_account_instr(client, payer, &account, data_size, owner)?];

    let (recent_hash, _fee_calc) = client.get_recent_blockhash()?;

    let txn = Transaction::new_signed_with_payer(
        &instructions,
        Some(&payer.pubkey()),
        &signers,
        recent_hash,
    );

    send_txn(client, &txn, false)?;
    Ok(account)
}

pub fn create_token_account_instr<'a>(
    client: &RpcClient,
    token_account: &'a Keypair,
    mint_pubkey: &Pubkey,
    owner_pubkey: &Pubkey,
    payer: &'a Keypair,
    instructions: &mut Vec<Instruction>,
    signers: &mut Vec<&'a Keypair>
) -> Result<()> {

    let lamports = client.get_minimum_balance_for_rent_exemption(spl_token::state::Account::LEN)?;

    let create_account_instr = solana_sdk::system_instruction::create_account(
        &payer.pubkey(),
        &token_account.pubkey(),
        lamports,
        spl_token::state::Account::LEN as u64,
        &spl_token::ID,
    );

    let init_account_instr = token_instruction::initialize_account(
        &spl_token::ID,
        &token_account.pubkey(),
        &mint_pubkey,
        &owner_pubkey,
    )?;
    instructions.push(create_account_instr);
    instructions.push(init_account_instr);
    if let None = signers.iter().find(|kp| **kp == payer) {
        signers.push(payer);
    }
    if let None = signers.iter().find(|kp| **kp == token_account) {
        signers.push(token_account);
    }
    Ok(())
}

pub fn create_token_account(
    client: &RpcClient,
    mint_pubkey: &Pubkey,
    owner_pubkey: &Pubkey,
    payer: &Keypair,
) -> Result<Keypair> {
    let spl_account = Keypair::new();
    let signers = vec![payer, &spl_account];

    let lamports = client.get_minimum_balance_for_rent_exemption(spl_token::state::Account::LEN)?;

    let create_account_instr = solana_sdk::system_instruction::create_account(
        &payer.pubkey(),
        &spl_account.pubkey(),
        lamports,
        spl_token::state::Account::LEN as u64,
        &spl_token::ID,
    );

    let init_account_instr = token_instruction::initialize_account(
        &spl_token::ID,
        &spl_account.pubkey(),
        &mint_pubkey,
        &owner_pubkey,
    )?;

    let instructions = vec![create_account_instr, init_account_instr];

    let (recent_hash, _fee_calc) = client.get_recent_blockhash()?;

    let txn = Transaction::new_signed_with_payer(
        &instructions,
        Some(&payer.pubkey()),
        &signers,
        recent_hash,
    );
    send_txn(client, &txn, false)?;
    Ok(spl_account)
}

pub fn create_and_init_mint_instr<'a>(
    client: &RpcClient,
    mint_keypair: &'a Keypair,
    payer_keypair: &'a Keypair,
    owner_pubkey: &Pubkey,
    decimals: u8,
    instructions: &mut Vec<Instruction>,
    signers: &mut Vec<&'a Keypair>
) -> Result<()> {
    let lamports = client.get_minimum_balance_for_rent_exemption(spl_token::state::Mint::LEN)?;

    let create_mint_account_instruction = solana_sdk::system_instruction::create_account(
        &payer_keypair.pubkey(),
        &mint_keypair.pubkey(),
        lamports,
        spl_token::state::Mint::LEN as u64,
        &spl_token::ID,
    );
    let initialize_mint_instruction = token_instruction::initialize_mint(
        &spl_token::ID,
        &mint_keypair.pubkey(),
        owner_pubkey,
        None,
        decimals,
    )?;
    instructions.push(create_mint_account_instruction);
    instructions.push(initialize_mint_instruction);
    if let None = signers.iter().find(|kp| **kp == payer_keypair) {
        signers.push(payer_keypair);
    }
    if let None = signers.iter().find(|kp| **kp == mint_keypair) {
        signers.push(mint_keypair);
    }
    Ok(())
}

pub fn create_and_init_mint(
    client: &RpcClient,
    payer_keypair: &Keypair,
    mint_keypair: &Keypair,
    owner_pubkey: &Pubkey,
    decimals: u8,
) -> Result<Signature> {
    let signers = vec![payer_keypair, mint_keypair];

    let lamports = client.get_minimum_balance_for_rent_exemption(spl_token::state::Mint::LEN)?;

    let create_mint_account_instruction = solana_sdk::system_instruction::create_account(
        &payer_keypair.pubkey(),
        &mint_keypair.pubkey(),
        lamports,
        spl_token::state::Mint::LEN as u64,
        &spl_token::ID,
    );
    let initialize_mint_instruction = token_instruction::initialize_mint(
        &spl_token::ID,
        &mint_keypair.pubkey(),
        owner_pubkey,
        None,
        decimals,
    )?;
    let instructions = vec![create_mint_account_instruction, initialize_mint_instruction];

    let (recent_hash, _fee_calc) = client.get_recent_blockhash()?;
    let txn = Transaction::new_signed_with_payer(
        &instructions,
        Some(&payer_keypair.pubkey()),
        &signers,
        recent_hash,
    );

    send_txn(client, &txn, false)
}

pub fn mint_to_new_account(
    client: &RpcClient,
    payer: &Keypair,
    minting_key: &Keypair,
    mint: &Pubkey,
    quantity: u64,
) -> Result<Keypair> {
    let recip_keypair = Keypair::new();

    let lamports = client.get_minimum_balance_for_rent_exemption(spl_token::state::Account::LEN)?;

    let signers = vec![payer, minting_key, &recip_keypair];

    let create_recip_instr = solana_sdk::system_instruction::create_account(
        &payer.pubkey(),
        &recip_keypair.pubkey(),
        lamports,
        spl_token::state::Account::LEN as u64,
        &spl_token::ID,
    );

    let init_recip_instr = token_instruction::initialize_account(
        &spl_token::ID,
        &recip_keypair.pubkey(),
        mint,
        &payer.pubkey(),
    )?;

    let mint_tokens_instr = token_instruction::mint_to(
        &spl_token::ID,
        mint,
        &recip_keypair.pubkey(),
        &minting_key.pubkey(),
        &[],
        quantity,
    )?;

    let instructions = vec![create_recip_instr, init_recip_instr, mint_tokens_instr];

    let (recent_hash, _fee_calc) = client.get_recent_blockhash()?;
    let txn = Transaction::new_signed_with_payer(
        &instructions,
        Some(&payer.pubkey()),
        &signers,
        recent_hash,
    );

    send_txn(client, &txn, false)?;
    Ok(recip_keypair)
}

pub fn send_txn(client: &RpcClient, txn: &Transaction, _simulate: bool) -> Result<Signature> {
    Ok(client.send_and_confirm_transaction_with_spinner_and_config(
        txn,
        CommitmentConfig::single_gossip(),
        RpcSendTransactionConfig {
            skip_preflight: true,
            ..RpcSendTransactionConfig::default()
        },
    )?)
}

pub fn simulate_transaction(
    client: &RpcClient,
    transaction: &Transaction,
    sig_verify: bool,
    cfg: CommitmentConfig,
) -> RpcResult<RpcSimulateTransactionResult> {
    let serialized_encoded = bs58::encode(bincode::serialize(transaction).unwrap()).into_string();
    client.send(
        RpcRequest::SimulateTransaction,
        serde_json::json!([serialized_encoded, {
            "sigVerify": sig_verify, "commitment": cfg.commitment
        }]),
    )
}

pub fn get_token_account<T: TokenPack>(client: &RpcClient, addr: &Pubkey) -> Result<T> {
    let account = client
        .get_account_with_commitment(addr, CommitmentConfig::recent())?
        .value
        .map_or(Err(anyhow!("Account not found")), Ok)?;
    T::unpack_from_slice(&account.data).map_err(Into::into)
}

pub fn get_account<T: Pack + IsInitialized>(client: &RpcClient, addr: &Pubkey) -> Result<T> {
    let account = client
        .get_account_with_commitment(addr, CommitmentConfig::recent())?
        .value
        .map_or(Err(anyhow!("Account not found")), Ok)?;
    T::unpack(&account.data).map_err(Into::into)
}

// Convenience for testing. Use `get_token_account` otherwise.
pub fn account_token_unpacked<T: TokenPack>(client: &RpcClient, addr: &Pubkey) -> T {
    get_token_account::<T>(client, addr).unwrap()
}

// Convenience for testing. Use `get_account` otherwise.
pub fn account_unpacked<T: Pack + IsInitialized>(client: &RpcClient, addr: &Pubkey) -> T {
    get_account(client, addr).unwrap()
}


pub trait SignerNonce: Pod {
    fn gen_signer_seeds<'a>(nonce: &'a Self, acc_pk: &'a Pubkey) -> [&'a [u8]; 2] {
        [acc_pk.as_ref(), bytes_of(nonce)]
    }
    fn gen_signer_key(nonce: Self, acc_pk: &Pubkey, program_id: &Pubkey) -> Result<Pubkey>;
    fn create_signer_key_and_nonce(program_id: &Pubkey, acc_pk: &Pubkey) -> (Pubkey, Self);
}
impl SignerNonce for u8 {

    fn gen_signer_key(
        nonce: Self,
        acc_pk: &Pubkey,
        program_id: &Pubkey,
    ) -> Result<Pubkey> {
        let seeds = Self::gen_signer_seeds(&nonce, acc_pk);
        Ok(Pubkey::create_program_address(&seeds, program_id)?)
    }

    fn create_signer_key_and_nonce(program_id: &Pubkey, acc_pk: &Pubkey) -> (Pubkey, Self) {

        for i in 0..=Self::MAX {
            if let Ok(pk) = Self::gen_signer_key(i, acc_pk, program_id) {
                return (pk, i);
            }
        }
        panic!("Could not generate signer key");

    }
}

pub fn gen_signer_seeds<'a>(nonce: &'a u64, acc_pk: &'a Pubkey) -> [&'a [u8]; 2] {
    [acc_pk.as_ref(), bytes_of(nonce)]
}


pub fn gen_signer_key(
    nonce: u64,
    acc_pk: &Pubkey,
    program_id: &Pubkey,
) -> Result<Pubkey> {
    let seeds = gen_signer_seeds(&nonce, acc_pk);
    Ok(Pubkey::create_program_address(&seeds, program_id)?)
}


pub fn create_signer_key_and_nonce(program_id: &Pubkey, acc_pk: &Pubkey) -> (Pubkey, u64) {

    for i in 0..256 {
        if let Ok(pk) = gen_signer_key(i, acc_pk, program_id) {
            return (pk, i);
        }
    }
    panic!("Could not generate signer key");

}

pub fn convert_assertion_error(e: u32) -> (u32, u32) {
    let line = e & 0xffffu32;
    let file_id = e >> 24;

    (line, file_id)
}

pub fn send_instructions(
    client: &RpcClient,
    instructions: Vec<Instruction>,
    signers: Vec<&Keypair>,
    payer_pk: &Pubkey
) -> Result<()> {
    let (recent_hash, _fee_calc) = client.get_recent_blockhash()?;
    let txn = Transaction::new_signed_with_payer(
        &instructions,
        Some(payer_pk),
        &signers,
        recent_hash,
    );

    let result = simulate_transaction(&client, &txn, true, CommitmentConfig::single_gossip())?;
    if let Some(e) = result.value.err {
        return Err(format_err!("simulate_transaction error: {:?}", e));
    }
    send_txn(&client, &txn, false)?;
    Ok(())
}


fn seedphrase_to_seed(seed_phrase: &str, passphrase: &str) -> Result<Vec<u8>> {
    let mnemonic = Mnemonic::from_phrase(seed_phrase, Language::English).unwrap();
    let seed = Seed::new(&mnemonic, passphrase);
    Ok(seed.as_bytes().to_vec())
}

pub fn mnemonic_to_keypair(seed_phrase: &str, pass_phrase: &str, derive_path: &str) -> Result<Keypair> {
    let seed = seedphrase_to_seed(seed_phrase, pass_phrase)?;
    let ext = ExtendedPrivKey::derive(seed.as_slice(), derive_path).unwrap();
    let secret = ed25519_dalek::SecretKey::from_bytes(ext.secret().as_ref())?;
    let public = ed25519_dalek::PublicKey::from(&secret);
    let dalek_kp = ed25519_dalek::Keypair { secret, public };
    let kp = Keypair::from_bytes(&dalek_kp.to_bytes())?;
    Ok(kp)

}