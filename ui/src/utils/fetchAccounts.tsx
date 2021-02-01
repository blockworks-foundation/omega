// This helper class fetches all token accounts from  wallet
// TODO: Check if to pass in an instruction class instead
// Import our token instruction class
import { TokenInstructions } from '@project-serum/serum';
// Linting
import { Connection, PublicKey } from '@solana/web3.js';
// For creating a new account
import {
  Account,
  SystemProgram,
  Transaction,
} from '@solana/web3.js';
import {AccountLayout} from '@solana/spl-token';
// Initiate a transaction
import {sendTransaction} from "../utils/utils";


/**
 * 
 * @param wallet The wallet from which the account is to be imported
 * @param connection The connection object to the account
 * @returns Promise<Array>
 */
export async function fetchAccounts(wallet: any, connection: Connection): Promise<any> {
    console.log('Fetch all SPL tokens for', wallet.publicKey.toString());

    const response = await connection.getParsedTokenAccountsByOwner(
      wallet.publicKey,
      { programId: TokenInstructions.TOKEN_PROGRAM_ID }
    );

    console.log(response.value.length, 'SPL tokens found', response);

    response.value.map((a) => a.account.data.parsed.info).forEach((info, _) => {
      console.log(info.mint, info.tokenAmount.uiAmount);
    });

    return response.value;
  }


  /**
   * 
   * @param accounts The user accounts
   * @param mintPubkey The public key of the account where the outcome tokens resides
   * @returns Promise<String>
   */
  export async function userTokenAccount(accounts: Array<any>, mintPubkey: PublicKey, wallet: any, connection: Connection) {
    let account = accounts.find(a => a.account.data.parsed.info.mint === mintPubkey.toBase58())
    if (account) {
      console.log('account exists', mintPubkey.toString(), account.pubkey.toString());
      return account.pubkey;
    } else {
      console.log('creating new account for', mintPubkey.toString());
      let { transaction, signer, newAccountPubkey } = await createTokenAccountTransaction(mintPubkey, connection, wallet);

      let signers = [signer]

      const instrStr = 'create account'
      let txid = await sendTransaction({
        transaction,
        wallet,
        signers,
        connection,
        sendingMessage: `sending ${instrStr}...`,
        sentMessage: `${instrStr} sent`,
        successMessage: `${instrStr} success`
      });
      console.log("txid", txid);
      console.log('pubkey', newAccountPubkey.toString());

      return newAccountPubkey;
    }
  }

  /**
   * 
   * @param mintPubkey The account where tokens are minted to
   * @param connection Connection to the account
   * @param wallet The users wallet
   */
async function createTokenAccountTransaction(mintPubkey: PublicKey, connection: Connection, wallet: any) {
    const newAccount = new Account();
    const transaction = new Transaction();
    transaction.add(
      SystemProgram.createAccount({
        fromPubkey: wallet.publicKey,
        newAccountPubkey: newAccount.publicKey,
        lamports: await connection.getMinimumBalanceForRentExemption(AccountLayout.span),
        space: AccountLayout.span,
        programId: TokenInstructions.TOKEN_PROGRAM_ID,
      })
    );

    transaction.add(
      TokenInstructions.initializeAccount({
        account: newAccount.publicKey,
        mint: mintPubkey,
        owner: wallet.publicKey,
      }),
    );

    return {
      transaction,
      signer: newAccount,
      newAccountPubkey: newAccount.publicKey,
    };
  }