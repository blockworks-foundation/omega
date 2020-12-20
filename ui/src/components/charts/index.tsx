import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { Button, Popover, Table, Tooltip, Typography } from "antd";
import { AppBar } from "./../appBar";
import { Settings } from "../settings";
import {
  SettingOutlined,
  TableOutlined,
  OneToOneOutlined,
} from "@ant-design/icons";
import { PoolIcon } from "../tokenIcon";
import { Input } from "antd";
import "./styles.less";
import echarts from "echarts";
import { useEnrichedPools } from "../../context/market";
import { usePools } from "../../utils/pools";
import {
  formatNumber,
  formatPct,
  formatUSD,
  useLocalStorageState,
} from "../../utils/utils";
import { PoolAddress } from "../pool/address";
import { PoolCard } from "./../pool/card";

const { Text } = Typography;

const { Search } = Input;

const FlashText = (props: { text: string; val: number }) => {
  const [activeClass, setActiveClass] = useState("");
  const [value] = useState(props.val);
  useEffect(() => {
    if (props.val !== value) {
      setActiveClass(props.val > value ? "flash-positive" : "flash-negative");

      setTimeout(() => setActiveClass(""), 200);
    }
  }, [props.text, props.val, value]);

  return <span className={activeClass}>{props.text}</span>;
};

interface Totals {
  liquidity: number;
  volume: number;
  fees: number;
}

const DEFAULT_DISPLAY_TYPE = "Table";

export const ChartsView = React.memo(() => {
  const [search, setSearch] = useState<string>("");
  const [totals, setTotals] = useState<Totals>(() => ({
    liquidity: 0,
    volume: 0,
    fees: 0,
  }));
  const chartDiv = useRef<HTMLDivElement>(null);
  const echartsRef = useRef<any>(null);
  const { pools } = usePools();
  const enriched = useEnrichedPools(pools);

  const [infoDisplayType, setInfoDisplayType] = useLocalStorageState(
    "infoDisplayType",
    DEFAULT_DISPLAY_TYPE
  );

  useEffect(() => {
    if (chartDiv.current) {
      echartsRef.current = echarts.init(chartDiv.current);
    }

    return () => {
      echartsRef.current.dispose();
    };
  }, []);

  // TODO: display user percent in the pool
  // const { ownedPools } = useOwnedPools();

  // TODO: create cache object with layout type, get, query, add

  let searchRegex: RegExp | undefined = useMemo(() => {
    try {
      return new RegExp(search, "i");
    } catch {
      // ignore bad regex typed by user
    }
  }, [search]);

  const updateChart = useCallback(() => {
    if (echartsRef.current) {
      echartsRef.current.setOption({
        series: [
          {
            name: "Liquidity",
            type: "treemap",
            top: 0,
            bottom: 10,
            left: 30,
            right: 30,
            animation: false,
            // visibleMin: 300,
            label: {
              show: true,
              formatter: "{b}",
            },
            itemStyle: {
              normal: {
                borderColor: "#000",
              },
            },
            breadcrumb: {
              show: false,
            },
            data: enriched
              .filter(
                (row) => !search || !searchRegex || searchRegex.test(row.name)
              )
              .map((row) => {
                return {
                  value: row.liquidity,
                  name: row.name,
                  path: `Liquidity/${row.name}`,
                  data: row,
                };
              }),
          },
        ],
      });
    }
  }, [enriched, search, searchRegex]);

  // Updates total values
  useEffect(() => {
    setTotals(
      enriched.reduce(
        (acc, item) => {
          acc.liquidity = acc.liquidity + item.liquidity;
          acc.volume = acc.volume + item.volume24h;
          acc.fees = acc.fees + item.fees;
          return acc;
        },
        { liquidity: 0, volume: 0, fees: 0 } as Totals
      )
    );

    updateChart();
  }, [enriched, updateChart, search]);

  const columns = [
    {
      title: "Name",
      dataIndex: "name",
      key: "name",
      render(text: string, record: any) {
        return {
          props: {
            style: {},
          },
          children: (
            <div style={{ display: "flex" }}>
              <PoolIcon mintA={record.mints[0]} mintB={record.mints[1]} />
              <a href={record.link} target="_blank" rel="noopener noreferrer">
                {text}
              </a>
            </div>
          ),
        };
      },
    },
    {
      title: "Liquidity",
      dataIndex: "liquidity",
      key: "liquidity",
      render(text: string, record: any) {
        return {
          props: {
            style: { textAlign: "right" },
          },
          children: (
            <div>
              <div>{formatUSD.format(record.liquidity)}</div>
              <div>
                <Text type="secondary" style={{ fontSize: 11 }}>
                  {formatNumber.format(record.liquidityA)} {record.names[0]}
                </Text>
              </div>
              <div>
                <Text type="secondary" style={{ fontSize: 11 }}>
                  {formatNumber.format(record.liquidityB)} {record.names[1]}
                </Text>
              </div>
            </div>
          ),
        };
      },
      sorter: (a: any, b: any) => a.liquidity - b.liquidity,
      defaultSortOrder: "descend" as any,
    },
    {
      title: "Supply",
      dataIndex: "supply",
      key: "supply",
      render(text: string, record: any) {
        return {
          props: {
            style: { textAlign: "right" },
          },
          children: <FlashText text={text} val={record.supply} />,
        };
      },
      sorter: (a: any, b: any) => a.supply - b.supply,
    },
    {
      title: "Volume (24h)",
      dataIndex: "volume",
      key: "volume",
      render(text: string, record: any) {
        return {
          props: {
            style: { textAlign: "right" },
          },
          children: (
            <FlashText
              text={formatUSD.format(record.volume24h)}
              val={record.volume24h}
            />
          ),
        };
      },
      sorter: (a: any, b: any) => a.volume24h - b.volume24h,
    },
    {
      title: "Fees (24h)",
      dataIndex: "fees24h",
      key: "fees24h",
      render(text: string, record: any) {
        return {
          props: {
            style: { textAlign: "right" },
          },
          children: (
            <FlashText
              text={formatUSD.format(record.fees24h)}
              val={record.fees24h}
            />
          ),
        };
      },
      sorter: (a: any, b: any) => a.fees24h - b.fees24h,
    },
    {
      title: "APY",
      dataIndex: "apy",
      key: "apy",
      render(text: string, record: any) {
        return {
          props: {
            style: { textAlign: "right" },
          },
          children: formatPct.format(record.apy),
        };
      },
      sorter: (a: any, b: any) => a.apy - b.apy,
    },
    {
      title: "Address",
      dataIndex: "address",
      key: "address",
      render(text: string, record: any) {
        return {
          props: {
            style: { fontFamily: "monospace" } as React.CSSProperties,
          },
          children: <PoolAddress pool={record.raw} />,
        };
      },
    },
  ];

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
      <div className="info-header">
        <h1>Liquidity: {formatUSD.format(totals.liquidity)}</h1>
        <h1>Volume (24h): {formatUSD.format(totals.volume)}</h1>
        <Search
          className="search-input"
          placeholder="Filter"
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          onSearch={(value) => setSearch(value)}
          style={{ width: 200 }}
        />
        <Tooltip title="Show as table">
          <Button
            size="small"
            type={infoDisplayType === "Table" ? "primary" : "text"}
            onClick={() => setInfoDisplayType("Table")}
            icon={<TableOutlined />}
          />
        </Tooltip>
        <Tooltip title="Show as cards">
          <Button
            size="small"
            type={infoDisplayType === "Card" ? "primary" : "text"}
            onClick={() => setInfoDisplayType("Card")}
            icon={<OneToOneOutlined />}
          />
        </Tooltip>
      </div>
      <div ref={chartDiv} style={{ height: "250px", width: "100%" }} />
      {infoDisplayType === "Table" ? (
        <Table
          dataSource={enriched.filter(
            (row) => !search || !searchRegex || searchRegex.test(row.name)
          )}
          columns={columns}
          size="small"
          pagination={{ pageSize: 10 }}
        />
      ) : (
        <div className="pool-grid">
          {enriched
            .sort((a, b) => b.liquidity - a.liquidity)
            .map((p) => {
              return <PoolCard pool={p.raw} />;
            })}
        </div>
      )}
    </>
  );
});
