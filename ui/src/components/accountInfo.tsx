import React from "react";
import { useWallet } from "./../utils/wallet";
import { shortenAddress } from "./../utils/utils";
import { Identicon } from "./identicon";
import { useUserAccounts, useMint } from "./../utils/accounts";
import contract_keys from "../contract_keys.json";
import { markets } from "../markets";

export const AccountInfo = (props: {}) => {
  const { wallet } = useWallet();
  const { userAccounts } = useUserAccounts();
  const mint = useMint(contract_keys.quote_mint_pk);

  if (!wallet || !wallet.publicKey) {
    return null;
  }

  const userUiBalance = () => {
    const currentAccount = userAccounts?.find(
      (a) => a.info.mint.toBase58() === contract_keys.quote_mint_pk
    );


    if (currentAccount && mint) {
      return (
        currentAccount.info.amount.toNumber() / Math.pow(10, mint.decimals)
      );
    }

    return 0;
  };

  const outcomes =
    Object.values(markets).map(m => m.outcomes[0]).concat(
    Object.values(markets).map(m => m.outcomes[1]));
  // sort in-place
  outcomes.sort((a,b) => a.name.localeCompare(b.name));


  let userOutcomeBalances = new Map<string, number>();
  outcomes.forEach(o => {
    const outcomeAccount = userAccounts?.find(a => a.info.mint.toBase58() === o.mint_pk);

    if (outcomeAccount && mint) {
      const balance = outcomeAccount.info.amount.toNumber() / Math.pow(10, mint.decimals);
      if (balance > 0)
        userOutcomeBalances.set(o.name, balance);
    }
  });

  const userYesBalance = () => {
    const yesAccount = userAccounts?.find(
        (t) => t.info.mint.toBase58() === contract_keys.outcomes[0].mint_pk
    );
    if (yesAccount && mint) {
      return (
          yesAccount.info.amount.toNumber() / Math.pow(10, mint.decimals)  // outcome mints have same decimals as quote
      );
    }

    return 0;
  }
  const userNoBalance = () => {
    const noAccount = userAccounts?.find(
        (t) => t.info.mint.toBase58() === contract_keys.outcomes[1].mint_pk
    );
    if (noAccount && mint) {
      return (
          noAccount.info.amount.toNumber() / Math.pow(10, mint.decimals)  // outcome mints have same decimals as quote
      );
    }
    return 0;

  }

  return (
    <div className="wallet-wrapper">
      <span>
        USDC: {userUiBalance().toFixed(2)}
        {Array.from(userOutcomeBalances.entries()).map(([name, amount]) =>
          ` ${name}: ${amount.toFixed(2)}`).join('')}
      </span>
      <div className="wallet-key">
        {' ' + shortenAddress(`${wallet.publicKey}`)}
        <Identicon
          address={wallet.publicKey.toBase58()}
          style={{ marginLeft: "0.5rem" }}
        />
      </div>
    </div>
  );
};
