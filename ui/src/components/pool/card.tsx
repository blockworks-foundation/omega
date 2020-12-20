import React, { useMemo } from "react";
import { Card, Typography } from "antd";
import { RemoveLiquidity } from "./remove";
import { useMint, useUserAccounts } from "../../utils/accounts";
import { PoolIcon } from "../tokenIcon";
import { PoolInfo, TokenAccount } from "../../models";
import "./view.less";
import { useEnrichedPools } from "../../context/market";
import { formatNumber, formatPct, formatUSD } from "../../utils/utils";
import { ExplorerLink } from "../explorerLink";
import { SupplyOverview } from "./supplyOverview";

const { Text } = Typography;

export const PoolCard = (props: { pool: PoolInfo, account?: TokenAccount }) => {
  const pools = useMemo(() => [props.pool].filter((p) => p) as PoolInfo[], [
    props.pool,
  ]);
  const enriched = useEnrichedPools(pools)[0];
  const { userAccounts } = useUserAccounts();

  const pool = props.pool;
  const account = props.account;

  const baseMintAddress = pool.pubkeys.holdingMints[0].toBase58();
  const quoteMintAddress = pool.pubkeys.holdingMints[1].toBase58();
  const lpMint = useMint(pool.pubkeys.mint);

  const ratio = (account?.info.amount.toNumber() || 0) /
    (lpMint?.supply.toNumber() || 0);

  if (!enriched) {
    return null;
  }

  const small: React.CSSProperties = { fontSize: 11 };

  const userInfo = userAccounts.length > 0 && (
    <>
      <div className="pool-card-row">
        <Text type="secondary" className="pool-card-cell ">
          Your liquidity:
        </Text>
        <div className="pool-card-cell ">
          <div className="left">
            <div>{formatUSD.format(ratio * enriched.liquidity)}</div>
            <div>
              <Text type="secondary" style={small}>
                {formatNumber.format(ratio * enriched.liquidityA)}{" "}
                {enriched.names[0]}
              </Text>
            </div>
            <div>
              <Text type="secondary" style={small}>
                {formatNumber.format(ratio * enriched.liquidityB)}{" "}
                {enriched.names[1]}
              </Text>
            </div>
          </div>
        </div>
      </div>
      <div className="pool-card-row">
        <Text type="secondary" className="pool-card-cell ">
          Your quantity:
        </Text>
        <div className="pool-card-cell ">{ratio * enriched.supply}</div>
      </div>
      <div className="pool-card-row">
        <Text type="secondary" className="pool-card-cell ">
          Your fees (24h):
        </Text>
        <div className="pool-card-cell " title={`${enriched.fees24h * ratio}`}>
          {enriched.fees24h * ratio < 0.005 ? "< " : ""}
          {formatUSD.format(enriched.fees24h * ratio)}
        </div>
      </div>

      <hr />
    </>
  );

  return (
    <Card
      className="pool-card"
      title={
        <>
          <PoolIcon
            mintA={baseMintAddress}
            mintB={quoteMintAddress}
            className="left-icon"
          />
          {enriched?.name}
        </>
      }
    >
      {userInfo}
      <div className="pool-card-row">
        <Text type="secondary" className="pool-card-cell ">
          Pool Liquidity:
        </Text>
        <div className="pool-card-cell ">
          <div className="left">
            <div>{formatUSD.format(enriched.liquidity)}</div>
            <div>
              <Text type="secondary" style={small}>
                {formatNumber.format(enriched.liquidityA)} {enriched.names[0]}
              </Text>
            </div>
            <div>
              <Text type="secondary" style={small}>
                {formatNumber.format(enriched.liquidityB)} {enriched.names[1]}
              </Text>
            </div>
          </div>
        </div>
      </div>
      <div className="pool-card-row">
        <Text type="secondary" className="pool-card-cell ">
          LP Supply:
        </Text>
        <div className="pool-card-cell " title={enriched.supply}>
          {formatNumber.format(enriched.supply)}
        </div>
      </div>
      <div className="pool-card-row">
        <Text type="secondary" className="pool-card-cell ">
          Value per token:
        </Text>
        <div className="pool-card-cell ">
          {formatUSD.format(enriched.liquidity / enriched.supply)}
        </div>
      </div>

      <div className="pool-card-row">
        <Text type="secondary" className="pool-card-cell ">
          Volume (24h):
        </Text>
        <div className="pool-card-cell ">
          {formatUSD.format(enriched.volume24h)}
        </div>
      </div>
      <div className="pool-card-row">
        <Text type="secondary" className="pool-card-cell ">
          Fees (24h):
        </Text>
        <div className="pool-card-cell ">
          {formatUSD.format(enriched.fees24h)}
        </div>
      </div>
      <div className="pool-card-row">
        <Text type="secondary" className="pool-card-cell ">
          Approx. APY (24h):
        </Text>
        <div className="pool-card-cell ">
          {formatPct.format(enriched.apy24h)}
        </div>
      </div>
      <div className="pool-card-row">
        <Text type="secondary" className="pool-card-cell ">
          Address:
        </Text>
        <div className="pool-card-cell ">
          <div className="left">
            <div>
              <ExplorerLink
                address={enriched.address}
                type="account"
                length={4}
              />
            </div>
            <div className="small">
              <ExplorerLink
                address={pool.pubkeys.holdingAccounts[0]}
                type="account"
                style={small}
                length={4}
              />
              <Text type="secondary" style={small}>
                {" "}
                {enriched.names[0]}
              </Text>
            </div>
            <div className="small">
              <ExplorerLink
                address={pool.pubkeys.holdingAccounts[1]}
                type="account"
                style={small}
                length={4}
              />
              <Text type="secondary" style={small}>
                {" "}
                {enriched.names[1]}
              </Text>
            </div>
          </div>
        </div>
      </div>

      <SupplyOverview pool={pool} />
      <div className="pool-card-row">
        {/* {item && <Button type="default" onClick={setPair}>Add</Button>} */}
        {props.account && (
          <RemoveLiquidity instance={{ pool, account: props.account }} />
        )}
      </div>
    </Card>
  );
};
