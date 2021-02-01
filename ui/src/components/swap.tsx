import React, { useState } from "react";
import { Card } from "antd";
import { TradeEntry } from "./trade";
import { AddToLiquidity } from "./pool/add";

export const SwapView = (props: {}) => {
  return (
    <>
      <Card
        className="exchange-card"
        headStyle={{ padding: 0 }}
        bodyStyle={{ position: "relative" }}
      >
        <div style={{ fontSize: '1.5rem', color: '#2ABDD2' }}>Trade</div>
        <TradeEntry />
      </Card>
    </>);
};

