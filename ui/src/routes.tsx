import { HashRouter, Route } from "react-router-dom";
import React from "react";
import { BetView } from "./components/bet";
import { ExchangeView } from "./components/exchange";
import { PoolOverview } from "./components/pool/view";
import { RedeemView } from "./components/redeem";

import { WalletProvider } from "./utils/wallet";
import { ConnectionProvider } from "./utils/connection";
import { AccountsProvider } from "./utils/accounts";
import { MarketProvider } from "./context/market";

export function Routes() {
  return (
    <>
      <HashRouter basename={"/"}>
        <ConnectionProvider>
          <WalletProvider>
            <AccountsProvider>
              <MarketProvider>
                  <Route exact path="/" component={BetView} />
                  <Route exact path="/exchange" component={ExchangeView} />
                  <Route exact path="/redeem" component={RedeemView} />
                  <Route exact path="/pool" component={PoolOverview} />
              </MarketProvider>
            </AccountsProvider>
          </WalletProvider>
        </ConnectionProvider>
      </HashRouter>
    </>
  );
}
