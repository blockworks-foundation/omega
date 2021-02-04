import React, { useState } from "react";
import { Button, Popover, Col, Row } from "antd";
import { Settings } from "./settings";
import { SettingOutlined } from "@ant-design/icons";
import { AppBar } from "./appBar";
import { CurrencyPairProvider } from "../utils/currencyPair";
import { SwapView } from "./swap";
import { AddLiquidityView } from "./addLiquidity";
import { markets } from "../markets";
// TODO: Allow market change before adding liquidity in case of multiple markets
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
      { markets.map((market: any) =>
        <>
          <Row justify="center">
            <Col flex={2}>
              <div style={colStyle}>
                <CurrencyPairProvider baseMintAddress={market.quote_mint_pk}
                  quoteMintAddress={market.outcomes[0].mint_pk} >
                  <SwapView />
                </CurrencyPairProvider>
              </div>
            </Col>
            <Col flex={2}>
              <div style={colStyle}>
                <CurrencyPairProvider baseMintAddress={market.quote_mint_pk}
                  quoteMintAddress={market.outcomes[1].mint_pk} >
                  <SwapView />
                </CurrencyPairProvider>
              </div>
            </Col>
          </Row>
          <Row justify="center">
            <Col flex={0}>
              <div style={colStyle}>
                <AddLiquidityView market={market} baseMintAddress={market.quote_mint_pk} outcomes={market.outcomes} />
              </div>
            </Col>
          </Row>
        </>
      )
      }
    </>
  );
};
