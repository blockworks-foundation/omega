import React from "react";
import { Button, Popover, Col, Row } from "antd";
import { Settings } from "./settings";
import { SettingOutlined } from "@ant-design/icons";
import { AppBar } from "./appBar";
import { CurrencyPairProvider } from "../utils/currencyPair";
import { SwapView } from "./swap";
import contract_keys from "../contract_keys.json";

export const ExchangeView = (props: {}) => {

  const colStyle: React.CSSProperties = { padding: "1em" };


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
      <Row justify="center">
        <Col>
          <div style={colStyle}>
            <CurrencyPairProvider baseMintAddress={contract_keys.quote_mint_pk}
                                  quoteMintAddress={contract_keys.outcomes[0].mint_pk} >
              <SwapView />
            </CurrencyPairProvider>
          </div>
        </Col>
        <Col>
          <div style={colStyle}>
            <CurrencyPairProvider baseMintAddress={contract_keys.quote_mint_pk}
                                  quoteMintAddress={contract_keys.outcomes[1].mint_pk} >
              <SwapView />
            </CurrencyPairProvider>
          </div>
        </Col>
      </Row>
    </>
  );
};
