import React, { useEffect } from "react";
import { useHistory } from "react-router-dom";
import { Button } from "antd";

import { PoolOperation } from "../../utils/pools";
import { useCurrencyPairState } from "../../utils/currencyPair";


export const BetButton = (props: {
}) => {

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
    console.log('A', A.amount, A);
    console.log('B', B.amount, B);
  }, [A, B, setPoolOperation, setLastTypedAccount]);

  const history = useHistory();

  let odds = "";
  if (B?.amount) {
    odds = (100 * epsilon / parseFloat(B.amount)).toFixed(0);
  }

  return (
    <Button
      className="bet-button"
      type="primary"
      size="large"
      onClick={() => history.push('/exchange')}
    >
      <span>{odds}¢</span>
    </Button>
  );
}

