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
import { markets } from "../markets";

const MarketsView = (props: {}) => {
  const colStyle = { padding: "0.5em", width: 256+64 };

  return (
    <>
      <Row justify="center">
        { markets.map(m =>
          <>
            <Col>
              <div style={colStyle}>
                <Card>
                  <p>
                    <img src={m.outcomes[0].icon} alt={m.outcomes[0].name} width="200px" height="200px"/>
                  </p>
                  <h1>{m.contract_name}</h1>
                  <p>
                    <CurrencyPairProvider baseMintAddress={m.quote_mint_pk}
                                          quoteMintAddress={m.outcomes[0].mint_pk} >
                      <BetButton label="YES" type="primary" market={m} outcome={m.outcomes[0]} />
                    </CurrencyPairProvider>
                    <CurrencyPairProvider baseMintAddress={m.quote_mint_pk}
                                          quoteMintAddress={m.outcomes[1].mint_pk} >
                      <BetButton label="NO" type={undefined} market={m} outcome={m.outcomes[1]} />
                    </CurrencyPairProvider>
                  </p>
                </Card>
              </div>
            </Col>
          </>
        )}
      </Row>
    </>
  );
};


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
          <h1>Which team will win the 55th Super Bowl?</h1>
          <Row justify="center">
            <Col>
              <p>The winner will be resolved by February 8th 08:00 AM UTC according to the results of the championship game. Winning tokens can be redeemed by March 8th 08:00 AM UTC.</p>
              <Divider />
              <p><b>Disclaimer:</b> Trading on Omega is not available in the U.S.A, EU or other prohibited jurisdictions. If you are located in, incorporated or otherwise established in, or a resident of the United States of America or any European nation, you are not permitted to trade on Omega.</p>
            </Col>
          </Row>
        </div>
      </Card>
      <MarketsView></MarketsView>
    </>
  );
};


