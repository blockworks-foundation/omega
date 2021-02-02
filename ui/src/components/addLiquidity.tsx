import React, { useState, useMemo } from "react";
import { Button, Spin, Select } from "antd";
import { LoadingOutlined } from "@ant-design/icons";
// Auto generate button label
import {
  ADD_LIQUIDITY_LABEL,
  generateActionLabel,
} from "./labels";
// Issue set helper
import issueSet from '../utils/issueSet';
import { markets } from "../markets";
// Connect to wallet
import { useWallet } from '../utils/wallet';
// Create connection to wallet
import {
  useConnection, useConnectionConfig, useSlippageConfig
} from '../utils/connection';
// Our contract details
import contract_keys from "../contract_keys.json";
import { useMint } from '../utils/accounts';
// Currency pair on this market
import { useCurrencyPairState } from "../utils/currencyPair";
// Input box
import { CurrencyInput } from "./currencyInput";
// Opertions on the pool
import { addLiquidity, usePoolForBasket } from '../utils/pools';
// Make notifications
import { notify } from '../utils/notifications'
// 
import { DEFAULT_DENOMINATOR } from "./pool/config";
import { PoolConfig } from "../models";

// Create icons
const antIcon = <LoadingOutlined style={{ fontSize: 24 }} spin />;
const { Option } = Select;

// TODO: Allow market change
// TODO: Check for no pool
// TODO: Only allow usdc account
export const AddLiquidityView = (props: {
  firstMintPK: any,
  secondMintPK: any
}) => {
  const connection = useConnection();
  const { wallet, connected } = useWallet();
  const [pendingTx, setPendingTx] = useState(false);
  // The mint address public key
  const quoteMint = useMint(contract_keys.quote_mint_pk);
  const {
    A,
    B,
    setLastTypedAccount
  } = useCurrencyPairState();
  const pool1 = usePoolForBasket([A?.mintAddress, props.firstMintPK?.mintAddress]);
  const pool2 = usePoolForBasket([A?.mintAddress, props.secondMintPK?.mintAddress])
  const { tokenMap } = useConnectionConfig();
  const { slippage } = useSlippageConfig();
  const [options, setOptions] = useState<PoolConfig>({
    curveType: 0,
    tradeFeeNumerator: 25,
    tradeFeeDenominator: DEFAULT_DENOMINATOR,
    ownerTradeFeeNumerator: 5,
    ownerTradeFeeDenominator: DEFAULT_DENOMINATOR,
    ownerWithdrawFeeNumerator: 0,
    ownerWithdrawFeeDenominator: DEFAULT_DENOMINATOR,
  });

  const parseAmount = (amount: any) => {
    if (quoteMint) {
      try {
        return parseFloat(amount) * Math.pow(10, quoteMint.decimals);
      } catch (error) {
        // TODOl WHat to do here
      }
    } else {
      // TODO: What to do here
    }
  }

  const fundPool = async (components: Array<any>, pool: any) => {
    // Add the liquidity to the first pool
    await addLiquidity(connection, wallet, components, slippage, pool, options)
      .then(() => {
        setPendingTx(false);
      })
      .catch((e) => {
        console.log("Transaction failed", e);
        notify({
          description:
            "Please try again and approve transactions from your wallet",
          message: "Adding liquidity cancelled.",
          type: "error",
        });
        setPendingTx(false);
      });
  }
  const hasSufficientBalance = A.sufficientBalance()

  // Swap usdc for market tokens
  const executeAction =
    !connected
      ? wallet.connect :
      async () => {
        if (A.account && B.account && A.mint && B.mint) {
          setPendingTx(true);
          let amount = parseAmount(A.amount);
          if (!amount) {
            return;
          }
          issueSet(markets[0], amount / 2, wallet, connection)
            .then(async () => {
              setPendingTx(true);
              let components = [
                {
                  account: A.account,
                  mintAddress: A.mintAddress,
                  amount: A.convertAmount(),
                },
                {
                  account: props.firstMintPK.account,
                  mintAddress: props.firstMintPK.mintAddress,
                  amount: props.firstMintPK.convertAmount(),
                },
              ];
              fundPool(components, pool1);
              components = [
                {
                  account: A.account,
                  mintAddress: A.mintAddress,
                  amount: A.convertAmount(),
                },
                {
                  account: props.secondMintPK.account,
                  mintAddress: props.secondMintPK.mintAddress,
                  amount: props.secondMintPK.convertAmount(),
                },
              ];
              fundPool(components, pool2);
            })
            .catch((e) => {
              console.log("Transaction failed", e);
              notify({
                description:
                  "Please try again and approve transactions from your wallet",
                message: "Adding liquidity cancelled.",
                type: "error",
              });
              setPendingTx(false);
            });
        }
      }

  const colStyle: React.CSSProperties = { padding: "1em" };


  return (
    <>
      <div>
        <CurrencyInput
          title="Input"
          onInputChange={(val: any) => {
            if (A.amount !== val) {
              setLastTypedAccount(A.mintAddress);
            }
            A.setAmount(val);
          }}
          amount={A.amount}
          mint={A.mintAddress}
          onMintChange={(item) => {
            A.setMint(item);
          }}
          forceMint={A.mintAddress}
          renderOneTokenItem={A.mintAddress}
        />

        <Button
          size="large"
          type="primary"
          onClick={executeAction}
          disabled={
            connected &&
            (pendingTx ||
              !A.account ||
              !B.account ||
              A.account === B.account ||
              !hasSufficientBalance)
          }
        >
          {generateActionLabel(ADD_LIQUIDITY_LABEL, connected, tokenMap, A, B)}
          {pendingTx && <Spin indicator={antIcon} className="add-spinner" />}
        </Button>

      </div>
    </>
  );
};
