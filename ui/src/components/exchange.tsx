import React from "react";
import { Button, Popover, Col, Row } from "antd";
import { Settings } from "./settings";
import { SettingOutlined } from "@ant-design/icons";
import { AppBar } from "./appBar";
import { CurrencyPairProvider } from "../utils/currencyPair";
import { SwapView } from "./swap";
// Issue set helper
import issueSet from '../utils/issueSet';
import { markets } from "../markets";
// Connect to wallet
import { useWallet } from '../utils/wallet';
// Create connection to wallet
import { useConnection } from '../utils/connection';
// Our contract details
import contract_keys from "../contract_keys.json";
import { useMint } from '../utils/accounts';

// TODO: Select market before making exchange
export const ExchangeView = (props: {}) => {
  let connection = useConnection();
  const { wallet } = useWallet();
  // The mint address public key
  const quoteMint = useMint(contract_keys.quote_mint_pk);

  const parseAmount = (amount: any) => {
  if(quoteMint) {
    try {
      return parseFloat(amount) * Math.pow(10, quoteMint.decimals);
    } catch (error) {
      // TODOl WHat to do here
    }
  } else {
    // TODO: What to do here
  }
}

  // Swap usdc for market tokens
  const callIssueSet = async () => {
    console.log('Market is ', markets[0])
    await issueSet(markets[0], parseAmount(1), wallet, connection)
}

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
          </>
        )}
        <Button  shape="circle"
              size="large"
              type="text"
              onClick={callIssueSet}
              > Provide Liquidity</Button>
    </>
  );
};
