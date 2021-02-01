// This util file contains helper functions
// for creating outcome tokens from usdc
// Import our token instruction class
import { TokenInstructions } from '@project-serum/serum';
// Setup transaction instruction
import {
  TransactionInstruction,
  PublicKey,
  Connection,
  Transaction
} from '@solana/web3.js';
// Our program id
import contract_keys from "../contract_keys.json";
// For creating instruction layout
import BufferLayout from 'buffer-layout';
// Initiate transaction
import {sendTransaction} from "../utils/utils";
// Account utils
import { fetchAccounts, userTokenAccount } from './fetchAccounts'

// Issue set identifier 
const IC_ISSUE_SET = 1;

// Layout of instruction
const instructionLayout = BufferLayout.struct([
  BufferLayout.u32('instruction'),
  BufferLayout.nu64('quantity'),
]);

// Our deployed program id
const PROGRAM_ID = new PublicKey(contract_keys.omega_program_id);

const QUOTE_CURRENCY_MINT = new PublicKey(contract_keys.quote_mint_pk);

function IssueSetInstruction(omegaContract: any, user: any, userQuote: any, vault: any, omegaSigner: any, outcomePks: any, quantity: any) {
  let keys = [
    { pubkey: omegaContract, isSigner: false, isWritable: false },
    { pubkey: user, isSigner: true, isWritable: false },
    { pubkey: userQuote, isSigner: false, isWritable: true },
    { pubkey: vault, isSigner: false, isWritable: true },
    { pubkey: TokenInstructions.TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
    { pubkey: omegaSigner, isSigner: false, isWritable: false }
  ];

  for (var i = 0; i < outcomePks.length; i++) {
    keys.push({pubkey: outcomePks[i], isSigner: false, isWritable: true});
  }

  const data = encodeInstructionData(instructionLayout, {
    instruction: IC_ISSUE_SET,
    quantity
  });

  return new TransactionInstruction({keys: keys, programId: PROGRAM_ID, data: data});
}

/**
 * @summary Create instruction layout
 * @param layout 
 * @param args 
 */
function encodeInstructionData(layout: typeof instructionLayout, args: any) {
  let data = Buffer.alloc(1024);
  const encodeLength = layout.encode(args, data);
  return data.slice(0, encodeLength);
}

/**
 * 
 * @param market 
 * @param amount Amount to issue
 * @param wallet Wallet to bill from
 * @param connection THe connection object
 */
  async function issueSet(market: any, amount: any, wallet: any, connection: Connection) {
    if (!wallet.connected) await wallet.connect();
    console.log('issueSet', amount);

    const accounts = await fetchAccounts(wallet, connection);

    let userQuote = await userTokenAccount(accounts, QUOTE_CURRENCY_MINT, wallet, connection);
    let outcomePks = [];
    let outcomeInfos = market["outcomes"];
    let numOutcomes = outcomeInfos.length;
    for (let i = 0; i < numOutcomes; i++) {
      let outcomeMint = new PublicKey(outcomeInfos[i]["mint_pk"]);
      outcomePks.push(outcomeMint);
      let userOutcomeWallet = await userTokenAccount(accounts, outcomeMint, wallet, connection);
      outcomePks.push(userOutcomeWallet);
      console.log(outcomeInfos[i]["name"], outcomeMint, userOutcomeWallet);
    }
    let issueSetInstruction = IssueSetInstruction(
      new PublicKey(market.omega_contract_pk),
      wallet.publicKey,
      userQuote,
      new PublicKey(market.quote_vault_pk),
      new PublicKey(market.signer_pk),
      outcomePks,
      amount);
    let transaction = new Transaction();
    transaction.add(issueSetInstruction);

    let txid = await sendTransaction({
      transaction,
      wallet,
      signers: [],
      connection,
      sendingMessage: 'sending IssueSetInstruction...',
      sentMessage: 'IssueSetInstruction sent',
      successMessage: 'IssueSetInstruction success'
    });
    console.log('success txid:', txid);
  }

  export default issueSet;