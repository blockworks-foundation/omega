import { useCallback, useState } from "react";
import { MintInfo } from "@solana/spl-token";

import { PoolInfo, TokenAccount } from "./../models";

import contract_keys from "../contract_keys.json";

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
