import React from "react";
import { Button, Popover } from "antd";
import { useOwnedPools } from "../../utils/pools";
import "./view.less";
import { Settings } from "./../settings";
import { SettingOutlined } from "@ant-design/icons";
import { AppBar } from "./../appBar";
import { useWallet } from "../../utils/wallet";
import { PoolCard } from "./card";

export const PoolOverview = () => {
  const owned = useOwnedPools();
  const { connected } = useWallet();

  return (
    <>
      <AppBar
        right={
          <Popover
            placement="topRight"
            title="Settings"
            content={<Settings />}
            trigger="click"
          >
            <Button
              shape="circle"
              size="large"
              type="text"
              icon={<SettingOutlined />}
            />
          </Popover>
        }
      />
      <div className="pool-grid">
        {owned.map((o) => (
          <PoolCard pool={o.pool} account={o.account} />
        ))}
        {!connected && <h3>Connect to a wallet to view your liquidity.</h3>}
      </div>
    </>
  );
};
