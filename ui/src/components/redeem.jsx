import React, { useState, useEffect } from "react";
import {
  Account,
  PublicKey,
  sendAndConfirmRawTransaction,
  SystemProgram,
  Transaction,
  TransactionInstruction,
} from '@solana/web3.js';

import {TokenInstructions} from '@project-serum/serum';
import BufferLayout from 'buffer-layout';
import {AccountLayout} from '@solana/spl-token';

import { Button, Card, Popover, Col, Row } from "antd";
import { NumericInput } from "./numericInput";
import { Settings } from "./settings";
import { SettingOutlined } from "@ant-design/icons";
import { AppBar } from "./appBar";
import contract_keys from "../contract_keys.json";


import { useMint } from '../utils/accounts';
import { useConnection } from '../utils/connection';
import { useWallet } from '../utils/wallet';


const PROGRAM_ID = new PublicKey(contract_keys.omega_program_id);

console.log('PROGRAM_ID', PROGRAM_ID.toString());

const QUOTE_CURRENCY = "USDC";
const QUOTE_CURRENCY_MINT = new PublicKey(contract_keys.quote_mint_pk);

console.log('QUOTE_CURRENCY', QUOTE_CURRENCY, QUOTE_CURRENCY_MINT.toString());

const CONTRACT_NAME = contract_keys.contract_name;
const OMEGA_CONTRACT = new PublicKey(contract_keys.omega_contract_pk);
const OMEGA_QUOTE_VAULT = new PublicKey(contract_keys.quote_vault_pk);

console.log('MARKET', CONTRACT_NAME, OMEGA_QUOTE_VAULT.toString());


/* INSTRUCTIONS
 * define buffer layouts and factory functions
 */

const MAX_OUTCOMES = 2;
const DETAILS_BUFFER_LEN = 2048;
const marketContractLayout = BufferLayout.struct([
  BufferLayout.nu64('flags'),
  BufferLayout.blob(32, 'oracle'),
  BufferLayout.blob(32, 'quote_mint'),
  BufferLayout.nu64('exp_time'),
  BufferLayout.blob(32, 'vault'),
  BufferLayout.blob(32, 'signer_key'),
  BufferLayout.nu64('signer_nonce'),
  BufferLayout.blob(32, 'winner'),
  BufferLayout.blob(32, 'outcome0'),
  BufferLayout.blob(32, 'outcome1'),
  BufferLayout.nu64('num_outcomes'),
  BufferLayout.blob(DETAILS_BUFFER_LEN, 'details')
]);


async function queryMarketContract(conn) {
  const accountInfo = await conn.getParsedAccountInfo(OMEGA_CONTRACT, 'singleGossip');

  const result = marketContractLayout.decode(Buffer.from(accountInfo.value.data));
  console.log('QUERY', CONTRACT_NAME, result);
  return result;
};



const IC_ISSUE_SET = 1;
const IC_REDEEM_SET = 2;
const IC_REDEEM_WINNER = 3;

const instructionLayout = BufferLayout.struct([
  BufferLayout.u32('instruction'),
  BufferLayout.nu64('quantity'),
]);

function encodeInstructionData(layout, args) {
  let data = Buffer.alloc(1024);
  const encodeLength = layout.encode(args, data);
  return data.slice(0, encodeLength);
}

function IssueSetInstruction(omegaContract, user, userQuote, vault, omegaSigner, outcomePks, quantity) {
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

function RedeemSetInstruction(omegaContract, user, userQuote, vault, omegaSigner, outcomePks, quantity) {
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
    instruction: IC_REDEEM_SET,
    quantity
  });

  return new TransactionInstruction({keys: keys, programId: PROGRAM_ID, data: data});
}

function RedeemWinnerInstruction(omegaContract, user, userQuote, vault, omegaSigner, winnerMint, winnerWallet, quantity) {
  let keys = [
    { pubkey: omegaContract, isSigner: false, isWritable: false },
    { pubkey: user, isSigner: true, isWritable: false },
    { pubkey: userQuote, isSigner: false, isWritable: true },
    { pubkey: vault, isSigner: false, isWritable: true },
    { pubkey: TokenInstructions.TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
    { pubkey: omegaSigner, isSigner: false, isWritable: false },
    { pubkey: winnerMint, isSigner: false, isWritable: true},
    { pubkey: winnerWallet, isSigner: false, isWritable: true},
  ];

  const data = encodeInstructionData(instructionLayout, {
    instruction: IC_REDEEM_WINNER,
    quantity
  });

  return new TransactionInstruction({keys: keys, programId: PROGRAM_ID, data: data});
}

/* utils */
async function signTransaction(
    transaction,
    wallet,
    signers,
    connection
) {
  transaction.recentBlockhash = (await connection.getRecentBlockhash('max')).blockhash;
  transaction.setSigners(wallet.publicKey, ...signers.map((s) => s.publicKey));
  if (signers.length > 0) {
    transaction.partialSign(...signers);
  }
  let res = await wallet.signTransaction(transaction);
  return res;
}

async function sendTransaction(
    transaction,
    wallet,
    signers,
    connection
) {

  const signedTransaction = await signTransaction(transaction, wallet, signers, connection);
  return await sendSignedTransaction(signedTransaction, connection);
}

const getUnixTs = () => {
  return new Date().getTime() / 1000;
};

async function sendSignedTransaction(
    signedTransaction,
    connection
) {
  const rawTransaction = signedTransaction.serialize();
  return await sendAndConfirmRawTransaction(connection, rawTransaction, {skipPreflight: true, commitment: "singleGossip"})
}


export const RedeemView = (props) => {

  let connection = useConnection();
  const { wallet, connected } = useWallet();
  const quoteMint = useMint(contract_keys.quote_mint_pk);
  const [contractData, setContractData] = useState({
    exp_time: 1612137600 // 02/01/2021 00:00 UTC
  });

  // TODO: test once we have a demo contract deployed
  useEffect(() => {
    async function fetchContractData() {
      let data = await queryMarketContract(connection);
      let winner = new PublicKey(data.winner);
      let zeroPubkey = new PublicKey(new Uint8Array(32));
      data['decided'] = !winner.equals(zeroPubkey);
      setContractData(data);
    };
    fetchContractData();
  }, [connection]);
  useEffect(() => {
    console.log('contract.exp_time', new Date(contractData.exp_time * 1000));
    console.log('contract.decided', contractData.decided);
  }, [contractData]);


  async function fetchAccounts() {
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

  async function createTokenAccountTransaction(mintPubkey) {
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

  async function userTokenAccount(accounts, mintPubkey) {
    let account = accounts.find(a => a.account.data.parsed.info.mint === mintPubkey.toBase58())
    if (account) {
      console.log('account exists', mintPubkey.toString(), account.pubkey.toString());
      return account.pubkey;
    } else {
      console.log('creating new account for', mintPubkey.toString());
      let { transaction, signer, newAccountPubkey } = await createTokenAccountTransaction(mintPubkey);

      let txid = await sendTransaction(transaction, wallet, [signer], connection);
      console.log("txid", txid);
      console.log('pubkey', newAccountPubkey.toString());

      return newAccountPubkey;
    }
  }

  function parseAmount(amount) {
    return parseFloat(amount) * Math.pow(10, quoteMint.decimals);
  }

  async function issueSet(amount) {

    if (!wallet.connected) await wallet.connect();
    console.log('issueSet', amount);

    const accounts = await fetchAccounts();

    let omegaSigner = new PublicKey(contract_keys.signer_pk);
    let userQuote = await userTokenAccount(accounts, QUOTE_CURRENCY_MINT);
    let outcomePks = [];
    let outcomeInfos = contract_keys["outcomes"];
    let numOutcomes = outcomeInfos.length;
    for (let i = 0; i < numOutcomes; i++) {
      let outcomeMint = new PublicKey(outcomeInfos[i]["mint_pk"]);
      outcomePks.push(outcomeMint);
      let userOutcomeWallet = await userTokenAccount(accounts, outcomeMint);
      outcomePks.push(userOutcomeWallet);
      console.log(outcomeInfos[i]["name"], outcomeMint, userOutcomeWallet);
    }
    let issueSetInstruction = IssueSetInstruction(OMEGA_CONTRACT, wallet.publicKey, userQuote, OMEGA_QUOTE_VAULT,
        omegaSigner, outcomePks, amount);
    let transaction = new Transaction();
    transaction.add(issueSetInstruction);

    let txid = await sendTransaction(transaction, wallet, [], connection);
    console.log('success txid:', txid);
  }

  async function redeemSet(amount) {
    if (!wallet.connected) await wallet.connect();
    console.log('redeemSet', amount);
    const accounts = await fetchAccounts();

    let omegaSigner = new PublicKey(contract_keys.signer_pk);
    let userQuote = await userTokenAccount(accounts, QUOTE_CURRENCY_MINT);
    let outcomePks = [];
    let outcomeInfos = contract_keys["outcomes"];
    let numOutcomes = outcomeInfos.length;
    for (let i = 0; i < numOutcomes; i++) {
      let outcomeMint = new PublicKey(outcomeInfos[i]["mint_pk"]);
      outcomePks.push(outcomeMint);
      let userOutcomeWallet = await userTokenAccount(accounts, outcomeMint);
      outcomePks.push(userOutcomeWallet);
      console.log(outcomeInfos[i]["name"], outcomeMint, userOutcomeWallet);
    }
    let redeemSetInstruction = RedeemSetInstruction(OMEGA_CONTRACT, wallet.publicKey, userQuote, OMEGA_QUOTE_VAULT,
        omegaSigner, outcomePks, amount);
    let transaction = new Transaction();
    transaction.add(redeemSetInstruction);

    let txid = await sendTransaction(transaction, wallet, [], connection);
    console.log('success txid:', txid);
  }

  async function redeemWinner(amount) {
    if (!wallet.connected) await wallet.connect();
    console.log('redeemWinner', amount);

    const accounts = await fetchAccounts();
    let winner = new PublicKey(contractData.winner);
    console.log(winner);
    let zeroPubkey = new PublicKey(new Uint8Array(32));

    if (winner === zeroPubkey) {
      console.log("Contract has not been resolved yet");
      return;
    }

    let winnerWallet = await userTokenAccount(accounts, winner);
    let userQuote = await userTokenAccount(accounts, QUOTE_CURRENCY_MINT);
    let omegaSigner = new PublicKey(contract_keys.signer_pk);

    let redeemWinnerInstruction = RedeemWinnerInstruction(OMEGA_CONTRACT, wallet.publicKey, userQuote,
        OMEGA_QUOTE_VAULT, omegaSigner, winner, winnerWallet, amount);


    let transaction = new Transaction();
    transaction.add(redeemWinnerInstruction);

    let txid = await sendTransaction(transaction, wallet, [], connection);
    console.log('success txid:', txid);

  }


  const colStyle = { padding: "0.5em", width: 256+128 };


  const [winnerAmount, setWinnerAmount] = useState("");
  const [redeemAmount, setRedeemAmount] = useState("");
  const [issueAmount, setIssueAmount] = useState("");


  return (
    <>
      <AppBar
        right={
          <Popover
            placement="topRight"
            title="Settings"
            content={<Settings />}
            trigger="click"
          >
            <Button
              shape="circle"
              size="large"
              type="text"
              icon={<SettingOutlined />}
            />
          </Popover>
        }
      />
      <Row justify="center">
        <Col>
          <div style={colStyle}>
            <Card>
              <h2>Redeem Winner</h2>
              <p>After the oracle has resolved the contract, you may redeem the winning token for equal quantities of USDC.</p>
              <NumericInput
                value={winnerAmount}
                onChange={setWinnerAmount}
                style={{
                  "margin-bottom": 10,
                }}
                placeholder="0.00"
                disabled={!contractData.decided}
              />

              <Button
                className="trade-button"
                type="primary"
                onClick={connected ?  () => redeemWinner(parseAmount(winnerAmount)) : wallet.connect}
                style={{ width: "100%" }}
                disabled={!contractData.decided}
              >
                { connected ? "Redeem Tokens" : "Connect Wallet" }

              </Button>
            </Card>
          </div>
        </Col>
        <Col>
          <div style={colStyle}>
            <Card>
              <h2>Redeem Set</h2>
              <p>Swap {contract_keys.contract_name} {contract_keys.outcomes[0].name} and {contract_keys.contract_name} {contract_keys.outcomes[1].name} for equal quantities of USDC.</p>
              <NumericInput
                value={redeemAmount}
                onChange={setRedeemAmount}
                style={{
                  "margin-bottom": 10,
                }}
                addonAfter={`${contract_keys.outcomes[0].name} & ${contract_keys.outcomes[1].name}`}
                placeholder="0.00"
              />
              <Button
                className="trade-button"
                type="primary"
                onClick={connected ?  () => redeemSet(parseAmount(redeemAmount)) : wallet.connect}
                style={{ width: "100%" }}
              >
                { connected ? "Redeem Tokens" : "Connect Wallet" }

              </Button>
            </Card> 
          </div>
        </Col>
        <Col>
          <div style={colStyle}>
            <Card>
              <h2>Issue Set</h2>
              <p>Swap USDC for equal quantities of {contract_keys.contract_name} {contract_keys.outcomes[0].name} and {contract_keys.contract_name} {contract_keys.outcomes[1].name} tokens.</p>
              <NumericInput
                value={issueAmount}
                onChange={setIssueAmount}
                style={{
                  "margin-bottom": 10,
                }}
                addonAfter="USDC"
                placeholder="0.00"
              />
              <Button
                className="trade-button"
                type="primary"
                onClick={connected ? () => issueSet(parseAmount(issueAmount)) : wallet.connect}
                style={{ width: "100%" }}
              >
                { connected ? "Issue Tokens" : "Connect Wallet" }

              </Button>

            </Card> 
          </div>
        </Col>
      </Row>
    </>
  );
};
