import React, { useState } from "react";

import "./input.less";

import { Card, Select } from "antd";
import { PublicKey } from "@solana/web3.js";

import { NumericInput } from "../numericInput";
import { PoolIcon, TokenIcon } from "../tokenIcon";
import { PoolInfo, TokenAccount } from "../../models";
import { getPoolName, getTokenName, isKnownMint } from "../../utils/utils";
import { useUserAccounts, useMint, useCachedPool } from "../../utils/accounts";
import { useConnectionConfig } from "../../utils/connection";

const { Option } = Select;


// this is a slimmed down version of CurrencyInput
export const BetInput = (props: {
  mint?: string;
  amount?: string;
  title?: string;
  onInputChange?: (val: string) => void;
  onMintChange?: (account: string) => void;
}) => {

  const { userAccounts } = useUserAccounts();
  const { pools } = useCachedPool();
  const mint = useMint(props.mint);
  const { tokens, tokenMap } = useConnectionConfig();

  const renderPopularTokens = tokens.filter((item) => {
      return item.mintAddress === props.mint;
    }).map((item) => {
      return (
        <Option
          key={item.mintAddress}
          value={item.mintAddress}
          name={item.tokenSymbol}
          title={item.mintAddress}
        >
          <div
            key={item.mintAddress}
            style={{ display: "flex", alignItems: "center" }}
          >
            <TokenIcon mintAddress={item.mintAddress} />
            {item.tokenSymbol}
          </div>
        </Option>
      );
  });

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
      name = getTokenName(tokenMap, mint);
      icon = <TokenIcon mintAddress={mint} />;
    }

    return (
      <Option key={mint} value={mint} name={name} title={mint}>
        <div key={mint} style={{ display: "flex", alignItems: "center" }}>
          {icon}
          {name}
        </div>
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
      className="bet-input"
      style={{ borderRadius: 20 }}
      bodyStyle={{ padding: 0 }}
    >
      <div className="bet-input-header">
        <div className="bet-input-header-left">{props.title}</div>

        <div
          className="bet-input-header-right"
          onClick={(e) =>
            props.onInputChange && props.onInputChange(userUiBalance().toString())
          }
        >
          Balance: {userUiBalance().toFixed(6)}
        </div>
      </div>
      <div className="bet-input-header" style={{ padding: "0px 10px 5px 7px" }}>
        <NumericInput
          value={props.amount}
          onChange={(val: any) => {
            if (props.onInputChange) {
              props.onInputChange(val.toString());
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

        <div className="bet-input-header-right" style={{ display: "felx" }}>
          <Select
            placeholder="bet"
            size="large"
            style={{ minWidth: 120 }}
            showSearch
            filterOption={(input, option) =>
              option?.name?.toLowerCase().indexOf(input.toLowerCase()) >= 0
            }
            value={props.mint}
            onChange={(item) => {
              if (props.onMintChange) {
                props.onMintChange(item);
              }
            }}
          >
            {[...renderPopularTokens, ...renderAdditionalTokens]}
          </Select>
        </div>
      </div>
    </Card>
  );
};
