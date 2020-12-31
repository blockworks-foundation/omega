use arrayref::{array_ref, array_refs};
use serde::{Deserialize, Serialize};
use solana_program::instruction::{AccountMeta, Instruction};
use solana_program::program_error::ProgramError;
use solana_program::pubkey::Pubkey;

#[repr(C)]
#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
pub enum OmegaInstruction {
    /// Initialize a new omega contract
    ///
    /// Accounts expected by this instruction:
    ///
    ///   0. `[writable]` omega_contract_acc
    ///   1. `[]` oracle_acc - pubkey of oracle
    ///   2. `[]` Quote currency mint
    ///   3. `[]` quote_vault - Quote currency SPL token account owned by Omega program
    ///   4. `[]` signer_acc - The account pointed to by signer key
    ///   5. `[]` Rent sysvar account
    InitOmegaContract {
        exp_time: u64,
        auto_exp_time: u64,
        signer_nonce: u64,
    },

    /// Issue one of each outcome token for each quote token deposited
    ///
    /// Accounts expected by this instruction:
    ///
    ///   0. `[]` OmegaContract data
    ///   1. `[signer]` user's solana account (the owner)
    ///   2. `[writable]` user's quote currency wallet
    ///   3. `[writable]` omega's quote currency vault
    ///   4. `[]` account pointed to by SPL token program id
    ///   5. `[]` account pointed to by hashing signer nonce, omega contract pubkey and omega program id
    ///   6. `[writable]` outcome0 mint account
    ///   7. `[writable]` outcome0 user wallet account
    ///
    ///   Repeat 6, 7 for each outcome.
    ///   Total accounts: 6 + 2 * num_outcomes
    IssueSet {
        quantity: u64,
    },

    /// Deposit one of each outcome to receive 1 lot size of quote token
    /// Contract will burn these tokens
    ///
    /// Accounts expected by this instruction:
    ///
    ///   0. `[]` omega_contract_acc - OmegaContract data
    ///   1. `[signer]` user_acc - user's solana account (the owner)
    ///   2. `[writable]` user_quote_acc - user's quote currency wallet
    ///   3. `[writable]` vault_acc - omega's quote currency vault
    ///   4. `[]` spl_token_program_acc - account pointed to by SPL token program id
    ///   5. `[]` omega_signer_acc - account pointed to by hashing signer nonce, omega contract
    ///           pubkey and omega program id
    ///   6. `[writable]` outcome0_mint_acc - outcome0 mint account
    ///   7. `[writable]` outcome0_user_acc - user wallet account for outcome0
    ///
    ///   Repeat 6, 7 for each outcome.
    ///   Total accounts: 6 + 2 * num_outcomes
    RedeemSet {
        quantity: u64
    },

    /// Deposit winning token to receie 1 lot size of quote token
    /// Will fail if contract not yet resolved
    ///
    /// Accounts expected by this instruction:
    ///
    ///   0. `[]` omega_contract_acc - OmegaContract data
    ///   1. `[signer]` user_acc - user's solana account (the owner)
    ///   2. `[writable]` user_quote_acc - user's quote currency wallet
    ///   3. `[writable]` vault_acc - omega's quote currency vault
    ///   4. `[]` spl_token_program_acc - account pointed to by SPL token program id
    ///   5. `[]` omega_signer_acc - account pointed to by hashing signer nonce, omega contract
    ///           pubkey and omega program id
    ///   6. `[writable]` winner_mint_acc - mint of winning outcome
    ///   7. `[writable]` winner_user_acc - user wallet of winning outcome
    ///   8. `[]` clock_acc - sysvar Clock
    RedeemWinner {
        quantity: u64
    },

    /// Designated oracle will pick winner
    /// This will fail if time < expiration time specified in contract
    ///
    /// Accounts expected by this instruction:
    ///
    ///   0. `[writable]` omega_contract_acc
    ///   1. `[signer]` oracle_acc - pubkey of oracle
    ///   2. `[]` winner_acc - mint pubkey of winning outcome
    ///   3. `[]` clock_acc - sysvar Clock
    Resolve
}

impl OmegaInstruction {
    /// First four bytes of instruction data is the index of the instruction (e.g. 0 -> InitOmegaContract)
    /// Remaining data is the actual instruction contents
    pub fn unpack(input: &[u8]) -> Option<Self> {
        let (&discrim, data) = array_refs![input, 4; ..;];
        let discrim = u32::from_le_bytes(discrim);

        Some(match discrim {
            0 => {
                let data = array_ref![data, 0, 24];
                let (exp_time, auto_exp_time, signer_nonce) = array_refs![data, 8, 8, 8];
                OmegaInstruction::InitOmegaContract {
                    exp_time: u64::from_le_bytes(*exp_time),
                    auto_exp_time: u64::from_le_bytes(*auto_exp_time),
                    signer_nonce: u64::from_le_bytes(*signer_nonce),
                }
            }
            1 => {
                let quantity = array_ref![data, 0, 8];
                OmegaInstruction::IssueSet {
                    quantity: u64::from_le_bytes(*quantity)
                }
            }
            2 => {
                let quantity = array_ref![data, 0, 8];
                OmegaInstruction::RedeemSet {
                    quantity: u64::from_le_bytes(*quantity)
                }
            }
            3 => {
                let quantity = array_ref![data, 0, 8];
                OmegaInstruction::RedeemWinner {
                    quantity: u64::from_le_bytes(*quantity)
                }
            }
            4 => {
                OmegaInstruction::Resolve
            }
            _ => { return None; }
        })
    }
    pub fn pack(&self) -> Vec<u8> {
        bincode::serialize(self).unwrap()
    }

}


/// The outcome_pks are public keys for the SPL token mint of each outcome
/// Make sure the token has 0 supply and the authority is the key generated by gen_vault_signer_key
/// using the signer nonce
pub fn init_omega_contract(
    program_id: &Pubkey,
    omega_contract_pk: &Pubkey,
    oracle_pk: &Pubkey,
    quote_mint_pk: &Pubkey,
    vault_pk: &Pubkey,
    signer_pk: &Pubkey,
    outcome_pks: &[Pubkey],
    exp_time: u64,
    auto_exp_time: u64,
    signer_nonce: u64,
    details_str: &str
) -> Result<Instruction, ProgramError> {

    let mut accounts = vec![
        AccountMeta::new(*omega_contract_pk, false),
        AccountMeta::new_readonly(*oracle_pk, false),
        AccountMeta::new_readonly(*quote_mint_pk, false),
        AccountMeta::new_readonly(*vault_pk, false),
        AccountMeta::new_readonly(*signer_pk, false),
        AccountMeta::new_readonly(solana_program::sysvar::rent::ID, false),
    ];

    for pk in outcome_pks {
        accounts.push(AccountMeta::new(*pk, false));
    }

    let instr = OmegaInstruction::InitOmegaContract {
        exp_time,
        auto_exp_time,
        signer_nonce
    };

    let details = details_str.as_bytes();
    let mut data = instr.pack();
    data.extend_from_slice(details);

    Ok(Instruction {
        program_id: *program_id,
        accounts,
        data
    })
}

pub fn issue_set(
    program_id: &Pubkey,
    omega_contract_pk: &Pubkey,
    user_pk: &Pubkey,
    user_quote_pk: &Pubkey,
    vault_pk: &Pubkey,
    signer_pk: &Pubkey,
    outcome_pks: &[(Pubkey, Pubkey)],  // (mint, user_acc)
    quantity: u64
) -> Result<Instruction, ProgramError> {

    let mut accounts = vec![
        AccountMeta::new_readonly(*omega_contract_pk, false),
        AccountMeta::new_readonly(*user_pk, true),
        AccountMeta::new(*user_quote_pk, false),
        AccountMeta::new(*vault_pk, false),
        AccountMeta::new_readonly(spl_token::id(), false),
        AccountMeta::new_readonly(*signer_pk, false),
    ];

    for (outcome_mint_pk, outcome_user_pk) in outcome_pks {
        accounts.push(AccountMeta::new(*outcome_mint_pk, false));
        accounts.push(AccountMeta::new(*outcome_user_pk, false));
    }

    let instr = OmegaInstruction::IssueSet { quantity };
    let data = instr.pack();

    Ok(Instruction {
        program_id: *program_id,
        accounts,
        data
    })
}


pub fn redeem_set(
    program_id: &Pubkey,
    omega_contract_pk: &Pubkey,
    user_pk: &Pubkey,
    user_quote_pk: &Pubkey,
    vault_pk: &Pubkey,
    signer_pk: &Pubkey,
    outcome_pks: &[(Pubkey, Pubkey)],  // (mint, user_acc)
    quantity: u64
) -> Result<Instruction, ProgramError> {

    let mut accounts = vec![
        AccountMeta::new_readonly(*omega_contract_pk, false),
        AccountMeta::new_readonly(*user_pk, true),
        AccountMeta::new(*user_quote_pk, false),
        AccountMeta::new(*vault_pk, false),
        AccountMeta::new_readonly(spl_token::id(), false),
        AccountMeta::new_readonly(*signer_pk, false),
    ];

    for (outcome_mint_pk, outcome_user_pk) in outcome_pks {
        accounts.push(AccountMeta::new(*outcome_mint_pk, false));
        accounts.push(AccountMeta::new(*outcome_user_pk, false));
    }

    let instr = OmegaInstruction::RedeemSet { quantity };
    let data = instr.pack();

    Ok(Instruction {
        program_id: *program_id,
        accounts,
        data
    })
}

pub fn redeem_winner(
    program_id: &Pubkey,
    omega_contract_pk: &Pubkey,
    user_pk: &Pubkey,
    user_quote_pk: &Pubkey,
    vault_pk: &Pubkey,
    signer_pk: &Pubkey,
    winner_mint_pk: &Pubkey,
    winner_user_pk: &Pubkey,
    quantity: u64
) -> Result<Instruction, ProgramError> {

    let accounts = vec![
        AccountMeta::new_readonly(*omega_contract_pk, false),
        AccountMeta::new_readonly(*user_pk, true),
        AccountMeta::new(*user_quote_pk, false),
        AccountMeta::new(*vault_pk, false),
        AccountMeta::new_readonly(spl_token::id(), false),
        AccountMeta::new_readonly(*signer_pk, false),
        AccountMeta::new(*winner_mint_pk, false),
        AccountMeta::new(*winner_user_pk, false),
        AccountMeta::new_readonly(solana_program::sysvar::clock::ID, false)
    ];

    let instr = OmegaInstruction::RedeemWinner { quantity };
    let data = instr.pack();

    Ok(Instruction {
        program_id: *program_id,
        accounts,
        data
    })
}


pub fn resolve(
    program_id: &Pubkey,
    omega_contract_pk: &Pubkey,
    oracle_pk: &Pubkey,
    winner_pk: &Pubkey
) -> Result<Instruction, ProgramError> {

    let accounts = vec![
        AccountMeta::new(*omega_contract_pk, false),
        AccountMeta::new_readonly(*oracle_pk, true),
        AccountMeta::new_readonly(*winner_pk, false),
        AccountMeta::new_readonly(solana_program::sysvar::clock::ID, false),
    ];

    let instr = OmegaInstruction::Resolve;
    let data = instr.pack();
    Ok(Instruction {
        program_id: *program_id,
        accounts,
        data
    })
}