use num_enum::{FromPrimitive, IntoPrimitive};
use solana_program::program_error::ProgramError;
use thiserror::Error;

pub type OmegaResult<T = ()> = Result<T, OmegaError>;

#[derive(Debug)]
pub struct AssertionError {
    pub line: u16,
    pub file_id: SourceFileId,
}

impl From<AssertionError> for u32 {
    fn from(err: AssertionError) -> u32 {
        (err.line as u32) + ((err.file_id as u8 as u32) << 24)
    }
}

impl From<AssertionError> for OmegaError {
    fn from(err: AssertionError) -> OmegaError {
        let err: u32 = err.into();
        OmegaError::ProgramError(ProgramError::Custom(err.into()))
    }
}

#[derive(Error, Debug, PartialEq, Eq)]
pub enum OmegaError {
    #[error(transparent)]
    ProgramError(#[from] ProgramError),
    #[error("{0:?}")]
    ErrorCode(#[from] OmegaErrorCode),
}

#[derive(Debug, IntoPrimitive, FromPrimitive, Clone, Copy, PartialEq, Eq)]
#[repr(u32)]
pub enum OmegaErrorCode {
    BorrowError,
    InvalidOutcomeMintAuthority,
    InvalidWinner,
    Unknown = 1000,

    // This contains the line number in the lower 16 bits,
    // and the source file id in the upper 8 bits
    #[num_enum(default)]
    AssertionError,
}

#[repr(u8)]
#[derive(Error, Debug)]
pub enum SourceFileId {
    #[error("src/processor.rs")]
    Processor = 0,
    #[error("src/state.rs")]
    State = 1,
    #[error("src/instruction.rs")]
    Instruction = 2,
}

#[macro_export]
macro_rules! declare_check_assert_macros {
    ($source_file_id:expr) => {
        macro_rules! assertion_error {
            () => {{
                let file_id: SourceFileId = $source_file_id;
                $crate::error::AssertionError {
                    line: line!() as u16,
                    file_id,
                }
            }};
        }

        #[allow(unused_macros)]
        macro_rules! check_assert {
            ($val:expr) => {{
                if $val {
                    Ok(())
                } else {
                    Err(assertion_error!())
                }
            }};
        }

        #[allow(unused_macros)]
        macro_rules! check_assert_eq {
            ($a:expr, $b:expr) => {{
                if $a == $b {
                    Ok(())
                } else {
                    Err(assertion_error!())
                }
            }};
        }

        #[allow(unused_macros)]
        macro_rules! check_unreachable {
            () => {{
                Err(assertion_error!())
            }};
        }
    };
}

impl std::fmt::Display for OmegaErrorCode {
    fn fmt(&self, fmt: &mut std::fmt::Formatter<'_>) -> Result<(), std::fmt::Error> {
        <Self as std::fmt::Debug>::fmt(self, fmt)
    }
}

impl std::error::Error for OmegaErrorCode {}

impl std::convert::From<OmegaError> for ProgramError {
    fn from(e: OmegaError) -> ProgramError {
        match e {
            OmegaError::ProgramError(e) => e,
            OmegaError::ErrorCode(c) => ProgramError::Custom(c.into()),
        }
    }
}

impl std::convert::From<std::cell::BorrowError> for OmegaError {
    fn from(_: std::cell::BorrowError) -> Self {
        OmegaError::ErrorCode(OmegaErrorCode::BorrowError)
    }
}


