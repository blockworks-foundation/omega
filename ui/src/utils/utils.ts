import { useCallback, useState } from "react";
import { MintInfo } from "@solana/spl-token";

import { PoolInfo, TokenAccount } from "./../models";

import contract_keys from "../contract_keys.json";
import {
  Account, Commitment,
  Connection, RpcResponseAndContext,
  sendAndConfirmRawTransaction,
  SimulatedTransactionResponse,
  Transaction,
  TransactionSignature
} from "@solana/web3.js";
import Wallet from "@project-serum/sol-wallet-adapter";
import {notify} from "./notifications";

export interface KnownToken {
  tokenSymbol: string;
  tokenName: string;
  icon: string;
  mintAddress: string;
}

export type KnownTokenMap = Map<string, KnownToken>;

export function useLocalStorageState(key: string, defaultState?: string) {
  const [state, setState] = useState(() => {
    // NOTE: Not sure if this is ok
    const storedState = localStorage.getItem(key);
    if (storedState) {
      return JSON.parse(storedState);
    }
    return defaultState;
  });

  const setLocalStorageState = useCallback(
    (newState) => {
      const changed = state !== newState;
      if (!changed) {
        return;
      }
      setState(newState);
      if (newState === null) {
        localStorage.removeItem(key);
      } else {
        localStorage.setItem(key, JSON.stringify(newState));
      }
    },
    [state, key]
  );

  return [state, setLocalStorageState];
}

// shorten the checksummed version of the input address to have 4 characters at start and end
export function shortenAddress(address: string, chars = 4): string {
  return `${address.slice(0, chars)}...${address.slice(-chars)}`;
}

export function getTokenName(
  map: KnownTokenMap,
  mintAddress: string,
  shorten = true,
  length = 5
): string {
  const knownSymbol = map.get(mintAddress)?.tokenSymbol;
  if (knownSymbol) {
    return knownSymbol;
  }

  if (mintAddress === contract_keys.quote_mint_pk) {
    return "USDC";
  }

  return shorten ? `${mintAddress.substring(0, length)}...` : mintAddress;
}

export function getTokenIcon(
  map: KnownTokenMap,
  mintAddress: string
): string | undefined {
  return map.get(mintAddress)?.icon;
}

export function getPoolName(
  map: KnownTokenMap,
  pool: PoolInfo,
  shorten = true
) {
  const sorted = pool.pubkeys.holdingMints.map((a) => a.toBase58()).sort();
  return sorted.map((item) => getTokenName(map, item, shorten)).join("/");
}

export function isKnownMint(map: KnownTokenMap, mintAddress: string) {
  return !!map.get(mintAddress);
}

export const STABLE_COINS = new Set(["USDC", "wUSDC", "USDT"]);

export function chunks<T>(array: T[], size: number): T[][] {
  return Array.apply<number, T[], T[][]>(
    0,
    new Array(Math.ceil(array.length / size))
  ).map((_, index) => array.slice(index * size, (index + 1) * size));
}

export function convert(
  account?: TokenAccount | number,
  mint?: MintInfo,
  rate: number = 1.0
): number {
  if (!account) {
    return 0;
  }

  const amount =
    typeof account === "number" ? account : account.info.amount?.toNumber();

  const precision = Math.pow(10, mint?.decimals || 0);
  return (amount / precision) * rate;
}

var SI_SYMBOL = ["", "k", "M", "G", "T", "P", "E"];

const abbreviateNumber = (number: number, precision: number) => {
  let tier = (Math.log10(number) / 3) | 0;
  let scaled = number;
  let suffix = SI_SYMBOL[tier];
  if (tier !== 0) {
    let scale = Math.pow(10, tier * 3);
    scaled = number / scale;
  }

  return scaled.toFixed(precision) + suffix;
};

const format = (val: number, precision: number, abbr: boolean) =>
  abbr ? abbreviateNumber(val, precision) : val.toFixed(precision);

export function formatTokenAmount(
  account?: TokenAccount,
  mint?: MintInfo,
  rate: number = 1.0,
  prefix = "",
  suffix = "",
  precision = 6,
  abbr = false
): string {
  if (!account) {
    return "";
  }

  return `${[prefix]}${format(
    convert(account, mint, rate),
    precision,
    abbr
  )}${suffix}`;
}

export const formatUSD = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
});

export const formatNumber = new Intl.NumberFormat("en-US", {
  style: "decimal",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

export const formatPct = new Intl.NumberFormat("en-US", {
  style: "percent",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

export const formatPriceNumber = new Intl.NumberFormat("en-US", {
  style: "decimal",
  minimumFractionDigits: 2,
  maximumFractionDigits: 8,
});

// returns a Color from a 4 color array, green to red, depending on the index
// of the closer (up) checkpoint number from the value
export const colorWarning = (value = 0, valueCheckpoints = [1, 3, 5, 100]) => {
  const defaultIndex = 1;
  const colorCodes = ["#27ae60", "inherit", "#f3841e", "#ff3945"];
  if (value > valueCheckpoints[valueCheckpoints.length - 1]) {
    return colorCodes[defaultIndex];
  }
  const closest = [...valueCheckpoints].sort((a, b) => {
    const first = a - value < 0 ? Number.POSITIVE_INFINITY : a - value;
    const second = b - value < 0 ? Number.POSITIVE_INFINITY : b - value;
    if (first < second) {
      return -1;
    } else if (first > second) {
      return 1;
    }
    return 0;
  })[0];
  const index = valueCheckpoints.indexOf(closest);
  if (index !== -1) {
    return colorCodes[index];
  }
  return colorCodes[defaultIndex];
};


const DEFAULT_TIMEOUT = 15000;

export async function sendTransaction({
                                        transaction,
                                        wallet,
                                        signers = [],
                                        connection,
                                        sendingMessage = 'Sending transaction...',
                                        sentMessage = 'Transaction sent',
                                        successMessage = 'Transaction confirmed',
                                        timeout = DEFAULT_TIMEOUT,
                                      }: {
  transaction: Transaction;
  wallet: any;
  signers?: Array<Account>;
  connection: Connection;
  sendingMessage?: string;
  sentMessage?: string;
  successMessage?: string;
  timeout?: number;
}) {
  const signedTransaction = await signTransaction({
    transaction,
    wallet,
    signers,
    connection,
  });
  return await sendSignedTransaction({
    signedTransaction,
    connection,
    sendingMessage,
    sentMessage,
    successMessage,
    timeout,
  });
}

export async function signTransaction({
                                        transaction,
                                        wallet,
                                        signers = [],
                                        connection,
                                      }: {
  transaction: Transaction;
  wallet: any;
  signers?: Array<Account>;
  connection: Connection;
}) {
  transaction.recentBlockhash = (
    await connection.getRecentBlockhash('max')
  ).blockhash;
  transaction.setSigners(wallet.publicKey, ...signers.map((s) => s.publicKey));
  if (signers.length > 0) {
    transaction.partialSign(...signers);
  }
  return await wallet.signTransaction(transaction);
}

export async function signTransactions({
                                         transactionsAndSigners,
                                         wallet,
                                         connection,
                                       }: {
  transactionsAndSigners: {
    transaction: Transaction;
    signers?: Array<Account>;
  }[];
  wallet: any;
  connection: Connection;
}) {
  const blockhash = (await connection.getRecentBlockhash('max')).blockhash;
  transactionsAndSigners.forEach(({ transaction, signers = [] }) => {
    transaction.recentBlockhash = blockhash;
    transaction.setSigners(
      wallet.publicKey,
      ...signers.map((s) => s.publicKey),
    );
    if (signers?.length > 0) {
      transaction.partialSign(...signers);
    }
  });
  return await wallet.signAllTransactions(
    transactionsAndSigners.map(({ transaction }) => transaction),
  );
}

export const getUnixTs = () => {
  return new Date().getTime() / 1000;
};

export async function sendSignedTransaction({
                                              signedTransaction,
                                              connection,
                                              sendingMessage = 'Sending transaction...',
                                              sentMessage = 'Transaction sent',
                                              successMessage = 'Transaction confirmed',
                                              timeout = DEFAULT_TIMEOUT,
                                            }: {
  signedTransaction: Transaction;
  connection: Connection;
  sendingMessage?: string;
  sentMessage?: string;
  successMessage?: string;
  timeout?: number;
}): Promise<string> {
  const rawTransaction = signedTransaction.serialize();
  const startTime = getUnixTs();
  notify({ message: sendingMessage });
  const txid: TransactionSignature = await connection.sendRawTransaction(
    rawTransaction,
    {
      skipPreflight: true,
    },
  );
  notify({ message: sentMessage, type: 'success', txid });

  console.log('Started awaiting confirmation for', txid);

  let done = false;
  (async () => {
    while (!done && getUnixTs() - startTime < timeout) {
      connection.sendRawTransaction(rawTransaction, {
        skipPreflight: true,
      });
      await sleep(300);
    }
  })();
  try {
    await awaitTransactionSignatureConfirmation(txid, timeout, connection);
  } catch (err) {
    if (err.timeout) {
      throw new Error('Timed out awaiting confirmation on transaction');
    }
    let simulateResult: SimulatedTransactionResponse | null = null;
    try {
      simulateResult = (
        await simulateTransaction(connection, signedTransaction, 'single')
      ).value;
    } catch (e) {}
    if (simulateResult && simulateResult.err) {
      if (simulateResult.logs) {
        for (let i = simulateResult.logs.length - 1; i >= 0; --i) {
          const line = simulateResult.logs[i];
          if (line.startsWith('Program log: ')) {
            throw new Error(
              'Transaction failed: ' + line.slice('Program log: '.length),
            );
          }
        }
      }
      throw new Error(JSON.stringify(simulateResult.err));
    }
    throw new Error('Transaction failed');
  } finally {
    done = true;
  }
  notify({ message: successMessage, type: 'success', txid });

  console.log('Latency', txid, getUnixTs() - startTime);
  return txid;
}

async function awaitTransactionSignatureConfirmation(
  txid: TransactionSignature,
  timeout: number,
  connection: Connection,
) {
  let done = false;
  const result = await new Promise((resolve, reject) => {
    (async () => {
      setTimeout(() => {
        if (done) {
          return;
        }
        done = true;
        console.log('Timed out for txid', txid);
        reject({ timeout: true });
      }, timeout);
      try {
        connection.onSignature(
          txid,
          (result) => {
            console.log('WS confirmed', txid, result);
            done = true;
            if (result.err) {
              reject(result.err);
            } else {
              resolve(result);
            }
          },
          'recent',
        );
        console.log('Set up WS connection', txid);
      } catch (e) {
        done = true;
        console.log('WS error in setup', txid, e);
      }
      while (!done) {
        // eslint-disable-next-line no-loop-func
        (async () => {
          try {
            const signatureStatuses = await connection.getSignatureStatuses([
              txid,
            ]);
            const result = signatureStatuses && signatureStatuses.value[0];
            if (!done) {
              if (!result) {
                console.log('REST null result for', txid, result);
              } else if (result.err) {
                console.log('REST error for', txid, result);
                done = true;
                reject(result.err);
              } else if (!result.confirmations) {
                console.log('REST no confirmations for', txid, result);
              } else {
                console.log('REST confirmation for', txid, result);
                done = true;
                resolve(result);
              }
            }
          } catch (e) {
            if (!done) {
              console.log('REST connection error: txid', txid, e);
            }
          }
        })();
        await sleep(300);
      }
    })();
  });
  done = true;
  return result;
}

function mergeTransactions(transactions: (Transaction | undefined)[]) {
  const transaction = new Transaction();
  transactions
    .filter((t): t is Transaction => t !== undefined)
    .forEach((t) => {
      transaction.add(t);
    });
  return transaction;
}


export async function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}


/** Copy of Connection.simulateTransaction that takes a commitment parameter. */
async function simulateTransaction(
  connection: Connection,
  transaction: Transaction,
  commitment: Commitment,
): Promise<RpcResponseAndContext<SimulatedTransactionResponse>> {
  // @ts-ignore
  transaction.recentBlockhash = await connection._recentBlockhash(
    // @ts-ignore
    connection._disableBlockhashCaching,
  );

  const signData = transaction.serializeMessage();
  // @ts-ignore
  const wireTransaction = transaction._serialize(signData);
  const encodedTransaction = wireTransaction.toString('base64');
  const config: any = { encoding: 'base64', commitment };
  const args = [encodedTransaction, config];

  // @ts-ignore
  const res = await connection._rpcRequest('simulateTransaction', args);
  if (res.error) {
    throw new Error('failed to simulate transaction: ' + res.error.message);
  }
  return res.result;
}
