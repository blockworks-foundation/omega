import React, { useMemo, useState } from "react";
import {
  addLiquidity,
  usePoolForBasket,
  PoolOperation,
} from "../../utils/pools";
import { Button, Card, Col, Dropdown, Popover, Row } from "antd";
import { useWallet } from "../../utils/wallet";
import {
  useConnection,
  useConnectionConfig,
  useSlippageConfig,
} from "../../utils/connection";
import { Spin } from "antd";
import { LoadingOutlined } from "@ant-design/icons";
import { notify } from "../../utils/notifications";
import { SupplyOverview } from "./supplyOverview";
import { CurrencyInput } from "../currencyInput";
import { DEFAULT_DENOMINATOR, PoolConfigCard } from "./config";
import "./add.less";
import { PoolConfig, PoolInfo } from "../../models";
import { SWAP_PROGRAM_OWNER_FEE_ADDRESS } from "../../utils/ids";
import { useCurrencyPairState } from "../../utils/currencyPair";
import {
  CREATE_POOL_LABEL,
  ADD_LIQUIDITY_LABEL,
  generateActionLabel,
} from "../labels";
import { AdressesPopover } from "./address";
import { formatPriceNumber } from "../../utils/utils";
import { useMint, useUserAccounts } from "../../utils/accounts";
import { useEnrichedPools } from "../../context/market";
import { PoolIcon } from "../tokenIcon";

const antIcon = <LoadingOutlined style={{ fontSize: 24 }} spin />;

export const AddToLiquidity = () => {
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
  const { slippage } = useSlippageConfig();
  const { tokenMap } = useConnectionConfig();
  const [options, setOptions] = useState<PoolConfig>({
    curveType: 0,
    tradeFeeNumerator: 25,
    tradeFeeDenominator: DEFAULT_DENOMINATOR,
    ownerTradeFeeNumerator: 5,
    ownerTradeFeeDenominator: DEFAULT_DENOMINATOR,
    ownerWithdrawFeeNumerator: 0,
    ownerWithdrawFeeDenominator: DEFAULT_DENOMINATOR,
  });

  const executeAction = !connected
    ? wallet.connect
    : async () => {
        if (A.account && B.account && A.mint && B.mint) {
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
        }
      };

  const hasSufficientBalance = A.sufficientBalance() && B.sufficientBalance();

  const createPoolButton = SWAP_PROGRAM_OWNER_FEE_ADDRESS ? (
    <Button
      className="add-button"
      onClick={executeAction}
      disabled={
        connected &&
        (pendingTx || !A.account || !B.account || A.account === B.account)
      }
      type="primary"
      size="large"
    >
      {generateActionLabel(CREATE_POOL_LABEL, connected, tokenMap, A, B)}
      {pendingTx && <Spin indicator={antIcon} className="add-spinner" />}
    </Button>
  ) : (
    <Dropdown.Button
      className="add-button"
      onClick={executeAction}
      disabled={
        connected &&
        (pendingTx || !A.account || !B.account || A.account === B.account)
      }
      type="primary"
      size="large"
      overlay={<PoolConfigCard options={options} setOptions={setOptions} />}
    >
      {generateActionLabel(CREATE_POOL_LABEL, connected, tokenMap, A, B)}
      {pendingTx && <Spin indicator={antIcon} className="add-spinner" />}
    </Dropdown.Button>
  );

  return (
    <>
      <div className="input-card">
        <AdressesPopover pool={pool} aName={A.name} bName={B.name} />
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
          <Button type="text">Read more about providing liquidity.</Button>
        </Popover>

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
        />
        <div>+</div>
        <CurrencyInput
          title="Input"
          onInputChange={(val: any) => {
            setPoolOperation(PoolOperation.Add);
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
        {pool && <PoolPrice pool={pool} />}
        <SupplyOverview pool={pool} />
      </div>
      {pool && (
        <Button
          className="add-button"
          type="primary"
          size="large"
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
      )}
      {!pool && createPoolButton}
      <YourPosition pool={pool} />
    </>
  );
};

export const PoolPrice = (props: { pool: PoolInfo }) => {
  const pool = props.pool;
  const pools = useMemo(() => [props.pool].filter((p) => p) as PoolInfo[], [
    props.pool,
  ]);
  const enriched = useEnrichedPools(pools)[0];

  const { userAccounts } = useUserAccounts();
  const lpMint = useMint(pool.pubkeys.mint);

  const ratio =
    userAccounts
      .filter((f) => pool.pubkeys.mint.equals(f.info.mint))
      .reduce((acc, item) => item.info.amount.toNumber() + acc, 0) /
    (lpMint?.supply.toNumber() || 0);

  if (!enriched) {
    return null;
  }
  return (
    <Card
      className="ccy-input"
      style={{ borderRadius: 20, width: "100%" }}
      bodyStyle={{ padding: "7px" }}
      size="small"
      title="Prices and pool share"
    >
      <Row style={{ width: "100%" }}>
        <Col span={8}>
          {formatPriceNumber.format(
            parseFloat(enriched.liquidityA) / parseFloat(enriched.liquidityB)
          )}
        </Col>
        <Col span={8}>
          {formatPriceNumber.format(
            parseFloat(enriched.liquidityB) / parseFloat(enriched.liquidityA)
          )}
        </Col>
        <Col span={8}>
          {ratio * 100 < 0.001 && ratio > 0 ? "<" : ""}
          &nbsp;{formatPriceNumber.format(ratio * 100)}%
        </Col>
      </Row>
      <Row style={{ width: "100%" }}>
        <Col span={8}>
          {enriched.names[0]} per {enriched.names[1]}
        </Col>
        <Col span={8}>
          {enriched.names[1]} per {enriched.names[0]}
        </Col>
        <Col span={8}>Share of pool</Col>
      </Row>
    </Card>
  );
};

export const YourPosition = (props: { pool?: PoolInfo }) => {
  const { pool } = props;
  const pools = useMemo(() => [props.pool].filter((p) => p) as PoolInfo[], [
    props.pool,
  ]);
  const enriched = useEnrichedPools(pools)[0];
  const { userAccounts } = useUserAccounts();
  const lpMint = useMint(pool?.pubkeys.mint);

  if (!pool || !enriched) {
    return null;
  }
  const baseMintAddress = pool.pubkeys.holdingMints[0].toBase58();
  const quoteMintAddress = pool.pubkeys.holdingMints[1].toBase58();

  const ratio =
    userAccounts
      .filter((f) => pool.pubkeys.mint.equals(f.info.mint))
      .reduce((acc, item) => item.info.amount.toNumber() + acc, 0) /
    (lpMint?.supply.toNumber() || 0);

  return (
    <Card
      className="ccy-input"
      style={{ borderRadius: 20, width: "100%" }}
      bodyStyle={{ padding: "7px" }}
      size="small"
      title="Your Position"
    >
      <div className="pool-card" style={{ width: "initial" }}>
        <div className="pool-card-row">
          <div className="pool-card-cell">
            <div style={{ display: "flex", alignItems: "center" }}>
              <PoolIcon mintA={baseMintAddress} mintB={quoteMintAddress} />
              <h3 style={{ margin: 0 }}>{enriched?.name}</h3>
            </div>
          </div>
          <div className="pool-card-cell">
            <h3 style={{ margin: 0 }}>
              {formatPriceNumber.format(ratio * enriched.supply)}
            </h3>
          </div>
        </div>
        <div className="pool-card-row" style={{ margin: 0 }}>
          <div className="pool-card-cell">Your Share:</div>
          <div className="pool-card-cell">
            {ratio * 100 < 0.001 && ratio > 0 ? "<" : ""}
            {formatPriceNumber.format(ratio * 100)}%
          </div>
        </div>
        <div className="pool-card-row" style={{ margin: 0 }}>
          <div className="pool-card-cell">{enriched.names[0]}:</div>
          <div className="pool-card-cell">
            {formatPriceNumber.format(ratio * enriched.liquidityA)}
          </div>
        </div>
        <div className="pool-card-row" style={{ margin: 0 }}>
          <div className="pool-card-cell">{enriched.names[1]}:</div>
          <div className="pool-card-cell">
            {formatPriceNumber.format(ratio * enriched.liquidityB)}
          </div>
        </div>
      </div>
    </Card>
  );
};
