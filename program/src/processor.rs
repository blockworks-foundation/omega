use std::mem::size_of;

use arrayref::{array_ref, array_refs};
use bytemuck::bytes_of;
use solana_program::account_info::AccountInfo;
use solana_program::entrypoint::ProgramResult;
use solana_program::msg;
use solana_program::program::{invoke, invoke_signed};
use solana_program::program_error::ProgramError;
use solana_program::program_pack::Pack;
use solana_program::pubkey::Pubkey;
use solana_program::sysvar::rent::Rent;
use solana_program::sysvar::Sysvar;
use spl_token::state::{Account, Mint};

use crate::error::{OmegaError, OmegaErrorCode, OmegaResult, SourceFileId};
use crate::instruction::OmegaInstruction;
use crate::state::{AccountFlag, DETAILS_BUFFER_LEN, Loadable, MAX_OUTCOMES, OmegaContract};

pub struct Processor {}


declare_check_assert_macros!(SourceFileId::Processor);

impl Processor {
    fn init_omega_contract(
        program_id: &Pubkey,
        accounts: &[AccountInfo],
        exp_time: u64,
        auto_exp_time: u64,
        signer_nonce: u64,
        details: &[u8]
    ) -> OmegaResult<()> {
        const NUM_FIXED: usize = 6;
        check_assert!(accounts.len() >= NUM_FIXED + 2 && accounts.len() <= NUM_FIXED + MAX_OUTCOMES)?;

        let (fixed_accs, outcome_accs) = array_refs![accounts, NUM_FIXED; ..;];
        let [
            omega_contract_acc,
            oracle_acc,
            quote_mint_acc,
            vault_acc,
            signer_acc,
            rent_acc
        ] = fixed_accs;

        let rent = Rent::from_account_info(rent_acc)?;

        check_assert!(omega_contract_acc.owner == program_id)?;
        check_assert!(rent.is_exempt(omega_contract_acc.lamports(), size_of::<OmegaContract>()))?;
        check_assert!(details.len() <= DETAILS_BUFFER_LEN)?;

        let mut omega_contract = OmegaContract::load_mut(omega_contract_acc)?;

        check_assert!(omega_contract.account_flags == 0)?;
        check_assert!(auto_exp_time >= exp_time)?;
        let signer_key = gen_signer_key(signer_nonce, omega_contract_acc.key, program_id)?;
        check_assert!(signer_key == *signer_acc.key)?;
        omega_contract.account_flags = (AccountFlag::Initialized | AccountFlag::OmegaContract).bits();
        omega_contract.oracle = *oracle_acc.key;
        omega_contract.quote_mint = *quote_mint_acc.key;
        omega_contract.exp_time = exp_time;
        omega_contract.auto_exp_time = auto_exp_time;
        omega_contract.vault = *vault_acc.key;
        omega_contract.signer_key = *signer_acc.key;
        omega_contract.signer_nonce = signer_nonce;
        omega_contract.winner = Pubkey::default();
        omega_contract.num_outcomes = outcome_accs.len();

        let details_buf = &mut omega_contract.details[..details.len()];
        details_buf.copy_from_slice(details);

        let quote_mint = Mint::unpack(&quote_mint_acc.try_borrow_data()?)?;
        let vault = Account::unpack(&vault_acc.try_borrow_data()?)?;
        check_assert!(vault.owner == signer_key)?;
        check_assert!(&vault.mint == quote_mint_acc.key)?;

        for (i, outcome_acc) in outcome_accs.iter().enumerate() {
            let outcome = Mint::unpack(&outcome_acc.try_borrow_data()?)?;
            let authority = outcome.mint_authority.ok_or(OmegaErrorCode::InvalidOutcomeMintAuthority)?;
            check_assert!(*outcome_acc.key != Pubkey::default())?;
            check_assert!(outcome.is_initialized)?;
            check_assert!(authority == signer_key)?;
            check_assert!(outcome.supply == 0)?;
            check_assert!(outcome.decimals == quote_mint.decimals)?;
            omega_contract.outcomes[i] = *outcome_acc.key;
        }

        Ok(())
    }

    fn issue_set(
        program_id: &Pubkey,
        accounts: &[AccountInfo],
        quantity: u64
    ) -> OmegaResult<()> {
        const NUM_FIXED: usize = 6;
        let (fixed_accs, outcome_accs) = array_refs![accounts, NUM_FIXED; ..;];

        let [
            omega_contract_acc,
            user_acc,
            user_quote_acc,
            vault_acc,
            spl_token_program_acc,
            omega_signer_acc,
        ] = fixed_accs;


        // Transfer quote tokens from the user's token wallet
        let omega_contract = OmegaContract::load(omega_contract_acc)?;
        check_assert!(omega_contract.account_flags == (AccountFlag::Initialized | AccountFlag::OmegaContract).bits())?;
        check_assert!(omega_contract_acc.owner == program_id)?;
        check_assert!(*vault_acc.key == omega_contract.vault)?;
        check_assert!(outcome_accs.len() == 2 * omega_contract.num_outcomes)?;
        check_assert!(user_acc.is_signer)?;

        let deposit_instruction = spl_token::instruction::transfer(
            spl_token_program_acc.key,
            user_quote_acc.key,
            vault_acc.key,
            user_acc.key,
            &[],
            quantity
        )?;
        let deposit_accs = [user_quote_acc.clone(), vault_acc.clone(), user_acc.clone(), spl_token_program_acc.clone()];
        invoke(&deposit_instruction, &deposit_accs)?;

        let signer_seeds = gen_signer_seeds(&omega_contract.signer_nonce, omega_contract_acc.key);
        for i in 0..omega_contract.num_outcomes {
            let outcome_mint_acc = &outcome_accs[2 * i];
            let outcome_user_acc = &outcome_accs[2 * i + 1];

            let mint_instruction = spl_token::instruction::mint_to(
                spl_token_program_acc.key,
                outcome_mint_acc.key,
                outcome_user_acc.key,
                omega_signer_acc.key,
                &[],
                quantity,
            )?;

            let mint_accs = [
                outcome_mint_acc.clone(),
                outcome_user_acc.clone(),
                omega_signer_acc.clone(),
                spl_token_program_acc.clone()
            ];
            invoke_signed(&mint_instruction, &mint_accs, &[&signer_seeds])?;
        }

        Ok(())
    }

    fn redeem_set(
        program_id: &Pubkey,
        accounts: &[AccountInfo],
        quantity: u64
    ) -> OmegaResult<()> {
        const NUM_FIXED: usize = 6;
        let (fixed_accs, outcome_accs) = array_refs![accounts, NUM_FIXED; ..;];

        let [
            omega_contract_acc,
            user_acc,
            user_quote_acc,
            vault_acc,
            spl_token_program_acc,
            omega_signer_acc,
        ] = fixed_accs;

        // Transfer outcome tokens for each outcome
        let omega_contract = OmegaContract::load(omega_contract_acc)?;
        check_assert!(omega_contract.account_flags == (AccountFlag::Initialized | AccountFlag::OmegaContract).bits())?;
        check_assert!(omega_contract_acc.owner == program_id)?;
        check_assert!(*vault_acc.key == omega_contract.vault)?;
        check_assert!(outcome_accs.len() == 2 * omega_contract.num_outcomes)?;
        check_assert!(user_acc.is_signer)?;

        for i in 0..omega_contract.num_outcomes {
            let outcome_mint_acc = &outcome_accs[2 * i];
            let outcome_user_acc = &outcome_accs[2 * i + 1];

            let burn_instruction = spl_token::instruction::burn(
                spl_token_program_acc.key,
                outcome_user_acc.key,
                outcome_mint_acc.key,
                user_acc.key,
                &[],
                quantity,
            )?;

            let mint_accs = [
                outcome_user_acc.clone(),
                outcome_mint_acc.clone(),
                user_acc.clone(),
                spl_token_program_acc.clone()
            ];

            invoke(&burn_instruction, &mint_accs)?;
        }

        let withdraw_instruction = spl_token::instruction::transfer(
            spl_token_program_acc.key,
            vault_acc.key,
            user_quote_acc.key,
            omega_signer_acc.key,
            &[],
            quantity
        )?;
        let withdraw_accs = [
            vault_acc.clone(),
            user_quote_acc.clone(),
            omega_signer_acc.clone(),
            spl_token_program_acc.clone()
        ];
        let signer_seeds = gen_signer_seeds(&omega_contract.signer_nonce, omega_contract_acc.key);
        invoke_signed(&withdraw_instruction, &withdraw_accs, &[&signer_seeds])?;

        Ok(())
    }

    fn redeem_winner(program_id: &Pubkey, accounts: &[AccountInfo], quantity: u64) -> OmegaResult<()>{
        let accounts = array_ref![accounts, 0, 9];
        let [
            omega_contract_acc,
            user_acc,
            user_quote_acc,
            vault_acc,
            spl_token_program_acc,
            omega_signer_acc,
            winner_mint_acc,
            winner_user_acc,
            clock_acc
        ] = accounts;
        let omega_contract = OmegaContract::load(omega_contract_acc)?;
        check_assert!(omega_contract.account_flags == (AccountFlag::Initialized | AccountFlag::OmegaContract).bits())?;
        check_assert!(omega_contract_acc.owner == program_id)?;
        check_assert!(*vault_acc.key == omega_contract.vault)?;
        check_assert!(user_acc.is_signer)?;

        let clock = solana_program::clock::Clock::from_account_info(clock_acc)?;
        let curr_time = clock.unix_timestamp as u64;

        // If it has auto expired with no winner, then let user redeem at 1 / num_outcomes rate
        let winnings = if omega_contract.winner == Pubkey::default() {
            check_assert!(curr_time >= omega_contract.auto_exp_time)?;
            // allow redemptions at 1 / num_outcomes
            quantity / (omega_contract.num_outcomes as u64)
            // no need to check winner mint because token program will fail if it's not a mint controlled by omega
        } else {
            check_assert!(*winner_mint_acc.key == omega_contract.winner)?;
            quantity
        };

        // Burn the tokens
        let burn_instruction = spl_token::instruction::burn(
            spl_token_program_acc.key,
            winner_user_acc.key,
            winner_mint_acc.key,
            user_acc.key,
            &[],
            quantity,
        )?;

        let mint_accs = [
            winner_user_acc.clone(),
            winner_mint_acc.clone(),
            user_acc.clone(),
            spl_token_program_acc.clone()
        ];
        invoke(&burn_instruction, &mint_accs)?;

        // Give quote currency winnings to user
        let withdraw_instruction = spl_token::instruction::transfer(
            spl_token_program_acc.key,
            vault_acc.key,
            user_quote_acc.key,
            omega_signer_acc.key,
            &[],
            winnings
        )?;
        let withdraw_accs = [
            vault_acc.clone(),
            user_quote_acc.clone(),
            omega_signer_acc.clone(),
            spl_token_program_acc.clone()
        ];
        let signer_seeds = gen_signer_seeds(&omega_contract.signer_nonce, omega_contract_acc.key);
        invoke_signed(&withdraw_instruction, &withdraw_accs, &[&signer_seeds])?;

        Ok(())
    }

    fn resolve(program_id: &Pubkey, accounts: &[AccountInfo]) -> OmegaResult<()> {
        let accounts = array_ref![accounts, 0, 4];
        let [
            omega_contract_acc,
            oracle_acc,  // signer
            winner_acc,
            clock_acc
        ] = accounts;

        let mut omega_contract = OmegaContract::load_mut(omega_contract_acc)?;
        check_assert!(omega_contract.account_flags == (AccountFlag::Initialized | AccountFlag::OmegaContract).bits())?;
        check_assert!(omega_contract_acc.owner == program_id)?;
        check_assert!(omega_contract.oracle == *oracle_acc.key)?;
        check_assert!(oracle_acc.is_signer)?;
        let clock = solana_program::clock::Clock::from_account_info(clock_acc)?;
        let curr_time = clock.unix_timestamp as u64;

        check_assert!(omega_contract.exp_time <= curr_time)?;
        check_assert!(curr_time < omega_contract.auto_exp_time)?;
        check_assert!(omega_contract.winner == Pubkey::default())?;

        let winner = *winner_acc.key;
        for i in 0..omega_contract.num_outcomes {
            if winner == omega_contract.outcomes[i] {
                omega_contract.winner = winner;
                return Ok(());
            }
        }

        Err(OmegaError::ErrorCode(OmegaErrorCode::InvalidWinner))
    }

    pub fn process(program_id: &Pubkey, accounts: &[AccountInfo], data: &[u8]) -> ProgramResult {
        let instruction = OmegaInstruction::unpack(data).ok_or(ProgramError::InvalidInstructionData)?;
        match instruction {
            OmegaInstruction::InitOmegaContract {
                exp_time, auto_exp_time, signer_nonce,
            } => {
                msg!("InitOmegaContract");
                let details_buffer = &data[16..];
                Self::init_omega_contract(program_id, accounts, exp_time, auto_exp_time, signer_nonce, details_buffer)?;
            },
            OmegaInstruction::IssueSet {
                quantity
            } => {
                msg!("IssueSet");
                Self::issue_set(program_id, accounts, quantity)?;
            },
            OmegaInstruction::RedeemSet {
                quantity
            } => {
                msg!("RedeemSet");
                Self::redeem_set(program_id, accounts, quantity)?;
            },
            OmegaInstruction::RedeemWinner {
                quantity
            } => {
                msg!("RedeemWinner");
                Self::redeem_winner(program_id, accounts, quantity)?;
            },
            OmegaInstruction::Resolve => {
                msg!("Resolve");
                Self::resolve(program_id, accounts)?;
            }
        }


        Ok(())
    }
}


fn gen_signer_seeds<'a>(nonce: &'a u64, contract_pk: &'a Pubkey) -> [&'a [u8]; 2] {
    [contract_pk.as_ref(), bytes_of(nonce)]
}

fn gen_signer_key(
    nonce: u64,
    contract_pk: &Pubkey,
    program_id: &Pubkey,
) -> Result<Pubkey, ProgramError> {
    let seeds = gen_signer_seeds(&nonce, contract_pk);
    Ok(Pubkey::create_program_address(&seeds, program_id)?)
}


#[cfg(test)]
mod tests {
    use std::mem::size_of;

    use bytemuck::Pod;
    use solana_program::instruction::Instruction;
    use solana_program::program_error::PrintProgramError;
    use solana_program::rent::Rent;
    use solana_sdk::account::{Account, create_account, create_is_signer_account_infos};

    use crate::error::OmegaError;
    use crate::instruction::*;

    use super::*;

    fn do_process_instruction(
        instruction: Instruction,
        accounts: Vec<&mut Account>,
    ) -> ProgramResult {
        let mut meta = instruction
            .accounts
            .iter()
            .zip(accounts)
            .map(|(account_meta, account)| (&account_meta.pubkey, account_meta.is_signer, account))
            .collect::<Vec<_>>();

        let account_infos = create_is_signer_account_infos(&mut meta);
        Processor::process(&instruction.program_id, &account_infos, &instruction.data)
    }

    fn get_rent_exempt<T: Pod>(owner: &Pubkey) -> Account {
        let rent = Rent::default();
        Account::new(rent.minimum_balance(size_of::<T>()), size_of::<T>(), owner)
    }

    #[test]
    fn test_init_omega_contract() {
        let program_id = Pubkey::new_unique();
        let omega_contract_pk = Pubkey::new_unique();
        let mut omega_contract_acc = get_rent_exempt::<OmegaContract>(&program_id);

        let oracle_pk = Pubkey::new_unique();
        let mut oracle_acc = Account::default();

        let quote_mint_pk = Pubkey::new_unique();
        let mut quote_mint_acc = Account::default();

        let vault_pk = Pubkey::new_unique();
        let mut vault_acc = Account::default();

        let signer_pk = Pubkey::new_unique();  // doesn't work

        let instruction = init_omega_contract(
            &program_id, &omega_contract_pk, &oracle_pk, &quote_mint_pk, &vault_pk, &signer_pk, &[],
            0, 0, 0, "DO NOT USE THIS CONTRACT"
        ).unwrap();

        let accounts = vec![&mut omega_contract_acc, &mut oracle_acc, &mut quote_mint_acc, &mut vault_acc];
        let result = do_process_instruction(instruction, accounts);
        assert!(result == Ok(()));
    }
}


