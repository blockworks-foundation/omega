import React from "react";
import { Button, Card, Popover, Col, Row, Divider } from "antd";
import { Settings } from "./settings";
import { SettingOutlined } from "@ant-design/icons";
import { AppBar } from "./appBar";
import { BetButton } from "./bet/button";
import "./bet/bet.less";

import "./trade/trade.less";

import { CurrencyPairProvider } from "../utils/currencyPair";
import contract_keys from "../contract_keys.json";

export const BetView = (props: {}) => {

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
      <Card
        className="bet-card"
        headStyle={{ padding: 0 }}
        bodyStyle={{ width: 700 }}
      >
        <div>
          <h1>Will the Democrats win the US Senate?</h1>
          <Row justify="center">
            <Col>
              <div className="bet-outcome">
                <div>
                  <h2>YES</h2>
                </div>
                <div>
                  <img src={contract_keys.outcomes[0].icon} alt="YES ICON" width="200px" height="200px" />
                </div>
                <div>
                  <CurrencyPairProvider baseMintAddress={contract_keys.quote_mint_pk}
                                        quoteMintAddress={contract_keys.outcomes[0].mint_pk} >
                    <BetButton />
                  </CurrencyPairProvider>
                </div>
              </div>
            </Col>
            <Col>
              <div className="bet-outcome">
                <h2>NO</h2>
                <img src={contract_keys.outcomes[1].icon} alt="NO ICON" width="200px" height="200px"/>
                <div>
                  <CurrencyPairProvider baseMintAddress={contract_keys.quote_mint_pk}
                                        quoteMintAddress={contract_keys.outcomes[1].mint_pk} >
                    <BetButton />
                  </CurrencyPairProvider>
                </div>
              </div>
            </Col>
          </Row>
          <Row justify="center">
            <Col>
              <p>{contract_keys.details}</p>
              <Divider />
              <p><b>Disclaimer:</b> Trading on Omega is not available in the United States or other prohibited jurisdictions. If you are located in, incorporated or otherwise established in, or a resident of the United States of America, you are not permitted to trade on Omega.</p>
            </Col>
          </Row>
        </div>
      </Card>
    </>
  );
};


