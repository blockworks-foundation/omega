import { Button, Popover, Spin, Typography } from "antd";
import React, { useEffect, useMemo, useState } from "react";
import {
  useConnection,
  useConnectionConfig,
  useSlippageConfig,
} from "../../utils/connection";
import { useWallet } from "../../utils/wallet";
import { CurrencyInput } from "../currencyInput";
import {
  LoadingOutlined,
  SwapOutlined,
  QuestionCircleOutlined,
} from "@ant-design/icons";
import {
  swap,
  usePoolForBasket,
  PoolOperation,
  LIQUIDITY_PROVIDER_FEE,
} from "../../utils/pools";
import { notify } from "../../utils/notifications";
import { useCurrencyPairState } from "../../utils/currencyPair";
import { generateActionLabel, POOL_NOT_AVAILABLE, SWAP_LABEL } from "../labels";
import "./trade.less";
import { colorWarning, getTokenName } from "../../utils/utils";
import { AdressesPopover } from "../pool/address";
import { PoolInfo } from "../../models";
import { useEnrichedPools } from "../../context/market";

const { Text } = Typography;

const antIcon = <LoadingOutlined style={{ fontSize: 24 }} spin />;

// TODO:
// Compute price breakdown with/without fee
// Show slippage
// Show fee information

export const TradeEntry = () => {
  const { wallet, connected } = useWallet();
  const connection = useConnection();
  const [pendingTx, setPendingTx] = useState(false);
  const {
    A,
    B,
    setLastTypedAccount,
    setPoolOperation,
  } = useCurrencyPairState();
  const pool = usePoolForBasket([A?.mintAddress, B?.mintAddress]);

  console.log('SWAP pool', pool);
  const { slippage } = useSlippageConfig();
  const { tokenMap } = useConnectionConfig();

  const swapAccounts = () => {
    const tempMint = A.mintAddress;
    const tempAmount = A.amount;
    A.setMint(B.mintAddress);
    A.setAmount(B.amount);
    B.setMint(tempMint);
    B.setAmount(tempAmount);
    // @ts-ignore
    setPoolOperation((op: PoolOperation) => {
      switch (+op) {
        case PoolOperation.SwapGivenInput:
          return PoolOperation.SwapGivenProceeds;
        case PoolOperation.SwapGivenProceeds:
          return PoolOperation.SwapGivenInput;
        case PoolOperation.Add:
          return PoolOperation.SwapGivenInput;
      }
    });
  };

  const handleSwap = async () => {
    if (A.account && B.mintAddress) {
      try {
        setPendingTx(true);

        const components = [
          {
            account: A.account,
            mintAddress: A.mintAddress,
            amount: A.convertAmount(),
          },
          {
            mintAddress: B.mintAddress,
            amount: B.convertAmount(),
          },
        ];

        await swap(connection, wallet, components, slippage, pool);
      } catch {
        notify({
          description:
            "Please try again and approve transactions from your wallet",
          message: "Swap trade cancelled.",
          type: "error",
        });
      } finally {
        setPendingTx(false);
      }
    }
  };

  return (
    <>
      <div className="input-card">
        <AdressesPopover pool={pool} aName={A.name} bName={B.name} />
        <CurrencyInput
          title="Input"
          onInputChange={(val: any) => {
            setPoolOperation(PoolOperation.SwapGivenInput);
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
        />
        <Button type="primary" className="swap-button" onClick={swapAccounts}>
          ⇅
        </Button>
        <CurrencyInput
          title="To (Estimate)"
          onInputChange={(val: any) => {
            setPoolOperation(PoolOperation.SwapGivenProceeds);
            if (B.amount !== val) {
              setLastTypedAccount(B.mintAddress);
            }

            B.setAmount(val);
          }}
          amount={B.amount}
          mint={B.mintAddress}
          onMintChange={(item) => {
            B.setMint(item);
          }}
        />
      </div>
      <Button
        className="trade-button"
        type="primary"
        size="large"
        onClick={connected ? handleSwap : wallet.connect}
        style={{ width: "100%" }}
        disabled={
          connected &&
          (pendingTx ||
            !A.account ||
            !B.mintAddress ||
            A.account === B.account ||
            !A.sufficientBalance() ||
            !pool)
        }
      >
        {generateActionLabel(
          !pool
            ? POOL_NOT_AVAILABLE(
                getTokenName(tokenMap, A.mintAddress),
                getTokenName(tokenMap, B.mintAddress)
              )
            : SWAP_LABEL,
          connected,
          tokenMap,
          A,
          B,
          true
        )}
        {pendingTx && <Spin indicator={antIcon} className="trade-spinner" />}
      </Button>
      <TradeInfo pool={pool} />
    </>
  );
};

export const TradeInfo = (props: { pool?: PoolInfo }) => {
  const { A, B } = useCurrencyPairState();
  const { pool } = props;
  const { slippage } = useSlippageConfig();
  const pools = useMemo(() => (pool ? [pool] : []), [pool]);
  const enriched = useEnrichedPools(pools);

  const [amountOut, setAmountOut] = useState(0);
  const [priceImpact, setPriceImpact] = useState(0);
  const [lpFee, setLpFee] = useState(0);
  const [exchangeRate, setExchangeRate] = useState(0);
  const [priceAccount, setPriceAccount] = useState("");

  useEffect(() => {
    if (!pool || enriched.length === 0) {
      return;
    }
    if (B.amount) {
      const minAmountOut = parseFloat(B?.amount) * (1 - slippage);
      setAmountOut(minAmountOut);
    }
    const liqA = enriched[0].liquidityA;
    const liqB = enriched[0].liquidityB;
    const supplyRatio = liqA / liqB;
    // We need to make sure the order matched the pool's accounts order
    const enrichedA = A.mintAddress === enriched[0].mints[0] ? A : B;
    const enrichedB = enrichedA.mintAddress === A.mintAddress ? B : A;
    const calculatedRatio =
      parseFloat(enrichedA.amount) / parseFloat(enrichedB.amount);
    // % difference between pool ratio and  calculated ratio
    setPriceImpact(Math.abs(100 - (calculatedRatio * 100) / supplyRatio));

    // 6 decimals without trailing zeros
    const lpFeeStr = (parseFloat(A.amount) * LIQUIDITY_PROVIDER_FEE).toFixed(6);
    setLpFee(parseFloat(lpFeeStr));

    if (priceAccount === B.mintAddress) {
      setExchangeRate(parseFloat(B.amount) / parseFloat(A.amount));
    } else {
      setExchangeRate(parseFloat(A.amount) / parseFloat(B.amount));
    }
  }, [B, slippage, pool, enriched, priceAccount]);

  const handleSwapPriceInfo = () => {
    if (priceAccount !== B.mintAddress) {
      setPriceAccount(B.mintAddress);
    } else {
      setPriceAccount(A.mintAddress);
    }
  };
  return !!parseFloat(B.amount) ? (
    <div className="pool-card" style={{ width: "initial" }}>
      <div className="pool-card-row">
        <Text className="pool-card-cell">Price</Text>
        <div className="pool-card-cell " title={exchangeRate.toString()}>
          <Button
            shape="circle"
            size="middle"
            type="text"
            icon={<SwapOutlined />}
            onClick={handleSwapPriceInfo}
          >
            {exchangeRate.toFixed(6)}&nbsp;
            {priceAccount === B.mintAddress ? B.name : A.name} per&nbsp;
            {priceAccount === B.mintAddress ? A.name : B.name}&nbsp;
          </Button>
        </div>
      </div>
      <div className="pool-card-row">
        <Text className="pool-card-cell">
          <Popover
            trigger="hover"
            content={
              <div style={{ width: 300 }}>
                You transaction will revert if there is a large, unfavorable
                price movement before it is confirmed.
              </div>
            }
          >
            Minimum Received <QuestionCircleOutlined />
          </Popover>
        </Text>
        <div className="pool-card-cell " title={amountOut.toString()}>
          {amountOut.toFixed(6)} {B.name}
        </div>
      </div>
      <div className="pool-card-row">
        <Text className="pool-card-cell">
          <Popover
            trigger="hover"
            content={
              <div style={{ width: 300 }}>
                The difference between the market price and estimated price due
                to trade size.
              </div>
            }
          >
            Price Impact <QuestionCircleOutlined />
          </Popover>
        </Text>
        <div
          className="pool-card-cell "
          title={priceImpact.toString()}
          style={{ color: colorWarning(priceImpact) }}
        >
          {priceImpact < 0.01 ? "< 0.01%" : priceImpact.toFixed(3) + "%"}
        </div>
      </div>
      <div className="pool-card-row">
        <Text className="pool-card-cell">
          <Popover
            trigger="hover"
            content={
              <div style={{ width: 300 }}>
                A portion of each trade ({LIQUIDITY_PROVIDER_FEE * 100}%) goes
                to liquidity providers as a protocol incentive.
              </div>
            }
          >
            Liquidity Provider Fee <QuestionCircleOutlined />
          </Popover>
        </Text>
        <div className="pool-card-cell " title={lpFee.toString()}>
          {lpFee} {A.name}
        </div>
      </div>
    </div>
  ) : null;
};
