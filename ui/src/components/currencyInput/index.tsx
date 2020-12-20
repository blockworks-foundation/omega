import React from "react";
import { Card, Select } from "antd";
import { NumericInput } from "../numericInput";
import { getPoolName, getTokenName, isKnownMint } from "../../utils/utils";
import {
  useUserAccounts,
  useMint,
  useCachedPool,
  useAccountByMint,
} from "../../utils/accounts";
import "./styles.less";
import { useConnectionConfig } from "../../utils/connection";
import { PoolIcon, TokenIcon } from "../tokenIcon";
import { PublicKey } from "@solana/web3.js";
import { PoolInfo, TokenAccount } from "../../models";

const { Option } = Select;

const TokenDisplay = (props: {
  name: string;
  mintAddress: string;
  icon?: JSX.Element;
  showBalance?: boolean;
}) => {
  const { showBalance, mintAddress, name, icon } = props;
  const tokenMint = useMint(mintAddress);
  const tokenAccount = useAccountByMint(mintAddress);

  let balance: number = 0;
  let hasBalance: boolean = false;
  if (showBalance) {
    if (tokenAccount && tokenMint) {
      balance =
        tokenAccount.info.amount.toNumber() / Math.pow(10, tokenMint.decimals);
      hasBalance = balance > 0;
    }
  }

  return (
    <>
      <div
        title={mintAddress}
        key={mintAddress}
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <div style={{ display: "flex", alignItems: "center" }}>
          {icon || <TokenIcon mintAddress={mintAddress} />}
          {name}
        </div>
        {showBalance ? (
          <span
            title={balance.toString()}
            key={mintAddress}
            className="token-balance"
          >
            &nbsp;{" "}
            {hasBalance && balance < 0.001 ? "<0.001" : balance.toFixed(3)}
          </span>
        ) : null}
      </div>
    </>
  );
};

export const CurrencyInput = (props: {
  mint?: string;
  amount?: string;
  title?: string;
  onInputChange?: (val: number) => void;
  onMintChange?: (account: string) => void;
}) => {
  const { userAccounts } = useUserAccounts();
  const { pools } = useCachedPool();
  const mint = useMint(props.mint);

  const { tokens, tokenMap } = useConnectionConfig();

  const renderPopularTokens = tokens.map((item) => {
    return (
      <Option
        key={item.mintAddress}
        value={item.mintAddress}
        name={item.tokenSymbol}
        title={item.mintAddress}
      >
        <TokenDisplay
          key={item.mintAddress}
          name={item.tokenSymbol}
          mintAddress={item.mintAddress}
          showBalance={true}
        />
      </Option>
    );
  });

  // TODO: expand nested pool names ...?

  // group accounts by mint and use one with biggest balance
  const grouppedUserAccounts = userAccounts
    .sort((a, b) => {
      return b.info.amount.toNumber() - a.info.amount.toNumber();
    })
    .reduce((map, acc) => {
      const mint = acc.info.mint.toBase58();
      if (isKnownMint(tokenMap, mint)) {
        return map;
      }

      const pool = pools.find((p) => p && p.pubkeys.mint.toBase58() === mint);

      map.set(mint, (map.get(mint) || []).concat([{ account: acc, pool }]));

      return map;
    }, new Map<string, { account: TokenAccount; pool: PoolInfo | undefined }[]>());

  const additionalAccounts = [...grouppedUserAccounts.keys()];
  if (
    tokens.findIndex((t) => t.mintAddress === props.mint) < 0 &&
    props.mint &&
    !grouppedUserAccounts.has(props?.mint)
  ) {
    additionalAccounts.push(props.mint);
  }

  const renderAdditionalTokens = additionalAccounts.map((mint) => {
    let pool: PoolInfo | undefined;
    const list = grouppedUserAccounts.get(mint);
    if (list && list.length > 0) {
      // TODO: group multple accounts of same time and select one with max amount
      const account = list[0];
      pool = account.pool;
    }

    let name: string;
    let icon: JSX.Element;
    if (pool) {
      name = getPoolName(tokenMap, pool);
      const sorted = pool.pubkeys.holdingMints
        .map((a: PublicKey) => a.toBase58())
        .sort();
      icon = <PoolIcon mintA={sorted[0]} mintB={sorted[1]} />;
    } else {
      name = getTokenName(tokenMap, mint, true, 3);
      icon = <TokenIcon mintAddress={mint} />;
    }

    return (
      <Option key={mint} value={mint} name={name}>
        <TokenDisplay
          key={mint}
          mintAddress={mint}
          name={name}
          icon={icon}
          showBalance={!pool}
        />
      </Option>
    );
  });

  const userUiBalance = () => {
    const currentAccount = userAccounts?.find(
      (a) => a.info.mint.toBase58() === props.mint
    );
    if (currentAccount && mint) {
      return (
        currentAccount.info.amount.toNumber() / Math.pow(10, mint.decimals)
      );
    }

    return 0;
  };

  return (
    <Card
      className="ccy-input"
      style={{ borderRadius: 20 }}
      bodyStyle={{ padding: 0 }}
    >
      <div className="ccy-input-header">
        <div className="ccy-input-header-left">{props.title}</div>

        <div
          className="ccy-input-header-right"
          onClick={(e) =>
            props.onInputChange && props.onInputChange(userUiBalance())
          }
        >
          Balance: {userUiBalance().toFixed(6)}
        </div>
      </div>
      <div className="ccy-input-header" style={{ padding: "0px 10px 5px 7px" }}>
        <NumericInput
          value={props.amount}
          onChange={(val: any) => {
            if (props.onInputChange) {
              props.onInputChange(val);
            }
          }}
          style={{
            fontSize: 20,
            boxShadow: "none",
            borderColor: "transparent",
            outline: "transpaernt",
          }}
          placeholder="0.00"
        />

        <div className="ccy-input-header-right" style={{ display: "felx" }}>
          <Select
            size="large"
            showSearch
            style={{ minWidth: 150 }}
            placeholder="CCY"
            value={props.mint}
            onChange={(item) => {
              if (props.onMintChange) {
                props.onMintChange(item);
              }
            }}
            filterOption={(input, option) =>
              option?.name?.toLowerCase().indexOf(input.toLowerCase()) >= 0
            }
          >
            {[...renderPopularTokens, ...renderAdditionalTokens]}
          </Select>
        </div>
      </div>
    </Card>
  );
};
