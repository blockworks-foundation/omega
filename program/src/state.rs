use std::cell::{Ref, RefMut};

use solana_program::account_info::AccountInfo;
use solana_program::program_error::ProgramError;

use bytemuck::{from_bytes, from_bytes_mut, Pod, Zeroable};
use solana_program::pubkey::Pubkey;
use enumflags2::BitFlags;

pub const DETAILS_BUFFER_LEN: usize = 2048;
pub const MAX_OUTCOMES: usize = 8;

pub trait Loadable: Pod {
    fn load_mut<'a>(account: &'a AccountInfo) -> Result<RefMut<'a, Self>, ProgramError> {
        Ok(RefMut::map(account.try_borrow_mut_data()?, |data| from_bytes_mut(data)))
    }
    fn load<'a>(account: &'a AccountInfo) -> Result<Ref<'a, Self>, ProgramError> {
        Ok(Ref::map(account.try_borrow_data()?, |data| from_bytes(data)))
    }

    fn load_from_bytes(data: &[u8]) -> Result<&Self, ProgramError> {
        Ok(from_bytes(data))
    }
}


#[derive(Copy, Clone, BitFlags, Debug, Eq, PartialEq)]
#[repr(u64)]
pub enum AccountFlag {
    Initialized = 1u64 << 0,
    OmegaContract = 1u64 << 1,
}


#[derive(Copy, Clone)]
#[repr(C)]


pub struct OmegaContract {
    pub account_flags: u64,
    pub oracle: Pubkey,  // Right now it's just a single oracle who determines outcome resolution
    pub quote_mint: Pubkey,  // SPL token of quote currency where winning contract redeems to 1 lot size, e.g. USDC
    pub exp_time: u64,  // expiration timestamp in seconds since 1970
    pub auto_exp_time: u64,  // time when all contracts become redeemable for 1 / num_outcomes
    pub vault: Pubkey,  // Where quote currency will be stored
    pub signer_key: Pubkey,
    pub signer_nonce: u64,
    pub winner: Pubkey,  // mint address of winning token. Will be 0 if not yet resolved
    pub outcomes: [Pubkey; MAX_OUTCOMES],
    pub num_outcomes: usize,

    pub details: [u8; DETAILS_BUFFER_LEN]  // utf-8 encoded string (compressed?) of details about how to resolve contract
}


unsafe impl Zeroable for OmegaContract {}
unsafe impl Pod for OmegaContract {}
impl Loadable for OmegaContract {}
