import React, {
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import {
  calculateDependentAmount,
  usePoolForBasket,
  PoolOperation,
} from "./pools";
import { useMint, useAccountByMint } from "./accounts";
import { MintInfo } from "@solana/spl-token";
import { useConnection, useConnectionConfig } from "./connection";
import { TokenAccount } from "../models";
import { convert, getTokenIcon, getTokenName, KnownToken } from "./utils";
import { useLocation } from "react-router-dom";
import bs58 from "bs58";

import contract_keys from "../contract_keys.json";

export interface CurrencyContextState {
  mintAddress: string;
  account?: TokenAccount;
  mint?: MintInfo;
  amount: string;
  name: string;
  icon?: string;
  setAmount: (val: string) => void;
  setMint: (mintAddress: string) => void;
  convertAmount: () => number;
  sufficientBalance: () => boolean;
}

export interface CurrencyPairContextState {
  A: CurrencyContextState;
  B: CurrencyContextState;
  lastTypedAccount: string;
  setLastTypedAccount: (mintAddress: string) => void;
  setPoolOperation: (swapDirection: PoolOperation) => void;
}

const CurrencyPairContext = React.createContext<CurrencyPairContextState | null>(
  null
);

export const convertAmount = (amount: string, mint?: MintInfo) => {
  return parseFloat(amount) * Math.pow(10, mint?.decimals || 0);
};

export const useCurrencyLeg = (defaultMint?: string) => {
  const { tokenMap } = useConnectionConfig();
  const [amount, setAmount] = useState("");
  const [mintAddress, setMintAddress] = useState(defaultMint || "");
  const account = useAccountByMint(mintAddress);
  const mint = useMint(mintAddress);

  return useMemo(
    () => ({
      mintAddress: mintAddress,
      account: account,
      mint: mint,
      amount: amount,
      name: getTokenName(tokenMap, mintAddress),
      icon: getTokenIcon(tokenMap, mintAddress),
      setAmount: setAmount,
      setMint: setMintAddress,
      convertAmount: () => convertAmount(amount, mint),
      sufficientBalance: () =>
        account !== undefined && convert(account, mint) >= parseFloat(amount),
    }),
    [mintAddress, account, mint, amount, tokenMap, setAmount, setMintAddress]
  );
};

export function CurrencyPairProvider({
    baseMintAddress = "" as string,
    quoteMintAddress = "" as string,
    children = null as any }) {
  const connection = useConnection();
  const { tokens } = useConnectionConfig();

  const location = useLocation();
  const [lastTypedAccount, setLastTypedAccount] = useState("");
  const [poolOperation, setPoolOperation] = useState<PoolOperation>(
    PoolOperation.Add
  );

  const base = useCurrencyLeg(baseMintAddress);
  const mintAddressA = base.mintAddress;
  const setMintAddressA = base.setMint;
  const amountA = base.amount;
  const setAmountA = base.setAmount;

  const quote = useCurrencyLeg(quoteMintAddress);
  const mintAddressB = quote.mintAddress;
  const setMintAddressB = quote.setMint;
  const amountB = quote.amount;
  const setAmountB = quote.setAmount;

  const pool = usePoolForBasket([base.mintAddress, quote.mintAddress]);


  // disabled: doesn't work well with multiple swaps on the same page
  // updates browser history on token changes
  //useEffect(() => {
    //// set history
    //const base =
      //tokens.find((t) => t.mintAddress === mintAddressA)?.tokenSymbol ||
      //mintAddressA;
    //const quote =
      //tokens.find((t) => t.mintAddress === mintAddressB)?.tokenSymbol ||
      //mintAddressB;

    //if (base && quote && location.pathname.indexOf("info") < 0) {
      //history.push({
        //search: `?pair=${base}-${quote}`,
      //});
    //} else {
      //if (mintAddressA && mintAddressB) {
        //history.push({
          //search: ``,
        //});
      //} else {
        //return;
      //}
    //}
  //}, [mintAddressA, mintAddressB, tokens, history, location.pathname]);

  // Updates tokens on location change
  useEffect(() => {
    if (!location.search && mintAddressA && mintAddressB) {
      return;
    }

    let { defaultBase, defaultQuote } = getDefaultTokens(
      tokens,
      location.search
    );
    if (!defaultBase || !defaultQuote) {
      return;
    }

    setMintAddressA(
      tokens.find((t) => t.tokenSymbol === defaultBase)?.mintAddress ||
        (isValidAddress(defaultBase) ? defaultBase : "") ||
        ""
    );
    setMintAddressB(
      tokens.find((t) => t.tokenSymbol === defaultQuote)?.mintAddress ||
        (isValidAddress(defaultQuote) ? defaultQuote : "") ||
        ""
    );
    // mintAddressA and mintAddressB are not included here to prevent infinite loop
    // eslint-disable-next-line
  }, [location, location.search, setMintAddressA, setMintAddressB, tokens]);

  const calculateDependent = useCallback(async () => {
    if (pool && mintAddressA && mintAddressB) {
      let setDependent;
      let amount;
      let independent;
      if (lastTypedAccount === mintAddressA) {
        independent = mintAddressA;
        setDependent = setAmountB;
        amount = parseFloat(amountA);
      } else {
        independent = mintAddressB;
        setDependent = setAmountA;
        amount = parseFloat(amountB);
      }

      const result = await calculateDependentAmount(
        connection,
        independent,
        amount,
        pool,
        poolOperation
      );

      console.log('calculateDependent', amount, result, independent);
      if (typeof result === "string") {
        setDependent(result);
      } else if (result !== undefined && Number.isFinite(result)) {
        setDependent(result.toFixed(6));
      } else {
        setDependent("");
      }
    }
  }, [
    pool,
    mintAddressA,
    mintAddressB,
    setAmountA,
    setAmountB,
    amountA,
    amountB,
    connection,
    lastTypedAccount,
    poolOperation,
  ]);

  useEffect(() => {
    calculateDependent();
  }, [amountB, amountA, lastTypedAccount, calculateDependent]);

  return (
    <CurrencyPairContext.Provider
      value={{
        A: base,
        B: quote,
        lastTypedAccount,
        setLastTypedAccount,
        setPoolOperation,
      }}
    >
      {children}
    </CurrencyPairContext.Provider>
  );
}

export const useCurrencyPairState = () => {
  const context = useContext(CurrencyPairContext);
  return context as CurrencyPairContextState;
};

const isValidAddress = (address: string) => {
  try {
    const decoded = bs58.decode(address);
    return decoded.length === 32;
  } catch {
    return false;
  }
};

function getDefaultTokens(tokens: KnownToken[], search: string) {
  let defaultBase = contract_keys.outcomes[0].name;
  let defaultQuote = contract_keys.outcomes[1].name;

  const nameToToken = tokens.reduce((map, item) => {
    map.set(item.tokenSymbol, item);
    return map;
  }, new Map<string, any>());

  if (search) {
    const urlParams = new URLSearchParams(search);
    const pair = urlParams.get("pair");
    if (pair) {
      let items = pair.split("-");

      if (items.length > 1) {
        if (nameToToken.has(items[0]) || isValidAddress(items[0])) {
          defaultBase = items[0];
        }

        if (nameToToken.has(items[1]) || isValidAddress(items[1])) {
          defaultQuote = items[1];
        }
      }
    }
  }
  return {
    defaultBase,
    defaultQuote,
  };
}
