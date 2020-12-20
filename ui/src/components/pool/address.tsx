import React from "react";
import { Button, Col, Popover, Row } from "antd";
import { PoolInfo } from "../../models";
import { CopyOutlined, InfoCircleOutlined } from "@ant-design/icons";
import { ExplorerLink } from "./../explorerLink";

const Address = (props: {
  address: string;
  style?: React.CSSProperties;
  label?: string;
}) => {
  return (
    <Row style={{ width: "100%", ...props.style }}>
      {props.label && <Col span={4}>{props.label}:</Col>}
      <Col span={17}>
        <ExplorerLink address={props.address} code={true} type="address" />
      </Col>
      <Col span={3} style={{ display: "flex" }}>
        <Button
          shape="round"
          icon={<CopyOutlined />}
          size={"small"}
          style={{ marginLeft: "auto", marginRight: 0 }}
          onClick={() => navigator.clipboard.writeText(props.address)}
        />
      </Col>
    </Row>
  );
};

export const PoolAddress = (props: {
  pool?: PoolInfo;
  style?: React.CSSProperties;
  showLabel?: boolean;
  label?: string;
}) => {
  const { pool } = props;
  const label = props.label || "Address";

  if (!pool?.pubkeys.account) {
    return null;
  }

  return (
    <Address
      address={pool.pubkeys.account.toBase58()}
      style={props.style}
      label={label}
    />
  );
};

export const AccountsAddress = (props: {
  pool?: PoolInfo;
  style?: React.CSSProperties;
  aName?: string;
  bName?: string;
}) => {
  const { pool } = props;
  const account1 = pool?.pubkeys.holdingAccounts[0];
  const account2 = pool?.pubkeys.holdingAccounts[1];

  return (
    <>
      {account1 && (
        <Address
          address={account1.toBase58()}
          style={props.style}
          label={props.aName}
        />
      )}
      {account2 && (
        <Address
          address={account2.toBase58()}
          style={props.style}
          label={props.bName}
        />
      )}
    </>
  );
};

export const AdressesPopover = (props: {
  pool?: PoolInfo;
  aName?: string;
  bName?: string;
}) => {
  const { pool, aName, bName } = props;

  return (
    <Popover
      placement="topRight"
      title={"Addresses"}
      trigger="hover"
      content={
        <>
          <PoolAddress pool={pool} showLabel={true} label={"Pool"} />
          <AccountsAddress pool={pool} aName={aName} bName={bName} />
        </>
      }
    >
      <Button
        shape="circle"
        size="large"
        type="text"
        className={"trade-address-info-button"}
        icon={<InfoCircleOutlined />}
      />
    </Popover>
  );
};
