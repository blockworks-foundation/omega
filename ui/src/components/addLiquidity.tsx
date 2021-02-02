import React, { useState } from "react";
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
import { PoolOperation, addLiquidity, usePoolForBasket } from '../utils/pools';
// Make notifications
import { notify } from '../utils/notifications'
// 
import { DEFAULT_DENOMINATOR } from "./pool/config";
import { PoolConfig } from "../models";
// Token Icons
import { TokenIcon } from "./tokenIcon";

// Create icons
const antIcon = <LoadingOutlined style={{ fontSize: 24 }} spin />;
const { Option } = Select;

// TODO: Allow market change
// TODO: Check for no pool
// TODO: Only allow usdc account
export const AddLiquidityView = (props: {}) => {
  const connection = useConnection();
  const { wallet, connected } = useWallet();
  const [pendingTx, setPendingTx] = useState(false);
  // The mint address public key
  const quoteMint = useMint(contract_keys.quote_mint_pk);
  const {
    A,
    B,
    setPoolOperation,
    setLastTypedAccount
  } = useCurrencyPairState();
  const pool = usePoolForBasket([A?.mintAddress, B?.mintAddress]);
  const { tokens, tokenMap } = useConnectionConfig();
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

  const hasSufficientBalance = A.sufficientBalance() && B.sufficientBalance();

  // Swap usdc for market tokens
  const executeAction =
    !connected
      ? wallet.connect :
      async () => {
        if (A.account && B.account && A.mint && B.mint) {
          setPendingTx(true);
          issueSet(markets[0], parseAmount(1), wallet, connection)
            .then(() => {
              setPendingTx(true);
              const components = [
                {
                  account: A.account,
                  mintAddress: A.mintAddress,
                  amount: A.convertAmount(),
                },
                {
                  account: B.account,
                  mintAddress: B.mintAddress,
                  amount: B.convertAmount(),
                },
              ];

              addLiquidity(connection, wallet, components, slippage, pool, options)
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
            setPoolOperation(PoolOperation.Add);
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
