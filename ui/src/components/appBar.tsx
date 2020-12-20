import React from "react";
import { Button, Menu, Popover } from "antd";
import { useWallet } from "../utils/wallet";
import { AccountInfo } from "./accountInfo";
import { Link, useHistory, useLocation } from "react-router-dom";

export const AppBar = (props: { left?: JSX.Element; right?: JSX.Element }) => {
  const { connected, wallet } = useWallet();
  const location = useLocation();
  const history = useHistory();

  const TopBar = (
    <div className="App-Bar">
      <div className="App-Bar-left">
        <div className="App-logo" />
        <Menu mode="horizontal" selectedKeys={[location.pathname]}>
          <Menu.Item key="/">
            <Link
              to={{
                pathname: "/",
              }}
            >
             Predict
            </Link>
          </Menu.Item>
          <Menu.Item key="/exchange">
            <Link
              to={{
                pathname: "/exchange",
              }}
            >
             Exchange
            </Link>
          </Menu.Item>
          <Menu.Item key="/redeem">
            <Link
              to={{
                pathname: "/redeem",
              }}
            >
             Redeem
            </Link>
          </Menu.Item>
          <Menu.Item key="help">
            <a
              href={"https://www.notion.so/Omega-Help-Center-0e0f30a8976c456aaa59a86e44657754"}
              target="_blank"
              rel="noopener noreferrer"
            >
              Help
              <sup>↗</sup>
            </a>
          </Menu.Item>
        </Menu>
        {props.left}
      </div>
      <div className="App-Bar-right">
        <AccountInfo />
        {connected && (
          <Button
            type="text"
            size="large"
            onClick={() => history.push({ pathname: "/pool" })}
          >
            My Pools
          </Button>
        )}
        <div>
          {!connected && (
            <Button
              type="text"
              size="large"
              onClick={connected ? wallet.disconnect : wallet.connect}
              style={{ color: "#2abdd2" }}
            >
              Connect
            </Button>
          )}
          {connected && (
            <Popover
              placement="bottomRight"
              title="Wallet public key"
              trigger="click"
            ></Popover>
          )}
        </div>
        {props.right}
      </div>
    </div>
  );

  return TopBar;
};
