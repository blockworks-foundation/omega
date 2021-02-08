import React, { useState } from "react";
import { Button, Spin, Popover } from "antd";
import { LoadingOutlined } from "@ant-design/icons";
// Auto generate button label
import {
  ADD_LIQUIDITY_LABEL,
  generateActionLabel,
} from "./labels";
// Issue set helper
import issueSet from '../utils/issueSet';
// Connect to wallet
import { useWallet } from '../utils/wallet';
// Create connection to wallet
import {
  useConnection, useConnectionConfig, useSlippageConfig
} from '../utils/connection';
// Currency pair on this market
import { useCurrencyLeg } from "../utils/currencyPair";
// Input box
import { CurrencyInput } from "./currencyInput";
// Opertions on the pool
import { addLiquidity, PoolForBasketPromise, usePoolForBasket, calculateDependentAmount, PoolOperation } from '../utils/pools';
import { useMint } from '../utils/accounts';
// Make notifications
import { notify } from '../utils/notifications'
// 
import { DEFAULT_DENOMINATOR } from "./pool/config";
// For setting the config of the pool
import { PoolConfig } from "../models";
// Lists of known pools
import { useCachedPool } from '../utils/accounts';
// Typescript: type of mint
import { MintInfo } from "@solana/spl-token";
// Create icons
const antIcon = <LoadingOutlined style={{ fontSize: 24 }} spin />;


// TODO: Allow market change
// TODO: Check for no pool
// TODO: Only allow usdc account
export const AddLiquidityView = (props: {
  market: any,
  baseMintAddress: string,
  outcomes: Array<any>
}) => {
  const connection = useConnection();
  const { wallet, connected } = useWallet();
  const [pendingTx, setPendingTx] = useState(false);
  let pendingTxNum = 0;
  const { tokenMap } = useConnectionConfig();
  const { slippage } = useSlippageConfig();
  // Create useful methods on our mint address
  const baseMintAddress = useCurrencyLeg(props.baseMintAddress);
  const outcome0 = useCurrencyLeg(props.outcomes[0].mint_pk);
  const outcome1 = useCurrencyLeg(props.outcomes[1].mint_pk);
  const baseMint = useMint(props.baseMintAddress);
  const outcome0Mint = useMint(props.outcomes[0].mint_pk);
  const outcome1Mint = useMint(props.outcomes[1].mint_pk);
  const [options, setOptions] = useState<PoolConfig>({
    curveType: 0,
    tradeFeeNumerator: 25,
    tradeFeeDenominator: DEFAULT_DENOMINATOR,
    ownerTradeFeeNumerator: 5,
    ownerTradeFeeDenominator: DEFAULT_DENOMINATOR,
    ownerWithdrawFeeNumerator: 0,
    ownerWithdrawFeeDenominator: DEFAULT_DENOMINATOR,
  });
  const { pools } = useCachedPool();

  const fundPool = async (components: Array<any>, pool: any) => {
    pendingTxNum += 1;
    // Add the liquidity to the first pool
    addLiquidity(connection, wallet, components, slippage, pool, options)
      .then(() => {
        pendingTxNum -= 1;
        if (pendingTxNum === 0) {
          setPendingTx(false);
        }
      })
      .catch((e) => {
        console.log("Transaction failed", e);
        notify({
          description:
            "Please try again and approve transactions from your wallet",
          message: "Adding liquidity cancelled.",
          type: "error",
        });
        pendingTxNum -= 1;
        if (pendingTxNum === 0) {
          setPendingTx(false);
        }
      });
  }
  const hasSufficientBalance = baseMintAddress.sufficientBalance()

  function parseAmount(mint: MintInfo | undefined, amount: string) {
    return parseFloat(amount) * Math.pow(10, mint?.decimals || 0);
  }
  // Swap usdc for market tokens
  const executeAction =
    !connected
      ? wallet.connect :
      async () => {
        // TODO: Confirm mint address exists for outcome pk
        // TODO: Should fail fast be implemented here i.e if one pool was not funded, can the other pool be ?
        if (baseMintAddress.account && baseMintAddress.mint) {
          setPendingTx(true);
          pendingTxNum += 1;
          // @ts-ignore
          issueSet(props.market, parseAmount(baseMint, baseMintAddress.amount) / 2, wallet, connection)
            .then(async () => {
              // Check that the outcome token accounts exists
              if (!outcome0.account || !outcome1.account) {
                notify({
                  description:
                    "Token account does not exists",
                  message: "Adding liquidity cancelled.",
                  type: "error",
                });
              }
              pendingTxNum -= 1;
              // Fund pools of the outcome pk
              [outcome0, outcome1].forEach(async (outcome, i) => {
                PoolForBasketPromise([baseMintAddress.mintAddress, outcome.mintAddress].sort(), connection, pools).then(async (pool) => {
                  const components = [
                    {
                      account: baseMintAddress.account,
                      mintAddress: baseMintAddress.mintAddress,
                      amount: await calculateDependentAmount(connection, outcome.mintAddress, parseAmount(i === 0 ? outcome0Mint : outcome1Mint, baseMintAddress.amount) / 2, pool, PoolOperation.Add),
                    },
                    {
                      account: outcome.account,
                      mintAddress: outcome.mintAddress,
                      amount: parseAmount(i === 0 ? outcome0Mint : outcome1Mint, baseMintAddress.amount) / 2,
                    },
                  ];
                  fundPool(components, pool);
                }).catch((e) => {
                  console.log("Transaction failed", e);
                  notify({
                    description:
                      "Please try again and approve transactions from your wallet",
                    message: "Adding liquidity cancelled.",
                    type: "error",
                  });
                  pendingTxNum -= 1;
                  if (pendingTxNum === 0) {
                    setPendingTx(false);
                  }
                });
              })
            })
            .catch((e) => {
              console.log("Transaction failed", e);
              notify({
                description:
                  "Please try again and approve transactions from your wallet",
                message: "Adding liquidity cancelled.",
                type: "error",
              });
              pendingTxNum -= 1;
              if (pendingTxNum === 0) {
                setPendingTx(false);
              }
            });
        }
      }

  const colStyle: React.CSSProperties = { padding: "1em" };


  return (
    <>
      <div>
        <div>
          <Popover
            trigger="hover"
            content={
              <div style={{ width: 300 }}>
                Liquidity providers earn a fixed percentage fee on all trades
                proportional to their share of the pool. Fees are added to the
                pool, accrue in real time and can be claimed by withdrawing your
                liquidity.
            </div>
            }
          >
            <Button type="text">Provide Liquidity to both pools</Button>
          </Popover>
        </div>
        <CurrencyInput
          title="Input"
          onInputChange={(val: any) => {
            baseMintAddress.setAmount(val);
          }}
          amount={baseMintAddress.amount}
          mint={baseMintAddress.mintAddress}
          onMintChange={(item) => {
            baseMintAddress.setMint(item);
          }}
          forceMint={baseMintAddress.mintAddress}
          renderOneTokenItem={baseMintAddress.mintAddress}
        />

        <Button
          size="large"
          type="primary"
          onClick={executeAction}
          disabled={
            connected &&
            (pendingTx ||
              !baseMintAddress.account ||
              baseMintAddress.account === outcome1.account ||
              baseMintAddress.account === outcome1.account ||
              !hasSufficientBalance)
          }
        >
          {generateActionLabel(ADD_LIQUIDITY_LABEL, connected, tokenMap, baseMintAddress, baseMintAddress)}
          {pendingTx && <Spin indicator={antIcon} className="add-spinner" />}
        </Button>

      </div>
    </>
  );
};
