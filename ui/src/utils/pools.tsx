import {
  Account, AccountInfo,
  Connection,
  PublicKey,
  SystemProgram, Transaction,
  TransactionInstruction,
} from "@solana/web3.js";
import { useConnection } from "./connection";
import { useEffect, useMemo, useState } from "react";
import { Token, MintLayout, AccountLayout } from "@solana/spl-token";
import { notify } from "./notifications";
import {
  cache,
  getCachedAccount,
  useUserAccounts,
  useCachedPool, precacheUserTokenAccounts,
} from "./accounts";
import {
  programIds,
  SWAP_HOST_FEE_ADDRESS, SWAP_POOL_OWNERS,
  SWAP_PROGRAM_OWNER_FEE_ADDRESS,
  WRAPPED_SOL_MINT,
} from "./ids";
import {
  LiquidityComponent,
  PoolInfo,
  TokenAccount,
  createInitSwapInstruction,
  TokenSwapLayout,
  depositInstruction,
  withdrawInstruction,
  TokenSwapLayoutLegacyV0,
  swapInstruction,
  PoolConfig,
} from "./../models";
import { sendTransaction } from "./utils";
import { rejects } from "assert";

const LIQUIDITY_TOKEN_PRECISION = 8;

export const LIQUIDITY_PROVIDER_FEE = 0.01;
export const SERUM_FEE = 0.0005;   // TODO check if we can make this 0

export const removeLiquidity = async (
  connection: Connection,
  wallet: any,
  liquidityAmount: number,
  account: TokenAccount,
  pool?: PoolInfo
) => {
  if (!pool) {
    return;
  }

  notify({
    message: "Removing Liquidity...",
    description: "Please review transactions to approve.",
    type: "warn",
  });

  // TODO get min amounts based on total supply and liquidity
  const minAmount0 = 0;
  const minAmount1 = 0;

  const poolMint = await cache.queryMint(connection, pool.pubkeys.mint);
  const accountA = await cache.queryAccount(
    connection,
    pool.pubkeys.holdingAccounts[0]
  );
  const accountB = await cache.queryAccount(
    connection,
    pool.pubkeys.holdingAccounts[1]
  );
  if (!poolMint.mintAuthority) {
    throw new Error("Mint doesnt have authority");
  }
  const authority = poolMint.mintAuthority;

  const signers: Account[] = [];
  const instructions: TransactionInstruction[] = [];
  const cleanupInstructions: TransactionInstruction[] = [];

  const accountRentExempt = await connection.getMinimumBalanceForRentExemption(
    AccountLayout.span
  );

  // TODO: check if one of to accounts needs to be native sol ... if yes unwrap it ...
  const toAccounts: PublicKey[] = [
    await findOrCreateAccountByMint(
      wallet.publicKey,
      wallet.publicKey,
      instructions,
      cleanupInstructions,
      accountRentExempt,
      accountA.info.mint,
      signers
    ),
    await findOrCreateAccountByMint(
      wallet.publicKey,
      wallet.publicKey,
      instructions,
      cleanupInstructions,
      accountRentExempt,
      accountB.info.mint,
      signers
    ),
  ];

  instructions.push(
    Token.createApproveInstruction(
      programIds().token,
      account.pubkey,
      authority,
      wallet.publicKey,
      [],
      liquidityAmount
    )
  );

  // withdraw
  instructions.push(
    withdrawInstruction(
      pool.pubkeys.account,
      authority,
      pool.pubkeys.mint,
      pool.pubkeys.feeAccount,
      account.pubkey,
      pool.pubkeys.holdingAccounts[0],
      pool.pubkeys.holdingAccounts[1],
      toAccounts[0],
      toAccounts[1],
      pool.pubkeys.program,
      programIds().token,
      liquidityAmount,
      minAmount0,
      minAmount1
    )
  );

  const deleteAccount = liquidityAmount === account.info.amount.toNumber();
  if (deleteAccount) {
    instructions.push(
      Token.createCloseAccountInstruction(
        programIds().token,
        account.pubkey,
        authority,
        wallet.publicKey,
        []
      )
    );
  }

  const transaction = new Transaction()
  instructions.concat(cleanupInstructions).forEach(
    (i) => (transaction.add(i))
  )

  const instrStr = 'remove liquidity transaction'
  let tx = await sendTransaction({
    transaction,
    wallet,
    signers,
    connection,
    sendingMessage: `sending ${instrStr}...`,
    sentMessage: `${instrStr} sent`,
    successMessage: `${instrStr} success`
  });

  if (deleteAccount) {
    cache.deleteAccount(account.pubkey);
  }

  notify({
    message: "Liquidity Returned. Thank you for your support.",
    type: "success",
    description: `Transaction - ${tx}`,
  });
};

export const swap = async (
  connection: Connection,
  wallet: any,
  components: LiquidityComponent[],
  SLIPPAGE: number,
  pool?: PoolInfo
) => {
  if (!pool || !components[0].account) {
    notify({
      type: "error",
      message: `Pool doesn't exsist.`,
      description: `Swap trade cancelled`,
    });
    return;
  }

  // Uniswap whitepaper: https://uniswap.org/whitepaper.pdf
  // see: https://uniswap.org/docs/v2/advanced-topics/pricing/
  // as well as native uniswap v2 oracle: https://uniswap.org/docs/v2/core-concepts/oracles/
  const amountIn = components[0].amount; // these two should include slippage
  const minAmountOut = components[1].amount * (1 - SLIPPAGE);
  const holdingA =
    pool.pubkeys.holdingMints[0]?.toBase58() ===
      components[0].account.info.mint.toBase58()
      ? pool.pubkeys.holdingAccounts[0]
      : pool.pubkeys.holdingAccounts[1];
  const holdingB =
    holdingA === pool.pubkeys.holdingAccounts[0]
      ? pool.pubkeys.holdingAccounts[1]
      : pool.pubkeys.holdingAccounts[0];

  const poolMint = await cache.queryMint(connection, pool.pubkeys.mint);
  if (!poolMint.mintAuthority || !pool.pubkeys.feeAccount) {
    throw new Error("Mint doesnt have authority");
  }
  const authority = poolMint.mintAuthority;

  const instructions: TransactionInstruction[] = [];
  const cleanupInstructions: TransactionInstruction[] = [];
  const signers: Account[] = [];

  const accountRentExempt = await connection.getMinimumBalanceForRentExemption(
    AccountLayout.span
  );

  const fromAccount = getWrappedAccount(
    instructions,
    cleanupInstructions,
    components[0].account,
    wallet.publicKey,
    amountIn + accountRentExempt,
    signers
  );

  let toAccount = findOrCreateAccountByMint(
    wallet.publicKey,
    wallet.publicKey,
    instructions,
    cleanupInstructions,
    accountRentExempt,
    new PublicKey(components[1].mintAddress),
    signers
  );

  // create approval for transfer transactions
  instructions.push(
    Token.createApproveInstruction(
      programIds().token,
      fromAccount,
      authority,
      wallet.publicKey,
      [],
      amountIn
    )
  );

  let hostFeeAccount = SWAP_HOST_FEE_ADDRESS
    ? findOrCreateAccountByMint(
      wallet.publicKey,
      SWAP_HOST_FEE_ADDRESS,
      instructions,
      cleanupInstructions,
      accountRentExempt,
      pool.pubkeys.mint,
      signers
    )
    : undefined;

  // swap
  instructions.push(
    swapInstruction(
      pool.pubkeys.account,
      authority,
      fromAccount,
      holdingA,
      holdingB,
      toAccount,
      pool.pubkeys.mint,
      pool.pubkeys.feeAccount,
      pool.pubkeys.program,
      programIds().token,
      amountIn,
      minAmountOut,
      hostFeeAccount
    )
  );

  const transaction = new Transaction()
  instructions.concat(cleanupInstructions).forEach(
    (i) => (transaction.add(i))
  )

  const instrStr = 'swap transaction'
  let tx = await sendTransaction({
    transaction,
    wallet,
    signers,
    connection,
    sendingMessage: `sending ${instrStr}...`,
    sentMessage: `${instrStr} sent`,
    successMessage: `${instrStr} success`
  });
  SWAP_POOL_OWNERS.forEach(o => {
    precacheUserTokenAccounts(connection, o);
  });
  notify({
    message: "Trade executed.",
    type: "success",
    description: `Transaction - ${tx}`,
  });
};

export const addLiquidity = async (
  connection: Connection,
  wallet: any,
  components: LiquidityComponent[],
  slippage: number,
  pool?: PoolInfo,
  options?: PoolConfig
) => {
  if (!pool) {
    if (!options) {
      throw new Error("Options are required to create new pool.");
    }

    await _addLiquidityNewPool(wallet, connection, components, options);
  } else {
    await _addLiquidityExistingPool(pool, components, connection, wallet);
  }
};

const getHoldings = (connection: Connection, accounts: string[]) => {
  return accounts.map((acc) =>
    cache.queryAccount(connection, new PublicKey(acc))
  );
};

const toPoolInfo = (item: any, program: PublicKey) => {
  const mint = new PublicKey(item.data.tokenPool);
  return {
    pubkeys: {
      account: item.pubkey,
      program: program,
      mint,
      holdingMints: [] as PublicKey[],
      holdingAccounts: [item.data.tokenAccountA, item.data.tokenAccountB].map(
        (a) => new PublicKey(a)
      ),
    },
    legacy: false,
    raw: item,
  } as PoolInfo;
};

export const usePools = () => {
  const connection = useConnection();
  const [pools, setPools] = useState<PoolInfo[]>([]);

  // initial query
  useEffect(() => {
    setPools([]);

    const queryPools = async (swapId: PublicKey, isLegacy = false) => {
      let poolsArray: PoolInfo[] = [];
      console.log('queryPools', swapId.toString());
      (await connection.getProgramAccounts(swapId))
        .filter(
          (item) =>
            item.account.data.length === TokenSwapLayout.span ||
            item.account.data.length === TokenSwapLayoutLegacyV0.span
        )
        .map((item) => {
          let result = {
            data: undefined as any,
            account: item.account,
            pubkey: item.pubkey,
            init: async () => { },
          };

          // handling of legacy layout can be removed soon...
          if (item.account.data.length === TokenSwapLayoutLegacyV0.span) {
            result.data = TokenSwapLayoutLegacyV0.decode(item.account.data);
            let pool = toPoolInfo(result, swapId);
            pool.legacy = isLegacy;
            poolsArray.push(pool as PoolInfo);

            result.init = async () => {
              try {
                // TODO: this is not great
                // Ideally SwapLayout stores hash of all the mints to make finding of pool for a pair easier
                const holdings = await Promise.all(
                  getHoldings(connection, [
                    result.data.tokenAccountA,
                    result.data.tokenAccountB,
                  ])
                );

                pool.pubkeys.holdingMints = [
                  holdings[0].info.mint,
                  holdings[1].info.mint,
                ] as PublicKey[];
              } catch (err) {
                console.log(err);
              }
            };
          } else {
            result.data = TokenSwapLayout.decode(item.account.data);
            let pool = toPoolInfo(result, swapId);
            pool.legacy = isLegacy;
            pool.pubkeys.feeAccount = new PublicKey(result.data.feeAccount);
            pool.pubkeys.holdingMints = [
              new PublicKey(result.data.mintA),
              new PublicKey(result.data.mintB),
            ] as PublicKey[];

            poolsArray.push(pool as PoolInfo);
          }

          return result;
        });

      const toQuery = poolsArray
        .map(
          (p) =>
            [
              ...p.pubkeys.holdingAccounts.map((h) => h.toBase58()),
              ...p.pubkeys.holdingMints.map((h) => h.toBase58()),
              p.pubkeys.feeAccount?.toBase58(), // used to calculate volume aproximation
              p.pubkeys.mint.toBase58(),
            ].filter((p) => p) as string[]
        )
        .flat();

      // This will pre-cache all accounts used by pools
      // All those accounts are updated whenever there is a change
      const keyedAccounts = await getMultipleAccounts(connection, toQuery)
      for (let i = 0; i < keyedAccounts.length; i++) {
        const ka = keyedAccounts[i]
        const pubKey = new PublicKey(ka.publicKey)
        if (ka.accountInfo.data.length === AccountLayout.span) {
          cache.addAccount(pubKey, ka.accountInfo)
        } else if (ka.accountInfo.data.length === MintLayout.span) {
          cache.addMint(pubKey, ka.accountInfo)
        }
      }
      return poolsArray;
    };

    console.log('queryPools', programIds());

    Promise.all([
      queryPools(programIds().swap),
      ...programIds().swap_legacy.map((leg) => queryPools(leg, true)),
    ]).then((all) => {
      setPools(all.flat());
    });
  }, [connection]);

  useEffect(() => {
    const subID = connection.onProgramAccountChange(
      programIds().swap,
      async (info) => {
        const id = (info.accountId as unknown) as string;
        if (info.accountInfo.data.length === TokenSwapLayout.span) {
          const account = info.accountInfo;
          const updated = {
            data: TokenSwapLayout.decode(account.data),
            account: account,
            pubkey: new PublicKey(id),
          };

          const index =
            pools &&
            pools.findIndex((p) => p.pubkeys.account.toBase58() === id);
          if (index && index >= 0 && pools) {
            // TODO: check if account is empty?

            const filtered = pools.filter((p, i) => i !== index);
            setPools([...filtered, toPoolInfo(updated, programIds().swap)]);
          } else {
            let pool = toPoolInfo(updated, programIds().swap);

            pool.pubkeys.feeAccount = new PublicKey(updated.data.feeAccount);
            pool.pubkeys.holdingMints = [
              new PublicKey(updated.data.mintA),
              new PublicKey(updated.data.mintB),
            ] as PublicKey[];

            setPools([...pools, pool]);
          }
        }
      },
      "singleGossip"
    );

    return () => {
      connection.removeProgramAccountChangeListener(subID);
    };
  }, [connection, pools]);

  return { pools };
};

async function getMultipleAccounts(
  connection: Connection,
  publicKeyStrs: string[]

): Promise<{ publicKey: string; accountInfo: AccountInfo<Buffer> }[]> {



  const filtPubkeys: string[] = []
  const filtData: any[] = []

  for (let i = 0; i < Math.ceil(publicKeyStrs.length / 100); i++) {

    let batchKeys = publicKeyStrs.slice(i * 100, Math.min((i + 1) * 100, publicKeyStrs.length));
    // @ts-ignore
    const resp = await connection._rpcRequest('getMultipleAccounts', [batchKeys]);
    if (resp.error) {
      throw new Error(resp.error.message);
    }
    for (let j = 0; j < resp.result.value.length; j++) {
      if (resp.result.value[j] === null) {
        console.log("NULL ACCOUNT", resp.result.value[j], batchKeys[j])
      } else {
        filtPubkeys.push(batchKeys[j])
        filtData.push(resp.result.value[j])
      }
    }
  }

  return filtData.map(
    // @ts-ignore
    ({ data, executable, lamports, owner }, i) => ({
      publicKey: filtPubkeys[i],
      accountInfo: {
        data: Buffer.from(data[0], 'base64'),
        executable,
        owner: new PublicKey(owner),
        lamports,
      },
    }),
  );

}

// Promisified usePoolForBasket
export const PoolForBasketPromise = async (mints: (string | undefined)[], connection: Connection, pools: PoolInfo[]): Promise<PoolInfo> => {
  return new Promise(async (resolve, reject) => {
    // Find pools mathing these mints
    let matchingPool = pools
      .filter((p) => !p.legacy)
      .filter((p) =>
        p.pubkeys.holdingMints
          .map((a) => a.toBase58())
          .sort()
          .every((address, i) => address === mints[i])
      );
    // Find first address with non-zero amount
    for (let i = 0; i < matchingPool.length; i++) {
      const p = matchingPool[i];

      const account = await cache.queryAccount(
        connection,
        p.pubkeys.holdingAccounts[0]
      )
      if (!account.info.amount.eqn(0)) {
        return resolve(p);
      }
    }
    return reject('No pool found');
  })
}

export const usePoolForBasket = (mints: (string | undefined)[]) => {
  const connection = useConnection();
  const { pools } = useCachedPool();
  const [pool, setPool] = useState<PoolInfo>();
  const sortedMints = useMemo(() => [...mints].sort(), [...mints]); // eslint-disable-line
  useEffect(() => {
    (async () => {
      // reset pool during query
      setPool(undefined);

      let matchingPool = pools
        .filter((p) => !p.legacy)
        .filter((p) =>
          p.pubkeys.holdingMints
            .map((a) => a.toBase58())
            .sort()
            .every((address, i) => address === sortedMints[i])
        );
      for (let i = 0; i < matchingPool.length; i++) {
        const p = matchingPool[i];

        const account = await cache.queryAccount(
          connection,
          p.pubkeys.holdingAccounts[0]
        );

        if (!account.info.amount.eqn(0)) {
          setPool(p);
          return;
        }
      }
    })();
  }, [connection, sortedMints, pools]);

  return pool;
};

export const useOwnedPools = () => {
  const { pools } = useCachedPool();
  const { userAccounts } = useUserAccounts();

  const ownedPools = useMemo(() => {
    const map = userAccounts.reduce((acc, item) => {
      const key = item.info.mint.toBase58();
      acc.set(key, [...(acc.get(key) || []), item]);
      return acc;
    }, new Map<string, TokenAccount[]>());

    return pools
      .filter((p) => map.has(p.pubkeys.mint.toBase58()))
      .map((item) => {
        let feeAccount = item.pubkeys.feeAccount?.toBase58();
        return map.get(item.pubkeys.mint.toBase58())?.map((a) => {
          return {
            account: a as TokenAccount,
            isFeeAccount: feeAccount === a.pubkey.toBase58(),
            pool: item,
          };
        }) as {
          account: TokenAccount;
          isFeeAccount: boolean;
          pool: PoolInfo;
        }[];
      })
      .flat();
  }, [pools, userAccounts]);

  return ownedPools;
};

// Allow for this much price movement in the pool before adding liquidity to the pool aborts
const SLIPPAGE = 0.005;

async function _addLiquidityExistingPool(
  pool: PoolInfo,
  components: LiquidityComponent[],
  connection: Connection,
  wallet: any
) {
  notify({
    message: "Adding Liquidity...",
    description: "Please review transactions to approve.",
    type: "warn",
  });

  const poolMint = await cache.queryMint(connection, pool.pubkeys.mint);
  if (!poolMint.mintAuthority) {
    throw new Error("Mint doesnt have authority");
  }

  if (!pool.pubkeys.feeAccount) {
    throw new Error("Invald fee account");
  }

  const accountA = await cache.queryAccount(
    connection,
    pool.pubkeys.holdingAccounts[0]
  );
  const accountB = await cache.queryAccount(
    connection,
    pool.pubkeys.holdingAccounts[1]
  );

  const reserve0 = accountA.info.amount.toNumber();
  const reserve1 = accountB.info.amount.toNumber();
  const fromA =
    accountA.info.mint.toBase58() === components[0].mintAddress
      ? components[0]
      : components[1];
  const fromB = fromA === components[0] ? components[1] : components[0];

  if (!fromA.account || !fromB.account) {
    throw new Error("Missing account info.");
  }

  const supply = poolMint.supply.toNumber();
  const authority = poolMint.mintAuthority;

  // Uniswap whitepaper: https://uniswap.org/whitepaper.pdf
  // see: https://uniswap.org/docs/v2/advanced-topics/pricing/
  // as well as native uniswap v2 oracle: https://uniswap.org/docs/v2/core-concepts/oracles/
  const amount0 = fromA.amount;
  const amount1 = fromB.amount;

  const liquidity = Math.min(
    (amount0 * (1 - SLIPPAGE) * supply) / reserve0,
    (amount1 * (1 - SLIPPAGE) * supply) / reserve1
  );
  const instructions: TransactionInstruction[] = [];
  const cleanupInstructions: TransactionInstruction[] = [];

  const signers: Account[] = [];

  const accountRentExempt = await connection.getMinimumBalanceForRentExemption(
    AccountLayout.span
  );
  const fromKeyA = getWrappedAccount(
    instructions,
    cleanupInstructions,
    fromA.account,
    wallet.publicKey,
    amount0 + accountRentExempt,
    signers
  );
  const fromKeyB = getWrappedAccount(
    instructions,
    cleanupInstructions,
    fromB.account,
    wallet.publicKey,
    amount1 + accountRentExempt,
    signers
  );

  let toAccount = findOrCreateAccountByMint(
    wallet.publicKey,
    wallet.publicKey,
    instructions,
    [],
    accountRentExempt,
    pool.pubkeys.mint,
    signers,
    new Set<string>([pool.pubkeys.feeAccount.toBase58()])
  );

  // create approval for transfer transactions
  instructions.push(
    Token.createApproveInstruction(
      programIds().token,
      fromKeyA,
      authority,
      wallet.publicKey,
      [],
      amount0
    )
  );

  instructions.push(
    Token.createApproveInstruction(
      programIds().token,
      fromKeyB,
      authority,
      wallet.publicKey,
      [],
      amount1
    )
  );

  // depoist
  instructions.push(
    depositInstruction(
      pool.pubkeys.account,
      authority,
      fromKeyA,
      fromKeyB,
      pool.pubkeys.holdingAccounts[0],
      pool.pubkeys.holdingAccounts[1],
      pool.pubkeys.mint,
      toAccount,
      pool.pubkeys.program,
      programIds().token,
      liquidity,
      amount0,
      amount1
    )
  );

  const transaction = new Transaction()
  instructions.concat(cleanupInstructions).forEach(
    (i) => (transaction.add(i))
  )

  const instrStr = 'add liquidity transaction'
  let tx = await sendTransaction({
    transaction,
    wallet,
    signers,
    connection,
    sendingMessage: `sending ${instrStr}...`,
    sentMessage: `${instrStr} sent`,
    successMessage: `${instrStr} success`
  });

  notify({
    message: "Pool Funded. Happy trading.",
    type: "success",
    description: `Transaction - ${tx}`,
  });
}

function findOrCreateAccountByMint(
  payer: PublicKey,
  owner: PublicKey,
  instructions: TransactionInstruction[],
  cleanupInstructions: TransactionInstruction[],
  accountRentExempt: number,
  mint: PublicKey, // use to identify same type
  signers: Account[],
  excluded?: Set<string>
): PublicKey {
  const accountToFind = mint.toBase58();
  const account = getCachedAccount(
    (acc) =>
      acc.info.mint.toBase58() === accountToFind &&
      acc.info.owner.toBase58() === owner.toBase58() &&
      (excluded === undefined || !excluded.has(acc.pubkey.toBase58()))
  );
  const isWrappedSol = accountToFind === WRAPPED_SOL_MINT.toBase58();

  let toAccount: PublicKey;
  if (account && !isWrappedSol) {
    toAccount = account.pubkey;
  } else {
    // creating depositor pool account
    const newToAccount = createSplAccount(
      instructions,
      payer,
      accountRentExempt,
      mint,
      owner,
      AccountLayout.span
    );

    toAccount = newToAccount.publicKey;
    signers.push(newToAccount);

    if (isWrappedSol) {
      cleanupInstructions.push(
        Token.createCloseAccountInstruction(
          programIds().token,
          toAccount,
          payer,
          payer,
          []
        )
      );
    }
  }

  return toAccount;
}

function estimateProceedsFromInput(
  inputQuantityInPool: number,
  proceedsQuantityInPool: number,
  inputAmount: number
): number {
  return (
    (proceedsQuantityInPool * inputAmount) / (inputQuantityInPool + inputAmount)
  );
}

function estimateInputFromProceeds(
  inputQuantityInPool: number,
  proceedsQuantityInPool: number,
  proceedsAmount: number
): number | string {
  if (proceedsAmount >= proceedsQuantityInPool) {
    return "Not possible";
  }

  return (
    (inputQuantityInPool * proceedsAmount) /
    (proceedsQuantityInPool - proceedsAmount)
  );
}

export enum PoolOperation {
  Add,
  SwapGivenInput,
  SwapGivenProceeds,
}

export async function calculateDependentAmount(
  connection: Connection,
  independent: string,
  amount: number,
  pool: PoolInfo,
  op: PoolOperation
): Promise<number | string | undefined> {
  const poolMint = await cache.queryMint(connection, pool.pubkeys.mint);
  const accountA = await cache.queryAccount(
    connection,
    pool.pubkeys.holdingAccounts[0]
  );
  const accountB = await cache.queryAccount(
    connection,
    pool.pubkeys.holdingAccounts[1]
  );
  if (!poolMint.mintAuthority) {
    throw new Error("Mint doesnt have authority");
  }

  if (poolMint.supply.eqn(0)) {
    return;
  }

  const mintA = await cache.queryMint(connection, accountA.info.mint);
  const mintB = await cache.queryMint(connection, accountB.info.mint);

  if (!mintA || !mintB) {
    return;
  }

  const isFirstIndependent = accountA.info.mint.toBase58() === independent;
  const depPrecision = Math.pow(
    10,
    isFirstIndependent ? mintB.decimals : mintA.decimals
  );
  const indPrecision = Math.pow(
    10,
    isFirstIndependent ? mintA.decimals : mintB.decimals
  );
  const indAdjustedAmount = amount * indPrecision;

  let indBasketQuantity = (isFirstIndependent
    ? accountA
    : accountB
  ).info.amount.toNumber();
  let depBasketQuantity = (isFirstIndependent
    ? accountB
    : accountA
  ).info.amount.toNumber();

  var depAdjustedAmount;
  switch (+op) {
    case PoolOperation.Add:
      depAdjustedAmount =
        (depBasketQuantity / indBasketQuantity) * indAdjustedAmount;
      break;
    case PoolOperation.SwapGivenProceeds:
      depAdjustedAmount = estimateInputFromProceeds(
        depBasketQuantity,
        indBasketQuantity,
        indAdjustedAmount
      );
      break;
    case PoolOperation.SwapGivenInput:
      depAdjustedAmount = estimateProceedsFromInput(
        indBasketQuantity,
        depBasketQuantity,
        indAdjustedAmount
      );
      break;
  }
  if (typeof depAdjustedAmount === "string") {
    return depAdjustedAmount;
  }
  if (depAdjustedAmount === undefined) {
    return undefined;
  }
  return depAdjustedAmount / depPrecision;
}

// TODO: add ui to customize curve type
async function _addLiquidityNewPool(
  wallet: any,
  connection: Connection,
  components: LiquidityComponent[],
  options: PoolConfig
) {
  notify({
    message: "Creating new pool...",
    description: "Please review transactions to approve.",
    type: "warn",
  });

  if (components.some((c) => !c.account)) {
    notify({
      message: "You need to have balance for all legs in the basket...",
      description: "Please review inputs.",
      type: "error",
    });
    return;
  }

  let instructions: TransactionInstruction[] = [];
  let cleanupInstructions: TransactionInstruction[] = [];

  const liquidityTokenAccount = new Account();
  // Create account for pool liquidity token
  instructions.push(
    SystemProgram.createAccount({
      fromPubkey: wallet.publicKey,
      newAccountPubkey: liquidityTokenAccount.publicKey,
      lamports: await connection.getMinimumBalanceForRentExemption(
        MintLayout.span
      ),
      space: MintLayout.span,
      programId: programIds().token,
    })
  );

  const tokenSwapAccount = new Account();
  console.log('token swap program id', programIds().swap.toString());
  const [authority, nonce] = await PublicKey.findProgramAddress(
    [tokenSwapAccount.publicKey.toBuffer()],
    programIds().swap
  );
  console.log('authority', authority.toString());

  // create mint for pool liquidity token
  instructions.push(
    Token.createInitMintInstruction(
      programIds().token,
      liquidityTokenAccount.publicKey,
      LIQUIDITY_TOKEN_PRECISION,
      // pass control of liquidity mint to swap program
      authority,
      // swap program can freeze liquidity token mint
      null
    )
  );

  // Create holding accounts for
  const accountRentExempt = await connection.getMinimumBalanceForRentExemption(
    AccountLayout.span
  );
  const holdingAccounts: Account[] = [];
  let signers: Account[] = [];

  components.forEach((leg) => {
    if (!leg.account) {
      return;
    }

    const mintPublicKey = leg.account.info.mint;
    // component account to store tokens I of N in liquidity poll
    holdingAccounts.push(
      createSplAccount(
        instructions,
        wallet.publicKey,
        accountRentExempt,
        mintPublicKey,
        authority,
        AccountLayout.span
      )
    );
  });

  // creating depositor pool account
  const depositorAccount = createSplAccount(
    instructions,
    wallet.publicKey,
    accountRentExempt,
    liquidityTokenAccount.publicKey,
    wallet.publicKey,
    AccountLayout.span
  );

  // creating fee pool account its set from env variable or to creater of the pool
  // creater of the pool is not allowed in some versions of token-swap program
  const feeAccount = createSplAccount(
    instructions,
    wallet.publicKey,
    accountRentExempt,
    liquidityTokenAccount.publicKey,
    SWAP_PROGRAM_OWNER_FEE_ADDRESS || wallet.publicKey,
    AccountLayout.span
  );

  console.log('here0', SWAP_PROGRAM_OWNER_FEE_ADDRESS.toString(), wallet.publicKey.toString());

  // create all accounts in one transaction
  signers = [
    liquidityTokenAccount,
    depositorAccount,
    feeAccount,
    ...holdingAccounts,
    ...signers,
  ]

  let transaction = new Transaction()
  instructions.concat(cleanupInstructions).forEach(
    (i) => (transaction.add(i))
  )

  let instrStr = 'create pool transaction'
  let tx: string = await sendTransaction({
    transaction,
    wallet,
    signers,
    connection,
    sendingMessage: `sending ${instrStr}...`,
    sentMessage: `${instrStr} sent`,
    successMessage: `${instrStr} success`
  });
  notify({
    message: "Accounts created",
    description: `Transaction ${tx}`,
    type: "success",
  });

  notify({
    message: "Adding Liquidity...",
    description: "Please review transactions to approve.",
    type: "warn",
  });

  signers = [];
  instructions = [];
  cleanupInstructions = [];

  instructions.push(
    SystemProgram.createAccount({
      fromPubkey: wallet.publicKey,
      newAccountPubkey: tokenSwapAccount.publicKey,
      lamports: await connection.getMinimumBalanceForRentExemption(
        TokenSwapLayout.span
      ),
      space: TokenSwapLayout.span,
      programId: programIds().swap,
    })
  );

  components.forEach((leg, i) => {
    if (!leg.account) {
      return;
    }

    // create temporary account for wrapped sol to perform transfer
    const from = getWrappedAccount(
      instructions,
      cleanupInstructions,
      leg.account,
      wallet.publicKey,
      leg.amount + accountRentExempt,
      signers
    );

    instructions.push(
      Token.createTransferInstruction(
        programIds().token,
        from,
        holdingAccounts[i].publicKey,
        wallet.publicKey,
        [],
        leg.amount
      )
    );
  });

  instructions.push(
    createInitSwapInstruction(
      tokenSwapAccount,
      authority,
      holdingAccounts[0].publicKey,
      holdingAccounts[1].publicKey,
      liquidityTokenAccount.publicKey,
      feeAccount.publicKey,
      depositorAccount.publicKey,
      programIds().token,
      programIds().swap,
      nonce,
      options.curveType,
      options.tradeFeeNumerator,
      options.tradeFeeDenominator,
      options.ownerTradeFeeNumerator,
      options.ownerTradeFeeDenominator,
      options.ownerWithdrawFeeNumerator,
      options.ownerWithdrawFeeDenominator
    )
  );

  // All instructions didn't fit in single transaction
  // initialize and provide inital liquidity to swap in 2nd (this prevents loss of funds)
  signers = [tokenSwapAccount, ...signers]
  transaction = new Transaction()
  instructions.concat(cleanupInstructions).forEach(
    (i) => (transaction.add(i))
  )

  instrStr = 'add liquidity transaction'
  tx = await sendTransaction({
    transaction,
    wallet,
    signers,
    connection,
    sendingMessage: `sending ${instrStr}...`,
    sentMessage: `${instrStr} sent`,
    successMessage: `${instrStr} success`
  });

  notify({
    message: "Pool Funded. Happy trading.",
    type: "success",
    description: `Transaction - ${tx}`,
  });
}

function getWrappedAccount(
  instructions: TransactionInstruction[],
  cleanupInstructions: TransactionInstruction[],
  toCheck: TokenAccount,
  payer: PublicKey,
  amount: number,
  signers: Account[]
) {
  if (!toCheck.info.isNative) {
    return toCheck.pubkey;
  }

  const account = new Account();
  instructions.push(
    SystemProgram.createAccount({
      fromPubkey: payer,
      newAccountPubkey: account.publicKey,
      lamports: amount,
      space: AccountLayout.span,
      programId: programIds().token,
    })
  );

  instructions.push(
    Token.createInitAccountInstruction(
      programIds().token,
      WRAPPED_SOL_MINT,
      account.publicKey,
      payer
    )
  );

  cleanupInstructions.push(
    Token.createCloseAccountInstruction(
      programIds().token,
      account.publicKey,
      payer,
      payer,
      []
    )
  );

  signers.push(account);

  return account.publicKey;
}

function createSplAccount(
  instructions: TransactionInstruction[],
  payer: PublicKey,
  accountRentExempt: number,
  mint: PublicKey,
  owner: PublicKey,
  space: number
) {
  const account = new Account();
  instructions.push(
    SystemProgram.createAccount({
      fromPubkey: payer,
      newAccountPubkey: account.publicKey,
      lamports: accountRentExempt,
      space,
      programId: programIds().token,
    })
  );

  instructions.push(
    Token.createInitAccountInstruction(
      programIds().token,
      mint,
      account.publicKey,
      owner
    )
  );

  return account;
}
