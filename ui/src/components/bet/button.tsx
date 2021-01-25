import React, { useEffect, useState } from "react";
import { useHistory } from "react-router-dom";
import { Button, Modal } from "antd";

import { useConnection, useSlippageConfig } from "../../utils/connection";
import { useCurrencyPairState, CurrencyPairProvider } from "../../utils/currencyPair";
import { notify } from "../../utils/notifications";
import { swap, usePoolForBasket, PoolOperation } from "../../utils/pools";
import { useWallet } from "../../utils/wallet";

import { BetInput } from "./input";

const BetModalContent = (props: {
  market: { quote_mint_pk: string },
  outcome: { name: string, mint_pk: string } }) => {

  const connection = useConnection();
  const { slippage } = useSlippageConfig();
  const { connected, wallet } = useWallet();
  const {
    A,
    B,
    setLastTypedAccount,
    setPoolOperation,
  } = useCurrencyPairState();
  const pool = usePoolForBasket([A?.mintAddress, B?.mintAddress]);
  const [betAmount, setBetAmount] = useState("0");

  const placeBet = async function() {

    if (A.account && B.mintAddress) {
      try {
        //setPendingTx(true);

        const components = [
          {
            account: A.account,
            mintAddress: A.mintAddress,
            amount: A.convertAmount(),
          },
          {
            mintAddress: B.mintAddress,
            amount: B.convertAmount(),
          },
        ];

        await swap(connection, wallet, components, slippage, pool);
      } catch {
        notify({
          description:
            "Please try again and approve transactions from your wallet",
          message: "Trade cancelled.",
          type: "error",
        });
      } finally {
        //setPendingTx(false);
      }
    }


  };

  return (
    <>

      <BetInput mint={A.mintAddress}
                amount={A.amount}
                onInputChange={(val) => {
                  setPoolOperation(PoolOperation.SwapGivenInput);
                  setLastTypedAccount(A.mintAddress);
                  A.setAmount(val);
                }} />


        <p>Maximum Profit: {(parseFloat(B.amount) * (1 - slippage)).toFixed(2)} USDC</p>



     {!connected && (
        <Button
          className="float-right"
          type="primary"
          size="large"
          onClick={wallet.connect}
        >
          Connect Wallet
        </Button>
      )}


     {connected && (
        <Button
          className="float-right"
          type="primary"
          size="large"
          onClick={placeBet}
        >
          Place Bet
        </Button>

      )}


    </>);
}


export const BetButton = (props: {
  type: "primary" | undefined,
  label: string,
  market: { quote_mint_pk: string },
  outcome: { name: string, mint_pk: string } }) => {

  const {
    A,
    B,
    setLastTypedAccount,
    setPoolOperation,
  } = useCurrencyPairState();

  const epsilon = 0.0001;

  useEffect( () => {
    setPoolOperation(PoolOperation.SwapGivenInput);
    setLastTypedAccount(A.mintAddress);
    A.setAmount(epsilon.toString());
  }, [A, B, setPoolOperation, setLastTypedAccount]);

  let odds = "";
  if (B?.amount) {
    odds = (100 * epsilon / parseFloat(B.amount)).toFixed(0);
  }

  const [visible, setVisible] = useState(false);

  return (
    <>
    <Button
      className="bet-button"
      type={props.type}
      size="large"
      onClick={() => setVisible(true)}
    >
      <span>{props.label} {odds}¢</span>
    </Button>

    <Modal
      visible={visible}
      title={`Bet on ${props.outcome.name}`}
      footer={null}
      onCancel={() => setVisible(false)}
    >
      <CurrencyPairProvider baseMintAddress={props.market.quote_mint_pk}
                            quoteMintAddress={props.outcome.mint_pk} >
        <BetModalContent market={props.market} outcome={props.outcome}/>
      </CurrencyPairProvider>
    </Modal>
    </>
  );
}

